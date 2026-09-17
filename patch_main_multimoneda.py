import re

with open("main.py", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update GET methods referring to monto_usd (line 933 and 1452)
content = content.replace("monto_gasto_usd = Decimal(str(gasto.monto_usd))", 
                          "monto_gasto_base = Decimal(str(gasto.monto_original))")

# 2. Update land cost calculations (line 1052)
# Old: monto_usd = Decimal(str(gasto.monto_usd)) if gasto.monto_usd else Decimal("0.00")
# Old: total_gastos_dam_pen += monto_usd * tipo_cambio_referencial
# New: If gasto is in USD -> multiply by TC. If in PEN -> add directly.
land_cost_old = """                monto_usd = Decimal(str(gasto.monto_usd)) if gasto.monto_usd else Decimal("0.00")
                total_gastos_dam_pen += monto_usd * tipo_cambio_referencial"""
land_cost_new = """                monto_original = Decimal(str(gasto.monto_original)) if gasto.monto_original else Decimal("0.00")
                if gasto.moneda == "USD":
                    total_gastos_dam_pen += monto_original * tipo_cambio_referencial
                else:
                    total_gastos_dam_pen += monto_original"""
content = content.replace(land_cost_old, land_cost_new)

# 3. Update snapshots (Audit logs)
content = content.replace('identificador_principal=f"Gasto USD: {gasto.monto_usd}', 
                          'identificador_principal=f"Gasto {gasto.moneda}: {gasto.monto_original}')
content = content.replace('"Ref. Gasto USD": f"{pago.gasto_rel.monto_usd}"', 
                          '"Ref. Gasto": f"{pago.gasto_rel.monto_original} {pago.gasto_rel.moneda}"')
content = content.replace('"Ref. Gasto USD": f"{pago_zd.gasto_rel.monto_usd}"', 
                          '"Ref. Gasto": f"{pago_zd.gasto_rel.monto_original} {pago_zd.gasto_rel.moneda}"')

# 4. Refactor dynamic balance calculation (crear_pago)
# We need to find the block for "Cálculo de saldos dinámicos" in crear_pago
old_calc = """            # B. Cálculo de saldos dinámicos
            total_pagado_usd = db.query(
                func.sum(
                    case(
                        (models.RegistroPago.moneda == "USD", models.RegistroPago.importe),
                        (models.RegistroPago.moneda == "PEN", models.RegistroPago.importe / func.coalesce(models.RegistroPago.tipo_cambio_aplicado, models.RegistroPago.tipo_cambio, 1)),
                        else_=0
                    )
                )
            ).filter(models.RegistroPago.id_gasto == id_gasto_afectado).scalar()
            
            total_pagado_usd = Decimal(str(total_pagado_usd)) if total_pagado_usd else Decimal("0.00")
            
            saldo_pendiente = monto_gasto_usd - total_pagado_usd
            margen_tolerancia = Decimal("0.05")"""

new_calc = """            # B. Cálculo de saldos dinámicos (Multimoneda)
            if gasto.moneda == "USD":
                total_pagado = db.query(
                    func.sum(
                        case(
                            (models.RegistroPago.moneda == "USD", models.RegistroPago.importe),
                            (models.RegistroPago.moneda == "PEN", models.RegistroPago.importe / func.coalesce(models.RegistroPago.tipo_cambio_aplicado, models.RegistroPago.tipo_cambio, 1)),
                            else_=0
                        )
                    )
                ).filter(models.RegistroPago.id_gasto == id_gasto_afectado).scalar()
            else: # Gasto en PEN
                total_pagado = db.query(
                    func.sum(
                        case(
                            (models.RegistroPago.moneda == "PEN", models.RegistroPago.importe),
                            (models.RegistroPago.moneda == "USD", models.RegistroPago.importe * func.coalesce(models.RegistroPago.tipo_cambio_aplicado, models.RegistroPago.tipo_cambio, 1)),
                            else_=0
                        )
                    )
                ).filter(models.RegistroPago.id_gasto == id_gasto_afectado).scalar()
            
            total_pagado = Decimal(str(total_pagado)) if total_pagado else Decimal("0.00")
            saldo_pendiente = monto_gasto_base - total_pagado
            margen_tolerancia = Decimal("0.05")"""
content = content.replace(old_calc, new_calc)

# We need to do the same replacement for eliminar_pago
old_calc_elim = """            # B. Cálculo de saldos dinámicos
            total_pagado_usd = db.query(
                func.sum(
                    case(
                        (models.RegistroPago.moneda == "USD", models.RegistroPago.importe),
                        (models.RegistroPago.moneda == "PEN", models.RegistroPago.importe / func.coalesce(models.RegistroPago.tipo_cambio_aplicado, models.RegistroPago.tipo_cambio, 1)),
                        else_=0
                    )
                )
            ).filter(models.RegistroPago.id_gasto == id_gasto_afectado).scalar()
            
            total_pagado_usd = Decimal(str(total_pagado_usd)) if total_pagado_usd else Decimal("0.00")
            monto_gasto_usd = Decimal(str(gasto.monto_usd))
            
            saldo_pendiente = monto_gasto_usd - total_pagado_usd
            margen_tolerancia = Decimal("0.05")"""

new_calc_elim = """            # B. Cálculo de saldos dinámicos (Multimoneda)
            monto_gasto_base = Decimal(str(gasto.monto_original))
            if gasto.moneda == "USD":
                total_pagado = db.query(
                    func.sum(
                        case(
                            (models.RegistroPago.moneda == "USD", models.RegistroPago.importe),
                            (models.RegistroPago.moneda == "PEN", models.RegistroPago.importe / func.coalesce(models.RegistroPago.tipo_cambio_aplicado, models.RegistroPago.tipo_cambio, 1)),
                            else_=0
                        )
                    )
                ).filter(models.RegistroPago.id_gasto == id_gasto_afectado).scalar()
            else: # Gasto en PEN
                total_pagado = db.query(
                    func.sum(
                        case(
                            (models.RegistroPago.moneda == "PEN", models.RegistroPago.importe),
                            (models.RegistroPago.moneda == "USD", models.RegistroPago.importe * func.coalesce(models.RegistroPago.tipo_cambio_aplicado, models.RegistroPago.tipo_cambio, 1)),
                            else_=0
                        )
                    )
                ).filter(models.RegistroPago.id_gasto == id_gasto_afectado).scalar()
            
            total_pagado = Decimal(str(total_pagado)) if total_pagado else Decimal("0.00")
            saldo_pendiente = monto_gasto_base - total_pagado
            margen_tolerancia = Decimal("0.05")"""
content = content.replace(old_calc_elim, new_calc_elim)

# Update the condition variables
content = content.replace("saldo_pendiente >= monto_gasto_usd", "saldo_pendiente >= monto_gasto_base")

with open("main.py", "w", encoding="utf-8") as f:
    f.write(content)

print("Parche en main.py completado.")
