"""
INICIALIZACIÓN DE UNA BASE DE DATOS VACÍA
=========================================
Úselo para: un servidor nuevo, una restauración en blanco o la base de pruebas.
NO lo use para actualizar una base existente: para eso es  `alembic upgrade head`.

Qué hace (receta oficial de Alembic, "Building an Up to Date Database from Scratch"):
  1. Verifica que la base esté VACÍA (si encuentra tablas del ERP, se detiene sin tocar nada).
  2. Crea todo el esquema desde models.py (Base.metadata.create_all).
  3. Marca la base en la última migración (`alembic stamp head`), para que las futuras
     migraciones se apliquen con normalidad.

Uso (desde la raíz del proyecto):
    python scripts/init_db.py                  -> usa DATABASE_URL del entorno / .env
    python scripts/init_db.py --url <URL>      -> usa otra base (ej. la de pruebas)

Después, para crear el SuperAdmin: abra el frontend en /setup  (o ejecute scripts/seed_inicial.py).
"""
import argparse
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    parser = argparse.ArgumentParser(description="Crea el esquema completo en una base de datos vacía.")
    parser.add_argument("--url", help="URL de la base a inicializar (por defecto DATABASE_URL).")
    args = parser.parse_args()

    if args.url:
        os.environ["DATABASE_URL"] = args.url  # antes de importar database.py (load_dotenv no lo pisa)

    sys.path.insert(0, RAIZ)
    os.chdir(RAIZ)

    import sqlalchemy as sa
    from alembic import command
    from alembic.config import Config
    from database import engine, Base
    import models  # noqa: F401  (registra todas las tablas en Base.metadata)

    destino = engine.url.render_as_string(hide_password=True)
    tablas_existentes = set(sa.inspect(engine).get_table_names())
    tablas_erp = set(Base.metadata.tables)
    choque = sorted(tablas_existentes & tablas_erp)
    if choque:
        print(f"[DETENIDO] La base {destino} NO está vacía: ya contiene {len(choque)} tabla(s) del ERP "
              f"(ej. {', '.join(choque[:3])}).\n"
              "Para actualizar una base existente use:  alembic upgrade head")
        sys.exit(1)

    print(f"Creando esquema en {destino} ...")
    Base.metadata.create_all(engine)

    cfg = Config(os.path.join(RAIZ, "alembic.ini"))
    command.stamp(cfg, "head")
    print(f"[OK] {len(tablas_erp)} tablas creadas y base marcada en la última migración de Alembic.")


if __name__ == "__main__":
    main()
