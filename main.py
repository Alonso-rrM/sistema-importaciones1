from typing import List
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

import models
import schemas
from database import SessionLocal, engine

# Nos aseguramos de que las tablas existan
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="API de Importaciones y Pagos")

# Función vital: Abre y cierra la conexión a la base de datos para cada petición
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- PATRÓN STRATEGY PARA VALIDACIÓN DE DAMS ---

def validar_dam_definitiva(dam: schemas.DetalleDamCreate):
    dam.monto_valor_provisional_usd = None
    return dam

def validar_dam_provisional(dam: schemas.DetalleDamCreate):
    if not dam.monto_valor_provisional_usd or dam.monto_valor_provisional_usd <= 0:
        raise HTTPException(
            status_code=400, 
            detail="Operación rechazada. Como el Maestro es 'PROVISIONAL', el campo 'monto_valor_provisional_usd' es obligatorio y debe ser mayor a 0."
        )
    return dam

ESTRATEGIAS_VALIDACION_DAM = {
    "DEFINITIVO": validar_dam_definitiva,
    "PROVISIONAL": validar_dam_provisional
}

@app.get("/")
def ruta_principal():
    return {"mensaje": "¡Servidor de Importaciones funcionando al 100%!"}

# --- ENDPOINTS DE CATÁLOGOS ---
@app.post("/bancos/", response_model=schemas.CatBanco)
def crear_banco(banco: schemas.CatBancoCreate, db: Session = Depends(get_db)):
    nuevo_banco = models.CatBanco(nombre=banco.nombre)
    db.add(nuevo_banco)
    db.commit()
    db.refresh(nuevo_banco)
    return nuevo_banco

@app.post("/agentes/", response_model=schemas.CatAgente)
def crear_agente(agente: schemas.CatAgenteCreate, db: Session = Depends(get_db)):
    nuevo_agente = models.CatAgente(**agente.model_dump())
    db.add(nuevo_agente)
    db.commit()
    db.refresh(nuevo_agente)
    return nuevo_agente

@app.post("/proveedores/", response_model=schemas.CatProveedor)
def crear_proveedor(proveedor: schemas.CatProveedorCreate, db: Session = Depends(get_db)):
    nuevo_proveedor = models.CatProveedor(**proveedor.model_dump())
    db.add(nuevo_proveedor)
    db.commit()
    db.refresh(nuevo_proveedor)
    return nuevo_proveedor

@app.post("/almacenes/", response_model=schemas.CatAlmacen)
def crear_almacen(almacen: schemas.CatAlmacenCreate, db: Session = Depends(get_db)):
    nuevo_almacen = models.CatAlmacen(**almacen.model_dump())
    db.add(nuevo_almacen)
    db.commit()
    db.refresh(nuevo_almacen)
    return nuevo_almacen

@app.post("/importadores/", response_model=schemas.CatImportador)
def crear_importador(importador: schemas.CatImportadorCreate, db: Session = Depends(get_db)):
    nuevo_importador = models.CatImportador(**importador.model_dump())
    db.add(nuevo_importador)
    db.commit()
    db.refresh(nuevo_importador)
    return nuevo_importador

@app.post("/empresas/", response_model=schemas.CatEmpresa)
def crear_empresa(empresa: schemas.CatEmpresaCreate, db: Session = Depends(get_db)):
    try:
        nueva_empresa = models.CatEmpresa(**empresa.model_dump())
        db.add(nueva_empresa)
        db.commit()
        db.refresh(nueva_empresa)
        return nueva_empresa
    except IntegrityError as e:
        db.rollback() 
        raise HTTPException(status_code=400, detail="Error: El Nombre o RUC ya están registrados.")

# --- ENDPOINTS PARA MAESTRO_IMPORTACIONES ---
@app.post("/maestros/", response_model=schemas.MaestroImportacion)
def crear_maestro(maestro: schemas.MaestroImportacionCreate, db: Session = Depends(get_db)):
    nuevo_maestro = models.MaestroImportacion(**maestro.model_dump())
    db.add(nuevo_maestro)
    db.commit()
    db.refresh(nuevo_maestro)
    return nuevo_maestro

