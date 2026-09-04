package fim

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"soc-agent/config"
	pb "soc-agent/proto"

	"github.com/fsnotify/fsnotify"
)

// Watcher theo dõi thay đổi filesystem trong các thư mục được cấu hình.
type Watcher struct {
	cfg       *config.AgentConfig
	eventChan chan<- *pb.EventRequest
	watcher   *fsnotify.Watcher
}

func NewWatcher(cfg *config.AgentConfig, eventChan chan<- *pb.EventRequest) (*Watcher, error) {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}
	return &Watcher{cfg: cfg, eventChan: eventChan, watcher: watcher}, nil
}

func (w *Watcher) Start(ctx context.Context) {
	defer w.watcher.Close()
	log.Printf("[FIM] Đang theo dõi: %v", w.cfg.FIMPaths)
	for _, root := range w.cfg.FIMPaths {
		if err := w.addTree(root); err != nil {
			log.Printf("[FIM] Không thể theo dõi '%s': %v", root, err)
		}
	}
	log.Printf("[FIM] File Integrity Monitoring đã khởi chạy (%d thư mục gốc)", len(w.cfg.FIMPaths))

	for {
		select {
		case <-ctx.Done():
			log.Println("[FIM] File Integrity Monitoring đã dừng.")
			return
		case event, ok := <-w.watcher.Events:
			if !ok {
				return
			}
			w.handleEvent(event)
		case err, ok := <-w.watcher.Errors:
			if ok {
				log.Printf("[FIM] fsnotify error: %v", err)
			}
		}
	}
}

func (w *Watcher) addTree(root string) error {
	root = filepath.Clean(root)
	info, err := os.Stat(root)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return fmt.Errorf("đường dẫn không phải thư mục")
	}

	return filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			if err := w.watcher.Add(path); err != nil {
				log.Printf("[FIM] Không thể watch '%s': %v", path, err)
			}
		}
		return nil
	})
}

func (w *Watcher) handleEvent(event fsnotify.Event) {
	action := ""
	switch {
	case event.Op&fsnotify.Create != 0:
		action = "created"
		if info, err := os.Stat(event.Name); err == nil && info.IsDir() {
			_ = w.addTree(event.Name)
		}
	case event.Op&fsnotify.Write != 0:
		action = "modified"
	case event.Op&fsnotify.Remove != 0:
		action = "deleted"
	case event.Op&fsnotify.Rename != 0:
		action = "renamed"
	}
	if action == "" {
		return
	}
	log.Printf("[FIM] Phát hiện file %s: %s", action, event.Name)

	raw, _ := json.Marshal(map[string]interface{}{
		"action":    action,
		"path":      event.Name,
		"timestamp": time.Now().Format(time.RFC3339),
	})
	request := &pb.EventRequest{
		AgentId:    w.cfg.AgentID,
		EventType:  "file_integrity",
		Hostname:   w.cfg.Hostname,
		IpAddress:  w.cfg.IPAddress,
		RawPayload: string(raw),
		Timestamp:  time.Now().UnixMilli(),
		Metadata: map[string]string{
			"severity": "medium",
			"action":   action,
			"path":     event.Name,
		},
	}

	select {
	case w.eventChan <- request:
	default:
		log.Printf("[FIM] Bỏ qua event vì buffer đầy: %s", event.Name)
	}
}
