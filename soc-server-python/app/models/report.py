from sqlalchemy import Column, BigInteger, String, DateTime, Boolean
from app.database import Base
from datetime import datetime, UTC

class Report(Base):
    __tablename__ = "reports"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    type = Column(String(64), nullable=False)
    range = Column(String(64), nullable=False)
    format = Column(String(16), nullable=False) # csv, pdf
    file_path = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(UTC))

class ReportSchedule(Base):
    __tablename__ = "report_schedules"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    name = Column(String(128), nullable=False)
    type = Column(String(64), nullable=False)
    cron = Column(String(64), nullable=False)
    recipients = Column(String(255), nullable=True)
    enabled = Column(Boolean, nullable=False, default=True)
