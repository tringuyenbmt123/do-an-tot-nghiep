from sqlalchemy import Column, String, DECIMAL, Boolean, Date, Enum
from app.database import Base

class Vulnerability(Base):
    __tablename__ = "vulnerabilities"
    cve = Column(String(20), primary_key=True)
    description = Column(String(255), nullable=False)
    cvss = Column(DECIMAL(3,1), nullable=False)
    exploited = Column(Boolean, nullable=False, default=False)
    due_date = Column(Date, nullable=True)
    status = Column(Enum("open", "patching", "fixed", "accepted", name="vuln_status"), nullable=False, default="open")
