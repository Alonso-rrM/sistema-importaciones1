"""
SERVICIO DE PAGOS: registrar y anular pagos de gastos.

Antes toda esta lógica vivía dentro de las rutas HTTP (registrar_pago tenía 232 líneas y eliminar_pago 151).
Ahora cada paso es una función con nombre propio, y las rutas de routers/finanzas.py solo traducen la
petición y la respuesta.

El orden de los pasos es deliberado y se conserva tal cual: determina qué error ve la usuaria cuando
hay más de un problema a la vez (por ejemplo, voucher de otro importador Y saldo insuficiente).

Las reglas incumplidas se informan con ErrorDeNegocio (main.py la convierte en la respuesta HTTP).
"""
import json
import os
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional

from fastapi.encoders import jsonable_encoder
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

import models
import schemas
from constantes import AccionAuditoria, ClaseAduanera, EstadoDocumentario, EstadoPago, EstadoRegistro, Moneda, Rol
from domain.finanzas import calcular_amortizacion_cruzada, total_amortizado
from services.audit import registrar_auditoria_sync
from services.errores import ErrorDeNegocio, error_interno_de_negocio
from services.state_machine import ESTADOS_POST_PROFORMA, evaluar_gatillos_gastos_dam, resultado_automatico_proforma

# ==========================================
# REGLAS FINANCIERAS DEL SERVIDOR
# ==========================================
CENTAVO = Decimal("0.01")
# Diferencia máxima por redondeo cambiario: hasta aquí un saldo se considera saldado (cierre automático "ZD")
TOLERANCIA_CENTAVOS = Decimal("0.05")
# Spread máximo que un banco puede cobrar sobre el débito teórico en pagos con moneda cruzada
MARGEN_SPREAD_BANCARIO = Decimal(os.getenv("MARGEN_SPREAD_BANCARIO", "0.05"))
# Banda del TC respecto al oficial SUNAT registrado para la fecha
MARGEN_TC_OFICIAL = Decimal(os.getenv("MARGEN_TC_OFICIAL", "0.05"))
# Banda de cordura USD/PEN cuando no hay TC oficial registrado para la fecha
TC_MINIMO = Decimal(os.getenv("TC_MINIMO", "2.50"))
TC_MAXIMO = Decimal(os.getenv("TC_MAXIMO", "5.50"))
# Tiempo máximo que un pago espera en cola a que otro pago libere el mismo gasto/voucher
LOCK_TIMEOUT_PAGOS = os.getenv("LOCK_TIMEOUT_PAGOS", "5s")


def _redondear(valor: Decimal) -> Decimal:
    return valor.quantize(CENTAVO, rounding=ROUND_HALF_UP)


# ==========================================
# UTILIDADES COMPARTIDAS (también las usan otras rutas de finanzas)
# ==========================================
def convertir_moneda(monto: Decimal, de: str, a: str, tc: Decimal) -> Decimal:
    """Convierte un monto entre USD y PEN con redondeo SUNAT (ROUND_HALF_UP)."""
    if de == a:
        resultado = monto
    elif de == Moneda.USD and a == Moneda.PEN:
        resultado = monto * tc
    elif de == Moneda.PEN and a == Moneda.USD:
        resultado = monto / tc
    else:
        raise ErrorDeNegocio(400, f"Conversión de moneda no soportada: {de} → {a}.")
    return _redondear(resultado)


def aplicar_lock_timeout(db: Session):
    """Limita la espera de bloqueos de fila en la transacción actual (solo PostgreSQL)."""
    if db.get_bind().dialect.name == "postgresql":
        # SET LOCAL solo afecta a la transacción en curso; el valor se valida para evitar inyección
        valor = LOCK_TIMEOUT_PAGOS.strip()
        if not valor.rstrip("ms").isdigit():
            valor = "5s"
        db.execute(text(f"SET LOCAL lock_timeout = '{valor}'"))


