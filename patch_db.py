from database import SessionLocal
from sqlalchemy import text

db = SessionLocal()
try:
    db.execute(text("ALTER TABLE catalogo_documentos_pago ADD COLUMN estado_registro VARCHAR(20) DEFAULT 'ACTIVO';"))
    db.commit()
    print("Columna agregada exitosamente.")
except Exception as e:
    print(f"Error o ya existe: {e}")
finally:
    db.close()
