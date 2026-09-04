// ==============================================================================
// Package streamer - gRPC Bidirectional Streamer Client
// File: streamer/grpc_streamer.go
// Mô tả: Kết nối gRPC Bidirectional Streaming (StreamEvents) + Heartbeat tới Server,
//         tự động reconnect với Exponential Backoff, xác thực Token & Metadata,
//         và chuyển tiếp Command từ Server tới Executor.
// ==============================================================================

package streamer

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"io"
	"log"
	"math"
	"os"
	"time"

	"soc-agent/collector"
	"soc-agent/config"
	"soc-agent/executor"
	pb "soc-agent/proto"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
)

// GRPCStreamer - Quản lý kết nối gRPC liên tục 2 chiều
type GRPCStreamer struct {
	cfg       *config.AgentConfig
	buffer    *EventBuffer
	executor  *executor.CommandExecutor
	collector *collector.MetricCollector
}

// NewGRPCStreamer - Khởi tạo Streamer
func NewGRPCStreamer(
	cfg *config.AgentConfig,
	buffer *EventBuffer,
	executor *executor.CommandExecutor,
	collector *collector.MetricCollector,
) *GRPCStreamer {
	return &GRPCStreamer{
		cfg:       cfg,
		buffer:    buffer,
		executor:  executor,
		collector: collector,
	}
}

// Start - Vòng lặp kết nối và duy trì Stream liên tục với Auto-Reconnect
func (s *GRPCStreamer) Start(ctx context.Context) {
	log.Printf("[STREAMER] 🚀 Bắt đầu gRPC Streamer (Server: %s, Protocol: gRPC)", s.cfg.ServerURL)

	attempt := 0
	for {
		select {
		case <-ctx.Done():
			log.Println("[STREAMER] 🛑 gRPC Streamer đã kết thúc.")
			return
		default:
		}

		err := s.connectAndStream(ctx)
		if ctx.Err() != nil {
			return
		}

		// Tính toán thời gian backoff
		attempt++
		backoffSec := math.Min(
			float64(s.cfg.MaxBackoffSec),
			float64(time.Duration(1<<attempt)*time.Second)/float64(time.Second),
		)
		if backoffSec < 1 {
			backoffSec = 1
		}

		log.Printf("[STREAMER] ⚠️ Mất kết nối tới Server: %v. Thử lại sau %.0fs (Lần #%d)...",
			err, backoffSec, attempt)

		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Duration(backoffSec) * time.Second):
		}
	}
}

// connectAndStream - Thiết lập kết nối gRPC, stream events và nhận commands
func (s *GRPCStreamer) connectAndStream(ctx context.Context) error {
	// 1. Tạo Dial Options (mTLS hoặc Insecure)
	dialOpts, err := s.createDialOptions()
	if err != nil {
		return fmt.Errorf("lỗi cấu hình TLS/Credentials: %w", err)
	}

	conn, err := grpc.DialContext(ctx, s.cfg.ServerURL, dialOpts...)
	if err != nil {
		return fmt.Errorf("không thể kết nối gRPC tới %s: %w", s.cfg.ServerURL, err)
	}
	defer conn.Close()

	client := pb.NewAgentServiceClient(conn)

	// 2. Tạo context đính kèm Authentication Metadata Header
	md := metadata.New(map[string]string{
		"authorization": fmt.Sprintf("Bearer %s", s.cfg.AgentSecretKey),
		"x-agent-id":    s.cfg.AgentID,
	})
	authCtx := metadata.NewOutgoingContext(ctx, md)

	// 3. Khởi tạo StreamEvents 2 chiều
	stream, err := client.StreamEvents(authCtx)
	if err != nil {
		return fmt.Errorf("không thể mở StreamEvents RPC: %w", err)
	}

	log.Printf("[STREAMER] 🟢 Kết nối thành công tới SOC Server: %s [AgentID: %s]", s.cfg.ServerURL, s.cfg.AgentID)

	// 4. Khởi chạy goroutine gửi Heartbeat định kỳ
	hbCtx, hbCancel := context.WithCancel(authCtx)
	defer hbCancel()
	go s.runHeartbeatLoop(hbCtx, client)

	// 5. Goroutine Receiver: Lắng nghe Commands từ Server
	errChan := make(chan error, 2)
	go func() {
		for {
			cmd, err := stream.Recv()
			if err == io.EOF {
				errChan <- fmt.Errorf("server đóng stream (EOF)")
				return
			}
			if err != nil {
				errChan <- fmt.Errorf("lỗi nhận command từ stream: %w", err)
				return
			}

			// Chuyển command sang Executor thực thi
			go s.executor.ExecuteProtoCommand(ctx, cmd)
		}
	}()

	// 6. Goroutine Sender: Đọc từ Buffer và gửi Event lên Server
	go func() {
		for {
			select {
			case <-ctx.Done():
				_ = stream.CloseSend()
				return
			case event := <-s.buffer.PopChan():
				if event == nil {
					continue
				}
				if err := stream.Send(event); err != nil {
					errChan <- fmt.Errorf("lỗi gửi event lên server: %w", err)
					return
				}
			}
		}
	}()

	// Chờ đợi lỗi phát sinh hoặc context canceled
	select {
	case <-ctx.Done():
		return ctx.Err()
	case err := <-errChan:
		return err
	}
}

