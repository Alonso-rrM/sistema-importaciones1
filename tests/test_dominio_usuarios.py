"""Reglas de las cuentas de usuario (domain/usuarios.py)."""
import pytest

from constantes import Rol
from domain.usuarios import motivo_para_rechazar_cambio

ADMIN, LOGI = Rol.SUPERADMIN, Rol.OPERACIONES


def regla(actor=1, objetivo=2, rol=LOGI, activo=True, rol_nuevo=None, activo_nuevo=None, admins=2):
    return motivo_para_rechazar_cambio(actor, objetivo, rol, activo, rol_nuevo, activo_nuevo, admins)


@pytest.mark.parametrize("cambios, fragmento", [
    ({"objetivo": 1, "activo_nuevo": False, "rol": ADMIN}, "propia cuenta"),
    ({"objetivo": 1, "rol": ADMIN, "rol_nuevo": LOGI}, "a sí mismo"),
    ({"rol": ADMIN, "activo_nuevo": False, "admins": 1}, "al menos un Administrador"),
    ({"rol": ADMIN, "rol_nuevo": LOGI, "admins": 1}, "al menos un Administrador"),
])
def test_cambios_rechazados(cambios, fragmento):
    assert fragmento in regla(**cambios)


@pytest.mark.parametrize("cambios", [
    {"activo_nuevo": False},                                    # desactivar a otro usuario no administrador
    {"rol_nuevo": ADMIN},                                       # promover a otro
    {"rol": ADMIN, "activo_nuevo": False, "admins": 2},         # desactivar a otro admin si queda uno
    {"objetivo": 1, "rol": ADMIN, "rol_nuevo": ADMIN},          # el admin se edita sin perder su rol
    {"rol": ADMIN, "activo": False, "activo_nuevo": True, "admins": 1},   # reactivar un admin inactivo
    {"activo": False, "activo_nuevo": False},                   # sin cambio real
])
def test_cambios_permitidos(cambios):
    assert regla(**cambios) is None
