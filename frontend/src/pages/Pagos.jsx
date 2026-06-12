import { useState, useEffect } from 'react';
import axios from 'axios';
import Select from 'react-select';

const Pagos = () => {
  // --- ESTADOS: CATÁLOGOS ---
  const [opcionesGastos, setOpcionesGastos] = useState([]);
  const [opcionesBancos, setOpcionesBancos] = useState([]);
  const [opcionesEmpresas, setOpcionesEmpresas] = useState([]);
  const [gastosRaw, setGastosRaw] = useState([]);

  // --- ESTADOS: FORMULARIO ---
  const estadoInicialForm = {
    id_gasto: null,
    id_empresa: null,
    id_banco: null,
    numero_operacion: '',
    fecha_pago: '',
    moneda: 'USD',
    tipo_cambio: '1.00',
    importe: ''
  };

  const [form, setForm] = useState(estadoInicialForm);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- CARGA INICIAL ---
  useEffect(() => {
    cargarCatalogos();
  }, []);

  const cargarCatalogos = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };

      const [resGastos, resBancos, resEmpresas] = await Promise.all([
        axios.get('http://127.0.0.1:8000/gastos/', config),
        axios.get('http://127.0.0.1:8000/bancos/', config),
        axios.get('http://127.0.0.1:8000/empresas/', config)
      ]);

      setGastosRaw(resGastos.data);
      
      // PARCHE FALLA #1: Solo mostrar gastos PENDIENTES, no los ya PAGADOS
      const gastosPendientes = resGastos.data.filter(g => g.estado_pago !== 'PAGADO');
      
      setOpcionesGastos(gastosPendientes.map(g => ({ 
        value: g.id_gasto, 
        label: `[Gasto #${g.id_gasto}] Doc: ${g.numero_documento || 'S/N'} — Deuda: $${g.monto_usd} USD (${g.estado_pago})` 
      })));
      
      setOpcionesBancos(resBancos.data.map(b => ({ value: b.id_banco, label: b.nombre })));
      setOpcionesEmpresas(resEmpresas.data.map(e => ({ value: e.id_empresa, label: `${e.ruc} - ${e.nombre}` })));

    } catch (error) {
      console.error('Error al cargar catálogos:', error);
      setMensaje({ texto: 'Error de conexión. Verifica que los catálogos existan.', tipo: 'error' });
    }
  };

  // --- MANEJADORES DE ESTADO DINÁMICOS ---
  const handleChangeTexto = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleChangeMoneda = (e) => {
    const nuevaMoneda = e.target.value;
    setForm({ 
      ...form, 
      moneda: nuevaMoneda,
      tipo_cambio: nuevaMoneda === 'USD' ? '1.00' : ''
    });
  };

  // --- PARCHE FALLA #2: Info contextual del gasto seleccionado ---
  const gastoSeleccionado = gastosRaw.find(g => g.id_gasto === form.id_gasto);

  // --- CÁLCULO EN VIVO (Monto amortizado en USD) ---
  const importeNum = parseFloat(form.importe) || 0;
  const tcNum = parseFloat(form.tipo_cambio) || 0;
  const amortizacionCalculada = tcNum > 0 
    ? (form.moneda === 'USD' ? importeNum : importeNum / tcNum).toFixed(2) 
    : '0.00';

  // --- MOTOR DE GUARDADO ---
  const registrarPago = async (e) => {
    e.preventDefault();
    
    if (isSubmitting) return;
    
    // Validación estricta ANTES de bloquear el botón
    if (!form.id_gasto || !form.id_empresa || !form.id_banco) {
      setMensaje({ texto: '❌ Faltan catálogos obligatorios (Gasto, Empresa o Banco).', tipo: 'error' });
      return;
    }

    if (!form.fecha_pago) {
      setMensaje({ texto: '❌ La fecha de pago es obligatoria.', tipo: 'error' });
      return;
    }

    if (form.moneda === 'PEN' && (!form.tipo_cambio || parseFloat(form.tipo_cambio) <= 0)) {
      setMensaje({ texto: '❌ Para pagos en Soles, el Tipo de Cambio debe ser mayor a 0.', tipo: 'error' });
      return;
    }

    if (!form.importe || parseFloat(form.importe) <= 0) {
      setMensaje({ texto: '❌ El importe debe ser mayor a 0.', tipo: 'error' });
      return;
    }

    setIsSubmitting(true);
    setMensaje({ texto: '⏳ Procesando transferencia...', tipo: 'info' });

    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      
      const payload = {
        id_gasto: form.id_gasto,
        id_empresa: form.id_empresa,
        id_banco: form.id_banco,
        numero_operacion: form.numero_operacion || null,
        fecha_pago: form.fecha_pago || null,
        moneda: form.moneda,
        importe: parseFloat(form.importe),
        tipo_cambio: parseFloat(form.tipo_cambio)
      };

      await axios.post('http://127.0.0.1:8000/pagos/', payload, config);

      setMensaje({ texto: '✅ Pago registrado con éxito. Si hubo céntimos de diferencia, el ajuste ZD se aplicó automáticamente.', tipo: 'exito' });
      setForm(estadoInicialForm);
      
      // Recargar gastos para que el ya pagado desaparezca de la lista
      await cargarCatalogos();

    } catch (error) {
      console.error('Error al registrar pago:', error);
      if (error.response && error.response.data && error.response.data.detail) {
        setMensaje({ texto: `❌ ${error.response.data.detail}`, tipo: 'error' });
      } else if (error.response && error.response.status === 403) {
        setMensaje({ texto: '❌ Acceso denegado. Solo los roles Admin y Tesorería pueden registrar pagos.', tipo: 'error' });
      } else {
        setMensaje({ texto: '❌ Error al comunicarse con el servidor.', tipo: 'error' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const estiloInput = { width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' };
  
  const simboloMoneda = form.moneda === 'USD' ? '$' : 'S/';
  const colorMoneda = form.moneda === 'USD' ? '#27ae60' : '#d35400';

  return (
    <div style={{ padding: '30px', color: '#2c3e50', fontFamily: 'sans-serif' }}>
      <h2 style={{ borderBottom: '2px solid #8e44ad', paddingBottom: '10px' }}>Tesorería: Liquidación de Pagos</h2>

      {mensaje.texto && (
        <div style={{ padding: '10px', marginBottom: '20px', borderRadius: '5px', backgroundColor: mensaje.tipo === 'error' ? '#ffcccc' : mensaje.tipo === 'info' ? '#e6f2ff' : '#ccffcc', color: mensaje.tipo === 'error' ? '#cc0000' : mensaje.tipo === 'info' ? '#004080' : '#006600' }}>
          {mensaje.texto}
        </div>
      )}

      <form onSubmit={registrarPago} style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #ddd', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
        
        {/* FASE A: ¿QUÉ ESTAMOS PAGANDO? */}
        <div style={{ backgroundColor: '#f9ebf9', padding: '15px', borderRadius: '5px', marginBottom: '20px', borderLeft: '4px solid #8e44ad' }}>
          <h4 style={{ marginTop: 0, color: '#8e44ad' }}>1. Cuenta por Pagar (Gasto Logístico)</h4>
          <div style={{ zIndex: 5, position: 'relative' }}>
            <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Buscar Gasto Pendiente *</label>
            <Select 
              options={opcionesGastos} 
              value={opcionesGastos.find(op => op.value === form.id_gasto) || null}
              onChange={(op) => setForm({ ...form, id_gasto: op ? op.value : null })} 
              placeholder="Busca por ID de gasto o documento..." 
              isClearable 
            />
          </div>
          
          {/* PARCHE FALLA #2: Tarjeta de contexto del gasto seleccionado */}
          {gastoSeleccionado && (
            <div style={{ marginTop: '12px', padding: '10px', backgroundColor: '#fff', borderRadius: '5px', border: '1px solid #d5b8d5', fontSize: '13px' }}>
              <strong>Resumen de Deuda:</strong> Monto original: <strong style={{ color: '#c0392b' }}>${gastoSeleccionado.monto_usd} USD</strong> 
              {' | '}Estado: <strong style={{ color: gastoSeleccionado.estado_pago === 'PENDIENTE' ? '#e67e22' : '#27ae60' }}>{gastoSeleccionado.estado_pago}</strong>
              {' | '}Doc: {gastoSeleccionado.numero_documento || 'Sin documento'}
            </div>
          )}
        </div>

        {/* FASE B: DETALLES BANCARIOS */}
        <h4 style={{ marginTop: 0, color: '#7f8c8d' }}>2. Origen de los Fondos</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <div style={{ zIndex: 4, position: 'relative' }}>
            <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Empresa Pagadora *</label>
            <Select options={opcionesEmpresas} value={opcionesEmpresas.find(op => op.value === form.id_empresa) || null} onChange={(op) => setForm({ ...form, id_empresa: op ? op.value : null })} placeholder="Empresa que emite el pago..." isClearable />
          </div>
          <div style={{ zIndex: 3, position: 'relative' }}>
            <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Banco de Origen *</label>
            <Select options={opcionesBancos} value={opcionesBancos.find(op => op.value === form.id_banco) || null} onChange={(op) => setForm({ ...form, id_banco: op ? op.value : null })} placeholder="Selecciona el banco..." isClearable />
          </div>
        </div>

        {/* FASE C: LA TRANSACCIÓN */}
        <h4 style={{ marginTop: 0, color: '#7f8c8d' }}>3. Datos de la Transacción</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Fecha de Pago *</label>
                <input type="date" name="fecha_pago" value={form.fecha_pago} onChange={handleChangeTexto} style={estiloInput} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '14px', fontWeight: 'bold' }}>N° Operación (Voucher)</label>
                <input type="text" name="numero_operacion" value={form.numero_operacion} onChange={handleChangeTexto} style={estiloInput} placeholder="Ej: OP-998877" />
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Moneda del Pago</label>
                <select name="moneda" value={form.moneda} onChange={handleChangeMoneda} style={{ ...estiloInput, fontWeight: 'bold', color: colorMoneda }}>
                  <option value="USD">Dólares (USD)</option>
                  <option value="PEN">Soles (PEN)</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Tipo de Cambio</label>
                <input 
                  type="number" 
                  step="0.001" 
                  name="tipo_cambio" 
                  value={form.tipo_cambio} 
                  onChange={handleChangeTexto} 
                  disabled={form.moneda === 'USD'}
                  style={{ ...estiloInput, backgroundColor: form.moneda === 'USD' ? '#f2f2f2' : '#fff' }} 
                />
                {form.moneda === 'PEN' && (
                  <small style={{ color: '#e67e22', fontSize: '11px' }}>⚠️ Ingresa el TC del día. Si lo dejas en 0, el backend buscará el TC SUNAT registrado.</small>
                )}
              </div>
            </div>
          </div>

          {/* Recuadro Destacado para el Importe */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: '#f4f6f7', padding: '15px', borderRadius: '8px', border: `2px solid ${colorMoneda}` }}>
            <div style={{ position: 'relative' }}>
              <label style={{ fontSize: '16px', fontWeight: 'bold', color: colorMoneda }}>Importe a Pagar ({form.moneda}) *</label>
              <span style={{ position: 'absolute', left: '15px', top: '38px', color: '#34495e', fontWeight: 'bold', fontSize: '18px' }}>{simboloMoneda}</span>
              <input 
                type="number" 
                step="0.01" 
                name="importe" 
                value={form.importe} 
                onChange={handleChangeTexto} 
                style={{ width: '100%', padding: '12px 12px 12px 40px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '18px', fontWeight: 'bold', boxSizing: 'border-box' }} 
                placeholder="0.00" 
              />
            </div>
            
            {/* Espejo de Amortización en USD */}
            <div style={{ marginTop: '10px', textAlign: 'right' }}>
              <span style={{ fontSize: '12px', color: '#7f8c8d' }}>Amortización estimada a la deuda: </span>
              <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#27ae60' }}>$ {amortizacionCalculada} USD</span>
            </div>
            
            {/* Alerta de sobrepago visual */}
            {gastoSeleccionado && parseFloat(amortizacionCalculada) > parseFloat(gastoSeleccionado.monto_usd) && (
              <div style={{ padding: '6px 10px', backgroundColor: '#ffcccc', borderRadius: '4px', fontSize: '12px', color: '#cc0000', fontWeight: 'bold' }}>
                ⚠️ ALERTA: El importe supera la deuda original (${gastoSeleccionado.monto_usd} USD). El backend rechazará el sobrepago.
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: '25px', textAlign: 'right', borderTop: '1px solid #eee', paddingTop: '15px' }}>
          <button 
            type="submit" 
            disabled={isSubmitting}
            style={{ 
              padding: '12px 25px', 
              backgroundColor: isSubmitting ? '#95a5a6' : '#8e44ad', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px', 
              cursor: isSubmitting ? 'not-allowed' : 'pointer', 
              fontSize: '15px', 
              fontWeight: 'bold', 
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              transition: 'background-color 0.3s',
              opacity: isSubmitting ? 0.7 : 1
            }}>
            {isSubmitting ? '⏳ PROCESANDO...' : '🏦 APLICAR PAGO Y LIQUIDAR'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Pagos;
