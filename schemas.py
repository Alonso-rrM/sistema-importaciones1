from typing import List
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime

# --- ESQUEMAS PARA CAT_BANCOS (Los que ya teníamos) ---
class CatBancoCreate(BaseModel):
    nombre: str

class CatBanco(BaseModel):
    id_banco: int
    nombre: str

    class Config:
        from_attributes = True

class CatAgenteCreate(BaseModel):
    nombre: str

class CatAgente(BaseModel):
    id_agente: int
    nombre: str

    class Config:
        from_attributes = True

class CatProveedorCreate(BaseModel):
    nombre: str
    ruc: str

class CatProveedor(BaseModel):
    id_proveedor: int
    nombre: str
    ruc: Optional[str] = None

    class Config:
        from_attributes = True

class CatAlmacenCreate(BaseModel):
    nombre: str

class CatAlmacen(BaseModel):
    id_almacen: int
    nombre: str

    class Config:
        from_attributes = True

class CatImportadorCreate(BaseModel):
    nombre: str
    ruc: str

class CatImportador(BaseModel):
    id_importador: int
    nombre: str
    ruc: Optional[str] = None 

    class Config:
        from_attributes = True

class CatEmpresaCreate(BaseModel):
    nombre: str
    ruc: str

class CatEmpresa(BaseModel):
    id_empresa: int
    nombre: str
    ruc: Optional[str] = None
    class Config:
        from_attributes = True

# --- NUEVOS ESQUEMAS PARA MAESTRO_IMPORTACIONES ---

# Esquema para recibir los datos (Crear Maestro)
class MaestroImportacionCreate(BaseModel):
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
    fob_usd: Optional[float] = None
    flete_usd: Optional[float] = None
    cfr_usd: Optional[float] = None
    venta_sucesiva: Optional[str] = None

# Esquema para devolver los datos (Leer Maestro)
class MaestroImportacion(MaestroImportacionCreate):
    id_maestro: int
    estado_registro: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# --- ESQUEMAS PARA DETALLE_DAMS ---

class DetalleDamCreate(BaseModel):
    id_maestro: int  # Obligatorio: ¿A qué factura pertenece?
    numero_de_dam: str # Obligatorio
    serie: Optional[str] = None
    canal_control: Optional[str] = None
    monto_valor_provisional_usd: Optional[float] = None
    tipo_valor: Optional[str] = None

class DetalleDam(DetalleDamCreate):
    id_dam: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# --- ESQUEMAS PARA REGISTRO_PAGOS ---

class RegistroPagoCreate(BaseModel):
    id_dam: int # Obligatorio: ¿A qué DAM pertenece el pago?
    concepto_gasto: Optional[str] = None
    moneda: Optional[str] = None
    importe: Optional[float] = None
    tipo_cambio: Optional[float] = None
    estado_pago: Optional[str] = None
    fecha_pago: Optional[date] = None
    numero_operacion: Optional[str] = None
    id_banco: Optional[int] = None
    id_empresa: Optional[int] = None

class RegistroPago(RegistroPagoCreate):
    id_pago: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# --- ESQUEMAS PARA REPORTES CONSOLIDADOS ---

class MaestroConDetalles(MaestroImportacion):
    dams: List[DetalleDam] = [] 

    class Config:
        from_attributes = True
        