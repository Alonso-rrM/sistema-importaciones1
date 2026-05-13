from sqlalchemy import Column, Integer, String, Numeric, Date, ForeignKey, DateTime
from database import Base
import datetime
from sqlalchemy.orm import relationship


# --- 1. TABLAS CATÁLOGO ---
class CatProveedor(Base):
    __tablename__ = "cat_proveedores"
    id_proveedor = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(200), unique=True, nullable=False)
    ruc = Column(String(11), unique=True)

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
    fecha_arribo = Column(Date)
    status_llegada = Column(String(50))
    estado_levante = Column(String(50))
    id_almacen = Column(Integer, ForeignKey("cat_almacenes.id_almacen"))
    fob_usd = Column(Numeric(15, 2))
    flete_usd = Column(Numeric(15, 2))
    cfr_usd = Column(Numeric(15, 2))
    venta_sucesiva = Column(String(50))
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
    monto_valor_provisional_usd = Column(Numeric(15, 2))
    tipo_valor = Column(String(50))
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    maestro = relationship("MaestroImportacion", back_populates="dams")
    pagos = relationship("RegistroPago", back_populates="dam")

class RegistroPago(Base):
    __tablename__ = "registro_pagos"
    id_pago = Column(Integer, primary_key=True, index=True)
    id_dam = Column(Integer, ForeignKey("detalle_dams.id_dam"), nullable=False)
    concepto_gasto = Column(String(100))
    moneda = Column(String(10))
    importe = Column(Numeric(15, 2))
    tipo_cambio = Column(Numeric(10, 4))
    estado_pago = Column(String(50))
    fecha_pago = Column(Date)
    numero_operacion = Column(String(100))
    id_banco = Column(Integer, ForeignKey("cat_bancos.id_banco"))
    id_empresa = Column(Integer, ForeignKey("cat_empresas.id_empresa"))
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    dam = relationship("DetalleDam", back_populates="pagos")
    banco = relationship("CatBanco", backref="pagos")
    empresa = relationship("CatEmpresa", backref="pagos")
