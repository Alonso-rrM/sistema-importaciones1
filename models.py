import datetime
# Agregamos 'Boolean' a las importaciones para el ZAJUSTE
from sqlalchemy import Column, Integer, String, Numeric, Date, ForeignKey, DateTime, Text, Boolean
from sqlalchemy.orm import relationship
from database import Base

# --- 1. TABLAS CATÁLOGO ---

# [NUEVO] Catálogo de Documentos y su impacto contable
class CatalogoDocumentoPago(Base):
    __tablename__ = "catalogo_documentos_pago"
    id_tipo_doc = Column(Integer, primary_key=True, index=True)
    nombre_documento = Column(String(50), unique=True, nullable=False)
    multiplicador_financiero = Column(Integer, nullable=False)
    
    gastos = relationship("RegistroGasto", back_populates="tipo_doc_rel")

# [NUEVO] Historial automatizado de SUNAT
class HistorialTipoCambio(Base):
    __tablename__ = "historial_tipo_cambio"
    fecha = Column(Date, primary_key=True, default=datetime.date.today)
    precio_compra = Column(Numeric(15, 4), nullable=False)
    precio_venta = Column(Numeric(15, 4), nullable=False)

class CatConceptoPago(Base):
    __tablename__ = "cat_conceptos_pagos"
    id_concepto = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), unique=True, nullable=False)
    descripcion = Column(Text)
    estado_registro = Column(String(20), default="ACTIVO")
    pagos = relationship("RegistroPago", back_populates="concepto_rel")
    gastos = relationship("RegistroGasto", back_populates="concepto_rel")
    
class CatProveedor(Base):
    __tablename__ = "cat_proveedores"
    id_proveedor = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(200), unique=True, nullable=False)
    ruc = Column(String(11), unique=True)
    # [NUEVO] Clasificación del proveedor
    categoria = Column(String(30), default="NACIONAL")
    
    gastos = relationship("RegistroGasto", back_populates="proveedor_rel")

class CatAlmacen(Base):
    __tablename__ = "cat_almacenes"
    id_almacen = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), unique=True, nullable=False)

class CatBanco(Base):
    __tablename__ = "cat_bancos"
    id_banco = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), unique=True, nullable=False)

class CatEmpresa(Base):
    __tablename__ = "cat_empresas"
    id_empresa = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(150), unique=True, nullable=False)
    ruc = Column(String(11), unique=True)

class CatAgente(Base):
    __tablename__ = "cat_agentes"
    id_agente = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), unique=True, nullable=False)

class CatImportador(Base):
    __tablename__ = "cat_importadores"
    id_importador = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(150), unique=True, nullable=False)
    ruc = Column(String(11), unique=True)

# --- 2. TABLAS PRINCIPALES ---

class MaestroImportacion(Base):
    __tablename__ = "maestro_importaciones"
    id_maestro = Column(Integer, primary_key=True, index=True)
    numero_factura = Column(String(100), unique=True, nullable=False)
    n_cont_fisico = Column(String(100))
    id_agente = Column(Integer, ForeignKey("cat_agentes.id_agente"))
    id_importador = Column(Integer, ForeignKey("cat_importadores.id_importador"))
    id_proveedor = Column(Integer, ForeignKey("cat_proveedores.id_proveedor"))
    documento_transporte = Column(String(100))
    fecha_embarque = Column(Date)
    fecha_arribo = Column(Date, nullable=True)
    status_llegada = Column(String(50), nullable=True, default="EN TRÁNSITO")
    estado_levante = Column(String(50), nullable=True, default="SIN LEVANTE")
    id_almacen = Column(Integer, ForeignKey("cat_almacenes.id_almacen"), nullable=True)
    fob_usd = Column(Numeric(15, 2))
    flete_usd = Column(Numeric(15, 2))
    cfr_usd = Column(Numeric(15, 2))
    venta_sucesiva = Column(String(50))
    tipo_valor = Column(String(50), default="DEFINITIVO")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    dams = relationship("DetalleDam", back_populates="maestro")
    estado_registro = Column(String(20), default="ACTIVO")

