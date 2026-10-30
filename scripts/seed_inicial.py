"""
=============================================================
SCRIPT DE SEED INICIAL (Bootstrap del Sistema)
=============================================================
Proposito: Crear los roles y el usuario SUPERADMIN directamente
           en la base de datos SIN necesidad de un token JWT.
           
Usalo SOLO despues de un reset completo de la base de datos.

Ejecucion:
    .venv/Scripts/python.exe scripts/seed_inicial.py

Variables de entorno requeridas en .env:
    DATABASE_URL = postgresql://usuario:clave@host/nombre_bd
    ADMIN_USERNAME = admin
    ADMIN_PASSWORD = tu_clave_segura
    ADMIN_EMAIL = admin@tuempresa.com
=============================================================
"""

import os
import sys

# Anadir el directorio raiz del proyecto al PATH de Python
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from database import SessionLocal
from security import get_password_hash
import models

# -----------------------------------------------------------
# CONFIGURACION: Roles del sistema
# -----------------------------------------------------------
ROLES_INICIALES = [
    {"id_rol": 1, "nombre": "SuperAdmin",   "descripcion": "Acceso total al sistema. Gestion de usuarios y configuracion."},
    {"id_rol": 2, "nombre": "Operaciones",  "descripcion": "Gestion de maestros, DAMs y gastos logisticos."},
    {"id_rol": 3, "nombre": "Finanzas",     "descripcion": "Gestion de pagos, vouchers y reportes financieros."},
    {"id_rol": 4, "nombre": "Auditor",      "descripcion": "Solo lectura. Acceso a logs de auditoria y reportes."},
]

# -----------------------------------------------------------
# CONFIGURACION: Usuario Administrador Inicial
# Se lee desde variables de entorno para no
# exponer credenciales en el codigo fuente.
# -----------------------------------------------------------
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
ADMIN_EMAIL    = os.getenv("ADMIN_EMAIL",    "admin@sistema.local")


def run():
    if not ADMIN_PASSWORD:
        print("\nERROR: La variable ADMIN_PASSWORD no esta definida en tu archivo .env")
        print("   Agrega esta linea a tu .env:")
        print("   ADMIN_PASSWORD=TuClaveSegura123!\n")
        sys.exit(1)

    db = SessionLocal()
    try:
        print("\n>>> INICIANDO SEED DEL SISTEMA...")

        # PASO 1: Crear Roles
        print("\n[1/2] Creando roles del sistema...")
        roles_creados = 0
        for rol_data in ROLES_INICIALES:
            existe = db.query(models.CatRol).filter(models.CatRol.id_rol == rol_data["id_rol"]).first()
            if not existe:
                db.add(models.CatRol(**rol_data))
                print(f"   OK  Rol creado: [{rol_data['id_rol']}] {rol_data['nombre']}")
                roles_creados += 1
            else:
                print(f"   --  Rol ya existe: [{rol_data['id_rol']}] {rol_data['nombre']} -- saltando.")
        db.commit()
        print(f"   -> {roles_creados} roles creados.")

        # PASO 2: Crear Usuario SuperAdmin
        print(f"\n[2/2] Creando usuario SuperAdmin '{ADMIN_USERNAME}'...")
        existe_usuario = db.query(models.Usuario).filter(models.Usuario.username == ADMIN_USERNAME).first()
        if existe_usuario:
            print(f"   --  El usuario '{ADMIN_USERNAME}' ya existe. No se modifico.")
        else:
            admin = models.Usuario(
                id_rol=1,
                username=ADMIN_USERNAME,
                email=ADMIN_EMAIL,
                hashed_password=get_password_hash(ADMIN_PASSWORD),
                is_active=True
            )
            db.add(admin)
            db.commit()
            print(f"   OK  Usuario creado exitosamente.")
            print(f"      Username : {ADMIN_USERNAME}")
            print(f"      Email    : {ADMIN_EMAIL}")
            print(f"      Rol      : SuperAdmin (id_rol=1)")

        print("\n>>> SEED COMPLETADO. Ya puedes iniciar sesion en el frontend.")
        print(f"   Username: {ADMIN_USERNAME}")
        print(f"   Password: (la que pusiste en ADMIN_PASSWORD en .env)\n")

    except Exception as e:
        db.rollback()
        print(f"\nERROR FATAL durante el seed: {e}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    run()
