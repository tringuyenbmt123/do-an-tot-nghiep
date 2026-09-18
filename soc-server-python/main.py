# ==============================================================================
# main.py - Runner cho SOC Server Python
# Sử dụng: python main.py
# Hoặc: uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload
# ==============================================================================

import uvicorn
from app.config import settings

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.server_host,
        port=settings.server_port,
        reload=True,
    )
