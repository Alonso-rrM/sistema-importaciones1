import re

with open("main.py", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update GET endpoints to accept mostrar_inactivos
catalogs = [
    ("agentes", "CatAgente", "id_agente"),
    ("proveedores", "CatProveedor", "id_proveedor"),
    ("almacenes", "CatAlmacen", "id_almacen"),
    ("importadores", "CatImportador", "id_importador"),
    ("empresas", "CatEmpresa", "id_empresa"),
    ("conceptos", "CatConceptoPago", "id_concepto"),
    ("bancos", "CatBanco", "id_banco")
]

for route, model, id_field in catalogs:
    # Fix GET
    get_pattern = re.compile(
        r'(@app\.get\("/' + route + r'/", response_model=List\[schemas\.' + model + r'\]\)\n'
        r'def listar_' + route + r'\(db: Session = Depends\(get_db\), current_user: models\.Usuario = Depends\(get_current_user\)\):\n'
        r'    return db\.query\(models\.' + model + r'\)\.filter\(models\.' + model + r'\.estado_registro == "ACTIVO"\)\.all\(\))'
    )
    
    replacement_get = (
        f'@app.get("/{route}/", response_model=List[schemas.{model}])\n'
        f'def listar_{route}(mostrar_inactivos: bool = False, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):\n'
        f'    query = db.query(models.{model})\n'
        f'    if not mostrar_inactivos:\n'
        f'        query = query.filter(models.{model}.estado_registro == "ACTIVO")\n'
        f'    return query.all()'
    )
    
    content = get_pattern.sub(replacement_get, content)

    # Add RESTAURAR and DELETE FISICO after the normal DELETE
    delete_pattern = re.compile(
        r'(@app\.delete\("/' + route + r'/{' + id_field + r'}"\)\n'
        r'def eliminar_.*?\n'
        r'(?:    .*?\n)*'
        r'    return {"mensaje": ".*? eliminad[oa] correctamente"}\n)'
    )
    
    new_endpoints = (
        f'\n@app.put("/{route}/{{{id_field}}}/restaurar", response_model=schemas.{model})\n'
        f'def restaurar_{route}({id_field}: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):\n'
        f'    db_item = db.query(models.{model}).filter(models.{model}.{id_field} == {id_field}).first()\n'
        f'    if not db_item:\n'
        f'        raise HTTPException(status_code=404, detail="Registro no encontrado")\n'
        f'    db_item.estado_registro = "ACTIVO"\n'
        f'    db.commit()\n'
        f'    db.refresh(db_item)\n'
        f'    return db_item\n\n'
        
        f'@app.delete("/{route}/{{{id_field}}}/fisico")\n'
        f'def eliminar_{route}_fisico({id_field}: int, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):\n'
        f'    db_item = db.query(models.{model}).filter(models.{model}.{id_field} == {id_field}).first()\n'
        f'    if not db_item:\n'
        f'        raise HTTPException(status_code=404, detail="Registro no encontrado")\n'
        f'    try:\n'
        f'        db.delete(db_item)\n'
        f'        db.commit()\n'
        f'        return {{"mensaje": "Registro eliminado definitivamente"}}\n'
        f'    except Exception as e:\n'
        f'        db.rollback()\n'
        f'        raise HTTPException(status_code=400, detail="No se puede eliminar porque este registro está siendo usado en otros módulos (llave foránea).")\n'
    )
    
    # We replace the DELETE endpoint with itself + the new endpoints
    content = delete_pattern.sub(r'\1' + new_endpoints, content)

with open("main.py", "w", encoding="utf-8") as f:
    f.write(content)

print("modifications complete")