class DetalleDam(Base):
    __tablename__ = "detalle_dams"
    id_dam = Column(Integer, primary_key=True, index=True)
    id_maestro = Column(Integer, ForeignKey("maestro_importaciones.id_maestro"), nullable=False)
    numero_de_dam = Column(String(100), unique=True, nullable=False)
    serie = Column(String(50))
    canal_control = Column(String(50))
    monto_valor_provisional_usd = Column(Numeric(15, 2), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    maestro = relationship("MaestroImportacion", back_populates="dams")
    pagos = relationship("RegistroPago", back_populates="dam")
    gastos = relationship("RegistroGasto", back_populates="dam")

class RegistroGasto(Base):
    __tablename__ = "registro_gastos"
    id_gasto = Column(Integer, primary_key=True, index=True)
    id_dam = Column(Integer, ForeignKey("detalle_dams.id_dam"), nullable=False)
    id_concepto = Column(Integer, ForeignKey("cat_conceptos_pagos.id_concepto"), nullable=False)
    monto_usd = Column(Numeric(15, 2), nullable=False)
    estado_pago = Column(String(50), default="PENDIENTE")
    estado_registro = Column(String(20), default="ACTIVO")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # [NUEVO] Control Documental y Proveedores
    id_proveedor = Column(Integer, ForeignKey("cat_proveedores.id_proveedor"))
    id_tipo_doc = Column(Integer, ForeignKey("catalogo_documentos_pago.id_tipo_doc"))
    numero_documento = Column(String(50))
    fecha_vencimiento = Column(Date)

    dam = relationship("DetalleDam", back_populates="gastos")
    concepto_rel = relationship("CatConceptoPago", back_populates="gastos")
    pagos = relationship("RegistroPago", back_populates="gasto_rel")
    proveedor_rel = relationship("CatProveedor", back_populates="gastos")
    tipo_doc_rel = relationship("CatalogoDocumentoPago", back_populates="gastos")

class RegistroPago(Base):
    __tablename__ = "registro_pagos"
    id_pago = Column(Integer, primary_key=True, index=True)
    id_dam = Column(Integer, ForeignKey("detalle_dams.id_dam"), nullable=False)
    id_concepto = Column(Integer, ForeignKey("cat_conceptos_pagos.id_concepto"), nullable=False)
    moneda = Column(String(3), nullable=False)
    importe = Column(Numeric(15, 2), nullable=False)
    tipo_cambio = Column(Numeric(15, 2), nullable=False)
    estado_pago = Column(String(50))
    fecha_pago = Column(Date)
    numero_operacion = Column(String(100))
    id_banco = Column(Integer, ForeignKey("cat_bancos.id_banco"))
    id_empresa = Column(Integer, ForeignKey("cat_empresas.id_empresa"))
    id_gasto = Column(Integer, ForeignKey("registro_gastos.id_gasto"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    estado_registro = Column(String(20), default="ACTIVO")
    
    # [NUEVO] Parches de Auditoría
    es_ajuste_sistema = Column(Boolean, default=False)
    tipo_cambio_aplicado = Column(Numeric(15, 4))
    
    dam = relationship("DetalleDam", back_populates="pagos")
    banco = relationship("CatBanco", backref="pagos")
    empresa = relationship("CatEmpresa", backref="pagos")
    concepto_rel = relationship("CatConceptoPago", back_populates="pagos")
    gasto_rel = relationship("RegistroGasto", back_populates="pagos")

# --- 3. TABLAS DE SEGURIDAD, RBAC Y AUDITORÍA ---

class CatRol(Base):
    __tablename__ = "cat_roles"
    id_rol = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(50), unique=True, nullable=False)
    descripcion = Column(Text)
    estado_registro = Column(String(20), default="ACTIVO")
    
    usuarios = relationship("Usuario", back_populates="rol")

class Usuario(Base):
    __tablename__ = "usuarios"
    id_usuario = Column(Integer, primary_key=True, index=True)
    id_rol = Column(Integer, ForeignKey("cat_roles.id_rol"), nullable=False)
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(100), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    rol = relationship("CatRol", back_populates="usuarios")
    audit_logs = relationship("AuditLog", back_populates="usuario")

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id_log = Column(Integer, primary_key=True, index=True)
    id_usuario = Column(Integer, ForeignKey("usuarios.id_usuario"), nullable=True) # Puede ser nulo para logins fallidos
    endpoint = Column(String(255), nullable=False)
    accion = Column(String(100), nullable=False)
    ip_address = Column(String(50))
    detalles = Column(Text)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    usuario = relationship("Usuario", back_populates="audit_logs")
