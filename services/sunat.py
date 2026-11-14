"""
Cliente de la consulta de RUC (SUNAT a través de ApiPeru).

Toda la comunicación con el servicio externo está aquí: la ruta HTTP solo traduce el resultado.
Si algún día se cambia de proveedor, se modifica este archivo y nada más.
"""
import os

import requests

from domain.razon_social import acortar_razon_social
from domain.validaciones import ValorInvalido, normalizar_ruc

URL_CONSULTA_RUC = "https://apiperu.dev/api/ruc/{ruc}"
TIEMPO_ESPERA_SEGUNDOS = 5

# Estado y condición del contribuyente SEGÚN SUNAT (no son valores del sistema).
ESTADO_CONTRIBUYENTE_ACTIVO = "ACTIVO"  # literal-permitido: dato de SUNAT
CONDICION_CONTRIBUYENTE_HABIDO = "HABIDO"


class ErrorConsultaRuc(Exception):
    """Fallo de la consulta, con el código HTTP y el mensaje que deben llegar a la usuaria."""

    def __init__(self, status_code: int, detalle: str):
        super().__init__(detalle)
        self.status_code = status_code
        self.detalle = detalle


def validar_formato_ruc(ruc: str) -> None:
    """Un RUC mal digitado (largo, prefijo o dígito verificador) no se consulta: se avisa de inmediato."""
    try:
        normalizar_ruc(ruc)
    except ValorInvalido as exc:
        raise ErrorConsultaRuc(400, str(exc)) from None


def consultar_ruc(ruc: str) -> dict:
    """
    Consulta un RUC y devuelve razón social, nombre sugerido, estado y condición.
    Lanza ErrorConsultaRuc si el RUC no es válido, no existe, no está activo y habido, o si el servicio falla.
    """
    validar_formato_ruc(ruc)

    token = os.getenv("SUNAT_API_TOKEN")
    if not token:
        raise ErrorConsultaRuc(500, "Token de SUNAT (ApiPeru) no configurado en el servidor.")

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    try:
        response = requests.get(URL_CONSULTA_RUC.format(ruc=ruc), headers=headers, timeout=TIEMPO_ESPERA_SEGUNDOS)
    except requests.exceptions.RequestException:
        raise ErrorConsultaRuc(503, "El servicio de consulta no está disponible temporalmente.") from None

    if response.status_code != 200:
        raise ErrorConsultaRuc(response.status_code, "Error al consultar SUNAT a través de ApiPeru.")

    res_json = response.json()
    if not res_json.get("success"):
        raise ErrorConsultaRuc(404, "RUC no encontrado en SUNAT.")

    data = res_json.get("data", {})
    estado, condicion = data.get("estado"), data.get("condicion")
    if estado != ESTADO_CONTRIBUYENTE_ACTIVO:
        raise ErrorConsultaRuc(400, f"El RUC está {estado}. No se puede operar.")
    if condicion != CONDICION_CONTRIBUYENTE_HABIDO:
        raise ErrorConsultaRuc(400, f"El RUC tiene condición {condicion}.")

    razon_social = data.get("nombre_o_razon_social") or ""
    return {
        "razon_social": razon_social,
        "nombre_sugerido": acortar_razon_social(razon_social),
        "estado": estado,
        "condicion": condicion,
    }
