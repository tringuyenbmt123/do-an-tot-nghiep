# Lưu lại những thay đổi mới nhất của frontend mà tôi vừa code
git add soc-frontend/
git commit -m "Keep local React frontend updates"

# Pull các cập nhật từ remote (kể cả database mới)
Write-Host "Đang pull code từ github..." -ForegroundColor Cyan
git pull origin main --no-edit

# Nếu có conflict ở frontend (do remote cũng có file frontend cũ), ưu tiên giữ code local
if ($LASTEXITCODE -ne 0) {
    Write-Host "Phát hiện conflict, đang ưu tiên giữ lại giao diện frontend mới..." -ForegroundColor Yellow
    git checkout --ours soc-frontend/
    git add soc-frontend/
    git commit -m "Merge branch 'main' - Keep local frontend"
}

# Thêm tất cả các file còn lại (kể cả database update mới pull về nếu có thay đổi gì thêm, hoặc code python)
git add .
git commit -m "Update database and backend, integrate with new UI"

# Push toàn bộ lên git
Write-Host "Đang push code lên github..." -ForegroundColor Cyan
git push origin main

Write-Host "Hoàn tất! Hãy kiểm tra lại Github của bạn." -ForegroundColor Green
