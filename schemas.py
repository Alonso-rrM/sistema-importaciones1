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

class CatProveedorCreate(BaseModel):
    nombre: str
    ruc: str

class CatProveedor(BaseModel):
    id_proveedor: int
    nombre: str
    ruc: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class CatAlmacenCreate(BaseModel):
    nombre: str

class CatAlmacen(BaseModel):
    id_almacen: int
    nombre: str
    model_config = ConfigDict(from_attributes=True)

class CatImportadorCreate(BaseModel):
    nombre: str
    ruc: str

class CatImportador(BaseModel):
    id_importador: int
    nombre: str
    ruc: Optional[str] = None 
    model_config = ConfigDict(from_attributes=True)

class CatEmpresaCreate(BaseModel):
    nombre: str
    ruc: str

class CatEmpresa(BaseModel):
    id_empresa: int
    nombre: str
    ruc: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class CatConceptoPagoCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = None

class CatConceptoPago(CatConceptoPagoCreate):
    id_concepto: int
    estado_registro: str
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

# --- 3. ESQUEMAS PARA DETALLE_DAMS ---

class DetalleDamBase(BaseModel):
    id_maestro: int
    numero_de_dam: str
    serie: Optional[str] = None
    canal_control: Optional[str] = None
    monto_valor_provisional_usd: Optional[Decimal] = None

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

# --- 4. ESQUEMAS PARA REGISTRO_GASTOS ---

class RegistroGastoCreate(BaseModel):
    id_dam: int
    id_concepto: int
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

# --- 6. ESQUEMAS PARA REPORTES CONSOLIDADOS ---

class MaestroConDetalles(MaestroImportacion):
    dams: List[DetalleDam] = [] 
    model_config = ConfigDict(from_attributes=True)