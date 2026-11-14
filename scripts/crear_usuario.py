"""
CREAR UN USUARIO DESDE LA CONSOLA
=================================
Mientras no exista una pantalla de usuarios, así se crean las cuentas de Logística, Tesorería, Auditoría
(u otro Administrador). Aplica las mismas reglas que la API (POST /usuarios/): usuario de 3 a 50
caracteres, correo válido, contraseña segura y nombre de usuario sin repetir.

Uso (desde la raíz del proyecto, con el .env configurado):
    python scripts/crear_usuario.py --usuario mperez --correo mperez@empresa.com --rol logistica

La contraseña se pide por teclado (no queda en el historial de la consola).
Roles: administrador, logistica, tesoreria, auditoria.
"""
import argparse
import getpass
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)

from pydantic import ValidationError  # noqa: E402

from constantes import Rol  # noqa: E402

ROLES = {"administrador": Rol.SUPERADMIN, "logistica": Rol.OPERACIONES, "tesoreria": Rol.FINANZAS, "auditoria": Rol.AUDITOR}


def main() -> int:
    parser = argparse.ArgumentParser(description="Crea un usuario del sistema.")
    parser.add_argument("--usuario", required=True, help="Nombre de usuario para iniciar sesión.")
    parser.add_argument("--correo", required=True)
    parser.add_argument("--rol", required=True, choices=ROLES)
    args = parser.parse_args()

    clave = getpass.getpass("Contraseña: ")
    if clave != getpass.getpass("Repita la contraseña: "):
        print("ERROR: las contraseñas no coinciden.")
        return 1

    # Importaciones que leen el .env (DATABASE_URL, SECRET_KEY)
    import models
    import schemas
    from database import SessionLocal
    from security import get_password_hash

    try:
        datos = schemas.UsuarioCreate(id_rol=ROLES[args.rol], username=args.usuario, email=args.correo, password=clave)
    except ValidationError as error:
        for detalle in error.errors():
            print(f"ERROR en {detalle['loc'][-1]}: {str(detalle['msg']).removeprefix('Value error, ')}")
        return 1

    db = SessionLocal()
    try:
        if not db.get(models.CatRol, int(datos.id_rol)):
            print("ERROR: los roles no existen todavía. Cree primero el administrador (pantalla /setup o seed_inicial.py).")
            return 1
        if db.query(models.Usuario).filter(models.Usuario.username == datos.username).first():
            print(f"ERROR: el usuario '{datos.username}' ya existe.")
            return 1
        db.add(models.Usuario(id_rol=datos.id_rol, username=datos.username, email=datos.email,
                              is_active=True, hashed_password=get_password_hash(datos.password)))
        db.commit()
        print(f"Usuario '{datos.username}' creado con el rol {args.rol}.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
