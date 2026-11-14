import re as _re
from typing import List, Optional, Dict, Any, Generic, TypeVar, Annotated
from pydantic import BaseModel, ConfigDict, Field, AfterValidator, model_validator

from datetime import date, datetime
from decimal import Decimal
from domain.validaciones import (
    ValorInvalido, limpiar_texto, normalizar_numero_dam, normalizar_ruc, normalizar_ruc_opcional,
)
from constantes import (
    CategoriaProveedor,
    ClaseAduanera,
    EstadoDam,
    EstadoDocumentario,
    EstadoLevante,
    EstadoPago,
    EstadoRegistro,
    Moneda,
    Rol,
    StatusLlegada,
    TipoGasto,
    TipoValor,
)

# Tipos financieros validados (blindaje contra montos negativos/cero y divisas inválidas).
# Las monedas admitidas se definen una sola vez en constantes.Moneda.
MontoPositivo = Annotated[Decimal, Field(gt=0, max_digits=15, decimal_places=2)]
MontoNoNegativo = Annotated[Decimal, Field(ge=0, max_digits=15, decimal_places=2)]

# --- Tipos para lo que digita la usuaria (reglas en domain/validaciones.py) ---
# Solo se aplican a lo que se ESCRIBE: las respuestas aceptan registros antiguos tal como están.


def _texto_obligatorio(valor: str) -> str:
    limpio = limpiar_texto(valor)
    if not limpio:
        raise ValorInvalido("no puede quedar vacío.")
    return limpio


TextoObligatorio = Annotated[str, AfterValidator(_texto_obligatorio)]
TextoOpcional = Annotated[Optional[str], AfterValidator(limpiar_texto)]


def texto_opcional(largo_maximo: int):
    """Texto opcional de hasta `largo_maximo` caracteres; vacío o solo espacios -> None."""
    return Optional[Annotated[str, Field(max_length=largo_maximo), AfterValidator(limpiar_texto)]]
Ruc = Annotated[str, AfterValidator(normalizar_ruc)]
NumeroDam = Annotated[str, Field(max_length=100), AfterValidator(normalizar_numero_dam)]


def _fechas_en_orden(embarque: Optional[date], arribo: Optional[date]) -> None:
    if embarque and arribo and arribo < embarque:
        raise ValorInvalido("La fecha de arribo no puede ser anterior a la fecha de embarque.")

# --- Tipos de seguridad para cuentas de usuario ---

def _validar_password(v: str) -> str:
    """Política mínima: 10+ caracteres, con mayúscula, minúscula y número. Máx. 72 bytes (límite de bcrypt)."""
    if len(v) < 10:
        raise ValueError("La contraseña debe tener al menos 10 caracteres.")
    if len(v.encode("utf-8")) > 72:
        raise ValueError("La contraseña no puede superar 72 bytes.")
    if not (_re.search(r"[a-z]", v) and _re.search(r"[A-Z]", v) and _re.search(r"\d", v)):
        raise ValueError("La contraseña debe incluir mayúsculas, minúsculas y números.")
    return v

def _validar_email(v: str) -> str:
    v = v.strip().lower()
    if not _re.fullmatch(r"[^@\s]+@[^@\s]+\.[A-Za-z]{2,}", v):
        raise ValueError("Correo electrónico inválido.")
    return v

def _validar_username(v: str) -> str:
    v = v.strip()
    if not _re.fullmatch(r"[A-Za-z0-9._-]{3,50}", v):
        raise ValueError("El usuario debe tener 3 a 50 caracteres: letras, números, punto, guion o guion bajo.")
    return v

PasswordSegura = Annotated[str, AfterValidator(_validar_password)]
Email = Annotated[str, AfterValidator(_validar_email)]
Username = Annotated[str, AfterValidator(_validar_username)]

# --- MODELO GENÉRICO DE PAGINACIÓN ---
T = TypeVar('T')

