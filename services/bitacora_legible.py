"""
BITÁCORA EN LENGUAJE DE NEGOCIO (presentación)
==============================================
Convierte las filas técnicas de `audit_logs` en textos que la usuaria entiende: reemplaza IDs internos
(id_dam, voucher_id, id_concepto...) por el número de DAM, la factura, el voucher o el nombre del concepto.

El REGISTRO de los cambios vive en services/audit_trail.py; este módulo solo los PRESENTA.
"""
import json
from decimal import Decimal

from sqlalchemy.orm import Session

import models
from constantes import AccionAuditoria
from services.audit_trail import CAMPOS_IGNORADOS

# Solo para PRESENTACIÓN: si un concepto sin proveedor contiene alguna de estas palabras,
# se muestra como pagado a SUNAT. No interviene en ninguna regla de negocio.
PALABRAS_CONCEPTO_SUNAT = ("TRIBUTO", "PERCEPCI", "OMC", "MULTA", "ARANCEL")  # literal-permitido: palabras buscadas en el nombre

ETIQUETAS_CAMPOS = {
    # Claves foráneas -> nombre de negocio
    "id_dam": "DAM",
    "id_maestro": "Contenedor / Factura",
    "id_importador": "Importador",
    "id_proveedor": "Proveedor",
    "id_agente": "Agente de Aduana",
    "id_almacen": "Almacén",
    "banco_id": "Banco",
    "id_banco": "Banco",
    "id_concepto": "Concepto",
    "id_tipo_doc": "Tipo de Documento",
    "voucher_id": "Voucher Bancario",
    "id_voucher": "Voucher Bancario",
    "id_gasto": "Gasto Asociado",
    "id_pago": "Pago",
    "id_rol": "Rol",
    "id_usuario": "Usuario",
    # Contenedor (MaestroImportacion)
    "numero_factura": "N° de Factura / Orden",
    "n_cont_fisico": "N° Contenedor Físico",
    "documento_transporte": "Doc. de Transporte (BL)",
    "fecha_embarque": "Fecha de Embarque",
    "fecha_arribo": "Fecha de Arribo",
    "status_llegada": "Estado de Llegada",
    "estado_levante": "Estado de Levante",
    "estado_documentario": "Estado Documentario",
    "fecha_levante_maestro": "Fecha de Levante",
    "fecha_recepcion_almacen": "Fecha Recepción Almacén",
    "fob_usd": "FOB (USD)",
    "flete_usd": "Flete (USD)",
    "cfr_usd": "CFR (USD)",
    "venta_sucesiva": "Venta Sucesiva",
    "tipo_valor": "Tipo de Valor",
    # DAM (DetalleDam)
    "numero_de_dam": "N° de DAM",
    "serie": "Serie",
    "canal_control": "Canal de Control",
    "monto_valor_provisional_usd": "Valor Garantizado (USD)",
    "aforo_realizado": "Aforo Realizado",
    "estado_dam": "Estado de la DAM",
    "fecha_levante": "Fecha de Levante",
    # Gasto (RegistroGasto)
    "numero_documento": "N° de Documento",
    "monto_original": "Monto Original",
    "moneda": "Moneda",
    "fecha_vencimiento": "Fecha de Vencimiento",
    "estado_pago": "Estado de Pago",
    "observaciones": "Observaciones",
    # Pago (RegistroPago)
    "importe": "Importe Pagado",
    "tipo_cambio": "Tipo de Cambio",
    "tipo_cambio_aplicado": "TC Aplicado",
    "monto_moneda_origen": "Débito en Voucher",
    "pago_moneda_cruzada": "Moneda Cruzada",
    "gasto_financiero_tc": "Diferencia de Cambio",
    "es_ajuste_sistema": "Ajuste Automático (ZD)",
    "fecha_pago": "Fecha de Pago",
    # Voucher (VoucherBancario)
    "numero_operacion": "N° de Operación",
    "monto_total": "Monto Total",
    "saldo_disponible": "Saldo Disponible",
    "fecha_transferencia": "Fecha de Transferencia",
    # Tipo de Cambio
    "fecha": "Fecha",
    "precio_compra": "Precio Compra (S/)",
    "precio_venta": "Precio Venta (S/)",
    # Catálogos y Usuarios
    "nombre": "Nombre / Razón Social",
    "nombre_documento": "Nombre del Documento",
    "ruc": "RUC",
    "categoria": "Categoría",
    "descripcion": "Descripción",
    "tipo_gasto": "Etapa de Gasto",
    "clase_aduanera": "Clase Aduanera",
    "multiplicador_financiero": "Multiplicador Financiero",
    "username": "Usuario",
    "email": "Correo Electrónico",
    "hashed_password": "Contraseña",
    "is_active": "Usuario Activo",
    "estado_registro": "Estado del Registro",
    # Eventos especiales
    "contenedor": "Contenedor / Factura",
    "motivo": "Motivo",
}

