package server

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strings"
	"sync"
	"time"
)

type assets struct {
	fsys  fs.FS
	etags sync.Map
}

func newAssets(fsys fs.FS) *assets { return &assets{fsys: fsys} }

func (a *assets) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
	if name == "" {
		name = "index.html"
	}
	a.serve(w, r, name)
}

func (a *assets) serve(w http.ResponseWriter, r *http.Request, name string) {
	info, err := fs.Stat(a.fsys, name)
	if err != nil || info.IsDir() {
		http.NotFound(w, r)
		return
	}
	data, err := fs.ReadFile(a.fsys, name)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	if ct := mime.TypeByExtension(path.Ext(name)); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("ETag", a.etag(name, data))
	http.ServeContent(w, r, name, time.Time{}, bytes.NewReader(data))
}

func (a *assets) etag(name string, data []byte) string {
	if cached, ok := a.etags.Load(name); ok {
		return cached.(string)
	}
	sum := sha256.Sum256(data)
	tag := `"` + hex.EncodeToString(sum[:8]) + `"`
	a.etags.Store(name, tag)
	return tag
}
