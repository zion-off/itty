package server

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/zion/itty/internal/auth"
	"github.com/zion/itty/internal/logging"
)

const maxBodyBytes = 64 * 1024

func (s *Server) handleChallenge(w http.ResponseWriter, r *http.Request) {
	log := s.Log.With("login_id", logging.NewID(), "remote", r.RemoteAddr)
	assertion, id, err := s.Auth.BeginLogin()
	switch {
	case errors.Is(err, auth.ErrNoCredentials):
		log.Warn("challenge refused", "reason", "no passkey enrolled")
		http.Error(w, "no passkey enrolled", http.StatusConflict)
		return
	case err != nil:
		log.Error("challenge failed", "error", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	log.Info("challenge issued")
	writeJSON(w, map[string]any{"id": id, "options": assertion})
}

func (s *Server) handleVerify(w http.ResponseWriter, r *http.Request) {
	log := s.Log.With("login_id", logging.NewID(), "remote", r.RemoteAddr)
	key := sourceKey(r)
	if !s.allowAttempt(w, key, log) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	ticket, err := s.Auth.FinishLogin(r.URL.Query().Get("id"), r)
	if err != nil {
		s.Limiter.RecordFailure(key)
		log.Warn("login failed", "reason", err.Error())
		http.Error(w, "login failed", http.StatusUnauthorized)
		return
	}
	log.Info("login succeeded; ticket issued")
	writeJSON(w, map[string]string{"ticket": ticket})
}

func (s *Server) handleEnrollPage(w http.ResponseWriter, r *http.Request) {
	if !s.Auth.EnrollmentActive() {
		http.NotFound(w, r)
		return
	}
	s.assets.serve(w, r, "enroll.html")
}

func (s *Server) handleEnrollBegin(w http.ResponseWriter, r *http.Request) {
	log := s.Log.With("enroll_id", logging.NewID(), "remote", r.RemoteAddr)
	key := sourceKey(r)
	if !s.Auth.EnrollmentActive() {
		http.NotFound(w, r)
		return
	}
	if !s.allowAttempt(w, key, log) {
		return
	}
	var body struct {
		Token string `json:"token"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	creation, id, err := s.Auth.BeginEnrollment(body.Token)
	if err != nil {
		s.Limiter.RecordFailure(key)
		log.Warn("enrollment begin rejected", "reason", err.Error())
		http.Error(w, "enrollment failed", http.StatusUnauthorized)
		return
	}
	log.Info("enrollment challenge issued")
	writeJSON(w, map[string]any{"id": id, "options": creation})
}

func (s *Server) handleEnrollFinish(w http.ResponseWriter, r *http.Request) {
	log := s.Log.With("enroll_id", logging.NewID(), "remote", r.RemoteAddr)
	key := sourceKey(r)
	if !s.Auth.EnrollmentActive() {
		http.NotFound(w, r)
		return
	}
	if !s.allowAttempt(w, key, log) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	if err := s.Auth.FinishEnrollment(r.URL.Query().Get("id"), r); err != nil {
		s.Limiter.RecordFailure(key)
		log.Warn("enrollment failed", "reason", err.Error())
		http.Error(w, "enrollment failed", http.StatusUnauthorized)
		return
	}
	log.Info("passkey enrolled")
	writeJSON(w, map[string]string{"status": "enrolled"})
}

func (s *Server) allowAttempt(w http.ResponseWriter, key string, log *slog.Logger) bool {
	if s.Limiter.Allowed(key) {
		return true
	}
	log.Warn("rate limit rejection", "source", key)
	http.Error(w, "too many attempts", http.StatusTooManyRequests)
	return false
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(v)
}
