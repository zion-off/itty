package lastsession

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"

	"github.com/zion/itty/internal/fsutil"
)

type FileStore struct {
	path string
	mu   sync.Mutex
}

func NewFileStore(path string) *FileStore { return &FileStore{path: path} }

func (s *FileStore) Load() (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	raw, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("read last session %s: %w", s.path, err)
	}
	return strings.TrimSpace(string(raw)), nil
}

func (s *FileStore) Save(name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := fsutil.WriteFileAtomic(s.path, []byte(name+"\n"), 0o600); err != nil {
		return fmt.Errorf("write last session %s: %w", s.path, err)
	}
	return nil
}
