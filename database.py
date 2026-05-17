import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base

# --- EJEMPLO DE ARCHIVO .env ---
# DATABASE_URL=postgresql://postgres:Dmc081953@localhost:5432/importaciones_db
# -------------------------------

load_dotenv()

URL_BASE_DATOS = os.getenv("DATABASE_URL")

if not URL_BASE_DATOS:
    raise ValueError("La variable de entorno DATABASE_URL no está configurada. Verifica tu archivo .env")

engine = create_engine(URL_BASE_DATOS)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()