"""Reglas puras sobre conceptos de gasto. Sin base de datos ni HTTP."""
from constantes import ClaseAduanera


def clase_aduanera_sugerida(nombre: str | None) -> ClaseAduanera:
    """
    Propone la clase aduanera de un concepto a partir de su nombre.

    Se usa SOLO como valor inicial cuando se crea un concepto sin indicar la clase (API, carga masiva
    por Excel) y es la misma regla con la que la migración clasificó los conceptos que ya existían.
    Una vez guardada, la clase se lee siempre del campo `clase_aduanera`: renombrar el concepto
    ya no cambia el comportamiento del levante.

    Orden: TRIBUTO, luego OMC, luego PERCEPCIÓN. "PERCEPCION OMC" es de la etapa OMC (no de la proforma).
    """
    texto = (nombre or "").upper()
    if "TRIBUTO" in texto:  # literal-permitido: palabra buscada dentro del nombre
        return ClaseAduanera.TRIBUTO
    if "OMC" in texto:  # literal-permitido: palabra buscada dentro del nombre
        return ClaseAduanera.OMC
    if "PERCEPCI" in texto:
        return ClaseAduanera.PERCEPCION
    return ClaseAduanera.NINGUNA
