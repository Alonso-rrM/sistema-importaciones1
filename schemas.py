from typing import List, Optional
from pydantic import BaseModel, ConfigDict
from datetime import date, datetime
from decimal import Decimal
from enum import Enum

# --- 1. ESQUEMAS PARA CATÁLOGOS ---

class CatBancoCreate(BaseModel):
    nombre: str

class CatBanco(BaseModel):
    id_banco: int
    nombre: str
    model_config = ConfigDict(from_attributes=True)

class CatAgenteCreate(BaseModel):
    nombre: str

class CatAgente(BaseModel):
    id_agente: int
    nombre: str
    model_config = ConfigDict(from_attributes=True)

class CatAgenteUpdate(BaseModel):
    nombre: Optional[str] = None

class CatProveedorCreate(BaseModel):
    nombre: str
    ruc: str
    categoria: str = "NACIONAL"

class CatProveedor(BaseModel):
    id_proveedor: int
    nombre: str
    ruc: Optional[str] = None
    categoria: str = "NACIONAL"
    model_config = ConfigDict(from_attributes=True)

class CatProveedorUpdate(BaseModel):
    nombre: Optional[str] = None
    ruc: Optional[str] = None
    categoria: Optional[str] = None

class CatAlmacenCreate(BaseModel):
    nombre: str

class CatAlmacen(BaseModel):
    id_almacen: int
    nombre: str
    model_config = ConfigDict(from_attributes=True)

class CatAlmacenUpdate(BaseModel):
    nombre: Optional[str] = None

class CatImportadorCreate(BaseModel):
    nombre: str
    ruc: str

class CatImportador(BaseModel):
    id_importador: int
    nombre: str
    ruc: Optional[str] = None 
    model_config = ConfigDict(from_attributes=True)

class CatImportadorUpdate(BaseModel):
    nombre: Optional[str] = None
    ruc: Optional[str] = None

class CatEmpresaCreate(BaseModel):
    nombre: str
    ruc: str

class CatEmpresa(BaseModel):
    id_empresa: int
    nombre: str
    ruc: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class CatEmpresaUpdate(BaseModel):
    nombre: Optional[str] = None
    ruc: Optional[str] = None

class CatConceptoPagoCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = None

class CatConceptoPago(CatConceptoPagoCreate):
    id_concepto: int
    estado_registro: str
    model_config = ConfigDict(from_attributes=True)

# --- NUEVOS CATÁLOGOS: DOCUMENTOS Y TIPO DE CAMBIO ---

class CatalogoDocumentoPagoBase(BaseModel):
    nombre_documento: str
    multiplicador_financiero: int

class CatalogoDocumentoPagoCreate(CatalogoDocumentoPagoBase):
    pass

class CatalogoDocumentoPago(CatalogoDocumentoPagoBase):
    id_tipo_doc: int
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
    status_llegada: Optional[str] = "EN TRÁNSITO"
    estado_levante: Optional[str] = "SIN LEVANTE"
    id_almacen: Optional[int] = None
    fob_usd: Optional[Decimal] = None
    flete_usd: Optional[Decimal] = None
    cfr_usd: Optional[Decimal] = None
    venta_sucesiva: Optional[str] = None
    tipo_valor: Optional[str] = "DEFINITIVO"
    version: int = 1

class MaestroImportacionCreate(MaestroImportacionBase):
    pass

class MaestroImportacion(MaestroImportacionBase):
    id_maestro: int
    estado_registro: str
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

class MaestroImportacionUpdate(BaseModel):
    numero_factura: str | None = None
    n_cont_fisico: str | None = None
    id_agente: int | None = None
    id_importador: int | None = None
    id_proveedor: int | None = None
    documento_transporte: str | None = None
    fecha_embarque: date | None = None
    fecha_arribo: date | None = None
    status_llegada: str | None = None
    estado_levante: str | None = None
    id_almacen: int | None = None
    fob_usd: Decimal | None = None
    flete_usd: Decimal | None = None
    cfr_usd: Decimal | None = None
    venta_sucesiva: str | None = None
    tipo_valor: str | None = None
    version: int | None = None


# --- 3. ESQUEMAS PARA DETALLE_DAMS ---

class DetalleDamBase(BaseModel):
    id_maestro: int
    numero_de_dam: str
    serie: Optional[str] = None
    canal_control: Optional[str] = None
    monto_valor_provisional_usd: Optional[Decimal] = None
    aforo_realizado: bool = False  # <--- NUEVO

class DetalleDamCreate(DetalleDamBase):
    pass

class DetalleDam(DetalleDamBase):
    id_dam: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class DetalleDamUpdate(BaseModel):
    id_maestro: int | None = None
    numero_de_dam: str | None = None
    serie: str | None = None
    canal_control: str | None = None
    monto_valor_provisional_usd: Decimal | None = None
    aforo_realizado: bool | None = None  # <--- NUEVO OPCIONAL


# --- 4. ESQUEMAS PARA REGISTRO_GASTOS ---

class RegistroGastoCreate(BaseModel):
    id_dam: int
    id_concepto: int
    id_proveedor: int
    id_tipo_doc: int
    numero_documento: Optional[str] = None
    fecha_vencimiento: Optional[date] = None
    monto_usd: Decimal

class RegistroGasto(RegistroGastoCreate):
    id_gasto: int
    estado_pago: str
    estado_registro: str
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

class RegistroGastoUpdate(BaseModel):
    id_dam: int | None = None
    id_concepto: int | None = None
    id_proveedor: int | None = None
    id_tipo_doc: int | None = None
    numero_documento: str | None = None
    fecha_vencimiento: date | None = None
    monto_usd: Decimal | None = None


# --- 5. ESQUEMAS PARA REGISTRO_PAGOS ---

class MonedaEnum(str, Enum):
    USD = "USD"
    PEN = "PEN"

class RegistroPagoCreate(BaseModel):
    id_dam: int | None = None
    id_concepto: int | None = None
    moneda: MonedaEnum
    importe: Decimal
    tipo_cambio: Decimal
    estado_pago: Optional[str] = "PAGADO"
    fecha_pago: Optional[date] = None
    numero_operacion: Optional[str] = None
    id_banco: Optional[int] = None
    id_empresa: Optional[int] = None
    id_gasto: Optional[int] = None
    es_ajuste_sistema: bool = False
    tipo_cambio_aplicado: Optional[Decimal] = None

class RegistroPago(RegistroPagoCreate):
    id_pago: int
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

class RegistroPagoUpdate(BaseModel):
    moneda: MonedaEnum | None = None
    importe: Decimal | None = None
    tipo_cambio: Decimal | None = None
    numero_operacion: str | None = None
    id_banco: int | None = None
    id_empresa: int | None = None
    id_gasto: int | None = None
    es_ajuste_sistema: bool | None = None
    tipo_cambio_aplicado: Decimal | None = None


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
    password: str  # Recibido en texto plano, jamás devuelto

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
    model_config = ConfigDict(from_attributes=True)