class PaginatedResponse(BaseModel, Generic[T]):
    total_registros: int
    pagina: int
    limite: int
    total_paginas: int
    data: List[T]

# --- 1. ESQUEMAS PARA CATÁLOGOS ---

class CatBancoCreate(BaseModel):
    nombre: Annotated[TextoObligatorio, Field(max_length=100)]

class CatBanco(BaseModel):
    id_banco: int
    nombre: str
    estado_registro: str = EstadoRegistro.ACTIVO
    model_config = ConfigDict(from_attributes=True)

class CatBancoUpdate(BaseModel):
    nombre: Optional[Annotated[TextoObligatorio, Field(max_length=100)]] = None

class CatAgenteCreate(BaseModel):
    nombre: Annotated[TextoObligatorio, Field(max_length=100)]
    ruc: Ruc

class CatAgente(BaseModel):
    id_agente: int
    nombre: str
    ruc: Optional[str] = None
    estado_registro: str = EstadoRegistro.ACTIVO
    model_config = ConfigDict(from_attributes=True)

class CatAgenteUpdate(BaseModel):
    nombre: Optional[Annotated[TextoObligatorio, Field(max_length=100)]] = None
    ruc: Optional[str] = None   # se valida en routers/catalogos.py solo si cambia (puede haber RUC antiguos)

class CatProveedorCreate(BaseModel):
    nombre: Annotated[TextoObligatorio, Field(max_length=200)]
    ruc: Optional[str] = None
    categoria: str = CategoriaProveedor.NACIONAL

    @model_validator(mode="after")
    def _validar_ruc(self):
        # Proveedores peruanos (nacionales y el Estado): RUC opcional, pero si se indica debe ser válido.
        # Del exterior: identificación tributaria libre (sin espacios sobrantes).
        if self.categoria == CategoriaProveedor.INTERNACIONAL:
            self.ruc = limpiar_texto(self.ruc)
        else:
            self.ruc = normalizar_ruc_opcional(self.ruc)
        return self

class CatProveedor(BaseModel):
    id_proveedor: int
    nombre: str
    ruc: Optional[str] = None
    categoria: str = CategoriaProveedor.NACIONAL
    estado_registro: str = EstadoRegistro.ACTIVO
    model_config = ConfigDict(from_attributes=True)

class CatProveedorUpdate(BaseModel):
    nombre: Optional[Annotated[TextoObligatorio, Field(max_length=200)]] = None
    ruc: Optional[str] = None   # se valida en routers/catalogos.py solo si cambia (puede haber RUC antiguos)
    categoria: Optional[str] = None

class CatAlmacenCreate(BaseModel):
    nombre: Annotated[TextoObligatorio, Field(max_length=100)]
    ubicacion: texto_opcional(255) = None

class CatAlmacen(BaseModel):
    id_almacen: int
    nombre: str
    ubicacion: Optional[str] = None
    estado_registro: str = EstadoRegistro.ACTIVO
    model_config = ConfigDict(from_attributes=True)

class CatAlmacenUpdate(BaseModel):
    nombre: Optional[Annotated[TextoObligatorio, Field(max_length=100)]] = None
    ubicacion: texto_opcional(255) = None

class CatImportadorCreate(BaseModel):
    nombre: Annotated[TextoObligatorio, Field(max_length=150)]
    ruc: Ruc

class CatImportador(BaseModel):
    id_importador: int
    nombre: str
    ruc: Optional[str] = None
    estado_registro: str = EstadoRegistro.ACTIVO
    model_config = ConfigDict(from_attributes=True)

class CatImportadorUpdate(BaseModel):
    nombre: Optional[Annotated[TextoObligatorio, Field(max_length=150)]] = None
    ruc: Optional[str] = None   # se valida en routers/catalogos.py solo si cambia (puede haber RUC antiguos)



