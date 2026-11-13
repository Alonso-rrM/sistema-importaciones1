"""
VALORES FIJOS DEL SISTEMA (única fuente de verdad)
==================================================
Todo rol, estado, moneda o categoría que el sistema compara o guarda se define AQUÍ una sola vez.
El resto del código usa estos nombres (p. ej. `EstadoPago.PAGADO`) en lugar de escribir el texto
("PAGADO") a mano: un error de tipeo deja de ser un fallo silencioso y pasa a ser un error inmediato
al arrancar el servidor o al correr el linter.

Los miembros valen exactamente el texto que se guarda en la base de datos
(`EstadoPago.PAGADO == "PAGADO"` es verdadero), así que no cambia ningún dato almacenado.

Su espejo en el frontend es `frontend/src/constants/index.js`: si se agrega o cambia un valor aquí,
hay que reflejarlo allá.
"""
from enum import IntEnum, StrEnum


# ----------------------------------------------------------------------------------------------
# Roles de usuario (tabla cat_roles)
# ----------------------------------------------------------------------------------------------
class Rol(IntEnum):
    SUPERADMIN = 1    # Acceso total, gestión de usuarios y configuración
    OPERACIONES = 2   # Logística: contenedores, DAMs y registro de gastos
    FINANZAS = 3      # Tesorería: pagos, vouchers y reportes financieros
    AUDITOR = 4       # Solo lectura: bitácora y reportes


# Grupos de roles autorizados (para RoleChecker). El SuperAdmin siempre está incluido.
ROLES_SOLO_ADMIN = [Rol.SUPERADMIN]
ROLES_OPERACIONES = [Rol.SUPERADMIN, Rol.OPERACIONES]
ROLES_FINANZAS = [Rol.SUPERADMIN, Rol.FINANZAS]
ROLES_AUDITORIA = [Rol.SUPERADMIN, Rol.AUDITOR]
ROLES_OPERACIONES_Y_FINANZAS = [Rol.SUPERADMIN, Rol.OPERACIONES, Rol.FINANZAS]


# ----------------------------------------------------------------------------------------------
# Estados generales
# ----------------------------------------------------------------------------------------------
class EstadoRegistro(StrEnum):
    """Borrado lógico de cualquier registro (columna estado_registro)."""
    ACTIVO = "ACTIVO"
    INACTIVO = "INACTIVO"


class Moneda(StrEnum):
    USD = "USD"   # Dólares
    PEN = "PEN"   # Soles


class EstadoPago(StrEnum):
    """Situación de pago de un gasto (registro_gastos.estado_pago)."""
    PENDIENTE = "PENDIENTE"
    PARCIAL = "PARCIAL"
    PAGADO = "PAGADO"


# ----------------------------------------------------------------------------------------------
# Contenedor (maestro de importación)
# ----------------------------------------------------------------------------------------------
class TipoValor(StrEnum):
    DEFINITIVO = "DEFINITIVO"
    GARANTIZADO = "GARANTIZADO"


class EstadoDocumentario(StrEnum):
    """Estado consolidado del contenedor, calculado a partir de sus DAMs y su ubicación física."""
    SIN_NUMERAR = "SIN NUMERAR"
    EN_PROCESO = "EN PROCESO"
    ATENCION_PARCIAL = "ATE. PARCIAL"
    CON_LEVANTE_PENDIENTE_INGRESO = "CON LEVANTE (PEND. INGRESO)"
    EN_ALMACEN_PENDIENTE_OMC = "EN ALMACÉN (PEND. OMC)"
    ATENCION_TOTAL = "ATE. TOTAL"


class EstadoLevante(StrEnum):
    """Autorización de levante del contenedor (maestro_importaciones.estado_levante)."""
    SIN_LEVANTE = "SIN LEVANTE"
    CON_LEVANTE = "CON LEVANTE"


