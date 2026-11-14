"""
DIAGNÓSTICO DE VALORES FIJOS EN LA BASE DE DATOS (solo lectura)
===============================================================
Revisa que las columnas de estado, moneda, categoría, etc. contengan únicamente los valores definidos
en constantes.py. NO modifica nada: solo consulta e informa.

Para qué sirve: antes de agregar restricciones (CHECK) en la base y validaciones estrictas en la API
hay que saber si existen registros antiguos con valores fuera del catálogo (por ejemplo, escritos con
un error de tipeo). Si este script no reporta nada, es seguro activar esas restricciones.

Además informa (sin afectar el resultado) los RUC, N° de DAM y comprobantes guardados que no cumplen
las reglas de domain/validaciones.py. La API acepta esos registros antiguos tal como están y solo exige
el formato cuando se cambia el dato; este informe sirve para corregirlos con calma si se desea.

Uso (desde la raíz del proyecto):
    python scripts/verificar_valores.py                -> usa DATABASE_URL del entorno / .env
    python scripts/verificar_valores.py --url <URL>    -> revisa otra base
"""
import argparse
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text

import constantes as C
from domain.validaciones import (
    ValorInvalido, normalizar_comprobante, normalizar_numero_dam, normalizar_ruc_opcional,
)

# tabla -> {columna: (catálogo, admite_vacío)}
REGLAS = {
    "cat_conceptos_pagos": {
        "tipo_gasto": (C.TipoGasto, False), "clase_aduanera": (C.ClaseAduanera, False),
        "estado_registro": (C.EstadoRegistro, True),
    },
    "cat_proveedores": {"categoria": (C.CategoriaProveedor, True), "estado_registro": (C.EstadoRegistro, True)},
    "cat_almacenes": {"estado_registro": (C.EstadoRegistro, True)},
    "cat_bancos": {"estado_registro": (C.EstadoRegistro, True)},
    "cat_agentes": {"estado_registro": (C.EstadoRegistro, True)},
    "cat_importadores": {"estado_registro": (C.EstadoRegistro, True)},
    "catalogo_documentos_pago": {"estado_registro": (C.EstadoRegistro, True)},
    "vouchers_bancarios": {"moneda": (C.Moneda, False), "estado_registro": (C.EstadoRegistro, True)},
    "maestro_importaciones": {
        "tipo_valor": (C.TipoValor, True), "status_llegada": (C.StatusLlegada, True),
        "estado_levante": (C.EstadoLevante, True), "estado_documentario": (C.EstadoDocumentario, False),
        "estado_registro": (C.EstadoRegistro, True),
    },
    "detalle_dams": {
        "canal_control": (C.CanalControl, True), "estado_dam": (C.EstadoDam, False),
    },
    "registro_gastos": {
        "moneda": (C.Moneda, False), "estado_pago": (C.EstadoPago, True), "estado_registro": (C.EstadoRegistro, True),
    },
    "registro_pagos": {"moneda": (C.Moneda, False), "estado_registro": (C.EstadoRegistro, True)},
}


# (tabla, columna con id, columna revisada, regla, condición SQL extra, parámetros, descripción)
_NO_EXTRANJERO = "(p.categoria IS NULL OR p.categoria NOT IN (:exterior, :estado))"
FORMATOS = [
    ("cat_importadores", "id_importador", "ruc", normalizar_ruc_opcional, "", {}, "RUC de importadores"),
    ("cat_agentes", "id_agente", "ruc", normalizar_ruc_opcional, "", {}, "RUC de agentes"),
    ("cat_proveedores", "id_proveedor", "ruc", normalizar_ruc_opcional,
     "WHERE categoria IS NULL OR categoria <> :exterior", {"exterior": C.CategoriaProveedor.INTERNACIONAL},
     "RUC de proveedores peruanos"),
    ("detalle_dams", "id_dam", "numero_de_dam", normalizar_numero_dam, "", {}, "N° de DAM"),
]
LIMITE_EJEMPLOS = 20