# --- ENDPOINTS PARA DAMS (CON STRATEGY PATTERN) ---
@app.post("/dams/", response_model=schemas.DetalleDam)
def crear_dam(dam: schemas.DetalleDamCreate, db: Session = Depends(get_db)):
    # 1. Buscar el Maestro de esa DAM en la BD
    maestro = db.query(models.MaestroImportacion).filter(models.MaestroImportacion.id_maestro == dam.id_maestro).first()
    
    if not maestro:
        raise HTTPException(status_code=404, detail="El Maestro de Importación asociado no existe en la base de datos.")

    # 2. Reglas de Negocio mediante Patrón Strategy
    estrategia = ESTRATEGIAS_VALIDACION_DAM.get(maestro.tipo_valor)
    if estrategia:
        dam = estrategia(dam)

    # 3. Guardar en Base de Datos
    nueva_dam = models.DetalleDam(**dam.model_dump())
    db.add(nueva_dam)
    db.commit()
    db.refresh(nueva_dam)
    
    return nueva_dam

# --- ENDPOINTS PARA PAGOS ---
@app.post("/pagos/", response_model=schemas.RegistroPago)
def registrar_pago(pago: schemas.RegistroPagoCreate, db: Session = Depends(get_db)):
    gasto = None
    
    if pago.id_gasto is not None:
        gasto = db.query(models.RegistroGasto).filter(models.RegistroGasto.id_gasto == pago.id_gasto).first()
        if not gasto:
            raise HTTPException(status_code=404, detail="El gasto asociado no existe.")
        
        pago.id_dam = gasto.id_dam
        pago.id_concepto = gasto.id_concepto

    if pago.id_concepto is not None:
        concepto_existe = db.query(models.CatConceptoPago).filter(models.CatConceptoPago.id_concepto == pago.id_concepto).first()
        if not concepto_existe:
            raise HTTPException(status_code=404, detail="El concepto de pago seleccionado no existe en el catálogo.")
    else:
        raise HTTPException(status_code=400, detail="Debe proporcionar un id_concepto o un id_gasto válido.")

    try:
        nuevo_pago = models.RegistroPago(**pago.model_dump())
        db.add(nuevo_pago)

        if gasto:
            gasto.estado_pago = "PAGADO"
        
        db.commit()
        db.refresh(nuevo_pago)
        return nuevo_pago
    except Exception as e:
        db.rollback()
        print(f"--- ERROR REAL EN BASE DE DATOS ---: {e}") 
        raise HTTPException(status_code=400, detail=f"Error exacto: {str(e)}")

# --- ENDPOINTS PARA CONCEPTOS ---
@app.post("/conceptos/", response_model=schemas.CatConceptoPago)
def crear_concepto(concepto: schemas.CatConceptoPagoCreate, db: Session = Depends(get_db)):
    try:
        nuevo_concepto = models.CatConceptoPago(**concepto.model_dump())
        db.add(nuevo_concepto)
        db.commit()
        db.refresh(nuevo_concepto)
        return nuevo_concepto
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al crear el concepto. Verifica que no esté duplicado.")

@app.get("/conceptos/", response_model=List[schemas.CatConceptoPago])
def listar_conceptos(db: Session = Depends(get_db)):
    return db.query(models.CatConceptoPago).filter(models.CatConceptoPago.estado_registro == "ACTIVO").all()

@app.delete("/conceptos/{id_concepto}")
def eliminar_concepto(id_concepto: int, db: Session = Depends(get_db)):
    concepto = db.query(models.CatConceptoPago).filter(models.CatConceptoPago.id_concepto == id_concepto).first()
    
    if not concepto:
        raise HTTPException(status_code=404, detail="Concepto no encontrado")
    
    concepto.estado_registro = "INACTIVO"
    db.commit()
    
    return {"mensaje": f"El concepto '{concepto.nombre}' ha sido eliminado lógicamente (INACTIVO)."}

