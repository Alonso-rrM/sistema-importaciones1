"""
Reglas financieras puras (sin base de datos ni HTTP).

REGLA ÚNICA DE AMORTIZACIÓN: cuánto descuenta un pago del saldo de un gasto.
Cada pago se convierte a la moneda del gasto y se redondea a 2 decimales (ROUND_HALF_UP) por separado;
el total pagado es la suma de esos montos ya redondeados. Es la misma regla con la que se valida el
sobrepago y se cierra un gasto por centavos, así que registrar, anular y los reportes coinciden.
"""
from decimal import Decimal, ROUND_HALF_UP

from constantes import Moneda

CENTAVO = Decimal("0.01")


def calcular_amortizacion_cruzada(importe_pago: Decimal, tc: Decimal, moneda_gasto: str, moneda_pago: str) -> Decimal:
    """Monto que amortiza un pago, en la moneda del gasto, con redondeo simétrico SUNAT (ROUND_HALF_UP)."""
    if tc <= Decimal("0.00"):
        tc = Decimal("1.00")

    if moneda_gasto == moneda_pago:
        return importe_pago.quantize(CENTAVO, rounding=ROUND_HALF_UP)
    elif moneda_gasto == Moneda.USD and moneda_pago == Moneda.PEN:
        return (importe_pago / tc).quantize(CENTAVO, rounding=ROUND_HALF_UP)
    elif moneda_gasto == Moneda.PEN and moneda_pago == Moneda.USD:
        return (importe_pago * tc).quantize(CENTAVO, rounding=ROUND_HALF_UP)
    return importe_pago.quantize(CENTAVO, rounding=ROUND_HALF_UP)


def tipo_cambio_efectivo(tipo_cambio_aplicado, tipo_cambio) -> Decimal:
    """TC con el que se registró un pago: el aplicado (4 decimales), si no el registrado, si no 1; nunca <= 0."""
    tc = Decimal(str(tipo_cambio_aplicado or tipo_cambio or "1.00"))
    return tc if tc > Decimal("0.00") else Decimal("1.00")


def amortizacion_de_pago(pago, moneda_gasto: str) -> Decimal:
    """Monto que amortiza un pago registrado (objeto con importe, moneda y tipos de cambio) sobre su gasto."""
    tc = tipo_cambio_efectivo(pago.tipo_cambio_aplicado, pago.tipo_cambio)
    return calcular_amortizacion_cruzada(Decimal(str(pago.importe)), tc, moneda_gasto, pago.moneda)


def total_amortizado(pagos, moneda_gasto: str) -> Decimal:
    """Suma de lo amortizado por los pagos (cada uno ya redondeado)."""
    return sum((amortizacion_de_pago(p, moneda_gasto) for p in pagos), Decimal("0.00"))
