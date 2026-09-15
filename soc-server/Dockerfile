# Multi-stage Dockerfile cho SOC Server
# Stage 1: Build binary
FROM golang:1.25-alpine AS builder

WORKDIR /app

# Cài đặt git và build tools cần thiết
RUN apk add --no-cache git ca-certificates tzdata

# Cache dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build executable tối ưu dung lượng
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o /app/soc-server ./cmd/server/main.go

# Stage 2: Runtime image siêu nhẹ
FROM alpine:3.19

WORKDIR /app

# Cài đặt tzdata và ca-certificates cho HTTPS/gRPC
RUN apk add --no-cache ca-certificates tzdata
ENV TZ=Asia/Ho_Chi_Minh

# Copy binary và configs từ stage builder
COPY --from=builder /app/soc-server /app/soc-server
COPY --from=builder /app/configs /app/configs

EXPOSE 8080 50051

ENTRYPOINT ["/app/soc-server"]
