"""
Traduce los errores de validación de Pydantic (en inglés y con nombres técnicos) a mensajes en español
con el nombre del campo tal como lo ve la usuaria. main.py lo usa para responder los 422.

La forma de la respuesta no cambia: `detail` sigue siendo una lista de {loc, msg, type}; solo `msg` se traduce.
"""
from typing import Any

# Nombre de cada campo en pantalla (los que no estén aquí se muestran con su nombre técnico legible)
ROTULOS = {
    "nombre": "Nombre", "ruc": "RUC", "categoria": "Categoría", "ubicacion": "Ubicación",
    "nombre_documento": "Tipo de documento", "tipo_gasto": "Tipo de gasto", "clase_aduanera": "Clase aduanera",
    "numero_factura": "N° de factura", "n_cont_fisico": "Contenedor físico", "documento_transporte": "BL / Transporte",
    "fecha_embarque": "Fecha de embarque", "fecha_arribo": "Fecha de arribo",
    "fecha_recepcion_almacen": "Fecha de recepción en almacén", "fecha_levante_maestro": "Fecha de levante",
    "fob_usd": "FOB (USD)", "flete_usd": "Flete (USD)", "cfr_usd": "CFR (USD)", "tipo_valor": "Tipo de valor",
    "status_llegada": "Estado de llegada", "venta_sucesiva": "Venta sucesiva",
    "id_maestro": "Contenedor", "id_importador": "Importador", "id_proveedor": "Proveedor", "id_agente": "Agente",
    "id_almacen": "Almacén", "id_dam": "DAM", "id_concepto": "Concepto", "id_tipo_doc": "Tipo de documento",
    "id_gasto": "Gasto", "banco_id": "Banco", "voucher_id": "Voucher",
    "numero_de_dam": "N° de DAM", "serie": "Serie", "canal_control": "Canal de control",
    "monto_valor_provisional_usd": "Monto garantizado (USD)", "estado_dam": "Estado de la DAM",
    "numero_documento": "N° de documento", "fecha_vencimiento": "Fecha de vencimiento",
    "monto_original": "Monto", "moneda": "Moneda", "observaciones": "Observaciones",
    "numero_operacion": "N° de operación", "monto_total": "Monto del voucher",
    "fecha_transferencia": "Fecha de transferencia", "importe": "Importe", "tipo_cambio": "Tipo de cambio",
    "fecha_pago": "Fecha de pago", "monto_moneda_origen": "Monto debitado", "motivo": "Motivo",
    "precio_compra": "TC compra", "precio_venta": "TC venta", "fecha": "Fecha",
    "username": "Usuario", "email": "Correo", "password": "Contraseña", "id_rol": "Rol",
}


def rotulo(loc: tuple | list) -> str:
    """Nombre en pantalla del campo de un error (el último tramo de `loc` que sea texto)."""
    campo = next((str(p) for p in reversed(loc) if isinstance(p, str) and p not in ("body", "query", "path")), "")
    return ROTULOS.get(campo, campo.replace("_", " ").capitalize() or "Dato")


def _numero(valor: Any) -> str:
    return str(valor)


def _mensaje(error: dict) -> str:
    tipo = error.get("type", "")
    ctx = error.get("ctx") or {}

    # Reglas propias (domain/validaciones.py): su mensaje ya está en español
    if tipo == "value_error":
        texto = str(ctx.get("error") or error.get("msg", "")).removeprefix("Value error, ")
        return texto if texto[:1].isupper() else f"{rotulo(error['loc'])}: {texto}"

    traducciones = {
        "missing": "es obligatorio.",
        "string_type": "debe ser un texto.",
        "string_too_short": f"debe tener al menos {ctx.get('min_length')} caracteres.",
        "string_too_long": f"admite como máximo {ctx.get('max_length')} caracteres.",
        "int_parsing": "debe ser un número entero.",
        "int_type": "debe ser un número entero.",
        "int_from_float": "debe ser un número entero.",
        "decimal_parsing": "debe ser un número (use punto para los decimales, sin comas ni símbolos).",
        "decimal_type": "debe ser un número.",
        "float_parsing": "debe ser un número.",
        "decimal_max_places": f"admite como máximo {ctx.get('decimal_places')} decimales.",
        "decimal_max_digits": f"admite como máximo {ctx.get('max_digits')} dígitos.",
        "decimal_whole_digits": f"admite como máximo {ctx.get('whole_digits')} dígitos antes del punto decimal.",
        "greater_than": f"debe ser mayor que {_numero(ctx.get('gt'))}.",
        "greater_than_equal": f"no puede ser menor que {_numero(ctx.get('ge'))}.",
        "less_than": f"debe ser menor que {_numero(ctx.get('lt'))}.",
        "less_than_equal": f"no puede ser mayor que {_numero(ctx.get('le'))}.",
        "date_parsing": "no es una fecha válida (formato AAAA-MM-DD).",
        "date_from_datetime_parsing": "no es una fecha válida (formato AAAA-MM-DD).",
        "date_type": "no es una fecha válida.",
        "bool_parsing": "debe ser sí o no.",
        "bool_type": "debe ser sí o no.",
        "enum": f"debe ser uno de: {ctx.get('expected')}.",
        "literal_error": f"debe ser uno de: {ctx.get('expected')}.",
        "extra_forbidden": "no se admite en esta operación.",
        "json_invalid": "los datos enviados no tienen un formato válido.",
    }
    texto = traducciones.get(tipo)
    if texto is None:
        return f"{rotulo(error.get('loc', ()))}: {error.get('msg', 'valor no válido')}"
    return f"{rotulo(error.get('loc', ()))} {texto}"


def traducir_errores(errores: list[dict]) -> list[dict]:
    """Lista de errores de Pydantic -> misma lista con `msg` en español (y sin datos internos como `ctx`)."""
    return [{"loc": list(e.get("loc", ())), "msg": _mensaje(e), "type": e.get("type", "")} for e in errores]
