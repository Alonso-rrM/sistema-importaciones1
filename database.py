import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base

# -------------------------------

load_dotenv()

URL_BASE_DATOS = os.getenv("DATABASE_URL")

if not URL_BASE_DATOS:
    raise ValueError("La variable de entorno DATABASE_URL no está configurada. Verifica tu archivo .env")

engine = create_engine(
    URL_BASE_DATOS,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()