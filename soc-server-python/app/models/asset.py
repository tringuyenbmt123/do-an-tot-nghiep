from sqlalchemy import Column, BigInteger, String, Enum, DateTime
from app.database import Base
from datetime import datetime, UTC

class Asset(Base):
    __tablename__ = "assets"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    hostname = Column(String(128), unique=True, nullable=False)
    ip = Column(String(45), nullable=True)
    type = Column(Enum("server", "workstation", "network", "cloud", name="asset_type"), nullable=False)
    os = Column(String(64), nullable=True)
    owner = Column(String(64), nullable=True)
    criticality = Column(Enum("high", "med", "low", name="asset_criticality"), nullable=False, default="med")
    last_seen = Column(DateTime, nullable=True)