class CatConceptoPagoCreate(BaseModel):
    nombre: Annotated[TextoObligatorio, Field(max_length=100)]
    descripcion: TextoOpcional = None
    tipo_gasto: Optional[str] = TipoGasto.FIJO_DESPACHO
    # Papel en el despacho aduanero. Si no se envía, el servidor propone uno según el nombre.
    clase_aduanera: Optional[ClaseAduanera] = None

class CatConceptoPago(BaseModel):
    id_concepto: int
    nombre: str
    descripcion: Optional[str] = None
    estado_registro: str
    tipo_gasto: str = TipoGasto.FIJO_DESPACHO
    clase_aduanera: str = ClaseAduanera.NINGUNA
    model_config = ConfigDict(from_attributes=True)

class CatConceptoPagoUpdate(BaseModel):
    nombre: Optional[Annotated[TextoObligatorio, Field(max_length=100)]] = None
    descripcion: TextoOpcional = None
    tipo_gasto: Optional[str] = None
    clase_aduanera: Optional[ClaseAduanera] = None

# --- NUEVOS CATÁLOGOS: DOCUMENTOS Y TIPO DE CAMBIO ---

class CatalogoDocumentoPagoBase(BaseModel):
    nombre_documento: str
    multiplicador_financiero: int

class CatalogoDocumentoPagoCreate(CatalogoDocumentoPagoBase):
    nombre_documento: Annotated[TextoObligatorio, Field(max_length=50)]

class CatalogoDocumentoPagoUpdate(BaseModel):
    nombre_documento: Optional[Annotated[TextoObligatorio, Field(max_length=50)]] = None
    multiplicador_financiero: Optional[int] = None

class CatalogoDocumentoPago(CatalogoDocumentoPagoBase):
    id_tipo_doc: int
    estado_registro: str
    model_config = ConfigDict(from_attributes=True)


class HistorialTipoCambioBase(BaseModel):
    fecha: date
    precio_compra: Decimal
    precio_venta: Decimal

class HistorialTipoCambioCreate(HistorialTipoCambioBase):
    pass

class HistorialTipoCambio(HistorialTipoCambioBase):
    # CORRECCIÓN DE AUDITORÍA: En models.py la PK es 'fecha'. No existe 'id_historial'.
    # Si mantenemos id_historial sin default, Pydantic lanzará error al intentar leer de la base de datos,
    # ya que buscará un campo que el ORM no tiene.
    model_config = ConfigDict(from_attributes=True)


# --- ESQUEMAS PARA VOUCHERS BANCARIOS ---

class VoucherBancarioBase(BaseModel):
    banco_id: int
    id_importador: int
    numero_operacion: str
    monto_total: Decimal
    moneda: str  # 'USD' o 'PEN'
    fecha_transferencia: date

class VoucherBancarioCreate(VoucherBancarioBase):
    numero_operacion: Annotated[TextoObligatorio, Field(max_length=100)]
    monto_total: MontoPositivo
    moneda: Moneda

class VoucherBancarioUpdate(BaseModel):
    banco_id: int | None = None
    id_importador: int | None = None
    numero_operacion: Optional[Annotated[TextoObligatorio, Field(max_length=100)]] = None
    monto_total: Decimal | None = Field(default=None, gt=0, max_digits=15, decimal_places=2)
    saldo_disponible: Decimal | None = None
    moneda: Moneda | None = None
    fecha_transferencia: date | None = None
    version: int | None = None

class VoucherBancarioResponse(VoucherBancarioBase):
    id_voucher: int
    saldo_disponible: Decimal
    estado_registro: str
    version: int
    model_config = ConfigDict(from_attributes=True)

# --- 2. ESQUEMAS PARA MAESTRO_IMPORTACIONES ---

