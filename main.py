from fastapi import FastAPI, Depends
from sqlalchemy.orm import Session
import models
import schemas
from database import SessionLocal, engine
from fastapi import HTTPException


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

@app.get("/")
def ruta_principal():
    return {"mensaje": "¡Servidor de Importaciones funcionando al 100%!"}

# --- NUESTRO PRIMER ENDPOINT (Guardar un Banco) ---
@app.post("/bancos/", response_model=schemas.CatBanco)
def crear_banco(banco: schemas.CatBancoCreate, db: Session = Depends(get_db)):
    # 1. Preparamos el dato para la base de datos
    nuevo_banco = models.CatBanco(nombre=banco.nombre)
    
    # 2. Lo agregamos y guardamos (Commit)
    db.add(nuevo_banco)
    db.commit()
    db.refresh(nuevo_banco) # Actualizamos para obtener el ID generado
    
    return nuevo_banco

# --- ENDPOINTS PARA LOS OTROS CATÁLOGOS ---
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
        db.rollback() # Limpiamos el error para no trabar la base de datos
        raise HTTPException(status_code=400, detail="Error: El Nombre o RUC ya están registrados.")

# --- NUESTRO SEGUNDO ENDPOINT (Guardar Factura Maestra) ---
@app.post("/maestros/", response_model=schemas.MaestroImportacion)
def crear_maestro(maestro: schemas.MaestroImportacionCreate, db: Session = Depends(get_db)):
    
    # En lugar de escribir campo por campo, usamos un truco de Python (**maestro.model_dump())
    # para pasar todos los datos del esquema directamente al modelo de la base de datos.
    nuevo_maestro = models.MaestroImportacion(**maestro.model_dump())
    
    db.add(nuevo_maestro)
    db.commit()
    db.refresh(nuevo_maestro)
    
    return nuevo_maestro

# --- TERCER ENDPOINT (Guardar DAM) ---
@app.post("/dams/", response_model=schemas.DetalleDam)
def crear_dam(dam: schemas.DetalleDamCreate, db: Session = Depends(get_db)):
    nueva_dam = models.DetalleDam(**dam.model_dump())
    db.add(nueva_dam)
    db.commit()
    db.refresh(nueva_dam)
    return nueva_dam

# --- CUARTO ENDPOINT (Guardar Pago) ---
@app.post("/pagos/", response_model=schemas.RegistroPago)
def registrar_pago(pago: schemas.RegistroPagoCreate, db: Session = Depends(get_db)):
    # 1. Verificamos que el concepto exista antes de pagar
    concepto_existe = db.query(models.CatConceptoPago).filter(models.CatConceptoPago.id_concepto == pago.id_concepto).first()
    if not concepto_existe:
        raise HTTPException(status_code=404, detail="El concepto de pago seleccionado no existe en el catálogo.")

    # 2. Registramos el pago en la base de datos
    try:
        nuevo_pago = models.RegistroPago(**pago.model_dump())
        db.add(nuevo_pago)
        db.commit()
        db.refresh(nuevo_pago)
        return nuevo_pago
    except Exception as e:
        db.rollback()
        # Esta línea imprimirá el error rojo gigante en tu terminal
        print(f"--- ERROR REAL EN BASE DE DATOS ---: {e}") 
        # Y esta línea te lo mostrará en Swagger
        raise HTTPException(status_code=400, detail=f"Error exacto: {str(e)}")

# --- QUINTO ENDPOINT (Guardar Concepto de Gasto) ---
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

@app.get("/conceptos/", response_model=list[schemas.CatConceptoPago])
def listar_conceptos(db: Session = Depends(get_db)):
    return db.query(models.CatConceptoPago).filter(models.CatConceptoPago.estado_registro == "ACTIVO").all()

@app.delete("/conceptos/{id_concepto}")
def eliminar_concepto(id_concepto: int, db: Session = Depends(get_db)):
    # 1. Buscamos el concepto
    concepto = db.query(models.CatConceptoPago).filter(models.CatConceptoPago.id_concepto == id_concepto).first()
    
    if not concepto:
        raise HTTPException(status_code=404, detail="Concepto no encontrado")
    
    # 2. BORRADO LÓGICO: Cambiamos el estado y guardamos
    concepto.estado_registro = "INACTIVO"
    db.commit()
    
    return {"mensaje": f"El concepto '{concepto.nombre}' ha sido eliminado lógicamente (INACTIVO)."}


from typing import List

# --- RUTAS PARA LEER (GET) ---

@app.get("/bancos/", response_model=List[schemas.CatBanco])
def listar_bancos(db: Session = Depends(get_db)):
    return db.query(models.CatBanco).all()

@app.get("/maestros/", response_model=List[schemas.MaestroImportacion])
def listar_facturas(db: Session = Depends(get_db)):
    # .all() trae absolutamente todas las facturas de la base de datos
    return db.query(models.MaestroImportacion).all()

@app.get("/reporte-maestro/{id_maestro}", response_model=schemas.MaestroConDetalles)
def reporte_completo_factura(id_maestro: int, db: Session = Depends(get_db)):
    # Buscamos la factura
    factura = db.query(models.MaestroImportacion).filter(models.MaestroImportacion.id_maestro == id_maestro).first()
    
    # Si no existe, lanzamos un error limpio
    if not factura:
        return {"error": "Factura no encontrada"}
        
    return factura

# --- 1. EDITAR UN BANCO (PUT) ---
@app.put("/bancos/{id_banco}", response_model=schemas.CatBanco)
def actualizar_banco(id_banco: int, banco_editado: schemas.CatBancoCreate, db: Session = Depends(get_db)):
    db_banco = db.query(models.CatBanco).filter(models.CatBanco.id_banco == id_banco).first()
    if not db_banco:
        raise HTTPException(status_code=404, detail="Banco no encontrado")
    
    db_banco.nombre = banco_editado.nombre
    db.commit()
    db.refresh(db_banco)
    return db_banco

# --- 2. ANULAR UNA FACTURA (Borrado Lógico) ---
@app.delete("/maestros/{id_maestro}")
def anular_factura(id_maestro: int, db: Session = Depends(get_db)):
    db_factura = db.query(models.MaestroImportacion).filter(models.MaestroImportacion.id_maestro == id_maestro).first()
    if not db_factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    
    # Ahora usamos la columna correcta
    db_factura.estado_registro = "ANULADO" 
    db.commit()
    return {"mensaje": f"Factura {db_factura.numero_factura} marcada como ANULADA correctamente."}

from sqlalchemy.exc import IntegrityError

# (Endpoints duplicados de empresa y anulación eliminados porque ya se integraron arriba)

