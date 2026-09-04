// ==============================================================================
// Package tailer - Real-time Event-Driven Log Tailer
// File: tailer/log_tailer.go
// Mô tả: Theo dõi sự kiện thay đổi file log thời gian thực bằng fsnotify,
//         non-blocking, đọc dòng mới nhất và gửi về pipeline với CPU cực thấp.
// ==============================================================================

package tailer

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"soc-agent/config"
	pb "soc-agent/proto"

	"github.com/fsnotify/fsnotify"
)

// FileWatcherState - Lưu trạng thái offset của từng file log đang theo dõi
type FileWatcherState struct {
	Path       string
	LastOffset int64
}

// LogTailer - Quản lý việc theo dõi và đọc log
type LogTailer struct {
	cfg       *config.AgentConfig
	eventChan chan<- *pb.EventRequest
	watcher   *fsnotify.Watcher
	states    map[string]*FileWatcherState
	mu        sync.Mutex
}

// NewLogTailer - Khởi tạo LogTailer mới
func NewLogTailer(cfg *config.AgentConfig, eventChan chan<- *pb.EventRequest) (*LogTailer, error) {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}

	return &LogTailer{
		cfg:       cfg,
		eventChan: eventChan,
		watcher:   watcher,
		states:    make(map[string]*FileWatcherState),
	}, nil
}

// Start - Bắt đầu theo dõi các file log trong config
func (t *LogTailer) Start(ctx context.Context) {
	log.Println("[TAILER] 🚀 Log Tailer (fsnotify) đang khởi động...")

	// 1. Thêm các đường dẫn log từ cấu hình
	for _, path := range t.cfg.LogPaths {
		if err := t.AddFile(path); err != nil {
			log.Printf("[TAILER] ⚠️ Không thể theo dõi '%s': %v", path, err)
		}
	}

	// 2. Vòng lặp event-driven non-blocking
	go func() {
		defer t.Close()

		for {
			select {
			case <-ctx.Done():
				log.Println("[TAILER] 🛑 Log Tailer đã nhận tín hiệu dừng.")
				return

			case event, ok := <-t.watcher.Events:
				if !ok {
					return
				}

				if event.Op&fsnotify.Write == fsnotify.Write {
					t.handleFileWrite(event.Name)
				} else if event.Op&fsnotify.Remove == fsnotify.Remove || event.Op&fsnotify.Rename == fsnotify.Rename {
					// Log rotation handling: reopen file
					t.handleFileRotate(event.Name)
				}

			case err, ok := <-t.watcher.Errors:
				if !ok {
					return
				}
				log.Printf("[TAILER] ⚠️ fsnotify error: %v", err)
			}
		}
	}()
}

// AddFile - Thêm một file log mới vào danh sách theo dõi
func (t *LogTailer) AddFile(filePath string) error {
	t.mu.Lock()
	defer t.mu.Unlock()

	cleanPath := filepath.Clean(filePath)

	// Lấy kích thước hiện tại của file
	var initialOffset int64 = 0
	if fi, err := os.Stat(cleanPath); err == nil {
		initialOffset = fi.Size()
	} else {
		return err
	}

	if err := t.watcher.Add(cleanPath); err != nil {
		return err
	}

	t.states[cleanPath] = &FileWatcherState{
		Path:       cleanPath,
		LastOffset: initialOffset,
	}

	log.Printf("[TAILER] 👁️ Bắt đầu theo dõi file: %s (Offset ban đầu: %d)", cleanPath, initialOffset)
	return nil
}

// handleFileWrite - Đọc các dòng log mới vừa được ghi (non-locking)
func (t *LogTailer) handleFileWrite(filePath string) {
	t.mu.Lock()
	state, exists := t.states[filePath]
	t.mu.Unlock()

	if !exists {
		return
	}

	file, err := os.Open(filePath)
	if err != nil {
		return
	}
	defer file.Close()

	// Đọc từ offset trước đó
	_, err = file.Seek(state.LastOffset, io.SeekStart)
	if err != nil {
		return
	}

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)
		if len(trimmed) == 0 {
			continue
		}

		t.dispatchLogLine(filePath, trimmed)
	}

	// Cập nhật lại offset
	newOffset, err := file.Seek(0, io.SeekCurrent)
	if err == nil {
		t.mu.Lock()
		state.LastOffset = newOffset
		t.mu.Unlock()
	}
}

// handleFileRotate - Xử lý khi file bị log rotate
func (t *LogTailer) handleFileRotate(filePath string) {
	t.mu.Lock()
	defer t.mu.Unlock()

	time.Sleep(500 * time.Millisecond)
	if fi, err := os.Stat(filePath); err == nil {
		t.states[filePath] = &FileWatcherState{
			Path:       filePath,
			LastOffset: 0,
		}
		_ = t.watcher.Add(filePath)
		log.Printf("[TAILER] 🔄 Đã reload file sau khi Rotate: %s (size: %d)", filePath, fi.Size())
	}
}

// dispatchLogLine - Đóng gói dòng log thành EventRequest và gửi vào channel
func (t *LogTailer) dispatchLogLine(filePath, line string) {
	eventType := "system_log"
	severity := "info"

	// Nhận diện loại log cơ bản
	lower := strings.ToLower(line)
	if strings.Contains(lower, "error") || strings.Contains(lower, "failed") || strings.Contains(lower, "denied") {
		severity = "medium"
	}
	if strings.Contains(lower, "malware") || strings.Contains(lower, "attack") || strings.Contains(lower, "unauthorized") {
		severity = "critical"
	}
	if strings.Contains(lower, "sysmon") {
		eventType = "sysmon_event"
	}

	rawPayloadObj := map[string]interface{}{
		"source_file": filePath,
		"message":     line,
		"timestamp":   time.Now().Format(time.RFC3339),
	}
	rawPayloadBytes, _ := json.Marshal(rawPayloadObj)

	req := &pb.EventRequest{
		AgentId:    t.cfg.AgentID,
		EventType:  eventType,
		Hostname:   t.cfg.Hostname,
		IpAddress:  t.cfg.IPAddress,
		RawPayload: string(rawPayloadBytes),
		Timestamp:  time.Now().UnixMilli(),
		Metadata: map[string]string{
			"source_file": filePath,
			"severity":    severity,
		},
	}

	select {
	case t.eventChan <- req:
	default:
		// Drop nếu buffer đầy
	}
}

// Close - Dọn dẹp tài nguyên
func (t *LogTailer) Close() {
	t.mu.Lock()
	defer t.mu.Unlock()

	if t.watcher != nil {
		_ = t.watcher.Close()
	}
}