class MaestroImportacionBase(BaseModel):
    numero_factura: str
    n_cont_fisico: Optional[str] = None
    id_agente: Optional[int] = None
    id_importador: Optional[int] = None
    id_proveedor: Optional[int] = None
    documento_transporte: Optional[str] = None
    fecha_embarque: Optional[date] = None
    fecha_arribo: Optional[date] = None
    status_llegada: Optional[str] = StatusLlegada.EN_TRANSITO
    estado_levante: Optional[str] = EstadoLevante.SIN_LEVANTE
    estado_documentario: Optional[str] = EstadoDocumentario.SIN_NUMERAR
    fecha_levante_maestro: Optional[date] = None
    fecha_recepcion_almacen: Optional[date] = None
    id_almacen: Optional[int] = None
    fob_usd: Optional[Decimal] = None
    flete_usd: Optional[Decimal] = None
    cfr_usd: Optional[Decimal] = None
    venta_sucesiva: Optional[str] = None
    tipo_valor: Optional[str] = TipoValor.DEFINITIVO
    version: int = 1

class MaestroImportacionCreate(MaestroImportacionBase):
    numero_factura: Annotated[TextoObligatorio, Field(max_length=100)]
    n_cont_fisico: texto_opcional(100) = None
    documento_transporte: texto_opcional(100) = None
    fob_usd: Optional[MontoNoNegativo] = None
    flete_usd: Optional[MontoNoNegativo] = None
    cfr_usd: Optional[MontoNoNegativo] = None

    @model_validator(mode="after")
    def _validar_fechas(self):
        _fechas_en_orden(self.fecha_embarque, self.fecha_arribo)
        return self

class MaestroImportacion(MaestroImportacionBase):
    id_maestro: int
    estado_registro: str
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

class MaestroImportacionUpdate(BaseModel):
    numero_factura: Optional[Annotated[TextoObligatorio, Field(max_length=100)]] = None
    n_cont_fisico: texto_opcional(100) = None
    id_agente: int | None = None
    id_importador: int | None = None
    id_proveedor: int | None = None
    documento_transporte: texto_opcional(100) = None
    fecha_embarque: date | None = None
    fecha_arribo: date | None = None
    status_llegada: str | None = None
    estado_levante: str | None = None
    estado_documentario: str | None = None
    fecha_levante_maestro: date | None = None
    fecha_recepcion_almacen: date | None = None
    id_almacen: int | None = None
    fob_usd: Optional[MontoNoNegativo] = None
    flete_usd: Optional[MontoNoNegativo] = None
    cfr_usd: Optional[MontoNoNegativo] = None
    venta_sucesiva: str | None = None
    tipo_valor: str | None = None
    version: int | None = None

class MaestroLookup(BaseModel):
    id_maestro: int
    numero_factura: str
    n_cont_fisico: Optional[str] = None
    tipo_valor: str
    model_config = ConfigDict(from_attributes=True)


# --- 3. ESQUEMAS PARA DETALLE_DAMS ---

class DetalleDamBase(BaseModel):
    id_maestro: int
    numero_de_dam: str
    serie: Optional[str] = None
    canal_control: Optional[str] = None
    monto_valor_provisional_usd: Optional[Decimal] = None
    aforo_realizado: bool = False  # <--- NUEVO
    estado_dam: Optional[str] = EstadoDam.NUMERADA
    fecha_levante: Optional[date] = None

class DamLookup(BaseModel):
    id_dam: int
    numero_de_dam: str
    id_maestro: int
    model_config = ConfigDict(from_attributes=True)

class DetalleDamCreate(DetalleDamBase):
    numero_de_dam: NumeroDam
    serie: texto_opcional(50) = None
    monto_valor_provisional_usd: Optional[MontoPositivo] = None

class DetalleDam(DetalleDamBase):
    id_dam: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class DetalleDamUpdate(BaseModel):
    id_maestro: int | None = None
    numero_de_dam: str | None = None   # se valida en routers/operaciones.py solo si cambia (puede haber DAM antiguas)
    serie: texto_opcional(50) = None
    canal_control: str | None = None
    monto_valor_provisional_usd: Optional[MontoPositivo] = None
    aforo_realizado: bool | None = None  # <--- NUEVO OPCIONAL
    estado_dam: str | None = None
    fecha_levante: date | None = None


