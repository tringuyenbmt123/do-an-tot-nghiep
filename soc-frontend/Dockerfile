# ==============================================================================
# Dockerfile — soc-frontend (React / Vite + Nginx)
# Build production bundle and serve with Nginx
# ==============================================================================

# ── Stage 1: Build ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Cài đặt dependencies (ci hoặc install)
RUN npm install

# Copy toàn bộ mã nguồn
COPY . .

# Đọc API_URL từ build-arg hoặc dùng mặc định
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL

# Build Vite app for production
RUN npm run build

# ── Stage 2: Serve with Nginx ─────────────────────────────────────────────
FROM nginx:alpine AS runner

LABEL org.opencontainers.image.title="SOC/EDR Dashboard"
LABEL org.opencontainers.image.description="React frontend dashboard for SOC Unified Security Platform"

# Xóa trang html mặc định của nginx
RUN rm -rf /usr/share/nginx/html/*

# Copy built assets từ stage 1
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy cấu hình nginx custom để support React Router (SPA)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Nginx lắng nghe port 80 mặc định
EXPOSE 80

# Chạy nginx dưới chế độ background
CMD ["nginx", "-g", "daemon off;"]
