from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
import io

import models
import schemas
from dependencies import get_db, get_current_user, RoleChecker
from routers.catalogo_generico import DefinicionCatalogo, normalizar_ruc_opcional, registrar_catalogo
from services.carga_masiva import ALIAS_COLUMNA_NOMBRE, CONSTRUCTORES, construir_registro
from domain.conceptos import clase_aduanera_sugerida
from constantes import (
    EstadoRegistro, ROLES_FINANZAS, ROLES_OPERACIONES, ROLES_OPERACIONES_Y_FINANZAS, ROLES_SOLO_ADMIN,
)

# Matriz RBAC de escritura en catálogos (1: Admin, 2: Logística, 3: Tesorería, 4: Auditoría = solo lectura)
ROLES_OPERATIVOS = ROLES_OPERACIONES_Y_FINANZAS   # importadores, proveedores, agentes, almacenes
ROLES_TESORERIA = ROLES_FINANZAS                 # bancos
ROLES_CONFIG = ROLES_OPERACIONES                 # conceptos y tipos de documento (alimentan la máquina de estados y el motor financiero)

router = APIRouter(tags=["Catalogos"])

# ==========================================
# 1. ROLES
# ==========================================
@router.post("/roles/", response_model=schemas.CatRol)
def crear_rol(
    rol: schemas.CatRolCreate, 
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(RoleChecker(ROLES_SOLO_ADMIN))
):
    nuevo_rol = models.CatRol(**rol.model_dump())
    db.add(nuevo_rol)
    db.commit()
    db.refresh(nuevo_rol)
    return nuevo_rol

# ==========================================
# 2-7. CATÁLOGOS ESTÁNDAR (rutas generadas por routers/catalogo_generico.py)
# ==========================================
MENSAJE_NOMBRE_O_RUC_DUPLICADO = "Error: El Nombre o RUC ya están registrados."


def _concepto_alta(datos: dict) -> dict:
    # Si no se indica la clase aduanera, se propone una según el nombre
    if datos.get("clase_aduanera") is None:
        datos["clase_aduanera"] = clase_aduanera_sugerida(datos.get("nombre"))
    return datos


def _concepto_cambio(datos: dict) -> dict:
    # La clase nunca queda vacía ni se recalcula al renombrar: solo cambia si se envía un valor
    if datos.get("clase_aduanera") is None:
        datos.pop("clase_aduanera", None)
    return datos


CATALOGOS_ESTANDAR = [
    DefinicionCatalogo(
        ruta="bancos", modelo=models.CatBanco, campo_id="id_banco",
        esquema=schemas.CatBanco, esquema_alta=schemas.CatBancoCreate, esquema_cambio=schemas.CatBancoUpdate,
        roles_escritura=ROLES_TESORERIA, singular="banco", plural="bancos",
        nombre_con_articulo="El banco", no_encontrado="Banco no encontrado",
        duplicado_alta="Error: El nombre del banco ya está registrado.",
        duplicado_cambio="Error: El nombre del banco ya está registrado.",
    ),
    DefinicionCatalogo(
        ruta="agentes", modelo=models.CatAgente, campo_id="id_agente",
        esquema=schemas.CatAgente, esquema_alta=schemas.CatAgenteCreate, esquema_cambio=schemas.CatAgenteUpdate,
        roles_escritura=ROLES_OPERATIVOS, singular="agente", plural="agentes",
        nombre_con_articulo="El agente", no_encontrado="Agente no encontrado",
        duplicado_alta=MENSAJE_NOMBRE_O_RUC_DUPLICADO, duplicado_cambio=MENSAJE_NOMBRE_O_RUC_DUPLICADO,
    ),
    DefinicionCatalogo(
        ruta="proveedores", modelo=models.CatProveedor, campo_id="id_proveedor",
        esquema=schemas.CatProveedor, esquema_alta=schemas.CatProveedorCreate, esquema_cambio=schemas.CatProveedorUpdate,
        roles_escritura=ROLES_OPERATIVOS, singular="proveedor", plural="proveedores",
        nombre_con_articulo="El proveedor", no_encontrado="Proveedor no encontrado",
        duplicado_alta=MENSAJE_NOMBRE_O_RUC_DUPLICADO, duplicado_cambio=MENSAJE_NOMBRE_O_RUC_DUPLICADO,
        preparar_alta=normalizar_ruc_opcional,
    ),
    DefinicionCatalogo(
        ruta="almacenes", modelo=models.CatAlmacen, campo_id="id_almacen",
        esquema=schemas.CatAlmacen, esquema_alta=schemas.CatAlmacenCreate, esquema_cambio=schemas.CatAlmacenUpdate,
        roles_escritura=ROLES_OPERATIVOS, singular="almacen", plural="almacenes",
        nombre_con_articulo="El almacén", no_encontrado="Almacén no encontrado",
        duplicado_alta="Error: El nombre del almacén ya está registrado.",
        duplicado_cambio="Error: El nombre del almacén ya está registrado.",
    ),
    DefinicionCatalogo(
        ruta="importadores", modelo=models.CatImportador, campo_id="id_importador",
        esquema=schemas.CatImportador, esquema_alta=schemas.CatImportadorCreate, esquema_cambio=schemas.CatImportadorUpdate,
        roles_escritura=ROLES_OPERATIVOS, singular="importador", plural="importadores",
        nombre_con_articulo="El importador", no_encontrado="Importador no encontrado",
        duplicado_alta=MENSAJE_NOMBRE_O_RUC_DUPLICADO, duplicado_cambio=MENSAJE_NOMBRE_O_RUC_DUPLICADO,
    ),
    DefinicionCatalogo(
        ruta="conceptos", modelo=models.CatConceptoPago, campo_id="id_concepto",
        esquema=schemas.CatConceptoPago, esquema_alta=schemas.CatConceptoPagoCreate, esquema_cambio=schemas.CatConceptoPagoUpdate,
        roles_escritura=ROLES_CONFIG, singular="concepto", plural="conceptos",
        nombre_con_articulo="El concepto", no_encontrado="Concepto no encontrado",
        duplicado_alta="Error al crear el concepto. Verifica que no esté duplicado.",
        duplicado_cambio="Error: El nombre del concepto ya existe.",
        preparar_alta=_concepto_alta, preparar_cambio=_concepto_cambio,
    ),
]

