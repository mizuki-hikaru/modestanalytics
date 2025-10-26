import os
from datetime import datetime, timezone

from sqlalchemy import (
    create_engine, Column, Integer, String, DateTime, ForeignKey
)
from sqlalchemy.orm import sessionmaker, declarative_base, relationship, Session

# ----------------------
# Database setup
# ----------------------
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./analytics.db")
engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String, index=True, nullable=False)
    token = Column(String, index=True, nullable=False)
    verification_code = Column(String, nullable=True)
    verification_code_expiry = Column(DateTime, nullable=True)

    pageviews = relationship("Pageview", back_populates="user")


class Pageview(Base):
    __tablename__ = "pageviews"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    domain = Column(String, nullable=False)
    path = Column(String, nullable=False)
    referrer = Column(String, nullable=False)
    time_spent_on_page = Column(Integer, nullable=False)
    view_id = Column(String, nullable=True)

    user = relationship("User", back_populates="pageviews")


Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()