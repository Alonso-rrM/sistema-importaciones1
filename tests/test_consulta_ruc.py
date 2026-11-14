"""
Consulta de RUC a SUNAT a través de ApiPeru (GET /sunat/ruc/{ruc}).
Se simula el servicio externo: estas pruebas no salen a internet ni usan base de datos.
"""
from types import SimpleNamespace

import pytest
import requests
from fastapi.testclient import TestClient

import main
from dependencies import get_current_user

RUC = "20100047218"   # RUC real (dígito verificador correcto)


@pytest.fixture
def cliente(monkeypatch):
    main.app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id_usuario=1, id_rol=1)
    monkeypatch.setenv("SUNAT_API_TOKEN", "token-de-prueba")
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


def simular_apiperu(monkeypatch, status=200, cuerpo=None, error=None):
    llamadas = []

    def falso_get(url, headers=None, timeout=None):
        llamadas.append({"url": url, "headers": headers, "timeout": timeout})
        if error:
            raise error
        return SimpleNamespace(status_code=status, json=lambda: cuerpo)

    monkeypatch.setattr(requests, "get", falso_get)
    return llamadas


def respuesta_ok(estado="ACTIVO", condicion="HABIDO", nombre="EMPRESA DEMO SOCIEDAD ANONIMA CERRADA"):
    return {"success": True, "data": {"estado": estado, "condicion": condicion, "nombre_o_razon_social": nombre}}


def test_ruc_valido_devuelve_razon_social_y_nombre_sugerido(cliente, monkeypatch):
    llamadas = simular_apiperu(monkeypatch, cuerpo=respuesta_ok())
    r = cliente.get(f"/sunat/ruc/{RUC}")
    assert r.status_code == 200
    assert r.json() == {
        "razon_social": "EMPRESA DEMO SOCIEDAD ANONIMA CERRADA",
        "nombre_sugerido": "EMPRESA DEMO S.A.C.",
        "estado": "ACTIVO",
        "condicion": "HABIDO",
    }
    assert llamadas == [{
        "url": f"https://apiperu.dev/api/ruc/{RUC}",
        "headers": {"Authorization": "Bearer token-de-prueba", "Content-Type": "application/json"},
        "timeout": 5,
    }]


@pytest.mark.parametrize("ruc, motivo", [
    ("123", "11 dígitos"), ("2012345678X", "11 dígitos"), ("201234567890", "11 dígitos"),
    ("20100047219", "dígito verificador"),   # un dígito mal digitado: ni siquiera se consulta a SUNAT
])
def test_ruc_mal_formado_se_rechaza_sin_consultar(cliente, monkeypatch, ruc, motivo):
    llamadas = simular_apiperu(monkeypatch, cuerpo=respuesta_ok())
    r = cliente.get(f"/sunat/ruc/{ruc}")
    assert r.status_code == 400 and motivo in r.json()["detail"]
    assert llamadas == []


def test_sin_token_configurado_responde_500(cliente, monkeypatch):
    monkeypatch.delenv("SUNAT_API_TOKEN")
    llamadas = simular_apiperu(monkeypatch, cuerpo=respuesta_ok())
    r = cliente.get(f"/sunat/ruc/{RUC}")
    assert r.status_code == 500 and "no configurado" in r.json()["detail"]
    assert llamadas == []


def test_ruc_no_encontrado(cliente, monkeypatch):
    simular_apiperu(monkeypatch, cuerpo={"success": False})
    r = cliente.get(f"/sunat/ruc/{RUC}")
    assert r.status_code == 404 and r.json()["detail"] == "RUC no encontrado en SUNAT."


def test_ruc_no_activo(cliente, monkeypatch):
    simular_apiperu(monkeypatch, cuerpo=respuesta_ok(estado="BAJA DE OFICIO"))
    r = cliente.get(f"/sunat/ruc/{RUC}")
    assert r.status_code == 400 and r.json()["detail"] == "El RUC está BAJA DE OFICIO. No se puede operar."


def test_ruc_no_habido(cliente, monkeypatch):
    simular_apiperu(monkeypatch, cuerpo=respuesta_ok(condicion="NO HABIDO"))
    r = cliente.get(f"/sunat/ruc/{RUC}")
    assert r.status_code == 400 and r.json()["detail"] == "El RUC tiene condición NO HABIDO."


def test_error_http_del_proveedor_se_propaga(cliente, monkeypatch):
    simular_apiperu(monkeypatch, status=429, cuerpo={})
    r = cliente.get(f"/sunat/ruc/{RUC}")
    assert r.status_code == 429 and "ApiPeru" in r.json()["detail"]


def test_servicio_caido_responde_503(cliente, monkeypatch):
    simular_apiperu(monkeypatch, error=requests.exceptions.ConnectionError("sin red"))
    r = cliente.get(f"/sunat/ruc/{RUC}")
    assert r.status_code == 503


def test_razon_social_vacia(cliente, monkeypatch):
    simular_apiperu(monkeypatch, cuerpo=respuesta_ok(nombre=None))
    r = cliente.get(f"/sunat/ruc/{RUC}")
    assert r.status_code == 200 and r.json()["razon_social"] == "" and r.json()["nombre_sugerido"] == ""