def expediente_cerrado(gasto_o_dam) -> bool:
    """True si el contenedor asociado está en ATENCIÓN TOTAL."""
    dam_obj = getattr(gasto_o_dam, "dam", None) or gasto_o_dam
    maestro = getattr(dam_obj, "maestro", None)
    return bool(maestro and maestro.estado_documentario == EstadoDocumentario.ATENCION_TOTAL)


def validar_tipo_cambio(db: Session, tc: Decimal, fecha: date):
    """Rechaza tipos de cambio fuera de la banda del TC oficial (o de la banda de cordura si no hay oficial)."""
    oficial = db.query(models.HistorialTipoCambio).filter(models.HistorialTipoCambio.fecha == fecha).first()
    if oficial and oficial.precio_venta:
        ref = Decimal(str(oficial.precio_venta))
        minimo = (ref * (Decimal("1") - MARGEN_TC_OFICIAL)).quantize(Decimal("0.0001"))
        maximo = (ref * (Decimal("1") + MARGEN_TC_OFICIAL)).quantize(Decimal("0.0001"))
        origen = f"TC oficial SUNAT {ref} del {fecha}"
    else:
        minimo, maximo = TC_MINIMO, TC_MAXIMO
        origen = "banda de control USD/PEN"
    if not (minimo <= tc <= maximo):
        raise ErrorDeNegocio(400, f"Tipo de cambio {tc} fuera de rango. Según {origen}, debe estar entre {minimo} y {maximo}.")


# ==========================================
# REGISTRAR UN PAGO
# ==========================================
@dataclass
class ContextoPeticion:
    """Datos de la petición HTTP que el servicio necesita (sin depender de FastAPI)."""
    usuario: models.Usuario
    endpoint: str
    ip: str
    clave_idempotencia_cliente: Optional[str] = None


def _clave_idempotencia(ctx: ContextoPeticion) -> Optional[str]:
    """La clave se aísla por usuario: un tercero no puede "secuestrar" ni anular el pago de otro reutilizándola."""
    clave = ctx.clave_idempotencia_cliente
    if not clave:
        return None
    if len(clave) > 80:
        raise ErrorDeNegocio(400, "Idempotency-Key demasiado larga (máx. 80 caracteres).")
    return f"u{ctx.usuario.id_usuario}:{clave}"


def _respuesta_guardada(db: Session, clave: str) -> Optional[dict]:
    previo = db.query(models.RegistroIdempotencia).filter(models.RegistroIdempotencia.clave_idempotencia == clave).first()
    return json.loads(previo.respuesta_json) if previo else None


def _bloquear_gasto(db: Session, id_gasto: int) -> models.RegistroGasto:
    """
    Bloquea la fila del gasto hasta el fin de la transacción.
    En vez de rechazar al instante un pago simultáneo, ESPERA en cola hasta LOCK_TIMEOUT_PAGOS.
    El bloqueo garantiza que no haya doble pago ni saldo negativo.
    """
    aplicar_lock_timeout(db)
    try:
        gasto = (db.query(models.RegistroGasto).filter(models.RegistroGasto.id_gasto == id_gasto)
                 .with_for_update().populate_existing().first())
    except OperationalError:
        db.rollback()
        raise ErrorDeNegocio(409, "El gasto está siendo liquidado por otro usuario y no se liberó a tiempo. Intente nuevamente.") from None
    if not gasto or gasto.estado_registro != EstadoRegistro.ACTIVO:
        raise ErrorDeNegocio(404, "El gasto asociado no existe.")
    if gasto.estado_pago == EstadoPago.PAGADO:
        raise ErrorDeNegocio(400, "Operación rechazada: El gasto ya se encuentra totalmente PAGADO.")
    return gasto


def _importador_del_gasto(gasto: models.RegistroGasto) -> int:
    id_importador = gasto.dam.maestro.id_importador if (gasto.dam and gasto.dam.maestro) else None
    if id_importador is None:
        raise ErrorDeNegocio(400, "El gasto no está vinculado a un contenedor con importador; no puede liquidarse.")
    return id_importador


