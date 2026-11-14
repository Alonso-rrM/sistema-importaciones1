"""
CARGA MASIVA DE CATÁLOGOS DESDE EXCEL: cómo se construye cada registro a partir de una fila.

Cada catálogo tiene su propia función constructora, registrada en CONSTRUCTORES (patrón Factory).
Agregar un catálogo nuevo a la carga masiva = escribir su constructora y registrarla; la ruta HTTP
(routers/catalogos.py) no cambia.

Cada constructora recibe la fila ya limpia (dict) y devuelve el objeto a insertar, o None si la fila
debe ignorarse (por ejemplo, sin nombre). Si la fila tiene un dato inválido, lanza ValueError con un
mensaje para la usuaria.
"""
import re
from typing import Callable, Optional

import models
from constantes import ClaseAduanera, TipoGasto
from domain.conceptos import clase_aduanera_sugerida
from domain.validaciones import normalizar_ruc_opcional

# Encabezados que se aceptan como sinónimos de la columna "nombre"
ALIAS_COLUMNA_NOMBRE = [
    "nombre_banco", "razon_social", "nombre_rol", "nombre_concepto",
    "nombre_proveedor", "nombre_agente", "nombre_importador", "nombre_almacen",
]


def _ruc_desde_excel(valor) -> Optional[str]:
    """
    RUC de una celda, validado. Excel suele entregarlo como número (20123456789.0): se quita el ".0".
    Si no es un RUC válido, la fila se rechaza con el motivo (ValorInvalido es un ValueError).
    """
    texto = str(valor).strip() if valor is not None else ""
    if re.fullmatch(r"\d+\.0+", texto):
        texto = texto.split(".")[0]
    return normalizar_ruc_opcional(texto)


def _rol(fila: dict):
    return models.CatRol(nombre=str(fila["nombre"]), descripcion=fila.get("descripcion"))


def _banco(fila: dict):
    return models.CatBanco(nombre=str(fila["nombre"]))


def _concepto(fila: dict):
    # Columna opcional: si no viene, la clase se propone según el nombre
    clase = str(fila.get("clase_aduanera") or "").strip().upper()
    if clase and clase not in {c.value for c in ClaseAduanera}:
        raise ValueError(f"clase_aduanera '{clase}' no es válida. Use: " + ", ".join(c.value for c in ClaseAduanera))
    return models.CatConceptoPago(
        nombre=str(fila["nombre"]),
        descripcion=fila.get("descripcion"),
        tipo_gasto=str(fila.get("tipo_gasto") or TipoGasto.FIJO_DESPACHO),
        clase_aduanera=clase or clase_aduanera_sugerida(str(fila["nombre"])),
    )


def _proveedor(fila: dict):
    return models.CatProveedor(nombre=str(fila["nombre"]), ruc=_ruc_desde_excel(fila.get("ruc")))


def _agente(fila: dict):
    return models.CatAgente(nombre=str(fila["nombre"]), ruc=_ruc_desde_excel(fila.get("ruc")))


def _importador(fila: dict):
    return models.CatImportador(nombre=str(fila["nombre"]), ruc=_ruc_desde_excel(fila.get("ruc")))


def _almacen(fila: dict):
    ubicacion = fila.get("ubicacion")
    return models.CatAlmacen(nombre=str(fila["nombre"]), ubicacion=str(ubicacion) if ubicacion else None)


# El orden es el que se muestra en el mensaje de "catálogo inválido".
CONSTRUCTORES: dict[str, Callable[[dict], object]] = {
    "roles": _rol,
    "bancos": _banco,
    "conceptos": _concepto,
    "proveedores": _proveedor,
    "agentes": _agente,
    "importadores": _importador,
    "almacenes": _almacen,
}


def construir_registro(catalogo: str, fila: dict):
    """Objeto a insertar para esta fila, o None si la fila no tiene nombre y debe ignorarse."""
    if not fila.get("nombre"):
        return None
    return CONSTRUCTORES[catalogo](fila)
