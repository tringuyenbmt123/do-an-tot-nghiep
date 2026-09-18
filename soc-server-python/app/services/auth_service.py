# ==============================================================================
# app/services/auth_service.py - Xác thực JWT + bcrypt
# Tương đương: internal/services/auth_service.go
# ==============================================================================

import uuid
from datetime import datetime, timedelta
from typing import Optional, Tuple

import bcrypt
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db

    def verify_password(self, plain: str, hashed: str) -> bool:
        """Kiểm tra mật khẩu với bcrypt hash trực tiếp"""
        try:
            return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
        except Exception:
            return False

    def hash_password(self, password: str) -> str:
        """Tạo bcrypt hash (chuẩn tương thích Go bcrypt)"""
        pwd_bytes = password.encode("utf-8")
        salt = bcrypt.gensalt()
        return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")

    def create_access_token(self, user: User) -> str:
        expire = datetime.utcnow() + timedelta(hours=settings.jwt_expire_hours)
        claims = {
            "sub": user.id,
            "username": user.username,
            "role": user.role,
            "exp": expire,
            "iat": datetime.utcnow(),
        }
        return jwt.encode(claims, settings.jwt_secret, algorithm=settings.jwt_algorithm)

    async def login(self, username: str, password: str) -> Tuple[str, User, Optional[str]]:
        """Kiểm tra user/password, trả về (token, user, error_str). Tương đương Login() trong Go."""
        result = await self.db.execute(
            select(User).where(User.username == username, User.deleted_at.is_(None))
        )
        user = result.scalar_one_or_none()

        if user is None or not self.verify_password(password, user.password_hash):
            return "", None, "Sai tên đăng nhập hoặc mật khẩu"

        if not user.is_active:
            return "", None, "Tài khoản đã bị khóa"

        # Cập nhật last_login_at
        user.last_login_at = datetime.utcnow()
        await self.db.commit()

        token = self.create_access_token(user)
        return token, user, None

    async def create_user(
        self,
        username: str,
        password: str,
        email: str = "",
        role: str = "analyst",
    ) -> User:
        """Tạo user mới"""
        user = User(
            id=str(uuid.uuid4()),
            username=username,
            password_hash=self.hash_password(password),
            email=email,
            role=role,
            is_active=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        return user

    @staticmethod
    def decode_token(token: str) -> dict:
        """Giải mã JWT token. Raise JWTError nếu không hợp lệ."""
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