for _definicion in CATALOGOS_ESTANDAR:
    registrar_catalogo(router, _definicion)

# ==========================================
# 8. TIPOS DE DOCUMENTO DE PAGO
# ==========================================
@router.get("/tipos-documento/", response_model=List[schemas.CatalogoDocumentoPago])
def listar_tipos_documento(mostrar_inactivos: bool = False, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):
    query = db.query(models.CatalogoDocumentoPago)
    if not mostrar_inactivos:
        query = query.filter(models.CatalogoDocumentoPago.estado_registro == EstadoRegistro.ACTIVO)
    return query.order_by(models.CatalogoDocumentoPago.id_tipo_doc.asc()).all()

@router.post("/tipos-documento/", response_model=schemas.CatalogoDocumentoPago)
def crear_tipo_documento(tipo_doc: schemas.CatalogoDocumentoPagoCreate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker(ROLES_CONFIG))):
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
def actualizar_tipo_documento(id: int, tipo_doc: schemas.CatalogoDocumentoPagoUpdate, db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker(ROLES_CONFIG))):
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
def eliminar_tipo_documento_logico(id: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker(ROLES_CONFIG))):
    doc_bd = db.query(models.CatalogoDocumentoPago).filter(models.CatalogoDocumentoPago.id_tipo_doc == id).first()
    if not doc_bd:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    
    doc_bd.estado_registro = EstadoRegistro.INACTIVO
    db.commit()
    return {"mensaje": "Documento desactivado lógicamente"}

@router.put("/tipos-documento/{id}/restaurar")
def restaurar_tipo_documento(id: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker(ROLES_CONFIG))):
    doc_bd = db.query(models.CatalogoDocumentoPago).filter(models.CatalogoDocumentoPago.id_tipo_doc == id).first()
    if not doc_bd:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    
    doc_bd.estado_registro = EstadoRegistro.ACTIVO
    db.commit()
    return {"mensaje": "Documento restaurado exitosamente"}

@router.delete("/tipos-documento/{id}/fisico")
def eliminar_tipo_documento_fisico(id: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(RoleChecker(ROLES_SOLO_ADMIN))):
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


# ==========================================
# CARGA MASIVA POR EXCEL (Solo SuperAdmin)
# ==========================================

def _limpiar_valor(v):
    """Limpia valores de pandas: NaN → None, float entero → int → str para RUC."""
    if v is None:
        return None
    try:
        import pandas as pd
        if pd.isna(v):
            return None
    except Exception:
        pass
    return v


@router.post("/admin/carga-masiva", tags=["Admin"])
async def carga_masiva_excel(
    catalogo: str,
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.Usuario = Depends(RoleChecker(ROLES_SOLO_ADMIN))
):
    """
    Carga masiva de catálogos desde Excel. Solo SuperAdmin (Rol 1).
    
    Parámetro 'catalogo': uno de
        roles | bancos | conceptos | proveedores | agentes | importadores | almacenes
    
    El archivo debe ser un .xlsx con las columnas correctas para cada catálogo.
    """
    try:
        import pandas as pd
    except ImportError:
        raise HTTPException(status_code=500, detail="Librería 'pandas' no instalada en el servidor.")

    if not archivo.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="El archivo debe ser un Excel (.xlsx o .xls).")

    contenido = await archivo.read()
    try:
        df = pd.read_excel(io.BytesIO(contenido))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"No se pudo leer el Excel: {str(e)}")

    # Limpiar NaN globalmente
    df = df.where(pd.notnull(df), None)

    # Renombrar columnas comunes a 'nombre'
    for alias in ALIAS_COLUMNA_NOMBRE:
        if alias in df.columns:
            df = df.rename(columns={alias: "nombre"})
            break

    insertados = 0
    errores = []

    if catalogo not in CONSTRUCTORES:
        raise HTTPException(status_code=400, detail=f"Catálogo inválido. Válidos: {', '.join(CONSTRUCTORES)}")

    for i, row in df.iterrows():
        fila_num = i + 2  # Excel es 1-indexado, fila 1 es cabecera
        try:
            fila = {k: _limpiar_valor(v) for k, v in row.to_dict().items()}
            obj = construir_registro(catalogo, fila)
            if obj is None:
                continue
            # Cada fila va en su propio punto de guardado: si una falla, se deshace SOLO esa fila.
            with db.begin_nested():
                db.add(obj)
                db.flush()  # detectar errores de integridad fila a fila
            insertados += 1

        except IntegrityError:
            nombre_val = row.get("nombre", f"Fila {fila_num}")
            errores.append(f"Fila {fila_num} '{nombre_val}': ya existe o viola una restricción única.")
        except Exception as e:
            errores.append(f"Fila {fila_num}: {str(e)}")

    db.commit()

    return {
        "catalogo": catalogo,
        "total_filas": len(df),
        "insertados": insertados,
        "errores_count": len(errores),
        "errores_detalle": errores[:20]  # máximo 20 errores en la respuesta
    }