def _bloquear_voucher(db: Session, id_voucher: int, id_importador: int) -> models.VoucherBancario:
    """No existe pago sin respaldo bancario: el voucher es obligatorio y debe ser del mismo importador."""
    try:
        voucher = (db.query(models.VoucherBancario).filter(models.VoucherBancario.id_voucher == id_voucher)
                   .with_for_update().populate_existing().first())
    except OperationalError:
        db.rollback()
        raise ErrorDeNegocio(409, "El voucher está siendo usado por otro pago y no se liberó a tiempo. Intente nuevamente.") from None
    if not voucher or voucher.estado_registro != EstadoRegistro.ACTIVO:
        raise ErrorDeNegocio(404, "El voucher especificado no existe.")
    if voucher.id_importador != id_importador:
        raise ErrorDeNegocio(400, "Violación de integridad transaccional: El voucher no pertenece a la entidad importadora del gasto.")
    return voucher


def _tipo_cambio_aplicado(db: Session, pago: schemas.RegistroPagoCreate, gasto, voucher, fecha_pago: date) -> Decimal:
    """Si todo el flujo es en una sola moneda el TC no interviene; si no, se valida (no se confía en el cliente)."""
    if len({pago.moneda, gasto.moneda, voucher.moneda}) == 1:
        return Decimal("1.0000")
    tc = Decimal(str(pago.tipo_cambio)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    validar_tipo_cambio(db, tc, fecha_pago)
    return tc


def _debito_del_voucher(pago: schemas.RegistroPagoCreate, voucher, tc: Decimal) -> tuple[Decimal, Decimal]:
    """
    Cuánto se descuenta del voucher, en SU moneda. Lo calcula el servidor.
    En moneda cruzada el banco puede cobrar algo más por su spread, dentro de un margen; ese exceso
    se registra como gasto financiero. Devuelve (débito, gasto_financiero_tc).
    """
    teorico = convertir_moneda(Decimal(str(pago.importe)), pago.moneda, voucher.moneda, tc)
    if not pago.pago_moneda_cruzada:
        return teorico, Decimal("0.00")
    if pago.monto_moneda_origen is None:
        raise ErrorDeNegocio(400, "En pago con moneda cruzada debe indicar el débito real del banco (monto_moneda_origen).")
    real = _redondear(Decimal(str(pago.monto_moneda_origen)))
    minimo = teorico - TOLERANCIA_CENTAVOS
    maximo = _redondear(teorico * (Decimal("1") + MARGEN_SPREAD_BANCARIO))
    if not (minimo <= real <= maximo):
        raise ErrorDeNegocio(400, (
            f"Débito bancario inconsistente: para {pago.moneda} {pago.importe} al TC {tc} el débito en el voucher "
            f"debe estar entre {voucher.moneda} {minimo} y {maximo}."
        ))
    return real, max(Decimal("0.00"), real - teorico)


def _descontar_del_voucher(voucher, monto: Decimal):
    if voucher.saldo_disponible < monto:
        raise ErrorDeNegocio(400, (
            f"Saldo insuficiente en el voucher. Disponible: {voucher.moneda} {voucher.saldo_disponible}, "
            f"requerido: {voucher.moneda} {monto}."
        ))
    voucher.saldo_disponible -= monto


def saldo_pendiente_gasto(db: Session, gasto) -> Decimal:
    """Saldo del gasto en SU moneda: monto original menos lo amortizado por sus pagos activos (regla única)."""
    pagos = db.query(models.RegistroPago).filter(
        models.RegistroPago.id_gasto == gasto.id_gasto,
        models.RegistroPago.estado_registro == EstadoRegistro.ACTIVO,
    ).all()
    return _redondear(_redondear(Decimal(str(gasto.monto_original))) - total_amortizado(pagos, gasto.moneda))


def _ajuste_por_centavos(gasto, id_importador: int, saldo: Decimal) -> models.RegistroPago:
    """Pago ficticio del sistema ("ZD") que salda los centavos que quedan por diferencias cambiarias."""
    return models.RegistroPago(
        id_dam=gasto.id_dam, id_concepto=gasto.id_concepto, moneda=gasto.moneda, importe=saldo,
        tipo_cambio=Decimal("1.00"), tipo_cambio_aplicado=Decimal("1.00"), estado_pago=EstadoPago.PAGADO,
        fecha_pago=date.today(), id_importador=id_importador, id_gasto=gasto.id_gasto, es_ajuste_sistema=True,
        voucher_id=None, pago_moneda_cruzada=False, gasto_financiero_tc=Decimal("0.00"), monto_moneda_origen=saldo,
    )


def registrar_pago(db: Session, pago: schemas.RegistroPagoCreate, ctx: ContextoPeticion):
    """
    Registra un pago contra un gasto, descontándolo de un voucher.
    Devuelve el pago creado, o la respuesta guardada si la misma clave de idempotencia ya se procesó.
    """
    # 0. Idempotencia: la misma solicitud repetida no debe cobrar dos veces
    clave = _clave_idempotencia(ctx)
    if clave:
        previa = _respuesta_guardada(db, clave)
        if previa:
            return previa

    # 1-2. Bloqueo y validación del gasto y del voucher
    gasto = _bloquear_gasto(db, pago.id_gasto)
    id_importador = _importador_del_gasto(gasto)
    voucher = _bloquear_voucher(db, pago.voucher_id, id_importador)

    # 3. Tipo de cambio
    fecha_pago = pago.fecha_pago or date.today()
    tc = _tipo_cambio_aplicado(db, pago, gasto, voucher, fecha_pago)

    # 4. Débito del voucher (en memoria: solo se guarda si todo lo demás es válido)
    debito, gasto_financiero_tc = _debito_del_voucher(pago, voucher, tc)
    _descontar_del_voucher(voucher, debito)

    if not db.query(models.CatConceptoPago).filter(models.CatConceptoPago.id_concepto == gasto.id_concepto).first():
        raise ErrorDeNegocio(404, "El concepto de pago no existe en el catálogo.")

    # 5. Sobrepago: lo amortizado no puede superar el saldo (más la tolerancia de centavos)
    saldo = saldo_pendiente_gasto(db, gasto)
    amortizado = calcular_amortizacion_cruzada(Decimal(str(pago.importe)), tc, gasto.moneda, pago.moneda)
    if amortizado > saldo + TOLERANCIA_CENTAVOS:
        raise ErrorDeNegocio(400, (
            "Sobrepago detectado. El importe ingresado supera el saldo pendiente. "
            f"Saldo restante: {gasto.moneda} {_redondear(saldo)}"
        ))

    # 6. Guardado atómico: pago, estado del gasto, ajuste de centavos, bitácora e idempotencia
    try:
        nuevo_pago = models.RegistroPago(
            id_gasto=gasto.id_gasto, id_dam=gasto.id_dam, id_concepto=gasto.id_concepto, id_importador=id_importador,
            voucher_id=voucher.id_voucher, moneda=pago.moneda, importe=Decimal(str(pago.importe)),
            tipo_cambio=tc,
            tipo_cambio_aplicado=tc,  # Numeric(15,4): conserva los 4 decimales para los recálculos
            estado_pago=EstadoPago.PAGADO, fecha_pago=fecha_pago, es_ajuste_sistema=False,
            pago_moneda_cruzada=pago.pago_moneda_cruzada, gasto_financiero_tc=gasto_financiero_tc,
            monto_moneda_origen=debito,
        )
        db.add(nuevo_pago)

        saldo_nuevo = _redondear(saldo - amortizado)
        if saldo_nuevo <= Decimal("0.00"):
            gasto.estado_pago = EstadoPago.PAGADO
        elif saldo_nuevo <= TOLERANCIA_CENTAVOS:
            db.add(_ajuste_por_centavos(gasto, id_importador, saldo_nuevo))
            gasto.estado_pago = EstadoPago.PAGADO
        else:
            gasto.estado_pago = EstadoPago.PARCIAL

        db.flush()  # asigna los IDs sin cerrar la transacción
        registrar_auditoria_sync(
            db=db, id_usuario=ctx.usuario.id_usuario, endpoint=ctx.endpoint,
            accion=AccionAuditoria.CREACION_PAGO, detalles=pago.model_dump_json(), ip_address=ctx.ip,
        )

        if clave:
            try:
                db.add(models.RegistroIdempotencia(
                    clave_idempotencia=clave, endpoint=ctx.endpoint,
                    respuesta_json=json.dumps(jsonable_encoder(schemas.RegistroPago.model_validate(nuevo_pago))),
                ))
                db.commit()
            except IntegrityError:
                db.rollback()
                # Otra solicitud paralela con la misma clave ganó la carrera: se devuelve su resultado
                previa = _respuesta_guardada(db, clave)
                if previa:
                    return previa
                raise ErrorDeNegocio(409, "Conflicto de idempotencia procesando la transacción paralela.") from None
        else:
            db.commit()

        db.refresh(nuevo_pago)
        # El pago puede liberar el levante de la DAM (proforma u OMC pagada)
        if nuevo_pago.id_dam:
            evaluar_gatillos_gastos_dam(db, nuevo_pago.id_dam)
        return nuevo_pago

    except ErrorDeNegocio:
        raise
    except Exception as e:
        db.rollback()
        raise error_interno_de_negocio("Error en transacción", e, 400) from e


# ==========================================
# ANULAR UN PAGO
# ==========================================
def _validar_permiso_anulacion(pago, usuario):
    if pago.dam and expediente_cerrado(pago.dam) and usuario.id_rol != Rol.SUPERADMIN:
        raise ErrorDeNegocio(403, "Operación Denegada: El expediente se encuentra en ATENCIÓN TOTAL. Solicite desbloqueo al Administrador.")

    # Anular un pago de PROFORMA revierte la DAM a PENDIENTE PAGO PROFORMA. Si la DAM ya avanzó por
    # diligencias MANUALES (aforo, observación, revisión, OMC), esa reversión borraría ese avance:
    # solo el Administrador puede autorizarla (queda en bitácora).
    dam = pago.dam
    clase = pago.concepto_rel.clase_aduanera if pago.concepto_rel else None
    es_pago_proforma = clase in (ClaseAduanera.TRIBUTO, ClaseAduanera.PERCEPCION)
    if (
        es_pago_proforma and dam and usuario.id_rol != Rol.SUPERADMIN
        and dam.estado_dam in ESTADOS_POST_PROFORMA
        and dam.estado_dam not in resultado_automatico_proforma(dam)
    ):
        raise ErrorDeNegocio(403, (
            f"La DAM {dam.numero_de_dam} ya avanzó por diligencias aduaneras (estado: {dam.estado_dam}). "
            "Anular este pago de proforma la haría retroceder a PENDIENTE PAGO PROFORMA y perder ese avance. "
            "Solicite la anulación al Administrador."
        ))


def _respaldar_y_borrar(db: Session, pago, motivo: str, usuario, identificador: str):
    """Devuelve el dinero al voucher, guarda una copia legible en pagos_eliminados y borra el pago."""
    if pago.voucher_rel:
        pago.voucher_rel.saldo_disponible += pago.monto_moneda_origen
    columnas_respaldo = {c.name for c in models.PagoEliminado.__table__.columns}
    datos = {c.name: getattr(pago, c.name) for c in pago.__table__.columns if c.name in columnas_respaldo}
    legible = {
        "Voucher": pago.voucher_rel.numero_operacion if pago.voucher_rel else "N/A",
        "Banco": pago.voucher_rel.banco_rel.nombre if (pago.voucher_rel and pago.voucher_rel.banco_rel) else "N/A",
        "Importador": pago.importador.nombre if pago.importador else "N/A",
        "Concepto": pago.concepto_rel.nombre if pago.concepto_rel else "N/A",
        "DAM": pago.dam.numero_de_dam if pago.dam else "N/A",
        "Ref. Gasto": f"{pago.gasto_rel.monto_original} {pago.gasto_rel.moneda}" if pago.gasto_rel else "N/A",
    }
    db.add(models.PagoEliminado(
        **datos, motivo_eliminacion=motivo, usuario_id=usuario.id_usuario, nombre_usuario_ejecutor=usuario.username,
        identificador_principal=identificador, detalles_legibles=legible,
    ))
    db.delete(pago)
    db.flush()


def _recalcular_estado_tras_anulacion(db: Session, gasto):
    """Recalcula el estado de pago del gasto con los pagos que quedan (misma regla que al registrar)."""
    monto = _redondear(Decimal(str(gasto.monto_original)))
    saldo = saldo_pendiente_gasto(db, gasto)
    if saldo >= monto:
        gasto.estado_pago = EstadoPago.PENDIENTE
    elif saldo > TOLERANCIA_CENTAVOS:
        gasto.estado_pago = EstadoPago.PARCIAL
    else:
        gasto.estado_pago = EstadoPago.PAGADO


def anular_pago(db: Session, id_pago: int, motivo: str, usuario) -> dict:
    """
    Anula un pago: devuelve el dinero al voucher, guarda el respaldo, revierte el ajuste de centavos que
    dependía de él, recalcula el estado del gasto y deshace el levante si el pago lo había concedido.
    """
    pago = db.query(models.RegistroPago).filter(models.RegistroPago.id_pago == id_pago).first()
    if not pago:
        raise ErrorDeNegocio(404, "Pago no encontrado")
    _validar_permiso_anulacion(pago, usuario)

    id_gasto = pago.id_gasto
    era_ajuste = pago.es_ajuste_sistema
    gasto = None
    try:
        _respaldar_y_borrar(db, pago, motivo, usuario, f"Pago {pago.id_pago}")

        if id_gasto:
            gasto = db.query(models.RegistroGasto).filter(models.RegistroGasto.id_gasto == id_gasto).first()
            if gasto:
                # El ajuste de centavos solo existía para cerrar el gasto con este pago: también se revierte
                if not era_ajuste:
                    ajuste = db.query(models.RegistroPago).filter(
                        models.RegistroPago.id_gasto == id_gasto,
                        models.RegistroPago.es_ajuste_sistema.is_(True),
                    ).first()
                    if ajuste:
                        _respaldar_y_borrar(
                            db, ajuste, f"Reversión contable automática por eliminación del pago padre ID: {id_pago}",
                            usuario, f"Pago ZD {ajuste.id_pago}",
                        )
                _recalcular_estado_tras_anulacion(db, gasto)

        db.commit()

        transicion = evaluar_gatillos_gastos_dam(db, gasto.id_dam) if (id_gasto and gasto and gasto.id_dam) else None
        mensaje = f"Pago {id_pago} eliminado exitosamente. Saldos recalculados y sincronizados en los registros de auditoría."
        respuesta = {"mensaje": mensaje, "reversion_dam": None}
        if transicion and transicion[0] != transicion[1]:
            dam = db.query(models.DetalleDam).filter(models.DetalleDam.id_dam == gasto.id_dam).first()
            respuesta["reversion_dam"] = {
                "numero_de_dam": dam.numero_de_dam if dam else None,
                "contenedor": dam.maestro.numero_factura if (dam and dam.maestro) else None,
                "estado_anterior": transicion[0],
                "estado_nuevo": transicion[1],
            }
            respuesta["mensaje"] = (
                f"{mensaje} ⚠ La DAM {respuesta['reversion_dam']['numero_de_dam']} del contenedor "
                f"{respuesta['reversion_dam']['contenedor']} volvió de '{transicion[0]}' a '{transicion[1]}'."
            )
        return respuesta
    except Exception as e:
        db.rollback()
        raise error_interno_de_negocio("Error al eliminar pago", e, 400) from e
