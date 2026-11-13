"""
Protección contra errores de digitación en valores fijos (roles, estados, monedas...).

1. Los valores de constantes.py son los que están GUARDADOS en la base de datos: cambiarlos por accidente
   dejaría registros huérfanos. Aquí se fijan uno por uno.
2. Ningún archivo del backend puede volver a escribir esos textos a mano: debe usar constantes.py.
"""
import ast
import glob
import io
import os
import tokenize
from enum import IntEnum, StrEnum

import constantes as C

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

VALORES_ESPERADOS = {
    "EstadoRegistro": ["ACTIVO", "INACTIVO"],
    "Moneda": ["USD", "PEN"],
    "EstadoPago": ["PENDIENTE", "PARCIAL", "PAGADO"],
    "TipoValor": ["DEFINITIVO", "GARANTIZADO"],
    "EstadoDocumentario": [
        "SIN NUMERAR", "EN PROCESO", "ATE. PARCIAL", "CON LEVANTE (PEND. INGRESO)",
        "EN ALMACÉN (PEND. OMC)", "ATE. TOTAL",
    ],
    "EstadoLevante": ["SIN LEVANTE", "CON LEVANTE"],
    "StatusLlegada": [
        "EN TRÁNSITO", "EN PUERTO", "EN ALMACÉN TEMPORAL", "PENDIENTE DESCARGA", "RETIRO PROGRAMADO", "EN ALMACÉN",
    ],
    "CanalControl": ["VERDE", "NARANJA", "ROJO"],
    "EstadoDam": [
        "NUMERADA / EN EVALUACIÓN", "PENDIENTE PAGO PROFORMA", "PENDIENTE DE AFORO", "OBSERVADA / NOTIFICADA",
        "EN REVISIÓN", "CON LEVANTE", "CON LEVANTE (GARANTÍA ACTIVA)", "EN REVISIÓN OMC (POST-LEVANTE)",
        "PENDIENTE PAGO OMC", "GARANTÍA CERRADA / LIQUIDADA",
    ],
    "CategoriaProveedor": ["NACIONAL", "INTERNACIONAL", "ESTADO_O_TRIBUTO"],
    "ClaseAduanera": ["NINGUNA", "TRIBUTO", "PERCEPCION", "OMC"],
    "TipoGasto": ["FIJO_DESPACHO", "POST_LEVANTE", "EXTRAORDINARIO"],
    "AccionAuditoria": [
        "CREACION GASTO", "CREACION PAGO", "EDICION FECHA PAGO", "REGISTRO TIPO CAMBIO", "CORRECCION TIPO CAMBIO",
        "CAMBIO ESTADO DAM", "REVERSION AUTOMATICA DAM", "AUTORIZACION LEVANTE", "DESBLOQUEO LEVANTE",
    ],
}


def _enums_de_texto():
    return {
        nombre: obj for nombre, obj in vars(C).items()
        if isinstance(obj, type) and issubclass(obj, StrEnum) and obj is not StrEnum
    }


def test_los_valores_guardados_en_la_base_no_cambian():
    reales = {nombre: [m.value for m in enum] for nombre, enum in _enums_de_texto().items()}
    assert reales == VALORES_ESPERADOS


def test_los_roles_conservan_su_numero():
    assert issubclass(C.Rol, IntEnum)
    assert {r.name: r.value for r in C.Rol} == {"SUPERADMIN": 1, "OPERACIONES": 2, "FINANZAS": 3, "AUDITOR": 4}


def test_los_grupos_de_roles_siempre_incluyen_al_superadmin():
    grupos = {n: v for n, v in vars(C).items() if n.startswith("ROLES_")}
    assert len(grupos) == 5
    for nombre, roles in grupos.items():
        assert C.Rol.SUPERADMIN in roles, nombre
        assert len(set(roles)) == len(roles), nombre
    assert C.ROLES_SOLO_ADMIN == [1]
    assert C.ROLES_OPERACIONES == [1, 2]
    assert C.ROLES_FINANZAS == [1, 3]
    assert C.ROLES_AUDITORIA == [1, 4]
    assert C.ROLES_OPERACIONES_Y_FINANZAS == [1, 2, 3]


def test_las_constantes_se_comportan_como_texto_plano():
    # Garantiza que comparar, guardar en la base o convertir a JSON da lo mismo que el texto original
    assert C.EstadoPago.PAGADO == "PAGADO"
    assert f"{C.Moneda.USD}" == "USD" and str(C.EstadoDam.CON_LEVANTE) == "CON LEVANTE"
    assert {C.TipoGasto.FIJO_DESPACHO: 1}["FIJO_DESPACHO"] == 1
    assert C.Rol.SUPERADMIN == 1 and f"{C.Rol.FINANZAS}" == "3"