// runHeartbeatLoop - Vòng lặp gửi Heartbeat định kỳ (mỗi 5s hoặc 30s)
func (s *GRPCStreamer) runHeartbeatLoop(ctx context.Context, client pb.AgentServiceClient) {
	for {
		interval := s.cfg.GetHeartbeatInterval()
		select {
		case <-ctx.Done():
			return
		case <-time.After(interval):
			// Lấy số liệu metric tức thời để gửi kèm Heartbeat
			var cpuPct, memPct float64
			if s.collector != nil {
				if snap, err := s.collector.CollectSnapshot(); err == nil {
					cpuPct = snap.CPUUsagePercent
					memPct = snap.MemoryUsagePercent
				}
			}

			req := &pb.HeartbeatRequest{
				AgentId:      s.cfg.AgentID,
				Hostname:     s.cfg.Hostname,
				IpAddress:    s.cfg.IPAddress,
				OsType:       s.cfg.OSType,
				AgentVersion: s.cfg.Version,
				CpuUsage:     cpuPct,
				MemoryUsage:  memPct,
				Timestamp:    time.Now().UnixMilli(),
			}

			hbCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
			resp, err := client.Heartbeat(hbCtx, req)
			cancel()

			if err != nil {
				log.Printf("[STREAMER] ⚠️ Gửi Heartbeat thất bại: %v", err)
			} else if resp != nil && resp.Acknowledged {
				// Cập nhật khoảng cách heartbeat theo yêu cầu của server nếu có
				if resp.HeartbeatIntervalSeconds > 0 && resp.HeartbeatIntervalSeconds != int32(s.cfg.HeartbeatIntervalSec) {
					s.cfg.UpdateIntervals(int(resp.HeartbeatIntervalSeconds), 0)
				}
			}
		}
	}
}

// createDialOptions - Tạo tùy chọn kết nối (mTLS nếu có certs, hoặc Insecure)
func (s *GRPCStreamer) createDialOptions() ([]grpc.DialOption, error) {
	opts := []grpc.DialOption{
		grpc.WithBlock(),
		grpc.WithDefaultCallOptions(
			grpc.MaxCallRecvMsgSize(50*1024*1024),
			grpc.MaxCallSendMsgSize(10*1024*1024),
		),
	}

	if s.cfg.MTLSEnabled && s.cfg.CACertPath != "" {
		caCert, err := os.ReadFile(s.cfg.CACertPath)
		if err != nil {
			return nil, fmt.Errorf("không thể đọc CA cert: %w", err)
		}

		caPool := x509.NewCertPool()
		if !caPool.AppendCertsFromPEM(caCert) {
			return nil, fmt.Errorf("CA cert không hợp lệ")
		}

		tlsConfig := &tls.Config{
			RootCAs:            caPool,
			InsecureSkipVerify: true, // Dev mode
		}

		if s.cfg.ClientCertPath != "" && s.cfg.ClientKeyPath != "" {
			cert, err := tls.LoadX509KeyPair(s.cfg.ClientCertPath, s.cfg.ClientKeyPath)
			if err != nil {
				return nil, fmt.Errorf("không thể đọc client cert/key: %w", err)
			}
			tlsConfig.Certificates = []tls.Certificate{cert}
		}

		opts = append(opts, grpc.WithTransportCredentials(credentials.NewTLS(tlsConfig)))
	} else {
		// Mặc định kết nối Insecure (phù hợp dev/local test)
		opts = append(opts, grpc.WithTransportCredentials(insecure.NewCredentials()))
	}

	return opts, nil
}
