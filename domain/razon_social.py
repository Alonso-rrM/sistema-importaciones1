"""Normalización de razones sociales devueltas por SUNAT. Función pura, sin red ni base de datos."""
import re


def acortar_razon_social(texto: str) -> str:
    """Normaliza y compacta razones sociales largas oficiales de SUNAT."""
    if not texto:
        return ""
    nombre = texto.strip().upper()
    if " - " in nombre:
        partes = [p.strip() for p in nombre.split(" - ") if p.strip()]
        if len(partes) >= 2:
            p1, p2 = partes[0], partes[-1]
            if len(p2) <= len(p1) and len(p2) >= 2:
                nombre = p2

    reemplazos = [
        (r'\bSOCIEDAD\s+ANONIMA\s+CERRADA\b', 'S.A.C.'),
        (r'\bSOCIEDAD\s+COMERCIAL\s+DE\s+RESPONSABILIDAD\s+LIMITADA\b', 'S.R.L.'),
        (r'\bEMPRESA\s+INDIVIDUAL\s+DE\s+RESPONSABILIDAD\s+LIMITADA\b', 'E.I.R.L.'),
        (r'\bSOCIEDAD\s+ANONIMA\s+ABIERTA\b', 'S.A.A.'),
        (r'\bSOCIEDAD\s+ANONIMA\b', 'S.A.'),
        (r'\bS\s*\.?\s*A\s*\.?\s*C\s*\.?\b', 'S.A.C.'),
        (r'\bS\s*\.?\s*R\s*\.?\s*L\s*\.?\b', 'S.R.L.'),
        (r'\bE\s*\.?\s*I\s*\.?\s*R\s*\.?\s*L\s*\.?\b', 'E.I.R.L.'),
        (r'\bS\s*\.?\s*A\s*\.?\s*A\s*\.?\b', 'S.A.A.'),
        (r'\bS\s*\.?\s*A\s*\.?(?!\w)', 'S.A.'),
    ]
    for patron, sigla in reemplazos:
        nombre = re.sub(patron, sigla, nombre, flags=re.IGNORECASE)

    nombre = re.sub(r'[\'\"\`]', '', nombre)
    nombre = re.sub(r'\s+O\s+(?=S\.)', ' ', nombre)
    nombre = re.sub(r'\s+', ' ', nombre).strip()
    nombre = re.sub(r'\.{2,}', '.', nombre)
    return nombre