class StatusLlegada(StrEnum):
    """Ubicación física del contenedor."""
    EN_TRANSITO = "EN TRÁNSITO"
    EN_PUERTO = "EN PUERTO"
    EN_ALMACEN_TEMPORAL = "EN ALMACÉN TEMPORAL"
    PENDIENTE_DESCARGA = "PENDIENTE DESCARGA"
    RETIRO_PROGRAMADO = "RETIRO PROGRAMADO"
    EN_ALMACEN = "EN ALMACÉN"


# ----------------------------------------------------------------------------------------------
# DAM
# ----------------------------------------------------------------------------------------------
class CanalControl(StrEnum):
    VERDE = "VERDE"
    NARANJA = "NARANJA"
    ROJO = "ROJO"


class EstadoDam(StrEnum):
    """Estado documentario de una DAM (detalle_dams.estado_dam)."""
    NUMERADA = "NUMERADA / EN EVALUACIÓN"
    PENDIENTE_PAGO_PROFORMA = "PENDIENTE PAGO PROFORMA"
    PENDIENTE_AFORO = "PENDIENTE DE AFORO"
    OBSERVADA = "OBSERVADA / NOTIFICADA"
    EN_REVISION = "EN REVISIÓN"
    CON_LEVANTE = "CON LEVANTE"
    CON_LEVANTE_GARANTIA_ACTIVA = "CON LEVANTE (GARANTÍA ACTIVA)"
    EN_REVISION_OMC = "EN REVISIÓN OMC (POST-LEVANTE)"
    PENDIENTE_PAGO_OMC = "PENDIENTE PAGO OMC"
    GARANTIA_CERRADA = "GARANTÍA CERRADA / LIQUIDADA"


# ----------------------------------------------------------------------------------------------
# Catálogos
# ----------------------------------------------------------------------------------------------
class CategoriaProveedor(StrEnum):
    NACIONAL = "NACIONAL"
    INTERNACIONAL = "INTERNACIONAL"
    ESTADO_O_TRIBUTO = "ESTADO_O_TRIBUTO"   # SUNAT y demás entidades del Estado


class ClaseAduanera(StrEnum):
    """
    Papel del concepto en el despacho aduanero (cat_conceptos_pagos.clase_aduanera).
    Es lo que usa la máquina de estados de la DAM para decidir levantes y reversiones:
    la PROFORMA es TRIBUTO + PERCEPCION; la OMC se evalúa aparte. No depende del nombre del concepto.
    """
    NINGUNA = "NINGUNA"         # Fletes, almacenaje, multas, etc.: no intervienen en el levante
    TRIBUTO = "TRIBUTO"
    PERCEPCION = "PERCEPCION"
    OMC = "OMC"


class TipoGasto(StrEnum):
    """Etapa a la que pertenece un concepto de gasto (cat_conceptos_pagos.tipo_gasto)."""
    FIJO_DESPACHO = "FIJO_DESPACHO"
    POST_LEVANTE = "POST_LEVANTE"
    EXTRAORDINARIO = "EXTRAORDINARIO"


# ----------------------------------------------------------------------------------------------
# Bitácora: eventos de negocio registrados explícitamente (audit_logs.accion)
# ----------------------------------------------------------------------------------------------
class AccionAuditoria(StrEnum):
    CREACION_GASTO = "CREACION GASTO"
    CREACION_PAGO = "CREACION PAGO"
    EDICION_FECHA_PAGO = "EDICION FECHA PAGO"
    REGISTRO_TIPO_CAMBIO = "REGISTRO TIPO CAMBIO"
    CORRECCION_TIPO_CAMBIO = "CORRECCION TIPO CAMBIO"
    CAMBIO_ESTADO_DAM = "CAMBIO ESTADO DAM"
    REVERSION_AUTOMATICA_DAM = "REVERSION AUTOMATICA DAM"
    AUTORIZACION_LEVANTE = "AUTORIZACION LEVANTE"
    DESBLOQUEO_LEVANTE = "DESBLOQUEO LEVANTE"