# --- 4. ESQUEMAS PARA REGISTRO_GASTOS ---

class RegistroGastoCreate(BaseModel):
    id_dam: int
    id_concepto: int
    id_proveedor: int
    id_tipo_doc: int
    numero_documento: texto_opcional(50) = None   # formato según el proveedor (routers/finanzas.py)
    fecha_vencimiento: Optional[date] = None
    monto_original: MontoPositivo
    moneda: Moneda = Moneda.USD
    observaciones: TextoOpcional = None

class PagoDetalleSimple(BaseModel):
    id_pago: int
    fecha_pago: Optional[date] = None
    moneda: str
    importe: Decimal
    tipo_cambio: Decimal
    voucher_id: Optional[int] = None
    numero_operacion: Optional[str] = None
    banco_nombre: Optional[str] = None
    monto_moneda_origen: Optional[Decimal] = None
    es_ajuste_sistema: bool = False
    model_config = ConfigDict(from_attributes=True)

class RegistroGasto(RegistroGastoCreate):
    # La respuesta debe poder serializar registros históricos aunque no cumplan las validaciones nuevas
    monto_original: Decimal
    moneda: str = Moneda.USD
    id_gasto: int
    estado_pago: str
    estado_registro: str
    created_at: Optional[datetime] = None

    # Propiedades calculadas / enriquecidas para UI
    saldo_pendiente: Optional[Decimal] = None
    dam_numero: Optional[str] = None
    importador_nombre: Optional[str] = None
    id_importador: Optional[int] = None
    maestro_factura: Optional[str] = None
    proveedor_nombre: Optional[str] = None
    concepto_nombre: Optional[str] = None
    tipo_doc_nombre: Optional[str] = None
    pagos_detalle: Optional[List[PagoDetalleSimple]] = []

    model_config = ConfigDict(from_attributes=True)

RegistroGastoResponse = RegistroGasto

class RegistroGastoUpdate(BaseModel):
    id_dam: int | None = None
    id_concepto: int | None = None
    id_proveedor: int | None = None
    id_tipo_doc: int | None = None
    numero_documento: texto_opcional(50) = None
    fecha_vencimiento: date | None = None
    monto_original: Decimal | None = Field(default=None, gt=0, max_digits=15, decimal_places=2)
    moneda: Moneda | None = None
    observaciones: TextoOpcional = None


# --- 5. ESQUEMAS PARA REGISTRO_PAGOS ---

class RegistroPagoCreate(BaseModel):
    """
    Entrada de un pago. Solo se confía en: gasto, voucher, moneda, importe, TC, fecha y
    (si es moneda cruzada) el débito real reportado por el banco. El resto lo deriva el servidor.
    """
    model_config = ConfigDict(extra="ignore")

    id_gasto: int
    voucher_id: int  # Obligatorio: no existe pago sin respaldo bancario (los Ajustes ZD los crea solo el servidor)
    moneda: Moneda
    importe: MontoPositivo
    tipo_cambio: Decimal = Field(gt=0, max_digits=15, decimal_places=4)
    fecha_pago: Optional[date] = None
    pago_moneda_cruzada: bool = False
    # Solo se usa cuando pago_moneda_cruzada=True (débito real del banco). Si no, lo calcula el servidor.
    monto_moneda_origen: Optional[Decimal] = Field(default=None, gt=0, max_digits=15, decimal_places=2)

