from decimal import Decimal, ROUND_HALF_UP

def calcular_amortizacion_cruzada(importe_pago: Decimal, tc: Decimal, moneda_gasto: str, moneda_pago: str) -> Decimal:
    """Función pura sin dependencias de base de datos ni HTTP.
    Calcula la amortización exacta con redondeo simétrico SUNAT (ROUND_HALF_UP).
    """
    if tc <= Decimal("0.00"):
        tc = Decimal("1.00")
        
    if moneda_gasto == moneda_pago:
        return importe_pago.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    elif moneda_gasto == "USD" and moneda_pago == "PEN":
        return (importe_pago / tc).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    elif moneda_gasto == "PEN" and moneda_pago == "USD":
        return (importe_pago * tc).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    return importe_pago.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
