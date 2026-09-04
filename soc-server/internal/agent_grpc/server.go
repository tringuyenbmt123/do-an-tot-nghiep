// ==============================================================================
// Package agent_grpc - gRPC Server Setup với mTLS
// File: internal/agent_grpc/server.go
// Mô tả: Khởi tạo gRPC Server có xác thực mTLS (Mutual TLS).
//         - Load CA cert, Server cert/key để tạo TLS config
//         - Yêu cầu Agent phải có Client Certificate ký bởi cùng CA
//         - Register AgentService handler và listen trên port chỉ định
//
// Quy trình mTLS:
//   1. Server load CA cert → tạo cert pool
//   2. Server load server cert + key
//   3. TLS config yêu cầu Client Certificate (RequireAndVerifyClientCert)
//   4. Agent kết nối phải xuất trình cert ký bởi CA → Server verify
// ==============================================================================

package agent_grpc

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"log"
	"net"
	"os"

	"soc-server/internal/config"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
)

// GRPCServer - Wrapper xung quanh grpc.Server
type GRPCServer struct {
	server   *grpc.Server    // gRPC server instance
	listener net.Listener    // TCP listener
	port     int             // Port lắng nghe
}

// NewGRPCServer - Khởi tạo gRPC Server với mTLS authentication
// Trả về *GRPCServer sẵn sàng Register service và Start
func NewGRPCServer(cfg *config.AppConfig) (*GRPCServer, error) {
	if !cfg.MTLS.Enabled {
		log.Println("[gRPC SERVER] ⚠️ mTLS đang tắt - Chạy ở chế độ INSECURE (dev mode)")
		return createInsecureServer(cfg.Server.GRPCPort)
	}

	// ===== 1. Tạo TLS Config với mTLS =====
	tlsConfig, err := createMTLSConfig(cfg.MTLS)
	if err != nil {
		// Nếu không load được cert → chạy KHÔNG có TLS (dev mode)
		log.Printf("[gRPC SERVER] ⚠️ Không thể tạo mTLS config: %v", err)
		log.Println("[gRPC SERVER] ⚠️ Chạy ở chế độ INSECURE (không mTLS) - CHỈ DÙNG CHO DEV!")
		return createInsecureServer(cfg.Server.GRPCPort)
	}

	// ===== 2. Tạo gRPC Server với TLS credentials =====
	creds := credentials.NewTLS(tlsConfig)
	server := grpc.NewServer(
		grpc.Creds(creds),
		// Giới hạn kích thước message nhận (50MB - cho log payload lớn)
		grpc.MaxRecvMsgSize(50*1024*1024),
		// Giới hạn kích thước message gửi (10MB)
		grpc.MaxSendMsgSize(10*1024*1024),
	)

	// ===== 3. Tạo TCP Listener =====
	addr := fmt.Sprintf(":%d", cfg.Server.GRPCPort)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return nil, fmt.Errorf("không thể listen trên %s: %w", addr, err)
	}

	log.Printf("[gRPC SERVER] ✅ gRPC Server đã sẵn sàng với mTLS trên port %d", cfg.Server.GRPCPort)

	return &GRPCServer{
		server:   server,
		listener: listener,
		port:     cfg.Server.GRPCPort,
	}, nil
}

// GetServer - Lấy grpc.Server instance để register services
func (s *GRPCServer) GetServer() *grpc.Server {
	return s.server
}

// Start - Khởi chạy gRPC Server (blocking call)
// Gọi trong goroutine riêng vì hàm này block cho đến khi server dừng
func (s *GRPCServer) Start() error {
	log.Printf("[gRPC SERVER] 🚀 gRPC Server đang chạy trên port :%d", s.port)
	return s.server.Serve(s.listener)
}

// GracefulStop - Dừng server an toàn
// Chờ các request đang xử lý hoàn thành trước khi tắt
func (s *GRPCServer) GracefulStop() {
	log.Println("[gRPC SERVER] 🛑 Đang graceful shutdown gRPC Server...")
	s.server.GracefulStop()
}

// ==============================================================================
// Hàm internal
// ==============================================================================

// createMTLSConfig - Tạo TLS config cho mTLS authentication
func createMTLSConfig(mtlsCfg config.MTLSConfig) (*tls.Config, error) {
	// 1. Load CA certificate → tạo cert pool để verify Client Certificate
	caCert, err := os.ReadFile(mtlsCfg.CACertPath)
	if err != nil {
		return nil, fmt.Errorf("không thể đọc CA cert '%s': %w", mtlsCfg.CACertPath, err)
	}

	caCertPool := x509.NewCertPool()
	if !caCertPool.AppendCertsFromPEM(caCert) {
		return nil, fmt.Errorf("CA cert không hợp lệ")
	}

	// 2. Load Server certificate + private key
	serverCert, err := tls.LoadX509KeyPair(mtlsCfg.ServerCertPath, mtlsCfg.ServerKeyPath)
	if err != nil {
		return nil, fmt.Errorf("không thể load server cert/key: %w", err)
	}

	// 3. Tạo TLS config với mTLS
	tlsConfig := &tls.Config{
		// Server certificate
		Certificates: []tls.Certificate{serverCert},
		// Yêu cầu Client PHẢI xuất trình certificate (mTLS)
		ClientAuth: tls.RequireAndVerifyClientCert,
		// CA pool để verify client certificate
		ClientCAs: caCertPool,
		// Chỉ cho phép TLS 1.2+ (bảo mật)
		MinVersion: tls.VersionTLS12,
	}

	log.Println("[gRPC SERVER] ✅ Đã tạo mTLS config thành công")
	return tlsConfig, nil
}

// createInsecureServer - Tạo gRPC Server KHÔNG có TLS (chỉ dùng cho development)
func createInsecureServer(port int) (*GRPCServer, error) {
	server := grpc.NewServer(
		grpc.MaxRecvMsgSize(50*1024*1024),
		grpc.MaxSendMsgSize(10*1024*1024),
	)

	addr := fmt.Sprintf(":%d", port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return nil, fmt.Errorf("không thể listen trên %s: %w", addr, err)
	}

	return &GRPCServer{
		server:   server,
		listener: listener,
		port:     port,
	}, nil
}