class RegistroPago(BaseModel):
    """Respuesta de un pago (lectura)."""
    id_dam: int | None = None
    id_concepto: int | None = None
    moneda: str
    importe: Decimal
    tipo_cambio: Decimal
    estado_pago: Optional[str] = EstadoPago.PAGADO
    fecha_pago: Optional[date] = None
    id_importador: Optional[int] = None
    id_gasto: Optional[int] = None
    es_ajuste_sistema: bool = False
    tipo_cambio_aplicado: Optional[Decimal] = None
    voucher_id: Optional[int] = None
    pago_moneda_cruzada: bool = False
    gasto_financiero_tc: Decimal = Decimal("0.00")
    monto_moneda_origen: Decimal
    id_pago: int
    created_at: Optional[datetime] = None
    
    # Propiedades enriquecidas para UI y trazabilidad
    dam_numero: Optional[str] = None
    importador_nombre: Optional[str] = None
    concepto_nombre: Optional[str] = None
    numero_operacion: Optional[str] = None
    banco_nombre: Optional[str] = None
    gasto_documento: Optional[str] = None
    proveedor_nombre: Optional[str] = None
    gasto_moneda: Optional[str] = None
    gasto_monto: Optional[Decimal] = None
    gasto_observaciones: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class RegistroPagoUpdate(BaseModel):
    """
    Un pago registrado es inmutable en lo financiero (importe, moneda, TC, voucher, gasto, débito).
    Si hubo error, se anula (DELETE con motivo) y se registra de nuevo. Solo se corrige la fecha.
    """
    model_config = ConfigDict(extra="forbid")
    fecha_pago: date | None = None


# --- 6. ESQUEMAS PARA REPORTES CONSOLIDADOS ---

class MaestroConDetalles(MaestroImportacion):
    dams: List[DetalleDam] = [] 
    model_config = ConfigDict(from_attributes=True)


# --- 7. ESQUEMAS PARA ESTADOS DE CUENTA (ANALÍTICO) ---

class EstadoCuentaDam(BaseModel):
    id_dam: int
    numero_de_dam: str
    total_gastos_pen: Decimal
    total_pagado_pen: Decimal
    saldo_pendiente_pen: Decimal
    model_config = ConfigDict(from_attributes=True)

class EstadoCuentaFacturaResumen(BaseModel):
    id_maestro: int
    numero_factura: str
    documento_transporte: Optional[str] = None
    total_general_gastos_pen: Decimal
    total_general_pagado_pen: Decimal
    saldo_general_pendiente_pen: Decimal
    porcentaje_amortizado: Decimal
    desglose_dams: List[EstadoCuentaDam]
    model_config = ConfigDict(from_attributes=True)

# --- 8. ESQUEMAS PARA SEGURIDAD, RBAC Y AUDITORÍA ---

# -- CatRol --
class CatRolBase(BaseModel):
    nombre: str
    descripcion: Optional[str] = None

class CatRolCreate(CatRolBase):
    pass

class CatRol(CatRolBase):
    id_rol: int
    estado_registro: str
    model_config = ConfigDict(from_attributes=True)

# -- Usuario --
class UsuarioBase(BaseModel):
    id_rol: int
    username: str
    email: str
    is_active: bool = True

class UsuarioCreate(UsuarioBase):
    id_rol: Rol
    username: Username
    email: Email
    password: PasswordSegura  # Recibido en texto plano, jamás devuelto

class Usuario(UsuarioBase):
    id_usuario: int
    created_at: datetime
    # Se excluye deliberadamente password y hashed_password para máxima seguridad
    model_config = ConfigDict(from_attributes=True)

# -- AuditLog --
class AuditLogBase(BaseModel):
    id_usuario: Optional[int] = None
    endpoint: str
    accion: str
    ip_address: Optional[str] = None
    detalles: Optional[str] = None

class AuditLogCreate(AuditLogBase):
    pass

class AuditLog(AuditLogBase):
    id_log: int
    created_at: datetime
    nombre_usuario: Optional[str] = None
    resumen_legible: Optional[str] = None
    detalles_legibles: Optional[Dict[str, Any]] = None
    model_config = ConfigDict(from_attributes=True)

