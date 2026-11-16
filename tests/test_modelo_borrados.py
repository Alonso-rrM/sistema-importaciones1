"""
Borrar un registro NUNCA debe dejar huérfanos a otros en silencio.

Por omisión, SQLAlchemy, al borrar un registro "padre", pone en NULL la referencia de sus "hijos" (por ejemplo,
el proveedor de los gastos) para que la base no proteste. Así ocurrió: al borrar definitivamente un proveedor
en uso, sus gastos quedaron sin proveedor. Con passive_deletes="all" la base de datos rechaza el borrado
(el registro está en uso) y el sistema responde "No se puede eliminar porque está en uso".
"""
from sqlalchemy.orm import ONETOMANY

import models
from database import Base


def test_ninguna_relacion_padre_hijo_deja_huerfanos_al_borrar():
    sin_proteccion = []
    for mapper in Base.registry.mappers:
        for rel in mapper.relationships:
            if rel.direction is ONETOMANY and rel.passive_deletes != "all" and "delete" not in rel.cascade:
                sin_proteccion.append(f"{mapper.class_.__name__}.{rel.key}")
    assert sin_proteccion == [], (
        "Estas relaciones dejarían en NULL la referencia de sus registros al borrar el padre; agregue "
        f'passive_deletes="all": {sin_proteccion}')


def test_el_proveedor_protege_sus_gastos():
    assert models.CatProveedor.gastos.property.passive_deletes == "all"