# Clave primaria interna de cada tabla (se omite en la vista de datos para no mostrar números de orden internos)
PK_POR_TABLA = {
    "maestro_importaciones": "id_maestro",
    "detalle_dams": "id_dam",
    "registro_gastos": "id_gasto",
    "registro_pagos": "id_pago",
    "vouchers_bancarios": "id_voucher",
    "cat_importadores": "id_importador",
    "cat_proveedores": "id_proveedor",
    "cat_agentes": "id_agente",
    "cat_almacenes": "id_almacen",
    "cat_bancos": "id_banco",
    "cat_conceptos_pagos": "id_concepto",
    "catalogo_documentos_pago": "id_tipo_doc",
    "cat_roles": "id_rol",
    "usuarios": "id_usuario",
}

CAMPOS_MONTO_2DEC = {
    "monto_original", "importe", "monto_moneda_origen", "monto_total",
    "saldo_disponible", "fob_usd", "flete_usd", "cfr_usd",
    "gasto_financiero_tc", "monto_valor_provisional_usd",
}

ORDEN_PREFERIDO_CAMPOS = [
    "numero_factura", "n_cont_fisico", "numero_de_dam", "id_dam", "id_maestro", "contenedor",
    "id_concepto", "id_gasto", "voucher_id", "id_voucher", "numero_operacion", "banco_id", "id_banco",
    "id_importador", "id_proveedor", "id_agente", "id_almacen",
    "id_tipo_doc", "numero_documento",
    "moneda", "monto_original", "importe", "monto_moneda_origen", "monto_total", "saldo_disponible",
    "tipo_cambio", "tipo_cambio_aplicado", "pago_moneda_cruzada", "gasto_financiero_tc",
    "canal_control", "estado_dam", "aforo_realizado", "fecha_levante",
    "status_llegada", "estado_documentario", "estado_levante", "fecha_levante_maestro", "fecha_recepcion_almacen",
    "tipo_valor", "documento_transporte", "fecha_embarque", "fecha_arribo",
    "fob_usd", "flete_usd", "cfr_usd", "venta_sucesiva",
    "estado_pago", "fecha_pago", "fecha_vencimiento", "fecha_transferencia",
    "nombre", "nombre_documento", "ruc", "categoria", "tipo_gasto", "clase_aduanera", "descripcion",
    "username", "email", "id_rol", "is_active", "hashed_password",
    "fecha", "precio_compra", "precio_venta",
    "observaciones", "motivo", "es_ajuste_sistema", "estado_registro",
]


# =====================================================================
# UTILIDADES
# =====================================================================
VACIO = "∅"
VALORES_NO_INFORMADOS = (None, "", "N/A")

# Claves que, si aparecen en los datos de un evento, apuntan a otra entidad
CAMPOS_FK = {
    "id_dam", "id_maestro", "id_importador", "id_proveedor", "id_agente",
    "id_almacen", "banco_id", "id_banco", "id_concepto", "id_tipo_doc",
    "voucher_id", "id_voucher", "id_gasto", "id_pago", "id_rol", "id_usuario",
}

_ORDEN_IDX = {k: idx for idx, k in enumerate(ORDEN_PREFERIDO_CAMPOS)}


def _a_int(v):
    if v is None or isinstance(v, bool):
        return None
    try:
        return int(v)
    except (ValueError, TypeError):
        return None


def _fmt_monto(v):
    if v is None or v == "":
        return VACIO
    try:
        return f"{Decimal(str(v)):.2f}"
    except Exception:
        return str(v)


def _etiqueta(campo: str) -> str:
    return ETIQUETAS_CAMPOS.get(campo, campo.replace("_", " ").capitalize())


def _ordenar_claves(claves):
    return sorted(claves, key=lambda k: (_ORDEN_IDX.get(k, 999), k))


def _json_o_none(texto):
    try:
        return json.loads(texto) if texto else None
    except Exception:
        return None


def _si_informado(dic: dict, clave: str):
    """Valor de un respaldo legible (pagos/gastos eliminados) solo si realmente trae dato."""
    valor = dic.get(clave)
    return None if valor in VALORES_NO_INFORMADOS else valor


def _id_o_vacio(valor) -> str:
    return str(valor) if valor is not None else VACIO