# --- RUTAS PARA LEER (GET) ---
@app.get("/bancos/", response_model=List[schemas.CatBanco])
def listar_bancos(db: Session = Depends(get_db)):
    return db.query(models.CatBanco).all()

@app.get("/maestros/", response_model=List[schemas.MaestroImportacion])
def listar_facturas(db: Session = Depends(get_db)):
    return db.query(models.MaestroImportacion).all()

@app.get("/reporte-maestro/{id_maestro}", response_model=schemas.MaestroConDetalles)
def reporte_completo_factura(id_maestro: int, db: Session = Depends(get_db)):
    factura = db.query(models.MaestroImportacion).filter(models.MaestroImportacion.id_maestro == id_maestro).first()
    
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
        
    return factura

# --- RUTAS DE ACTUALIZACIÓN (PUT) ---
@app.put("/bancos/{id_banco}", response_model=schemas.CatBanco)
def actualizar_banco(id_banco: int, banco_editado: schemas.CatBancoCreate, db: Session = Depends(get_db)):
    db_banco = db.query(models.CatBanco).filter(models.CatBanco.id_banco == id_banco).first()
    if not db_banco:
        raise HTTPException(status_code=404, detail="Banco no encontrado")
    
    db_banco.nombre = banco_editado.nombre
    db.commit()
    db.refresh(db_banco)
    return db_banco

@app.put("/maestros/{id_maestro}", response_model=schemas.MaestroImportacion)
def actualizar_maestro(id_maestro: int, maestro_editado: schemas.MaestroImportacionUpdate, db: Session = Depends(get_db)):
    db_maestro = db.query(models.MaestroImportacion).filter(models.MaestroImportacion.id_maestro == id_maestro).first()
    
    if not db_maestro:
        raise HTTPException(status_code=404, detail="Maestro de importación no encontrado")
    
    update_data = maestro_editado.model_dump(exclude_unset=True)
    
    for key, value in update_data.items():
        setattr(db_maestro, key, value)
        
    db.commit()
    db.refresh(db_maestro)
    
    return db_maestro

@app.put("/dams/{id_dam}", response_model=schemas.DetalleDam)
def actualizar_dam(id_dam: int, dam_editada: schemas.DetalleDamUpdate, db: Session = Depends(get_db)):
    db_dam = db.query(models.DetalleDam).filter(models.DetalleDam.id_dam == id_dam).first()
    
    if not db_dam:
        raise HTTPException(status_code=404, detail="DAM no encontrada")
        
    update_data = dam_editada.model_dump(exclude_unset=True)
    
    for key, value in update_data.items():
        setattr(db_dam, key, value)
        
    db.commit()
    db.refresh(db_dam)
    
    return db_dam

# --- RUTAS DE ELIMINACIÓN (DELETE) ---
@app.delete("/maestros/{id_maestro}")
def anular_factura(id_maestro: int, db: Session = Depends(get_db)):
    db_factura = db.query(models.MaestroImportacion).filter(models.MaestroImportacion.id_maestro == id_maestro).first()
    if not db_factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    
    db_factura.estado_registro = "ANULADO" 
    db.commit()
    return {"mensaje": f"Factura {db_factura.numero_factura} marcada como ANULADA correctamente."}

# --- ENDPOINTS PARA REGISTRO DE GASTOS ---
@app.post("/gastos/", response_model=schemas.RegistroGasto)
def crear_gasto(gasto: schemas.RegistroGastoCreate, db: Session = Depends(get_db)):
    try:
        nuevo_gasto = models.RegistroGasto(**gasto.model_dump())
        db.add(nuevo_gasto)
        db.commit()
        db.refresh(nuevo_gasto)
        return nuevo_gasto
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error al crear gasto: {str(e)}")

@app.get("/gastos/", response_model=List[schemas.RegistroGasto])
def listar_gastos(db: Session = Depends(get_db)):
    return db.query(models.RegistroGasto).all()
