"""
RUTAS ESTÁNDAR DE UN CATÁLOGO (una sola implementación para todos)
=================================================================
Bancos, agentes, proveedores, almacenes, importadores y conceptos exponen las mismas seis operaciones:

    POST   /<ruta>/                     alta
    GET    /<ruta>/                     listado (activos, o todos con ?mostrar_inactivos=true)
    PUT    /<ruta>/{id}                 modificación
    DELETE /<ruta>/{id}                 baja lógica (estado_registro = INACTIVO)
    PUT    /<ruta>/{id}/restaurar       reactivación
    DELETE /<ruta>/{id}/fisico          borrado definitivo (solo SuperAdmin)

Antes cada catálogo repetía esas seis funciones casi idénticas. Ahora cada uno se DECLARA con un
`DefinicionCatalogo` y `registrar_catalogo` genera las rutas. Las URLs, los nombres de los parámetros,
los permisos y las respuestas son exactamente los mismos que antes.

Para agregar un catálogo nuevo basta con declarar su definición. Si un catálogo necesita una regla
propia al crear o modificar, se pasa en `preparar_alta` / `preparar_cambio` (sin tocar este archivo).
"""
from dataclasses import dataclass
from typing import Callable, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models
from constantes import ROLES_SOLO_ADMIN, EstadoRegistro
from dependencies import RoleChecker, get_current_user, get_db

MENSAJE_EN_USO = "No se puede eliminar porque este registro está siendo usado en otros módulos."


def _sin_cambios(datos: dict) -> dict:
    return datos


@dataclass(frozen=True)
class DefinicionCatalogo:
    ruta: str                              # "bancos"  ->  /bancos/
    modelo: type                           # models.CatBanco
    campo_id: str                          # "id_banco" (nombre de la columna y del parámetro en la URL)
    esquema: type[BaseModel]               # respuesta
    esquema_alta: type[BaseModel]
    esquema_cambio: type[BaseModel]
    roles_escritura: List[int]             # quién puede crear, modificar, dar de baja y restaurar
    singular: str                          # "banco"   (nombres internos de las operaciones)
    plural: str                            # "bancos"
    nombre_con_articulo: str               # "El banco" (mensaje de baja)
    no_encontrado: str                     # "Banco no encontrado"
    duplicado_alta: str                    # mensaje si el alta viola una restricción única
    duplicado_cambio: str                  # mensaje si la modificación viola una restricción única
    preparar_alta: Callable[[dict], dict] = _sin_cambios
    preparar_cambio: Callable[[dict], dict] = _sin_cambios


def _buscar(db: Session, d: DefinicionCatalogo, id_registro: int):
    return db.query(d.modelo).filter(getattr(d.modelo, d.campo_id) == id_registro).first()


def registrar_catalogo(router: APIRouter, d: DefinicionCatalogo) -> None:
    """Agrega al router las seis rutas estándar del catálogo `d`."""
    escritura = RoleChecker(d.roles_escritura)
    solo_admin = RoleChecker(ROLES_SOLO_ADMIN)
    id_en_url = Path(..., alias=d.campo_id)
    base = f"/{d.ruta}/"
    con_id = f"/{d.ruta}/{{{d.campo_id}}}"

    def crear(datos: d.esquema_alta, db: Session = Depends(get_db), current_user: models.Usuario = Depends(escritura)):
        nuevo = d.modelo(**d.preparar_alta(datos.model_dump()))
        try:
            db.add(nuevo)
            db.commit()
            db.refresh(nuevo)
            return nuevo
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=400, detail=d.duplicado_alta) from None

    def listar(mostrar_inactivos: bool = False, db: Session = Depends(get_db),
               current_user: models.Usuario = Depends(get_current_user)):
        query = db.query(d.modelo)
        if not mostrar_inactivos:
            query = query.filter(d.modelo.estado_registro == EstadoRegistro.ACTIVO)
        return query.order_by(getattr(d.modelo, d.campo_id).asc()).all()

    def actualizar(datos: d.esquema_cambio, id_registro: int = id_en_url, db: Session = Depends(get_db),
                   current_user: models.Usuario = Depends(escritura)):
        registro = _buscar(db, d, id_registro)
        if not registro:
            raise HTTPException(status_code=404, detail=d.no_encontrado)
        for campo, valor in d.preparar_cambio(datos.model_dump(exclude_unset=True)).items():
            setattr(registro, campo, valor)
        try:
            db.commit()
            db.refresh(registro)
            return registro
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=400, detail=d.duplicado_cambio) from None

    def dar_de_baja(id_registro: int = id_en_url, db: Session = Depends(get_db),
                    current_user: models.Usuario = Depends(escritura)):
        registro = _buscar(db, d, id_registro)
        if not registro:
            raise HTTPException(status_code=404, detail=d.no_encontrado)
        registro.estado_registro = EstadoRegistro.INACTIVO
        db.commit()
        return {"mensaje": f"{d.nombre_con_articulo} '{registro.nombre}' ha sido desactivado correctamente."}

    def restaurar(id_registro: int = id_en_url, db: Session = Depends(get_db),
                  current_user: models.Usuario = Depends(escritura)):
        registro = _buscar(db, d, id_registro)
        if not registro:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        registro.estado_registro = EstadoRegistro.ACTIVO
        db.commit()
        db.refresh(registro)
        return registro

    def eliminar_fisico(id_registro: int = id_en_url, db: Session = Depends(get_db),
                        current_user: models.Usuario = Depends(solo_admin)):
        registro = _buscar(db, d, id_registro)
        if not registro:
            raise HTTPException(status_code=404, detail="Registro no encontrado")
        try:
            db.delete(registro)
            db.commit()
            return {"mensaje": "Registro eliminado definitivamente"}
        except Exception:
            db.rollback()
            raise HTTPException(status_code=400, detail=MENSAJE_EN_USO) from None

    s, p = d.singular, d.plural
    router.add_api_route(base, crear, methods=["POST"], response_model=d.esquema, name=f"crear_{s}")
    router.add_api_route(base, listar, methods=["GET"], response_model=List[d.esquema], name=f"listar_{p}")
    router.add_api_route(con_id, actualizar, methods=["PUT"], response_model=d.esquema, name=f"actualizar_{s}")
    router.add_api_route(con_id, dar_de_baja, methods=["DELETE"], name=f"eliminar_{s}")
    router.add_api_route(f"{con_id}/restaurar", restaurar, methods=["PUT"], response_model=d.esquema,
                         name=f"restaurar_{p}")
    router.add_api_route(f"{con_id}/fisico", eliminar_fisico, methods=["DELETE"], name=f"eliminar_{p}_fisico")


def normalizar_ruc_opcional(datos: dict) -> dict:
    """RUC vacío o con espacios -> None; si viene, sin espacios alrededor."""
    ruc: Optional[str] = datos.get("ruc")
    datos["ruc"] = str(ruc).strip() if ruc and str(ruc).strip() else None
    return datos
