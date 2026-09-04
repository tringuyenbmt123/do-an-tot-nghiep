// ==============================================================================
// Package streamer - In-Memory Buffer & Backpressure Queue
// File: streamer/buffer.go
// Mô tả: Hàng đợi đệm trong RAM với dung lượng cố định (1000 items),
//         cơ chế Backpressure ưu tiên giữ lại các log Critical/High khi đứt mạng.
// ==============================================================================

package streamer

import (
	"log"
	"sync"

	pb "soc-agent/proto"
)

// EventBuffer - Quản lý queue buffered channel và chính sách drop log khi đầy
type EventBuffer struct {
	queue    chan *pb.EventRequest
	capacity int
	dropped  uint64
	mu       sync.Mutex
}

// NewEventBuffer - Tạo bộ đệm mới
func NewEventBuffer(capacity int) *EventBuffer {
	if capacity <= 0 {
		capacity = 1000
	}
	return &EventBuffer{
		queue:    make(chan *pb.EventRequest, capacity),
		capacity: capacity,
	}
}

// Push - Đẩy event vào buffer với cơ chế ưu tiên Backpressure
func (b *EventBuffer) Push(event *pb.EventRequest) bool {
	if event == nil {
		return false
	}

	// Thử gửi non-blocking vào channel
	select {
	case b.queue <- event:
		return true
	default:
		// Queue đã đầy! Áp dụng Backpressure Logic:
		severity := ""
		if event.Metadata != nil {
			severity = event.Metadata["severity"]
		}

		// Nếu đây là event Critical hoặc High -> Cố gắng đẩy ra 1 event cũ/low để nhường chỗ
		if severity == "critical" || severity == "high" {
			select {
			case droppedEvent := <-b.queue:
				b.mu.Lock()
				b.dropped++
				b.mu.Unlock()
				_ = droppedEvent // Bỏ qua item cũ

				// Nhét item critical vào
				select {
				case b.queue <- event:
					log.Printf("[BUFFER] ⚠️ Queue đầy: Đã drop 1 event cũ để nhường chỗ cho Event [%s]", severity)
					return true
				default:
				}
			default:
			}
		}

		// Drop event thông thường
		b.mu.Lock()
		b.dropped++
		b.mu.Unlock()
		return false
	}
}

// PopChan - Trả về read-only channel để streamer tiêu thụ
func (b *EventBuffer) PopChan() <-chan *pb.EventRequest {
	return b.queue
}

// Channel - Trả về channel hai chiều (để truyền cho collectors/tailers)
func (b *EventBuffer) Channel() chan *pb.EventRequest {
	return b.queue
}

// GetDroppedCount - Số lượng event đã bị drop do quá tải
func (b *EventBuffer) GetDroppedCount() uint64 {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.dropped
}
