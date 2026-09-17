with open("frontend/src/pages/Pagos.jsx", "r", encoding="utf-8") as f:
    content = f.read()

# Chunk 1
old1 = """            if (p.moneda === 'USD') {
              totalYaPagado += importe;
            } else if (p.moneda === 'PEN') {
              totalYaPagado += (importe / tc);
            }
          });
          const saldoRestante = Math.max(0, parseFloat(foundGasto.monto_usd) - totalYaPagado);"""
new1 = """            if (foundGasto.moneda === 'USD' || !foundGasto.moneda) {
              if (p.moneda === 'USD') totalYaPagado += importe;
              if (p.moneda === 'PEN') totalYaPagado += (importe / tc);
            } else {
              if (p.moneda === 'PEN') totalYaPagado += importe;
              if (p.moneda === 'USD') totalYaPagado += (importe * tc);
            }
          });
          const saldoRestante = Math.max(0, parseFloat(foundGasto.monto_original) - totalYaPagado);"""
content = content.replace(old1, new1)

# Chunk 2
old2 = """        label: `[Gasto #${g.id_gasto}] Doc: ${g.numero_documento || 'S/N'} — Deuda original: $${parseFloat(g.monto_usd).toFixed(2)} USD (${g.estado_pago})`"""
new2 = """        label: `[Gasto #${g.id_gasto}] Doc: ${g.numero_documento || 'S/N'} — Deuda original: ${g.moneda==='PEN'?'S/':'$'}${parseFloat(g.monto_original).toFixed(2)} ${g.moneda||'USD'} (${g.estado_pago})`"""
content = content.replace(old2, new2)

# Chunk 3
old3 = "  const amortizacionCalculada = tcNum > 0 ? (form.moneda === 'USD' ? importeNum : importeNum / tcNum).toFixed(2) : '0.00';"
new3 = """  let amortCalculadaNum = 0;
  if (gastoSeleccionado) {
    const monedaGasto = gastoSeleccionado.moneda || 'USD';
    if (monedaGasto === 'USD') {
      amortCalculadaNum = tcNum > 0 ? (form.moneda === 'USD' ? importeNum : importeNum / tcNum) : 0;
    } else {
      amortCalculadaNum = tcNum > 0 ? (form.moneda === 'PEN' ? importeNum : (importeNum * tcNum)) : 0;
    }
  }
  const amortizacionCalculada = amortCalculadaNum.toFixed(2);"""
content = content.replace(old3, new3)

# Chunk 4
old4 = "$ {amortizacionCalculada} USD"
new4 = "{gastoSeleccionado?.moneda === 'PEN' ? 'S/' : '$'} {amortizacionCalculada} {gastoSeleccionado?.moneda || 'USD'}"
content = content.replace(old4, new4)

# Chunk 5
old5 = """              {gastoSeleccionado && parseFloat(amortizacionCalculada) > (parseFloat(gastoSeleccionado.monto_usd) + 0.05) && (
                <div style={{ color: '#c0392b', fontSize: '12px', marginTop: '5px', fontWeight: 'bold' }}>
                  ⚠️ ALERTA: El importe supera la deuda original (${gastoSeleccionado.monto_usd} USD). El backend rechazará el sobrepago.
                </div>
              )}"""
new5 = """              {gastoSeleccionado && parseFloat(amortizacionCalculada) > (parseFloat(gastoSeleccionado.monto_original) + 0.05) && (
                <div style={{ color: '#c0392b', fontSize: '12px', marginTop: '5px', fontWeight: 'bold' }}>
                  ⚠️ ALERTA: El importe supera la deuda original ({gastoSeleccionado.moneda==='PEN'?'S/':'$'}{gastoSeleccionado.monto_original} {gastoSeleccionado.moneda||'USD'}). El backend rechazará el sobrepago.
                </div>
              )}"""
content = content.replace(old5, new5)

# Chunk 6
old6_a = "${parseFloat(inheritedGasto.monto_usd).toFixed(2)} USD"
new6_a = "{inheritedGasto.moneda==='PEN'?'S/':'$'}{parseFloat(inheritedGasto.monto_original).toFixed(2)} {inheritedGasto.moneda||'USD'}"
content = content.replace(old6_a, new6_a)

old6_b = "${parseFloat(gastoSeleccionado.monto_usd).toFixed(2)} USD"
new6_b = "{gastoSeleccionado.moneda==='PEN'?'S/':'$'}{parseFloat(gastoSeleccionado.monto_original).toFixed(2)} {gastoSeleccionado.moneda||'USD'}"
content = content.replace(old6_b, new6_b)

with open("frontend/src/pages/Pagos.jsx", "w", encoding="utf-8") as f:
    f.write(content)

print("Parche frontend Pagos.jsx aplicado.")
