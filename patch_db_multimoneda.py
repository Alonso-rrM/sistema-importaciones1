from database import SessionLocal
from sqlalchemy import text

db = SessionLocal()
try:
    # Renombrar monto_usd a monto_original
    db.execute(text("ALTER TABLE registro_gastos RENAME COLUMN monto_usd TO monto_original;"))
    
    # Agregar columna moneda
    db.execute(text("ALTER TABLE registro_gastos ADD COLUMN moneda VARCHAR(3) DEFAULT 'USD';"))
    
    db.commit()
    print("Migración multimoneda ejecutada exitosamente en registro_gastos.")
except Exception as e:
    print(f"Error o ya migrado: {e}")
finally:
    db.close()