def _archivos_backend():
    patrones = ["*.py", "routers/*.py", "services/*.py", "domain/*.py", "scripts/*.py"]
    archivos = [a for p in patrones for a in glob.glob(os.path.join(REPO, p))]
    return sorted(a for a in archivos if os.path.basename(a) != "constantes.py")


def test_el_backend_no_escribe_a_mano_los_valores_fijos():
    """
    Si esta prueba falla: reemplace el texto por la constante (p. ej. "PAGADO" -> EstadoPago.PAGADO).
    Solo si el texto NO es un valor del sistema (viene de un servicio externo), agregue al final de la
    línea el comentario  # literal-permitido: <motivo>
    """
    valores = {m.value for enum in _enums_de_texto().values() for m in enum}
    infracciones = []
    for ruta in _archivos_backend():
        with open(ruta, encoding="utf-8") as f:
            codigo = f.read()
        for tok in tokenize.generate_tokens(io.StringIO(codigo).readline):
            if tok.type != tokenize.STRING or "literal-permitido" in tok.line:
                continue
            try:
                valor = ast.literal_eval(tok.string)
            except (ValueError, SyntaxError):
                continue
            if isinstance(valor, str) and valor in valores:
                infracciones.append(f"{os.path.relpath(ruta, REPO)}:{tok.start[0]}: {tok.line.strip()[:110]}")
    assert not infracciones, "Valores fijos escritos a mano (use constantes.py):\n" + "\n".join(infracciones)


def test_el_backend_no_usa_numeros_de_rol_sueltos():
    import re
    patron = re.compile(r"RoleChecker\(\s*\[\s*\d|id_rol\s*(==|!=)\s*\d|id_rol\s*=\s*\d|id_rol\s+(not\s+)?in\s*[\[(]\s*\d")
    infracciones = []
    for ruta in _archivos_backend():
        with open(ruta, encoding="utf-8") as f:
            for n, linea in enumerate(f, 1):
                if patron.search(linea) and not linea.lstrip().startswith(("#", "print(")):
                    infracciones.append(f"{os.path.relpath(ruta, REPO)}:{n}: {linea.strip()[:110]}")
    assert not infracciones, "Números de rol sueltos (use constantes.Rol / ROLES_*):\n" + "\n".join(infracciones)


# ---------- Coherencia entre el backend y el frontend ----------

def _constantes_frontend():
    """Lee frontend/src/constants/index.js y devuelve {NOMBRE: {MIEMBRO: valor}}."""
    import re
    ruta = os.path.join(REPO, "frontend", "src", "constants", "index.js")
    with open(ruta, encoding="utf-8") as f:
        codigo = f.read()
    grupos = {}
    for nombre, cuerpo in re.findall(r"export const (\w+) = Object\.freeze\(\{(.*?)\}\);", codigo, flags=re.S):
        miembros = {}
        for clave, texto, numero in re.findall(r"^\s*(\w+):\s*(?:'([^']*)'|(\d+)),", cuerpo, flags=re.M):
            miembros[clave] = int(numero) if numero else texto
        grupos[nombre] = miembros
    return grupos


def test_las_constantes_del_frontend_son_identicas_a_las_del_backend():
    """Si falla: se cambió un valor en constantes.py o en frontend/src/constants/index.js y no en el otro."""
    equivalencias = {
        "ROL": C.Rol, "ESTADO_REGISTRO": C.EstadoRegistro, "MONEDA": C.Moneda, "ESTADO_PAGO": C.EstadoPago,
        "TIPO_VALOR": C.TipoValor, "ESTADO_DOCUMENTARIO": C.EstadoDocumentario, "ESTADO_LEVANTE": C.EstadoLevante,
        "STATUS_LLEGADA": C.StatusLlegada, "CANAL_CONTROL": C.CanalControl, "ESTADO_DAM": C.EstadoDam,
        "CATEGORIA_PROVEEDOR": C.CategoriaProveedor, "TIPO_GASTO": C.TipoGasto,
        "CLASE_ADUANERA": C.ClaseAduanera,
    }
    frontend = _constantes_frontend()
    assert set(frontend) == set(equivalencias)
    for nombre, enum in equivalencias.items():
        assert frontend[nombre] == {m.name: m.value for m in enum}, nombre
