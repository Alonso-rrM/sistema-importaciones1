"""
Reglas de las cuentas de usuario (puras, sin base de datos).

Evitan que el sistema se quede sin nadie que lo administre: el Administrador no puede quitarse a sí mismo
el acceso, y siempre debe quedar al menos un Administrador activo.
"""
from typing import Optional

from constantes import Rol


def motivo_para_rechazar_cambio(
    id_actor: int,
    id_objetivo: int,
    rol_actual: int,
    activo_actual: bool,
    rol_nuevo: Optional[int],
    activo_nuevo: Optional[bool],
    administradores_activos: int,
) -> Optional[str]:
    """
    Motivo por el que NO se puede aplicar el cambio de rol / estado a un usuario, o None si se puede.

    `rol_nuevo` y `activo_nuevo` son None cuando ese dato no cambia. `administradores_activos` cuenta a los
    Administradores activos ANTES del cambio (incluido el objetivo, si lo es).
    """
    rol_final = rol_actual if rol_nuevo is None else rol_nuevo
    activo_final = activo_actual if activo_nuevo is None else activo_nuevo

    if id_actor == id_objetivo:
        if not activo_final:
            return "No puede desactivar su propia cuenta."
        if rol_final != Rol.SUPERADMIN and rol_actual == Rol.SUPERADMIN:
            return "No puede quitarse a sí mismo el rol de Administrador."

    era_admin_activo = rol_actual == Rol.SUPERADMIN and activo_actual
    sigue_admin_activo = rol_final == Rol.SUPERADMIN and activo_final
    if era_admin_activo and not sigue_admin_activo and administradores_activos <= 1:
        return "Debe quedar al menos un Administrador activo en el sistema."
    return None
