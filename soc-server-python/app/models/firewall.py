from sqlalchemy import Column, BigInteger, String, Enum, DateTime, Integer, Boolean
from app.database import Base
from datetime import datetime, UTC

class FwRule(Base):
    __tablename__ = "fw_rules"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    action = Column(Enum("allow", "deny", "drop", name="fw_action"), nullable=False)
    src = Column(String(128), nullable=False)
    dst = Column(String(128), nullable=False)
    port = Column(String(32), nullable=False)
    hits = Column(Integer, nullable=False, default=0)
    enabled = Column(Boolean, nullable=False, default=True)

class IdsEvent(Base):
    __tablename__ = "ids_events"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    sid = Column(String(64), nullable=False)
    signature = Column(String(255), nullable=False)
    severity = Column(Enum("crit", "high", "med", "low", name="ids_severity"), nullable=False)
    count = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(UTC))

class IpBlocklist(Base):
    __tablename__ = "ip_blocklist"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    cidr = Column(String(50), unique=True, nullable=False)
    reason = Column(String(255), nullable=True)
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(UTC))
