with open("frontend/src/pages/Gastos.jsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update estadoInicialForm
old_form = """    numero_documento: '',
    fecha_vencimiento: '',
    monto_usd: ''"""
new_form = """    numero_documento: '',
    fecha_vencimiento: '',
    monto_original: '',
    moneda: 'USD'"""
content = content.replace(old_form, new_form)

# 2. Update handleRowClick
old_rowclick = """        numero_documento: gasto.numero_documento || '',
        fecha_vencimiento: gasto.fecha_vencimiento || '',
        monto_usd: gasto.monto_usd || ''"""
new_rowclick = """        numero_documento: gasto.numero_documento || '',
        fecha_vencimiento: gasto.fecha_vencimiento || '',
        monto_original: gasto.monto_original || '',
        moneda: gasto.moneda || 'USD'"""
content = content.replace(old_rowclick, new_rowclick)

# 3. Update payload in handleGuardar
old_payload = """        id_tipo_doc: form.id_tipo_doc,
        monto_usd: parseFloat(form.monto_usd),
        numero_documento: form.numero_documento || null,
        fecha_vencimiento: form.fecha_vencimiento || null"""
new_payload = """        id_tipo_doc: form.id_tipo_doc,
        monto_original: parseFloat(form.monto_original),
        moneda: form.moneda,
        numero_documento: form.numero_documento || null,
        fecha_vencimiento: form.fecha_vencimiento || null"""
content = content.replace(old_payload, new_payload)

# 4. Table headers and body
old_thead = """                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Documento</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Monto (USD)</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Estado Pago</th>"""
new_thead = """                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Documento</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Monto</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Moneda</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Estado Pago</th>"""
content = content.replace(old_thead, new_thead)

old_tbody = """                    <td style={{ padding: '12px' }}>{g.numero_documento || 'Sin documento'}</td>
                    <td style={{ padding: '12px', fontWeight: '500' }}>${parseFloat(g.monto_usd).toFixed(2)}</td>
                    <td style={{ padding: '12px' }}>"""
new_tbody = """                    <td style={{ padding: '12px' }}>{g.numero_documento || 'Sin documento'}</td>
                    <td style={{ padding: '12px', fontWeight: '500' }}>{parseFloat(g.monto_original).toFixed(2)}</td>
                    <td style={{ padding: '12px', fontWeight: 'bold' }}>{g.moneda || 'USD'}</td>
                    <td style={{ padding: '12px' }}>"""
content = content.replace(old_tbody, new_tbody)

# 5. Form inputs
old_input = """            <div>
              <label style={labelStyle}>Fecha Vencimiento</label>
              <input 
                type="date" 
                name="fecha_vencimiento" 
                value={form.fecha_vencimiento} 
                onChange={handleChangeTexto} 
                style={inputStyle} 
                disabled={isReadOnly}
              />
            </div>
            <div style={{ position: 'relative' }}>
              <label style={labelStyle}>Monto Total (USD) *</label>
              <span style={{ position: 'absolute', left: '12px', top: '38px', color: '#7f8c8d', fontWeight: 'bold' }}>$</span>
              <input 
                type="number" 
                step="0.01" 
                name="monto_usd" 
                value={form.monto_usd} 
                onChange={handleChangeTexto} 
                required 
                style={{ ...inputStyle, paddingLeft: '25px' }} 
                placeholder="0.00" 
                disabled={isReadOnly}
              />
            </div>"""

new_input = """            <div>
              <label style={labelStyle}>Fecha Vencimiento</label>
              <input 
                type="date" 
                name="fecha_vencimiento" 
                value={form.fecha_vencimiento} 
                onChange={handleChangeTexto} 
                style={inputStyle} 
                disabled={isReadOnly}
              />
            </div>
            <div>
              <label style={labelStyle}>Moneda *</label>
              <select 
                name="moneda" 
                value={form.moneda} 
                onChange={handleChangeTexto} 
                required 
                style={inputStyle} 
                disabled={isReadOnly}
              >
                <option value="USD">Dólares (USD)</option>
                <option value="PEN">Soles (PEN)</option>
              </select>
            </div>
            <div style={{ position: 'relative' }}>
              <label style={labelStyle}>Monto Total *</label>
              <span style={{ position: 'absolute', left: '12px', top: '38px', color: '#7f8c8d', fontWeight: 'bold' }}>{form.moneda === 'PEN' ? 'S/' : '$'}</span>
              <input 
                type="number" 
                step="0.01" 
                name="monto_original" 
                value={form.monto_original} 
                onChange={handleChangeTexto} 
                required 
                style={{ ...inputStyle, paddingLeft: '25px' }} 
                placeholder="0.00" 
                disabled={isReadOnly}
              />
            </div>"""
content = content.replace(old_input, new_input)

with open("frontend/src/pages/Gastos.jsx", "w", encoding="utf-8") as f:
    f.write(content)

print("Parche frontend Gastos.jsx aplicado.")
