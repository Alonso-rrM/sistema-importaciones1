"""
Validación y normalización de lo que digita la usuaria (reglas puras, sin base de datos).

Cada función recibe el texto tal como llegó y devuelve su forma canónica, o lanza ValorInvalido con un
mensaje en español listo para mostrar. El frontend repite estas mismas reglas en
`frontend/src/utils/validaciones.js` (para avisar antes de enviar); la autoridad es este archivo.
"""
import re
from typing import Optional


class ValorInvalido(ValueError):
    """Valor digitado que no cumple el formato esperado. El mensaje se muestra tal cual a la usuaria."""


# ---------------------------------------------------------------------------
# Textos
# ---------------------------------------------------------------------------

def limpiar_texto(texto: Optional[str]) -> Optional[str]:
    """Quita espacios sobrantes (al inicio, al final y repetidos). Vacío -> None."""
    if texto is None:
        return None
    limpio = re.sub(r"\s+", " ", str(texto)).strip()
    return limpio or None


# ---------------------------------------------------------------------------
# RUC (SUNAT)
# ---------------------------------------------------------------------------

# 10: persona natural · 15 y 17: casos especiales de no domiciliados/otros · 16: entes · 20: persona jurídica
PREFIJOS_RUC = ("10", "15", "16", "17", "20")
_PESOS_RUC = (5, 4, 3, 2, 7, 6, 5, 4, 3, 2)


def digito_verificador_ruc(primeros_diez: str) -> int:
    """Dígito verificador del RUC (módulo 11 de SUNAT) a partir de sus 10 primeros dígitos."""
    suma = sum(int(digito) * peso for digito, peso in zip(primeros_diez, _PESOS_RUC))
    resto = 11 - suma % 11
    return {10: 0, 11: 1}.get(resto, resto)


def normalizar_ruc(texto: Optional[str]) -> str:
    """RUC peruano válido, sin espacios ni guiones. Lanza ValorInvalido si no lo es."""
    ruc = re.sub(r"[\s-]", "", str(texto or ""))
    if not ruc:
        raise ValorInvalido("El RUC es obligatorio.")
    if not ruc.isdigit() or len(ruc) != 11:
        raise ValorInvalido(f"El RUC debe tener 11 dígitos (se recibió «{texto}»).")
    if not ruc.startswith(PREFIJOS_RUC):
        raise ValorInvalido(f"El RUC {ruc} no es válido: debe empezar con {', '.join(PREFIJOS_RUC)}.")
    if digito_verificador_ruc(ruc[:10]) != int(ruc[10]):
        raise ValorInvalido(f"El RUC {ruc} no es válido: su dígito verificador no corresponde. Revise si hay un error de digitación.")
    return ruc


def normalizar_ruc_opcional(texto: Optional[str]) -> Optional[str]:
    """Como normalizar_ruc, pero vacío -> None."""
    return normalizar_ruc(texto) if limpiar_texto(texto) else None


# ---------------------------------------------------------------------------
# Número de DAM
# ---------------------------------------------------------------------------

EJEMPLO_DAM = "118-2026-10-123456"
_SEPARADORES = r"[\s\-/.]+"


def normalizar_numero_dam(texto: Optional[str]) -> str:
    """
    Número de DAM en su forma canónica: ADUANA(3)-AÑO(4)-RÉGIMEN(2)-NÚMERO(6), p. ej. 118-2026-10-000123.

    Acepta el año con 2 dígitos (118-26-10-535304, como lo muestra SUNAT en el C.D.A.), el número sin ceros
    a la izquierda y como separadores guiones, espacios, barras o puntos.
    """
    original = limpiar_texto(texto)
    if not original:
        raise ValorInvalido("El N° de DAM es obligatorio.")
    partes = [p for p in re.split(_SEPARADORES, original) if p]
    formato = f"Formato esperado: aduana-año-régimen-número, por ejemplo {EJEMPLO_DAM}."
    if len(partes) != 4 or not all(p.isdigit() for p in partes):
        raise ValorInvalido(f"El N° de DAM «{original}» no es válido. {formato}")
    aduana, anio, regimen, numero = partes
    if len(aduana) != 3:
        raise ValorInvalido(f"El código de aduana de la DAM debe tener 3 dígitos (se recibió «{aduana}»). {formato}")
    if len(anio) == 2:
        anio = f"20{anio}"
    if len(anio) != 4 or not anio.startswith("20"):
        raise ValorInvalido(f"El año de la DAM debe tener 4 dígitos, por ejemplo 2026 (se recibió «{partes[1]}»). {formato}")
    if len(regimen) != 2:
        raise ValorInvalido(f"El régimen de la DAM debe tener 2 dígitos, por ejemplo 10 (se recibió «{regimen}»). {formato}")
    if not 1 <= len(numero) <= 6 or int(numero) == 0:
        raise ValorInvalido(f"El número correlativo de la DAM debe tener entre 1 y 6 dígitos (se recibió «{numero}»). {formato}")
    return f"{aduana}-{anio}-{regimen}-{numero.zfill(6)}"


# ---------------------------------------------------------------------------
# Comprobantes de pago de proveedores nacionales
# ---------------------------------------------------------------------------

EJEMPLO_COMPROBANTE = "F001-123"
_COMPROBANTE = re.compile(r"([A-Z0-9]{1,4})-(\d{1,8})")


def normalizar_comprobante(texto: Optional[str]) -> Optional[str]:
    """
    Comprobante peruano en su forma canónica SERIE-CORRELATIVO: serie de hasta 4 letras o dígitos (en
    mayúsculas) y correlativo de 8 dígitos con ceros a la izquierda. F001-77 -> F001-00000077. Vacío -> None.
    """
    original = limpiar_texto(texto)
    if not original:
        return None
    compacto = re.sub(r"\s*-\s*", "-", original.upper())
    coincidencia = _COMPROBANTE.fullmatch(compacto)
    if not coincidencia:
        raise ValorInvalido(
            f"El N° de comprobante «{original}» no es válido. Formato esperado: SERIE-NÚMERO "
            f"(serie de hasta 4 caracteres y número de hasta 8 dígitos), por ejemplo {EJEMPLO_COMPROBANTE}."
        )
    serie, correlativo = coincidencia.groups()
    if int(correlativo) == 0:
        raise ValorInvalido(f"El número del comprobante «{original}» no puede ser cero.")
    return f"{serie}-{correlativo.zfill(8)}"
