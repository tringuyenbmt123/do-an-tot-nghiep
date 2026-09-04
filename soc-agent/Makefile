# ==============================================================================
# Makefile cho SOC/EDR Agent
# ==============================================================================

BINARY_NAME=soc-agent
BUILD_DIR=bin

.PHONY: all build build-windows build-linux clean run tidy

all: tidy build

# Tải và dọn dẹp go dependencies
tidy:
	go mod tidy

# Build mặc định cho OS hiện tại
build: tidy
	go build -ldflags="-s -w" -o $(BUILD_DIR)/$(BINARY_NAME) main.go

# Build file thực thi Windows (.exe)
build-windows: tidy
	$$env:GOOS="windows"; $$env:GOARCH="amd64"; go build -ldflags="-s -w" -o $(BUILD_DIR)/$(BINARY_NAME).exe main.go

# Build file thực thi Linux (ELF binary)
build-linux: tidy
	$$env:GOOS="linux"; $$env:GOARCH="amd64"; go build -ldflags="-s -w" -o $(BUILD_DIR)/$(BINARY_NAME)-linux main.go

# Chạy trực tiếp Agent
run:
	go run main.go -config config.json

# Xóa thư mục build
clean:
	Remove-Item -Recurse -Force $(BUILD_DIR)
