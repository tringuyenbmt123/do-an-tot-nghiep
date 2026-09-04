# ==============================================================================
# Makefile cho dự án SOC/EDR All-in-One Backend
# ==============================================================================

.PHONY: build run proto certs clean setup

# Build file thực thi
build:
	@echo "🛠️ Đang build SOC Server..."
	@go build -o bin/soc-server ./cmd/server/main.go
	@echo "✅ Build hoàn tất: bin/soc-server"

# Chạy trực tiếp
run:
	@echo "🚀 Đang khởi động SOC Server..."
	@go run ./cmd/server/main.go

# Sinh mã code Golang từ file proto
proto:
	@echo "🔄 Sinh mã gRPC từ proto/agent.proto..."
	@mkdir -p internal/generated/proto
	@protoc --go_out=./internal/generated/proto --go_opt=paths=source_relative \
		--go-grpc_out=./internal/generated/proto --go-grpc_opt=paths=source_relative \
		-I proto proto/agent.proto
	@echo "✅ Sinh mã proto hoàn tất."

# Tạo cặp khóa và chứng chỉ mTLS cho DEV mode (tự ký)
certs:
	@echo "🔐 Đang tạo chứng chỉ mTLS cho Development..."
	@mkdir -p configs/certs
	
	@echo "1. Tạo CA private key và certificate..."
	@openssl req -x509 -newkey rsa:4096 -days 365 -nodes -keyout configs/certs/ca.key -out configs/certs/ca.crt -subj "/C=VN/O=SOC/CN=SOC-CA"
	
	@echo "2. Tạo Server private key và CSR..."
	@openssl req -newkey rsa:4096 -nodes -keyout configs/certs/server.key -out configs/certs/server.csr -subj "/C=VN/O=SOC/CN=localhost"
	
	@echo "3. CA ký Server certificate..."
	@openssl x509 -req -in configs/certs/server.csr -CA configs/certs/ca.crt -CAkey configs/certs/ca.key -CAcreateserial -out configs/certs/server.crt -days 365
	
	@echo "4. Tạo Agent private key và CSR..."
	@openssl req -newkey rsa:4096 -nodes -keyout configs/certs/agent.key -out configs/certs/agent.csr -subj "/C=VN/O=SOC/CN=Agent-Test"
	
	@echo "5. CA ký Agent certificate..."
	@openssl x509 -req -in configs/certs/agent.csr -CA configs/certs/ca.crt -CAkey configs/certs/ca.key -CAcreateserial -out configs/certs/agent.crt -days 365
	
	@echo "✅ Tạo chứng chỉ thành công tại configs/certs/"

# Cài đặt công cụ cần thiết cho dev (protoc plugins)
setup:
	@echo "📦 Đang cài đặt các dependencies..."
	@go mod tidy
	@go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.28
	@go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.2

# Dọn dẹp
clean:
	@echo "🧹 Dọn dẹp bin/ và certs/"
	@rm -rf bin/
	@rm -rf configs/certs/