# =====================================================================
# TRADUCTOR
# =====================================================================
class TraductorBitacora:
    """
    Traduce un lote de filas de audit_logs. El trabajo se hace en tres fases:

      1. Reunir todos los IDs que mencionan las filas (contenedores, DAMs, gastos, pagos, vouchers).
      2. Cargar sus datos legibles en lote: primero desde los propios snapshots de la bitácora, después
         desde las tablas vivas y las tablas sombra de eliminados (sirve aunque el registro ya no exista).
      3. Armar, fila por fila, un identificador, el resumen y la lista de cambios o de datos.
    """

    # Tabla -> conjunto de IDs donde se acumula su clave primaria
    _TABLA_A_CONJUNTO = {
        "maestro_importaciones": "maestro_ids", "detalle_dams": "dam_ids", "registro_gastos": "gasto_ids",
        "registro_pagos": "pago_ids", "vouchers_bancarios": "voucher_ids",
    }
    # Clave dentro de los datos -> conjunto de IDs
    _CLAVE_A_CONJUNTO = {
        "id_maestro": "maestro_ids", "id_dam": "dam_ids", "id_gasto": "gasto_ids", "id_pago": "pago_ids",
        "voucher_id": "voucher_ids", "id_voucher": "voucher_ids",
    }

    def __init__(self, db: Session, filas: list):
        self.db = db
        self.filas = filas
        self.detalles = [_json_o_none(f.detalles) for f in filas]
        self.maestro_ids, self.dam_ids, self.gasto_ids, self.pago_ids, self.voucher_ids = set(), set(), set(), set(), set()
        self.maestros, self.dams, self.vouchers, self.gastos, self.pagos = {}, {}, {}, {}, {}

    # ------------------------------------------------------------------ fase 1
    def _agregar_id(self, conjunto: str, valor):
        iv = _a_int(valor)
        if iv is not None:
            getattr(self, conjunto).add(iv)

    def _recolectar_ids_de(self, dic):
        if not isinstance(dic, dict):
            return
        for clave, valor in dic.items():
            conjunto = self._CLAVE_A_CONJUNTO.get(clave)
            if conjunto:
                for item in (valor if isinstance(valor, list) else [valor]):
                    self._agregar_id(conjunto, item)

    def _recolectar_ids(self):
        for d in self.detalles:
            if not isinstance(d, dict):
                continue
            conjunto = self._TABLA_A_CONJUNTO.get(d.get("tabla"))
            if conjunto:
                self._agregar_id(conjunto, d.get("id"))
            for parte in (d, d.get("valores"), d.get("valores_previos"), d.get("cambios")):
                self._recolectar_ids_de(parte)

    # ------------------------------------------------------------------ fase 2
    def _cargar_catalogos(self):
        db = self.db
        self.bancos = {b.id_banco: b.nombre for b in db.query(models.CatBanco).all()}
        self.importadores = {i.id_importador: i.nombre for i in db.query(models.CatImportador).all()}
        self.proveedores = {p.id_proveedor: p.nombre for p in db.query(models.CatProveedor).all()}
        self.agentes = {a.id_agente: a.nombre for a in db.query(models.CatAgente).all()}
        self.almacenes = {a.id_almacen: a.nombre for a in db.query(models.CatAlmacen).all()}
        self.conceptos = {c.id_concepto: c.nombre for c in db.query(models.CatConceptoPago).all()}
        self.tipos_doc = {t.id_tipo_doc: t.nombre_documento for t in db.query(models.CatalogoDocumentoPago).all()}
        self.roles = {r.id_rol: r.nombre for r in db.query(models.CatRol).all()}
        self.usuarios = {u.id_usuario: u.username for u in db.query(models.Usuario).all()}

    def _poblar_desde_snapshots(self):
        """Respaldo ante borrados: los propios eventos guardan los valores del registro."""
        catalogos_por_nombre = {
            "cat_bancos": (self.bancos, "nombre"), "cat_importadores": (self.importadores, "nombre"),
            "cat_proveedores": (self.proveedores, "nombre"), "cat_agentes": (self.agentes, "nombre"),
            "cat_almacenes": (self.almacenes, "nombre"), "cat_conceptos_pagos": (self.conceptos, "nombre"),
            "catalogo_documentos_pago": (self.tipos_doc, "nombre_documento"), "usuarios": (self.usuarios, "username"),
        }
        for d in self.detalles:
            if not isinstance(d, dict):
                continue
            tabla = d.get("tabla")
            snap = d.get("valores") or d.get("valores_previos")
            if not isinstance(snap, dict):
                continue
            id_pk = _a_int(d.get("id"))
            if not id_pk:
                continue
            if tabla in catalogos_por_nombre:
                mapa, campo = catalogos_por_nombre[tabla]
                if snap.get(campo):
                    mapa.setdefault(id_pk, snap[campo])
            elif tabla == "maestro_importaciones":
                self.maestros[id_pk] = {"factura": snap.get("numero_factura"), "contenedor": snap.get("n_cont_fisico")}
            elif tabla == "detalle_dams":
                idm = _a_int(snap.get("id_maestro"))
                if idm:
                    self.maestro_ids.add(idm)
                self.dams[id_pk] = {"numero": snap.get("numero_de_dam"), "id_maestro": idm}
            elif tabla == "vouchers_bancarios":
                self.vouchers[id_pk] = {
                    "operacion": snap.get("numero_operacion"), "banco_id": _a_int(snap.get("banco_id")),
                    "id_importador": _a_int(snap.get("id_importador")), "moneda": snap.get("moneda"),
                    "monto": snap.get("monto_total"),
                }
            elif tabla == "registro_gastos":
                idd = _a_int(snap.get("id_dam"))
                if idd:
                    self.dam_ids.add(idd)
                self.gastos[id_pk] = {
                    "id_dam": idd, "id_concepto": _a_int(snap.get("id_concepto")),
                    "id_proveedor": _a_int(snap.get("id_proveedor")), "id_tipo_doc": _a_int(snap.get("id_tipo_doc")),
                    "documento": snap.get("numero_documento"), "moneda": snap.get("moneda"),
                    "monto": snap.get("monto_original"),
                }
            elif tabla == "registro_pagos":
                idd, idg, idv = _a_int(snap.get("id_dam")), _a_int(snap.get("id_gasto")), _a_int(snap.get("voucher_id"))
                for conjunto, valor in (("dam_ids", idd), ("gasto_ids", idg), ("voucher_ids", idv)):
                    if valor:
                        getattr(self, conjunto).add(valor)
                self.pagos[id_pk] = {
                    "id_dam": idd, "id_concepto": _a_int(snap.get("id_concepto")), "id_gasto": idg, "voucher_id": idv,
                    "id_importador": _a_int(snap.get("id_importador")), "moneda": snap.get("moneda"),
                    "importe": snap.get("importe"), "es_ajuste": bool(snap.get("es_ajuste_sistema")),
                }

    def _info_pago(self, p) -> dict:
        for conjunto, valor in (("dam_ids", p.id_dam), ("gasto_ids", p.id_gasto), ("voucher_ids", p.voucher_id)):
            if valor:
                getattr(self, conjunto).add(valor)
        return {
            "id_dam": p.id_dam, "id_concepto": p.id_concepto, "id_gasto": p.id_gasto, "voucher_id": p.voucher_id,
            "id_importador": p.id_importador, "moneda": p.moneda, "importe": _fmt_monto(p.importe),
            "es_ajuste": bool(p.es_ajuste_sistema),
        }

    def _info_gasto(self, g) -> dict:
        if g.id_dam:
            self.dam_ids.add(g.id_dam)
        return {
            "id_dam": g.id_dam, "id_concepto": g.id_concepto, "id_proveedor": g.id_proveedor,
            "id_tipo_doc": g.id_tipo_doc, "documento": g.numero_documento, "moneda": g.moneda,
            "monto": _fmt_monto(g.monto_original),
        }

    def _nombres_desde_gasto_eliminado(self, g):
        if not isinstance(g.detalles_legibles, dict):
            return
        legible = g.detalles_legibles
        for id_ref, mapa, clave in ((g.id_proveedor, self.proveedores, "Proveedor"),
                                    (g.id_concepto, self.conceptos, "Concepto"),
                                    (g.id_tipo_doc, self.tipos_doc, "Tipo Documento")):
            if id_ref and _si_informado(legible, clave) is not None:
                mapa.setdefault(id_ref, legible[clave])

    def _cargar_en_cascada(self):
        """Pagos -> Gastos / Vouchers -> DAMs -> Contenedores. Primero tablas sombra; las vivas sobrescriben."""
        db = self.db
        if self.pago_ids:
            for p in db.query(models.PagoEliminado).filter(models.PagoEliminado.id_pago.in_(self.pago_ids)).all():
                if isinstance(p.detalles_legibles, dict):
                    if p.id_importador and _si_informado(p.detalles_legibles, "Importador") is not None:
                        self.importadores.setdefault(p.id_importador, p.detalles_legibles["Importador"])
                    if p.id_concepto and _si_informado(p.detalles_legibles, "Concepto") is not None:
                        self.conceptos.setdefault(p.id_concepto, p.detalles_legibles["Concepto"])
                self.pagos[p.id_pago] = self._info_pago(p)
            for p in db.query(models.RegistroPago).filter(models.RegistroPago.id_pago.in_(self.pago_ids)).all():
                self.pagos[p.id_pago] = self._info_pago(p)

        if self.gasto_ids:
            for g in db.query(models.GastoEliminado).filter(models.GastoEliminado.id_gasto.in_(self.gasto_ids)).all():
                if g.id_dam:
                    self.dam_ids.add(g.id_dam)
                self._nombres_desde_gasto_eliminado(g)
                self.gastos[g.id_gasto] = self._info_gasto(g)
            for g in db.query(models.RegistroGasto).filter(models.RegistroGasto.id_gasto.in_(self.gasto_ids)).all():
                self.gastos[g.id_gasto] = self._info_gasto(g)

        # Nombres de catálogos eliminados físicamente en el pasado, recuperados de los respaldos
        for g in db.query(models.GastoEliminado).all():
            self._nombres_desde_gasto_eliminado(g)
        for v in db.query(models.VoucherEliminado).all():
            if isinstance(v.detalles_legibles, dict):
                if v.banco_id and _si_informado(v.detalles_legibles, "Banco") is not None:
                    self.bancos.setdefault(v.banco_id, v.detalles_legibles["Banco"])
                if getattr(v, "id_importador", None) and _si_informado(v.detalles_legibles, "Importador") is not None:
                    self.importadores.setdefault(v.id_importador, v.detalles_legibles["Importador"])

        if self.voucher_ids:
            for modelo in (models.VoucherEliminado, models.VoucherBancario):
                for v in db.query(modelo).filter(modelo.id_voucher.in_(self.voucher_ids)).all():
                    self.vouchers[v.id_voucher] = {
                        "operacion": v.numero_operacion, "banco_id": v.banco_id,
                        "id_importador": getattr(v, "id_importador", None), "moneda": v.moneda,
                        "monto": _fmt_monto(v.monto_total),
                    }

        if self.dam_ids:
            for modelo in (models.DamEliminada, models.DetalleDam):
                for dm in db.query(modelo).filter(modelo.id_dam.in_(self.dam_ids)).all():
                    if dm.id_maestro:
                        self.maestro_ids.add(dm.id_maestro)
                    self.dams[dm.id_dam] = {"numero": dm.numero_de_dam, "id_maestro": dm.id_maestro}

        if self.maestro_ids:
            for modelo in (models.MaestroEliminado, models.MaestroImportacion):
                for m in db.query(modelo).filter(modelo.id_maestro.in_(self.maestro_ids)).all():
                    self.maestros[m.id_maestro] = {"factura": m.numero_factura, "contenedor": m.n_cont_fisico}

    # ------------------------------------------------------------------ formateadores de entidades
    def fmt_maestro(self, id_m):
        iv = _a_int(id_m)
        info = self.maestros.get(iv) if iv is not None else None
        if not info:
            return _id_o_vacio(id_m)
        fac, cont = info.get("factura"), info.get("contenedor")
        if fac and cont:
            return f"{fac} (Cont. {cont})"
        return fac or cont or str(id_m)

    def fmt_dam(self, id_d):
        iv = _a_int(id_d)
        info = self.dams.get(iv) if iv is not None else None
        if not info or not info.get("numero"):
            return _id_o_vacio(id_d)
        m_info = self.maestros.get(info.get("id_maestro"))
        fac = m_info.get("factura") if m_info else None
        return f"{info['numero']} (Fact. {fac})" if fac else info["numero"]

    def fmt_voucher(self, id_v):
        iv = _a_int(id_v)
        info = self.vouchers.get(iv) if iv is not None else None
        if not info or not info.get("operacion"):
            return _id_o_vacio(id_v)
        banco = self.bancos.get(info.get("banco_id"))
        return f"Op. {info['operacion']} ({banco})" if banco else f"Op. {info['operacion']}"

    def fmt_gasto(self, id_g, incluir_dam=False):
        iv = _a_int(id_g)
        info = self.gastos.get(iv) if iv is not None else None
        if not info:
            return _id_o_vacio(id_g)
        conc = self.conceptos.get(info.get("id_concepto")) or "Gasto"
        mon = info.get("moneda") or ""
        mto = _fmt_monto(info.get("monto")) if info.get("monto") is not None else ""
        partes = [f"{conc} ({mon} {mto})".strip()]
        if info.get("documento"):
            partes.append(f"Doc. {info['documento']}")
        if incluir_dam and info.get("id_dam"):
            partes.append(f"DAM {self.fmt_dam(info['id_dam'])}")
        return " · ".join(partes)

    def fmt_pago(self, id_p):
        iv = _a_int(id_p)
        info = self.pagos.get(iv) if iv is not None else None
        if not info:
            return _id_o_vacio(id_p)
        mon = info.get("moneda") or ""
        imp = _fmt_monto(info.get("importe")) if info.get("importe") is not None else ""
        partes = [f"{mon} {imp}".strip()]
        conc = self.conceptos.get(info.get("id_concepto"))
        if conc:
            partes.append(conc)
        if info.get("voucher_id"):
            partes.append(self.fmt_voucher(info["voucher_id"]))
        elif info.get("es_ajuste"):
            partes.append("Ajuste ZD")
        if info.get("id_dam"):
            partes.append(f"DAM {self.fmt_dam(info['id_dam'])}")
        return " · ".join(partes)

    def fmt_valor_campo(self, campo, valor):
        if valor is None or valor == "":
            return VACIO
        if isinstance(valor, bool):
            return "Sí" if valor else "No"
        formateadores = {
            "id_dam": self.fmt_dam, "id_maestro": self.fmt_maestro, "voucher_id": self.fmt_voucher,
            "id_voucher": self.fmt_voucher, "id_gasto": self.fmt_gasto, "id_pago": self.fmt_pago,
        }
        if campo in formateadores:
            return formateadores[campo](valor)
        catalogos = {
            "id_importador": self.importadores, "id_proveedor": self.proveedores, "id_agente": self.agentes,
            "id_almacen": self.almacenes, "banco_id": self.bancos, "id_banco": self.bancos,
            "id_concepto": self.conceptos, "id_tipo_doc": self.tipos_doc, "id_rol": self.roles,
            "id_usuario": self.usuarios,
        }
        if campo in catalogos:
            return catalogos[campo].get(_a_int(valor), str(valor))
        if campo in CAMPOS_MONTO_2DEC:
            return _fmt_monto(valor)
        return str(valor)

    # ------------------------------------------------------------------ identificador legible por tabla
    def _ident_maestro(self, id_reg, snap):
        fac, cont = snap.get("numero_factura"), snap.get("n_cont_fisico")
        if not fac and id_reg is not None:
            return f"Contenedor / Factura {self.fmt_maestro(id_reg)}"
        return f"Factura {fac}" + (f" (Cont. {cont})" if cont else "")

    def _ident_dam(self, id_reg, snap):
        num, idm = snap.get("numero_de_dam"), snap.get("id_maestro")
        if not num and id_reg is not None:
            return f"DAM {self.fmt_dam(id_reg)}"
        fac_str = self.fmt_maestro(idm) if idm else None
        return f"DAM {num}" + (f" · Fact. {fac_str}" if fac_str and fac_str != VACIO else "")

    def _ident_gasto(self, id_reg, snap):
        if not snap and id_reg is not None:
            return f"Gasto {self.fmt_gasto(id_reg, incluir_dam=True)}"
        conc = self.fmt_valor_campo("id_concepto", snap.get("id_concepto"))
        mon = snap.get("moneda") or ""
        mto = _fmt_monto(snap.get("monto_original"))
        dam_s = self.fmt_dam(snap.get("id_dam")) if snap.get("id_dam") else None
        id_prov = _a_int(snap.get("id_proveedor"))
        prov_s = self.proveedores.get(id_prov) if id_prov else None
        if not prov_s and any(p in conc.upper() for p in PALABRAS_CONCEPTO_SUNAT):
            prov_s = "SUNAT"
        partes = []
        if dam_s and dam_s != VACIO and not dam_s.isdigit():
            partes.append(f"DAM {dam_s}")
        partes.append(f"{conc} · {mon} {mto}".strip())
        if snap.get("numero_documento"):
            partes.append(f"Doc. {snap['numero_documento']}")
        if prov_s:
            partes.append(prov_s)
        return " · ".join(partes)

    def _ident_pago(self, id_reg, snap):
        if not snap and id_reg is not None:
            return f"Pago {self.fmt_pago(id_reg)}"
        # Completar DAM y concepto desde el gasto si no venían en los datos del evento
        g_info = self.gastos.get(_a_int(snap.get("id_gasto"))) if _a_int(snap.get("id_gasto")) else None
        id_dam = snap.get("id_dam") or (g_info.get("id_dam") if g_info else None)
        id_conc = snap.get("id_concepto") or (g_info.get("id_concepto") if g_info else None)
        idv = _a_int(snap.get("voucher_id"))
        partes = []
        if id_dam:
            partes.append(f"DAM {self.fmt_dam(id_dam)}")
        if id_conc:
            partes.append(self.fmt_valor_campo("id_concepto", id_conc))
        partes.append(f"Pago {snap.get('moneda') or ''} {_fmt_monto(snap.get('importe'))}".strip())
        if idv:
            partes.append(self.fmt_voucher(idv))
        elif snap.get("es_ajuste_sistema"):
            partes.append("Ajuste ZD")
        return " · ".join(partes)

    def _ident_voucher(self, id_reg, snap):
        op = snap.get("numero_operacion")
        if not op and id_reg is not None:
            return f"Voucher {self.fmt_voucher(id_reg)}"
        bco = self.fmt_valor_campo("banco_id", snap.get("banco_id")) if snap.get("banco_id") else None
        imp_nom = self.fmt_valor_campo("id_importador", snap.get("id_importador")) if snap.get("id_importador") else None
        mon = snap.get("moneda") or ""
        mto = _fmt_monto(snap.get("monto_total")) if snap.get("monto_total") is not None else ""
        partes = [f"Voucher Op. {op}" + (f" ({bco})" if bco and bco != VACIO else "")]
        if mon and mto and mto != VACIO:
            partes.append(f"{mon} {mto}")
        if imp_nom and imp_nom != VACIO:
            partes.append(imp_nom)
        return " · ".join(partes)

    def _ident_catalogo(self, etiqueta, mapa, id_reg, snap, con_ruc=True):
        nombre = snap.get("nombre") or mapa.get(_a_int(id_reg)) or str(id_reg)
        ruc = snap.get("ruc") if con_ruc else None
        return f"{etiqueta}: {nombre}" + (f" (RUC {ruc})" if ruc else "")

    def identificador(self, tabla, id_reg, snap):
        snap = snap if isinstance(snap, dict) else {}
        por_tabla = {
            "maestro_importaciones": self._ident_maestro,
            "detalle_dams": self._ident_dam,
            "registro_gastos": self._ident_gasto,
            "registro_pagos": self._ident_pago,
            "vouchers_bancarios": self._ident_voucher,
        }
        if tabla in por_tabla:
            return por_tabla[tabla](id_reg, snap)
        if tabla == "historial_tipo_cambio":
            return f"Tipo de Cambio del {snap.get('fecha') or id_reg}"
        catalogos = {
            "cat_importadores": ("Importador", self.importadores), "cat_proveedores": ("Proveedor", self.proveedores),
            "cat_agentes": ("Agente", self.agentes), "cat_almacenes": ("Almacén", self.almacenes),
            "cat_bancos": ("Banco", self.bancos), "cat_conceptos_pagos": ("Concepto", self.conceptos),
        }
        if tabla in catalogos:
            etiqueta, mapa = catalogos[tabla]
            return self._ident_catalogo(etiqueta, mapa, id_reg, snap)
        if tabla == "catalogo_documentos_pago":
            nombre = snap.get("nombre_documento") or self.tipos_doc.get(_a_int(id_reg)) or str(id_reg)
            return f"Tipo de Documento: {nombre}"
        if tabla == "cat_roles":
            return self._ident_catalogo("Rol", self.roles, id_reg, snap, con_ruc=False)
        if tabla == "usuarios":
            usuario = snap.get("username") or self.usuarios.get(_a_int(id_reg)) or str(id_reg)
            return f"Usuario: {usuario}" + (f" ({snap['email']})" if snap.get("email") else "")
        return f"{tabla} {id_reg}"

    # ------------------------------------------------------------------ lista de datos legibles
    def datos_legibles(self, tabla, dic):
        if not isinstance(dic, dict):
            return []
        datos = dict(dic)
        # Pago cuyo evento tenía DAM, concepto o importador vacíos: se completan desde su gasto / voucher
        if tabla == "registro_pagos":
            idg, idv = _a_int(datos.get("id_gasto")), _a_int(datos.get("voucher_id"))
            g_info = self.gastos.get(idg) if idg else None
            v_info = self.vouchers.get(idv) if idv else None
            if not datos.get("id_dam") and g_info and g_info.get("id_dam"):
                datos["id_dam"] = g_info["id_dam"]
            if not datos.get("id_concepto") and g_info and g_info.get("id_concepto"):
                datos["id_concepto"] = g_info["id_concepto"]
            if not datos.get("id_importador") and v_info and v_info.get("id_importador"):
                datos["id_importador"] = v_info["id_importador"]

        conc_str = self.fmt_valor_campo("id_concepto", datos.get("id_concepto")).upper() if datos.get("id_concepto") else ""
        es_concepto_sunat = any(p in conc_str for p in PALABRAS_CONCEPTO_SUNAT)
        pk_propia = PK_POR_TABLA.get(tabla)

        items = []
        for k in _ordenar_claves(list(datos.keys())):
            if k == pk_propia or k in CAMPOS_IGNORADOS:
                continue
            val = datos[k]
            if val is None or val == "":
                continue
            if k == "tipo_cambio_aplicado" and datos.get("tipo_cambio") is not None and str(val) == str(datos.get("tipo_cambio")):
                continue
            val_fmt = self.fmt_valor_campo(k, val)
            # Referencia que no se pudo traducir a un nombre: no se muestra un número interno
            if k in CAMPOS_FK and val_fmt == str(val) and str(val).isdigit():
                if k == "id_proveedor" and es_concepto_sunat:
                    val_fmt = "SUNAT"
                elif k == "id_tipo_doc" and es_concepto_sunat:
                    val_fmt = "LIQUIDACIÓN DE COBRANZA / SUNAT"
                else:
                    continue
            items.append({"campo": _etiqueta(k), "valor": val_fmt})
        return items

    # ------------------------------------------------------------------ fase 3: un tipo de evento por método
    # Cada método recibe (fila, detalles) y devuelve (identificador, resumen, cambios, datos).
    def _evento_de_tabla(self, f, d):
        tabla, id_reg = d["tabla"], d.get("id")
        snap = d.get("valores") or d.get("valores_previos") or {}
        ident = self.identificador(tabla, id_reg, snap)
        if not isinstance(d.get("cambios"), dict):
            return ident, ident, [], self.datos_legibles(tabla, snap)
        cambios, partes = [], []
        for k in _ordenar_claves(list(d["cambios"].keys())):
            par = d["cambios"][k]
            antes, despues = (par[0], par[1]) if isinstance(par, list) and len(par) == 2 else (None, par)
            etq = _etiqueta(k)
            v_ant, v_des = self.fmt_valor_campo(k, antes), self.fmt_valor_campo(k, despues)
            cambios.append({"campo": etq, "antes": v_ant, "despues": v_des})
            partes.append(f"{etq}: {v_ant} → {v_des}")
        resumen = f"{ident} · " + " | ".join(partes) if partes else ident
        return ident, resumen, cambios, []

    def _evento_cambio_estado_dam(self, f, d):
        ident = f"DAM {self.fmt_dam(d.get('id_dam'))}"
        cambios, partes = [], []
        if d.get("estado_anterior") != d.get("estado_nuevo"):
            cambios.append({"campo": "Estado de la DAM", "antes": str(d.get("estado_anterior") or VACIO),
                            "despues": str(d.get("estado_nuevo") or VACIO)})
            partes.append(f"Estado: {d.get('estado_anterior')} → {d.get('estado_nuevo')}")
        if d.get("aforo_anterior") != d.get("aforo_nuevo"):
            ant, nue = ("Sí" if d.get("aforo_anterior") else "No"), ("Sí" if d.get("aforo_nuevo") else "No")
            cambios.append({"campo": "Aforo Realizado", "antes": ant, "despues": nue})
            partes.append(f"Aforo: {ant} → {nue}")
        resumen = f"{ident} · " + " | ".join(partes) if partes else ident
        return ident, resumen, cambios, []

    def _evento_reversion_dam(self, f, d):
        num_dam = d.get("numero_de_dam") or self.fmt_dam(d.get("id_dam"))
        cont = d.get("contenedor")
        ident = f"DAM {num_dam}" + (f" (Fact. {cont})" if cont else "")
        cambios = [{"campo": "Estado de la DAM", "antes": str(d.get("estado_anterior") or VACIO),
                    "despues": str(d.get("estado_nuevo") or VACIO)}]
        datos = [{"campo": "Motivo de Reversión", "valor": str(d["motivo"])}] if d.get("motivo") else []
        resumen = f"{ident} · {d.get('estado_anterior')} → {d.get('estado_nuevo')}" + (f" · {d.get('motivo')}" if d.get("motivo") else "")
        return ident, resumen, cambios, datos

    def _evento_edicion_fecha_pago(self, f, d):
        ident = f"Pago {self.fmt_pago(d.get('id_pago'))}"
        cambios = [{"campo": "Fecha de Pago", "antes": str(d.get("fecha_anterior") or VACIO),
                    "despues": str(d.get("fecha_nueva") or VACIO)}]
        return ident, f"{ident} · Fecha de Pago: {d.get('fecha_anterior')} → {d.get('fecha_nueva')}", cambios, []

    def _evento_tipo_cambio(self, f, d):
        fecha_tc = d.get("fecha") or ""
        ident = f"Tipo de Cambio del {fecha_tc}"
        ant, nue = d.get("anterior"), d.get("nuevo") or {}
        if isinstance(ant, dict):
            cambios = [
                {"campo": "Precio Compra (S/)", "antes": str(ant.get("compra", VACIO)), "despues": str(nue.get("compra", VACIO))},
                {"campo": "Precio Venta (S/)", "antes": str(ant.get("venta", VACIO)), "despues": str(nue.get("venta", VACIO))},
            ]
            resumen = f"{ident} · Compra: {ant.get('compra')} → {nue.get('compra')} | Venta: {ant.get('venta')} → {nue.get('venta')}"
            return ident, resumen, cambios, []
        datos = [
            {"campo": "Fecha", "valor": str(fecha_tc)},
            {"campo": "Precio Compra (S/)", "valor": str(nue.get("compra", VACIO))},
            {"campo": "Precio Venta (S/)", "valor": str(nue.get("venta", VACIO))},
        ]
        return ident, f"{ident} · Compra: {nue.get('compra')} / Venta: {nue.get('venta')}", [], datos

    def _evento_como_tabla(self, tabla):
        """Eventos manuales antiguos (CREACION GASTO / CREACION PAGO) que guardan los datos del registro."""
        def traducir(f, d):
            ident = self.identificador(tabla, None, d)
            return ident, ident, [], self.datos_legibles(tabla, d)
        return traducir

    def _evento_generico(self, f, d):
        datos = self.datos_legibles("", d)
        resumen = " · ".join(f"{x['campo']}: {x['valor']}" for x in datos[:4]) or (f.detalles or "")
        return f.accion, resumen, [], datos

    def _traductor_de_evento(self, f, d):
        """Elige cómo traducir el evento: por su acción o, en eventos antiguos, por la forma de sus datos."""
        accion = f.accion
        if d.get("tabla"):
            return self._evento_de_tabla
        if accion == AccionAuditoria.CAMBIO_ESTADO_DAM or ("estado_anterior" in d and "id_dam" in d and "motivo" not in d):
            return self._evento_cambio_estado_dam
        if accion == AccionAuditoria.REVERSION_AUTOMATICA_DAM or ("motivo" in d and "estado_anterior" in d):
            return self._evento_reversion_dam
        if accion == AccionAuditoria.EDICION_FECHA_PAGO or ("id_pago" in d and "fecha_nueva" in d):
            return self._evento_edicion_fecha_pago
        if "TIPO CAMBIO" in (accion or "") or ("nuevo" in d and "fecha" in d):
            return self._evento_tipo_cambio
        if accion == AccionAuditoria.CREACION_GASTO or ("id_concepto" in d and "monto_original" in d):
            return self._evento_como_tabla("registro_gastos")
        if accion == AccionAuditoria.CREACION_PAGO or ("id_gasto" in d and "importe" in d):
            return self._evento_como_tabla("registro_pagos")
        return self._evento_generico

    def _traducir_fila(self, f, d) -> dict:
        identificador, resumen, cambios, datos = f.accion, f.detalles or "", [], []
        if isinstance(d, dict):
            identificador, resumen, cambios, datos = self._traductor_de_evento(f, d)(f, d)
        return {
            "id_log": f.id_log,
            "id_usuario": f.id_usuario,
            "nombre_usuario": f.usuario.username if f.usuario else None,
            "endpoint": f.endpoint,
            "accion": f.accion,
            "ip_address": f.ip_address,
            "detalles": f.detalles,
            "created_at": f.created_at,
            "resumen_legible": resumen,
            "detalles_legibles": {"identificador": identificador, "cambios": cambios, "datos": datos},
        }

    # ------------------------------------------------------------------ punto de entrada
    def traducir(self) -> list[dict]:
        self._recolectar_ids()
        self._cargar_catalogos()
        self._poblar_desde_snapshots()
        self._cargar_en_cascada()
        return [self._traducir_fila(f, d) for f, d in zip(self.filas, self.detalles)]


def enriquecer_bitacora(db: Session, filas: list) -> list[dict]:
    """
    Traduce cada fila de `audit_logs` a valores legibles de negocio:
    reemplaza `id_dam`, `id_maestro`, `id_concepto`, `id_proveedor`, `voucher_id`, etc.
    por el número real de DAM, Factura/Contenedor, nombre de Concepto, Proveedor, N° de Voucher, etc.
    """
    if not filas:
        return []
    return TraductorBitacora(db, filas).traducir()
