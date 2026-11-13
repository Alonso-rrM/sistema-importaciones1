"""
DIAGNÓSTICO DE VALORES FIJOS EN LA BASE DE DATOS (solo lectura)
===============================================================
Revisa que las columnas de estado, moneda, categoría, etc. contengan únicamente los valores definidos
en constantes.py. NO modifica nada: solo consulta e informa.

Para qué sirve: antes de agregar restricciones (CHECK) en la base y validaciones estrictas en la API
hay que saber si existen registros antiguos con valores fuera del catálogo (por ejemplo, escritos con
un error de tipeo). Si este script no reporta nada, es seguro activar esas restricciones.

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

# tabla -> {columna: (catálogo, admite_vacío)}
REGLAS = {
    "cat_conceptos_pagos": {"tipo_gasto": (C.TipoGasto, False), "estado_registro": (C.EstadoRegistro, True)},
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

    print(f"\nColumnas revisadas: {revisadas}. Valores fuera de catálogo: {hallazgos}.")
    if hallazgos:
        print("Revise esos registros (o indique si el valor es legítimo y debe agregarse a constantes.py).")
        return 1
    print("Todo en orden: es seguro activar las restricciones de valores.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