# --- 9. [INTEGRADO] ESQUEMA DE BORRADO FÍSICO ---

class EliminacionRequest(BaseModel):
    motivo: str = Field(..., min_length=10, description="Motivo de la eliminación.")

# --- 10. ESQUEMAS DE AUDITORÍA (TABLAS SOMBRA) ---

class AuditoriaBaseResponse(BaseModel):
    id_eliminacion: int
    motivo_eliminacion: str
    usuario_id: int
    fecha_eliminacion: datetime
    nombre_usuario_ejecutor: str | None = None
    identificador_principal: str | None = None
    detalles_legibles: Optional[Dict[str, Any]] = None
    
    model_config = ConfigDict(from_attributes=True)

class MaestroEliminadoResponse(AuditoriaBaseResponse):
    id_maestro: Optional[int] = None
    numero_factura: str
    n_cont_fisico: Optional[str] = None
    id_agente: Optional[int] = None
    id_importador: Optional[int] = None
    id_proveedor: Optional[int] = None
    documento_transporte: Optional[str] = None
    fecha_embarque: Optional[date] = None
    fecha_arribo: Optional[date] = None
    status_llegada: Optional[str] = None
    estado_levante: Optional[str] = None
    id_almacen: Optional[int] = None
    fob_usd: Optional[Decimal] = None
    flete_usd: Optional[Decimal] = None
    cfr_usd: Optional[Decimal] = None
    venta_sucesiva: Optional[str] = None
    tipo_valor: Optional[str] = None
    created_at: Optional[datetime] = None
    estado_registro: Optional[str] = None
    version: Optional[int] = None

class DamEliminadaResponse(AuditoriaBaseResponse):
    id_dam: Optional[int] = None
    id_maestro: int
    numero_de_dam: str
    serie: Optional[str] = None
    canal_control: Optional[str] = None
    monto_valor_provisional_usd: Optional[Decimal] = None
    aforo_realizado: Optional[bool] = None
    created_at: Optional[datetime] = None

class GastoEliminadoResponse(AuditoriaBaseResponse):
    id_gasto: Optional[int] = None
    id_dam: int
    id_concepto: int
    monto_original: Decimal
    moneda: str = Moneda.USD
    estado_pago: Optional[str] = None
    estado_registro: Optional[str] = None
    created_at: Optional[datetime] = None
    id_proveedor: Optional[int] = None
    id_tipo_doc: Optional[int] = None
    numero_documento: Optional[str] = None
    fecha_vencimiento: Optional[date] = None
    observaciones: Optional[str] = None

class PagoEliminadoResponse(AuditoriaBaseResponse):
    id_pago: Optional[int] = None
    id_dam: int
    id_concepto: int
    moneda: str
    importe: Decimal
    tipo_cambio: Decimal
    estado_pago: Optional[str] = None
    fecha_pago: Optional[date] = None
    id_importador: Optional[int] = None
    id_gasto: Optional[int] = None
    created_at: Optional[datetime] = None
    estado_registro: Optional[str] = None
    es_ajuste_sistema: Optional[bool] = None
    tipo_cambio_aplicado: Optional[Decimal] = None
    # [SPRINT 1] Columnas de Voucher
    voucher_id: Optional[int] = None
    pago_moneda_cruzada: Optional[bool] = None
    gasto_financiero_tc: Optional[Decimal] = None
    monto_moneda_origen: Optional[Decimal] = None

class VoucherEliminadoResponse(AuditoriaBaseResponse):
    id_voucher: Optional[int] = None
    banco_id: Optional[int] = None
    numero_operacion: Optional[str] = None
    monto_total: Optional[Decimal] = None
    saldo_disponible: Optional[Decimal] = None
    moneda: Optional[str] = None
    fecha_transferencia: Optional[date] = None
    estado_registro: Optional[str] = None
    version: Optional[int] = None