from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base

# Cambia "TU_CONTRASEÑA" por la clave de tu usuario postgres
URL_BASE_DATOS = "postgresql://postgres:Dmc081953@localhost:5432/postgres"

engine = create_engine(URL_BASE_DATOS)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
# para victor