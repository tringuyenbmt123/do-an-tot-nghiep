from sqlalchemy import Column, String, Integer
from app.database import Base

class MitreTechnique(Base):
    __tablename__ = "mitre_techniques"
    id = Column(String(16), primary_key=True) # e.g. T1059
    name = Column(String(255), nullable=False)
    tactic = Column(String(64), nullable=False)
    hits = Column(Integer, nullable=False, default=0)
