import re

with open("main.py", "r", encoding="utf-8") as f:
    content = f.read()

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
    # 1. Update GET
    old_get1 = f'@app.get("/{route}/", response_model=List[schemas.{model}])\ndef listar_{route}(db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):\n    return db.query(models.{model}).filter(models.{model}.estado_registro == "ACTIVO").all()'
    
    new_get1 = f'@app.get("/{route}/", response_model=List[schemas.{model}])\ndef listar_{route}(mostrar_inactivos: bool = False, db: Session = Depends(get_db), current_user: models.Usuario = Depends(get_current_user)):\n    query = db.query(models.{model})\n    if not mostrar_inactivos:\n        query = query.filter(models.{model}.estado_registro == "ACTIVO")\n    return query.all()'
    
    content = content.replace(old_get1, new_get1)
    
    # 2. Add PUT restaurar and DELETE fisico
    old_del = f'@app.delete("/{route}/{{{id_field}}}")'
    
    # We will just find where old_del starts, then search for `return {"mensaje": ...}` after it.
    idx = content.find(old_del)
    if idx != -1:
        end_idx = content.find('return {"mensaje"', idx)
        if end_idx != -1:
            end_idx = content.find('}\n', end_idx) + 2
            
            # The whole block for normal delete
            original_del_block = content[idx:end_idx]
            
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
                f'        raise HTTPException(status_code=400, detail="No se puede eliminar porque este registro está siendo usado en otros módulos.")\n'
            )
            
            # Replace original block with original + new
            content = content[:end_idx] + new_endpoints + content[end_idx:]

with open("main.py", "w", encoding="utf-8") as f:
    f.write(content)

print("modifications complete 2")