def _informar_formato(descripcion, filas, regla):
    """Cuenta e imprime los valores que no cumplen la regla o que se guardarían de otra forma."""
    invalidos, distintos, por_forma = [], [], {}
    for id_, valor in filas:
        if valor is None or not str(valor).strip():
            continue
        try:
            canonico = regla(valor)
        except ValorInvalido as exc:
            invalidos.append((id_, valor, str(exc)))
            continue
        if canonico != valor:
            distintos.append((id_, valor, canonico))
        por_forma.setdefault(canonico, []).append((id_, valor))
    repetidos = {forma: ids for forma, ids in por_forma.items() if len(ids) > 1}
    for id_, valor, motivo in invalidos[:LIMITE_EJEMPLOS]:
        print(f"[FORMATO NO VÁLIDO] {descripcion} (id {id_}): {valor!r} -> {motivo}")
    for id_, valor, canonico in distintos[:LIMITE_EJEMPLOS]:
        print(f"[FORMA DISTINTA] {descripcion} (id {id_}): {valor!r}; con la regla actual sería {canonico!r}")
    for forma, ids in list(repetidos.items())[:LIMITE_EJEMPLOS]:
        print(f"[REPETIDO SEGÚN LA REGLA] {descripcion}: {forma!r} aparece en los ids {[i for i, _ in ids]} ({[v for _, v in ids]})")
    for lista, etiqueta in ((invalidos, "no válidos"), (distintos, "con otra forma")):
        if len(lista) > LIMITE_EJEMPLOS:
            print(f"   ... y {len(lista) - LIMITE_EJEMPLOS} más {etiqueta} en {descripcion}.")
    return len(invalidos) + len(distintos) + len(repetidos)


def revisar_formatos(conn, tablas) -> int:
    """Informe de formatos (RUC, DAM, comprobantes). Devuelve la cantidad de observaciones."""
    observaciones = 0
    for tabla, col_id, columna, regla, condicion, parametros, descripcion in FORMATOS:
        if tabla not in tablas:
            continue
        filas = conn.execute(text(f'SELECT "{col_id}", "{columna}" FROM "{tabla}" {condicion}'), parametros).all()
        observaciones += _informar_formato(descripcion, filas, regla)
    if {"registro_gastos", "cat_proveedores"} <= tablas:
        filas = conn.execute(text(
            "SELECT g.id_gasto, g.numero_documento FROM registro_gastos g "
            f"JOIN cat_proveedores p ON p.id_proveedor = g.id_proveedor WHERE {_NO_EXTRANJERO}"
        ), {"exterior": C.CategoriaProveedor.INTERNACIONAL, "estado": C.CategoriaProveedor.ESTADO_O_TRIBUTO}).all()
        observaciones += _informar_formato("Comprobantes de proveedores nacionales", filas, normalizar_comprobante)
    return observaciones


def main():
    parser = argparse.ArgumentParser(description="Detecta valores fuera de catálogo en la base (solo lectura).")
    parser.add_argument("--url", help="URL de la base a revisar (por defecto DATABASE_URL).")
    args = parser.parse_args()

    load_dotenv(os.path.join(RAIZ, ".env"))
    url = args.url or os.environ.get("DATABASE_URL")
    if not url:
        print("ERROR: defina DATABASE_URL o use --url.")
        return 2

    engine = create_engine(url)
    hallazgos = 0
    revisadas = 0
    with engine.connect() as conn:
        conn.execute(text("SET TRANSACTION READ ONLY"))
        existentes = inspect(conn)
        tablas = set(existentes.get_table_names())
        for tabla, columnas in REGLAS.items():
            if tabla not in tablas:
                print(f"[AVISO] La tabla {tabla} no existe en esta base; se omite.")
                continue
            cols = {c["name"] for c in existentes.get_columns(tabla)}
            for columna, (catalogo, admite_vacio) in columnas.items():
                if columna not in cols:
                    print(f"[AVISO] {tabla}.{columna} no existe en esta base; se omite.")
                    continue
                revisadas += 1
                validos = {m.value for m in catalogo}
                filas = conn.execute(
                    text(f'SELECT "{columna}" AS valor, COUNT(*) AS n FROM "{tabla}" GROUP BY "{columna}" ORDER BY n DESC')
                ).all()
                for valor, n in filas:
                    if valor is None:
                        if not admite_vacio:
                            hallazgos += 1
                            print(f"[FUERA DE CATÁLOGO] {tabla}.{columna}: {n} registro(s) SIN VALOR")
                    elif valor not in validos:
                        hallazgos += 1
                        print(f"[FUERA DE CATÁLOGO] {tabla}.{columna}: {n} registro(s) con {valor!r}")

        print("\n--- Formatos de RUC, N° de DAM y comprobantes (informativo) ---")
        observaciones = revisar_formatos(conn, tablas)

    print(f"\nFormatos: {observaciones} observación(es). Son registros antiguos: la API los acepta tal como están.")
    print(f"Columnas revisadas: {revisadas}. Valores fuera de catálogo: {hallazgos}.")
    if hallazgos:
        print("Revise esos registros (o indique si el valor es legítimo y debe agregarse a constantes.py).")
        return 1
    print("Todo en orden: es seguro activar las restricciones de valores.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
