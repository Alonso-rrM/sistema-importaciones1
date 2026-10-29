from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

import models
import schemas
from dependencies import get_db, get_current_user, RoleChecker

router = APIRouter(tags=["Catalogos"])

# ==========================================
# 1. ROLES
# ==========================================
@router.post("/roles/", response_model=schemas.CatRol)
def crear_rol(
    rol: schemas.CatRolCreate, 
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(RoleChecker([1]))
):
    nuevo_rol = models.CatRol(**rol.model_dump())
    db.add(nuevo_rol)
    db.commit()
    db.refresh(nuevo_rol)
    return nuevo_rol

# ==========================================
# 2. BANCOS
# ==========================================
@router.post("/bancos/", response_model=schemas.CatBanco)
def crear_banco(banco: schemas.CatBancoCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    nuevo_banco = models.CatBanco(nombre=banco.nombre)
    db.add(nuevo_banco)
    db.commit()
    db.refresh(nuevo_banco)
    return nuevo_banco

@router.get("/bancos/", response_model=List[schemas.CatBanco])
def listar_bancos(mostrar_inactivos: bool = False, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    query = db.query(models.CatBanco)
    if not mostrar_inactivos:
        query = query.filter(models.CatBanco.estado_registro == "ACTIVO")
    return query.order_by(models.CatBanco.id_banco.asc()).all()

@router.put("/bancos/{id_banco}", response_model=schemas.CatBanco)
def actualizar_banco(id_banco: int, banco_editado: schemas.CatBancoUpdate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    db_banco = db.query(models.CatBanco).filter(models.CatBanco.id_banco == id_banco).first()
    if not db_banco:
        raise HTTPException(status_code=404, detail="Banco no encontrado")
    
    update_data = banco_editado.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_banco, key, value)
    
    db.commit()
    db.refresh(db_banco)
    return db_banco

@router.delete("/bancos/{id_banco}")
def eliminar_banco(id_banco: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    banco = db.query(models.CatBanco).filter(models.CatBanco.id_banco == id_banco).first()
    if not banco:
        raise HTTPException(status_code=404, detail="Banco no encontrado")
    banco.estado_registro = "INACTIVO"
    db.commit()
    return {"mensaje": f"El banco '{banco.nombre}' ha sido desactivado correctamente."}

@router.put("/bancos/{id_banco}/restaurar", response_model=schemas.CatBanco)
def restaurar_bancos(id_banco: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    db_item = db.query(models.CatBanco).filter(models.CatBanco.id_banco == id_banco).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    db_item.estado_registro = "ACTIVO"
    db.commit()
    db.refresh(db_item)
    return db_item

@router.delete("/bancos/{id_banco}/fisico")
def eliminar_bancos_fisico(id_banco: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker([1]))):
    db_item = db.query(models.CatBanco).filter(models.CatBanco.id_banco == id_banco).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    try:
        db.delete(db_item)
        db.commit()
        return {"mensaje": "Registro eliminado definitivamente"}
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="No se puede eliminar porque este registro está siendo usado en otros módulos.")

# ==========================================
# 3. AGENTES
# ==========================================
@router.post("/agentes/", response_model=schemas.CatAgente)
def crear_agente(agente: schemas.CatAgenteCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    nuevo_agente = models.CatAgente(**agente.model_dump())
    db.add(nuevo_agente)
    db.commit()
    db.refresh(nuevo_agente)
    return nuevo_agente

@router.get("/agentes/", response_model=List[schemas.CatAgente])
def listar_agentes(mostrar_inactivos: bool = False, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    query = db.query(models.CatAgente)
    if not mostrar_inactivos:
        query = query.filter(models.CatAgente.estado_registro == "ACTIVO")
    return query.order_by(models.CatAgente.id_agente.asc()).all()

@router.put("/agentes/{id_agente}", response_model=schemas.CatAgente)
def actualizar_agente(id_agente: int, agente_editado: schemas.CatAgenteUpdate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    db_agente = db.query(models.CatAgente).filter(models.CatAgente.id_agente == id_agente).first()
    if not db_agente:
        raise HTTPException(status_code=404, detail="Agente no encontrado")
    
    update_data = agente_editado.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_agente, key, value)
        
    try:
        db.commit()
        db.refresh(db_agente)
        return db_agente
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Error: El Nombre o RUC ya están registrados.")

@router.delete("/agentes/{id_agente}")
def eliminar_agente(id_agente: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    agente = db.query(models.CatAgente).filter(models.CatAgente.id_agente == id_agente).first()
    if not agente:
        raise HTTPException(status_code=404, detail="Agente no encontrado")
    agente.estado_registro = "INACTIVO"
    db.commit()
    return {"mensaje": f"El agente '{agente.nombre}' ha sido desactivado correctamente."}

@router.put("/agentes/{id_agente}/restaurar", response_model=schemas.CatAgente)
def restaurar_agentes(id_agente: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    db_item = db.query(models.CatAgente).filter(models.CatAgente.id_agente == id_agente).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    db_item.estado_registro = "ACTIVO"
    db.commit()
    db.refresh(db_item)
    return db_item

@router.delete("/agentes/{id_agente}/fisico")
def eliminar_agentes_fisico(id_agente: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker([1]))):
    db_item = db.query(models.CatAgente).filter(models.CatAgente.id_agente == id_agente).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    try:
        db.delete(db_item)
        db.commit()
        return {"mensaje": "Registro eliminado definitivamente"}
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="No se puede eliminar porque este registro está siendo usado en otros módulos.")

# ==========================================
# 4. PROVEEDORES
# ==========================================
@router.post("/proveedores/", response_model=schemas.CatProveedor)
def crear_proveedor(proveedor: schemas.CatProveedorCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    nuevo_proveedor = models.CatProveedor(**proveedor.model_dump())
    db.add(nuevo_proveedor)
    db.commit()
    db.refresh(nuevo_proveedor)
    return nuevo_proveedor

@router.get("/proveedores/", response_model=List[schemas.CatProveedor])
def listar_proveedores(mostrar_inactivos: bool = False, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    query = db.query(models.CatProveedor)
    if not mostrar_inactivos:
        query = query.filter(models.CatProveedor.estado_registro == "ACTIVO")
    return query.order_by(models.CatProveedor.id_proveedor.asc()).all()

@router.put("/proveedores/{id_proveedor}", response_model=schemas.CatProveedor)
def actualizar_proveedor(id_proveedor: int, proveedor_editado: schemas.CatProveedorUpdate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    db_proveedor = db.query(models.CatProveedor).filter(models.CatProveedor.id_proveedor == id_proveedor).first()
    if not db_proveedor:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    
    update_data = proveedor_editado.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_proveedor, key, value)
        
    try:
        db.commit()
        db.refresh(db_proveedor)
        return db_proveedor
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Error: El Nombre o RUC ya están registrados.")

@router.delete("/proveedores/{id_proveedor}")
def eliminar_proveedor(id_proveedor: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    proveedor = db.query(models.CatProveedor).filter(models.CatProveedor.id_proveedor == id_proveedor).first()
    if not proveedor:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    proveedor.estado_registro = "INACTIVO"
    db.commit()
    return {"mensaje": f"El proveedor '{proveedor.nombre}' ha sido desactivado correctamente."}

@router.put("/proveedores/{id_proveedor}/restaurar", response_model=schemas.CatProveedor)
def restaurar_proveedores(id_proveedor: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    db_item = db.query(models.CatProveedor).filter(models.CatProveedor.id_proveedor == id_proveedor).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    db_item.estado_registro = "ACTIVO"
    db.commit()
    db.refresh(db_item)
    return db_item

@router.delete("/proveedores/{id_proveedor}/fisico")
def eliminar_proveedores_fisico(id_proveedor: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker([1]))):
    db_item = db.query(models.CatProveedor).filter(models.CatProveedor.id_proveedor == id_proveedor).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    try:
        db.delete(db_item)
        db.commit()
        return {"mensaje": "Registro eliminado definitivamente"}
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="No se puede eliminar porque este registro está siendo usado en otros módulos.")

# ==========================================
# 5. ALMACENES
# ==========================================
@router.post("/almacenes/", response_model=schemas.CatAlmacen)
def crear_almacen(almacen: schemas.CatAlmacenCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    nuevo_almacen = models.CatAlmacen(**almacen.model_dump())
    db.add(nuevo_almacen)
    db.commit()
    db.refresh(nuevo_almacen)
    return nuevo_almacen

@router.get("/almacenes/", response_model=List[schemas.CatAlmacen])
def listar_almacenes(mostrar_inactivos: bool = False, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    query = db.query(models.CatAlmacen)
    if not mostrar_inactivos:
        query = query.filter(models.CatAlmacen.estado_registro == "ACTIVO")
    return query.order_by(models.CatAlmacen.id_almacen.asc()).all()

@router.put("/almacenes/{id_almacen}", response_model=schemas.CatAlmacen)
def actualizar_almacen(id_almacen: int, almacen_editado: schemas.CatAlmacenUpdate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    db_almacen = db.query(models.CatAlmacen).filter(models.CatAlmacen.id_almacen == id_almacen).first()
    if not db_almacen:
        raise HTTPException(status_code=404, detail="Almacén no encontrado")
    
    update_data = almacen_editado.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_almacen, key, value)
        
    db.commit()
    db.refresh(db_almacen)
    return db_almacen

@router.delete("/almacenes/{id_almacen}")
def eliminar_almacen(id_almacen: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    almacen = db.query(models.CatAlmacen).filter(models.CatAlmacen.id_almacen == id_almacen).first()
    if not almacen:
        raise HTTPException(status_code=404, detail="Almacén no encontrado")
    almacen.estado_registro = "INACTIVO"
    db.commit()
    return {"mensaje": f"El almacén '{almacen.nombre}' ha sido desactivado correctamente."}

@router.put("/almacenes/{id_almacen}/restaurar", response_model=schemas.CatAlmacen)
def restaurar_almacenes(id_almacen: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    db_item = db.query(models.CatAlmacen).filter(models.CatAlmacen.id_almacen == id_almacen).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    db_item.estado_registro = "ACTIVO"
    db.commit()
    db.refresh(db_item)
    return db_item

@router.delete("/almacenes/{id_almacen}/fisico")
def eliminar_almacenes_fisico(id_almacen: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker([1]))):
    db_item = db.query(models.CatAlmacen).filter(models.CatAlmacen.id_almacen == id_almacen).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    try:
        db.delete(db_item)
        db.commit()
        return {"mensaje": "Registro eliminado definitivamente"}
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="No se puede eliminar porque este registro está siendo usado en otros módulos.")

# ==========================================
# 6. IMPORTADORES
# ==========================================
@router.post("/importadores/", response_model=schemas.CatImportador)
def crear_importador(importador: schemas.CatImportadorCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    nuevo_importador = models.CatImportador(**importador.model_dump())
    db.add(nuevo_importador)
    db.commit()
    db.refresh(nuevo_importador)
    return nuevo_importador

@router.get("/importadores/", response_model=List[schemas.CatImportador])
def listar_importadores(mostrar_inactivos: bool = False, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    query = db.query(models.CatImportador)
    if not mostrar_inactivos:
        query = query.filter(models.CatImportador.estado_registro == "ACTIVO")
    return query.order_by(models.CatImportador.id_importador.asc()).all()

@router.put("/importadores/{id_importador}", response_model=schemas.CatImportador)
def actualizar_importador(id_importador: int, importador_editado: schemas.CatImportadorUpdate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    db_importador = db.query(models.CatImportador).filter(models.CatImportador.id_importador == id_importador).first()
    if not db_importador:
        raise HTTPException(status_code=404, detail="Importador no encontrado")
    
    update_data = importador_editado.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_importador, key, value)
        
    try:
        db.commit()
        db.refresh(db_importador)
        return db_importador
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Error: El Nombre o RUC ya están registrados.")

@router.delete("/importadores/{id_importador}")
def eliminar_importador(id_importador: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    importador = db.query(models.CatImportador).filter(models.CatImportador.id_importador == id_importador).first()
    if not importador:
        raise HTTPException(status_code=404, detail="Importador no encontrado")
    importador.estado_registro = "INACTIVO"
    db.commit()
    return {"mensaje": f"El importador '{importador.nombre}' ha sido desactivado correctamente."}

@router.put("/importadores/{id_importador}/restaurar", response_model=schemas.CatImportador)
def restaurar_importadores(id_importador: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    db_item = db.query(models.CatImportador).filter(models.CatImportador.id_importador == id_importador).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    db_item.estado_registro = "ACTIVO"
    db.commit()
    db.refresh(db_item)
    return db_item

@router.delete("/importadores/{id_importador}/fisico")
def eliminar_importadores_fisico(id_importador: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker([1]))):
    db_item = db.query(models.CatImportador).filter(models.CatImportador.id_importador == id_importador).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    try:
        db.delete(db_item)
        db.commit()
        return {"mensaje": "Registro eliminado definitivamente"}
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="No se puede eliminar porque este registro está siendo usado en otros módulos.")

# ==========================================
# 7. CONCEPTOS DE PAGO
# ==========================================
@router.post("/conceptos/", response_model=schemas.CatConceptoPago)
def crear_concepto(concepto: schemas.CatConceptoPagoCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    try:
        nuevo_concepto = models.CatConceptoPago(**concepto.model_dump())
        db.add(nuevo_concepto)
        db.commit()
        db.refresh(nuevo_concepto)
        return nuevo_concepto
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="Error al crear el concepto. Verifica que no esté duplicado.")

@router.get("/conceptos/", response_model=List[schemas.CatConceptoPago])
def listar_conceptos(mostrar_inactivos: bool = False, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    query = db.query(models.CatConceptoPago)
    if not mostrar_inactivos:
        query = query.filter(models.CatConceptoPago.estado_registro == "ACTIVO")
    return query.order_by(models.CatConceptoPago.id_concepto.asc()).all()

@router.put("/conceptos/{id_concepto}", response_model=schemas.CatConceptoPago)
def actualizar_concepto(id_concepto: int, concepto_editado: schemas.CatConceptoPagoUpdate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    db_concepto = db.query(models.CatConceptoPago).filter(models.CatConceptoPago.id_concepto == id_concepto).first()
    if not db_concepto:
        raise HTTPException(status_code=404, detail="Concepto no encontrado")
    
    update_data = concepto_editado.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_concepto, key, value)
        
    try:
        db.commit()
        db.refresh(db_concepto)
        return db_concepto
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Error: El nombre del concepto ya existe.")

@router.delete("/conceptos/{id_concepto}")
def eliminar_concepto(id_concepto: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    concepto = db.query(models.CatConceptoPago).filter(models.CatConceptoPago.id_concepto == id_concepto).first()
    if not concepto:
        raise HTTPException(status_code=404, detail="Concepto no encontrado")
    
    concepto.estado_registro = "INACTIVO"
    db.commit()
    return {"mensaje": f"El concepto '{concepto.nombre}' ha sido desactivado correctamente."}

@router.put("/conceptos/{id_concepto}/restaurar", response_model=schemas.CatConceptoPago)
def restaurar_conceptos(id_concepto: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    db_item = db.query(models.CatConceptoPago).filter(models.CatConceptoPago.id_concepto == id_concepto).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    db_item.estado_registro = "ACTIVO"
    db.commit()
    db.refresh(db_item)
    return db_item

@router.delete("/conceptos/{id_concepto}/fisico")
def eliminar_conceptos_fisico(id_concepto: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker([1]))):
    db_item = db.query(models.CatConceptoPago).filter(models.CatConceptoPago.id_concepto == id_concepto).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    try:
        db.delete(db_item)
        db.commit()
        return {"mensaje": "Registro eliminado definitivamente"}
    except Exception:
        db.rollback()
        raise HTTPException(status_code=400, detail="No se puede eliminar porque este registro está siendo usado en otros módulos.")

# ==========================================
# 8. TIPOS DE DOCUMENTO DE PAGO
# ==========================================
@router.get("/tipos-documento/", response_model=List[schemas.CatalogoDocumentoPago])
def listar_tipos_documento(mostrar_inactivos: bool = False, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    query = db.query(models.CatalogoDocumentoPago)
    if not mostrar_inactivos:
        query = query.filter(models.CatalogoDocumentoPago.estado_registro == "ACTIVO")
    return query.order_by(models.CatalogoDocumentoPago.id_tipo_doc.asc()).all()

@router.post("/tipos-documento/", response_model=schemas.CatalogoDocumentoPago)
def crear_tipo_documento(tipo_doc: schemas.CatalogoDocumentoPagoCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    nuevo_tipo = models.CatalogoDocumentoPago(**tipo_doc.model_dump())
    db.add(nuevo_tipo)
    try:
        db.commit()
        db.refresh(nuevo_tipo)
        return nuevo_tipo
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="El nombre del documento ya existe.")

@router.put("/tipos-documento/{id}", response_model=schemas.CatalogoDocumentoPago)
def actualizar_tipo_documento(id: int, tipo_doc: schemas.CatalogoDocumentoPagoUpdate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    doc_bd = db.query(models.CatalogoDocumentoPago).filter(models.CatalogoDocumentoPago.id_tipo_doc == id).first()
    if not doc_bd:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    
    update_data = tipo_doc.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(doc_bd, key, value)
        
    try:
        db.commit()
        db.refresh(doc_bd)
        return doc_bd
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="El nombre del documento ya existe.")

@router.delete("/tipos-documento/{id}")
def eliminar_tipo_documento_logico(id: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    doc_bd = db.query(models.CatalogoDocumentoPago).filter(models.CatalogoDocumentoPago.id_tipo_doc == id).first()
    if not doc_bd:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    
    doc_bd.estado_registro = "INACTIVO"
    db.commit()
    return {"mensaje": "Documento desactivado lógicamente"}

@router.put("/tipos-documento/{id}/restaurar")
def restaurar_tipo_documento(id: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    doc_bd = db.query(models.CatalogoDocumentoPago).filter(models.CatalogoDocumentoPago.id_tipo_doc == id).first()
    if not doc_bd:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    
    doc_bd.estado_registro = "ACTIVO"
    db.commit()
    return {"mensaje": "Documento restaurado exitosamente"}

@router.delete("/tipos-documento/{id}/fisico")
def eliminar_tipo_documento_fisico(id: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker([1]))):
    doc_bd = db.query(models.CatalogoDocumentoPago).filter(models.CatalogoDocumentoPago.id_tipo_doc == id).first()
    if not doc_bd:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    
    try:
        db.delete(doc_bd)
        db.commit()
        return {"mensaje": "Documento eliminado físicamente de la base de datos"}
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="No se puede eliminar el documento físicamente porque tiene gastos asociados.")
