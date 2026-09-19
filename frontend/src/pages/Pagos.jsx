import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import Select from 'react-select';

const Pagos = () => {
  const [gastos, setGastos] = useState([]);
  const [pagosLista, setPagosLista] = useState([]);
  const [dams, setDams] = useState([]);
  const [maestros, setMaestros] = useState([]);
  const [importadores, setImportadores] = useState([]);
  const [bancos, setBancos] = useState([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedGasto, setSelectedGasto] = useState(null);
  
  const [opcionesVouchers, setOpcionesVouchers] = useState([]);
  
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [form, setForm] = useState({
    voucher_id: null,
    fecha_pago: '',
    moneda: 'USD',
    tipo_cambio: '1.00',
    importe: '',
    pago_moneda_cruzada: false,
    monto_moneda_origen: ''
  });

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };

      const [resGastos, resDams, resMaestros, resImportadores, resBancos, resPagos] = await Promise.all([
        axios.get('http://127.0.0.1:8000/gastos/', config),
        axios.get('http://127.0.0.1:8000/dams/', config),
        axios.get('http://127.0.0.1:8000/maestros/', config),
        axios.get('http://127.0.0.1:8000/importadores/', config),
        axios.get('http://127.0.0.1:8000/bancos/', config),
        axios.get('http://127.0.0.1:8000/pagos/', config)
      ]);

      setGastos(resGastos.data);
      setDams(resDams.data);
      setMaestros(resMaestros.data);
      setImportadores(resImportadores.data);
      setBancos(resBancos.data);
      setPagosLista(resPagos.data);
      
    } catch (error) {
      console.error('Error al cargar datos:', error);
      setMensaje({ texto: 'Error de conexión al cargar datos.', tipo: 'error' });
    }
  };

  const gastosEnriquecidos = useMemo(() => {
    return gastos.map(gasto => {
      const dam = dams.find(d => d.id_dam === gasto.id_dam);
      const maestro = dam ? maestros.find(m => m.id_maestro === dam.id_maestro) : null;
      const importador = maestro ? importadores.find(i => i.id_importador === maestro.id_importador) : null;
      
      const pagosAsociados = pagosLista.filter(p => p.id_gasto === gasto.id_gasto);
      let totalYaPagado = 0;
      pagosAsociados.forEach(p => {
        const importe = parseFloat(p.importe) || 0;
        const tc = parseFloat(p.tipo_cambio_aplicado || p.tipo_cambio) || 1;
        if (gasto.moneda === 'USD' || !gasto.moneda) {
          if (p.moneda === 'USD') totalYaPagado += importe;
          if (p.moneda === 'PEN') totalYaPagado += (importe / tc);
        } else {
          if (p.moneda === 'PEN') totalYaPagado += importe;
          if (p.moneda === 'USD') totalYaPagado += (importe * tc);
        }
      });
      const saldoRestante = Math.max(0, parseFloat(gasto.monto_original) - totalYaPagado);

      return {
        ...gasto,
        dam_numero: dam?.numero_de_dam || 'N/A',
        maestro_factura: maestro?.numero_factura || 'N/A',
        importador_nombre: importador?.nombre || 'Desconocido',
        id_importador: importador?.id_importador,
        saldo_restante: saldoRestante
      };
    });
  }, [gastos, dams, maestros, importadores, pagosLista]);

  const gastosPendientesFiltrados = useMemo(() => {
    let filtrados = gastosEnriquecidos.filter(g => g.estado_pago === 'PENDIENTE' || g.estado_pago === 'PARCIAL');
    
    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      filtrados = filtrados.filter(g => {
        const text = `${g.id_gasto} ${g.numero_documento} ${g.dam_numero} ${g.maestro_factura} ${g.importador_nombre} ${g.estado_pago}`.toLowerCase();
        return text.includes(lowerTerm);
      });
    }
    return filtrados;
  }, [gastosEnriquecidos, searchTerm]);

  const openModal = async (gasto) => {
    setSelectedGasto(gasto);
    setForm({
      voucher_id: null,
      fecha_pago: '',
      moneda: 'USD',
      tipo_cambio: '1.00',
      importe: gasto.saldo_restante.toFixed(2),
      pago_moneda_cruzada: false,
      monto_moneda_origen: ''
    });
    
    try {
      if (gasto.id_importador) {
        const token = localStorage.getItem('token');
        const resVouchers = await axios.get(`http://127.0.0.1:8000/vouchers/?saldo_mayor_cero=true&id_importador=${gasto.id_importador}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        const bancosMap = {};
        bancos.forEach(b => bancosMap[b.id_banco] = b.nombre);
        
        setOpcionesVouchers(resVouchers.data.map(v => ({
          value: v.id_voucher,
          label: `${bancosMap[v.banco_id] || 'Banco'} - ${v.numero_operacion} (Saldo: ${v.moneda} ${v.saldo_disponible})`
        })));
      } else {
        setOpcionesVouchers([]);
      }
    } catch (error) {
      console.error("Error fetching vouchers:", error);
    }

    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedGasto(null);
  };

  const handleChangeTexto = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const handleChangeCheckbox = (e) => setForm({ ...form, [e.target.name]: e.target.checked });
  const handleChangeMoneda = (e) => {
    const nuevaMoneda = e.target.value;
    setForm({ 
      ...form, 
      moneda: nuevaMoneda,
      tipo_cambio: nuevaMoneda === 'USD' ? '1.00' : ''
    });
  };

  const registrarPago = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!form.voucher_id || !form.fecha_pago) {
      alert('❌ Falta voucher o fecha de pago.');
      return;
    }

    const importeConvertido = form.moneda === 'PEN' ? (parseFloat(form.importe) / parseFloat(form.tipo_cambio)) : parseFloat(form.importe);
    const montoOrigenNum = form.pago_moneda_cruzada && form.monto_moneda_origen ? parseFloat(form.monto_moneda_origen) : parseFloat(form.importe);
    const gastoFinancieroTc = form.pago_moneda_cruzada ? Math.max(0, montoOrigenNum - importeConvertido) : 0;

    setIsSubmitting(true);
    setMensaje({ texto: 'Procesando pago...', tipo: 'info' });

    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      
      const payload = {
        id_gasto: selectedGasto.id_gasto,
        id_importador: selectedGasto.id_importador,
        voucher_id: form.voucher_id,
        fecha_pago: form.fecha_pago || null,
        moneda: form.moneda,
        importe: parseFloat(form.importe),
        tipo_cambio: parseFloat(form.tipo_cambio),
        pago_moneda_cruzada: form.pago_moneda_cruzada,
        monto_moneda_origen: montoOrigenNum,
        gasto_financiero_tc: gastoFinancieroTc
      };
      
      await axios.post('http://127.0.0.1:8000/pagos/', payload, config);
      setMensaje({ texto: '✅ Pago registrado con éxito.', tipo: 'exito' });
      
      cargarDatos();
      closeModal();
      setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);

    } catch (error) {
      console.error(error);
      if (error.response && error.response.data && error.response.data.detail) {
        alert(`❌ Error: ${error.response.data.detail}`);
      } else {
        alert('❌ Error de conexión al registrar el pago.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const importeNum = parseFloat(form.importe) || 0;
  const tcNum = parseFloat(form.tipo_cambio) || 0;
  const importeConvertido = form.moneda === 'PEN' && tcNum > 0 ? (importeNum / tcNum) : importeNum;
  const montoOrigenNum = parseFloat(form.monto_moneda_origen) || 0;
  const gastoFinancieroCálculo = form.pago_moneda_cruzada ? Math.max(0, montoOrigenNum - importeConvertido) : 0;


  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h2 style={{ color: '#2c3e50', borderBottom: '2px solid #8e44ad', paddingBottom: '10px' }}>Liquidación de Pagos (Gastos Pendientes)</h2>

      {mensaje.texto && (
        <div style={{ padding: '15px', marginBottom: '20px', borderRadius: '5px', backgroundColor: mensaje.tipo === 'error' ? '#f8d7da' : '#d4edda', color: mensaje.tipo === 'error' ? '#721c24' : '#155724', fontWeight: 'bold' }}>
          {mensaje.texto}
        </div>
      )}

      {/* SEARCH BAR */}
      <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
        <input 
          type="search" 
          placeholder="Buscar por DAM, Factura, Importador, Doc..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ padding: '10px', width: '100%', maxWidth: '500px', borderRadius: '5px', border: '1px solid #ccc' }}
        />
      </div>

      {/* TABLA DE GASTOS */}
      <div style={{ overflowX: 'auto', backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '8px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#ecf0f1', textAlign: 'left' }}>
              <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>ID Gasto</th>
              <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>DAM</th>
              <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Importador</th>
              <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Estado</th>
              <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Deuda Orig.</th>
              <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Saldo Rest.</th>
              <th style={{ padding: '12px', borderBottom: '2px solid #ddd', textAlign: 'center' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {gastosPendientesFiltrados.map(g => (
              <tr key={g.id_gasto} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '12px' }}>{g.id_gasto}</td>
                <td style={{ padding: '12px' }}>{g.dam_numero}</td>
                <td style={{ padding: '12px', fontWeight: 'bold' }}>{g.importador_nombre}</td>
                <td style={{ padding: '12px' }}>
                  <span style={{ backgroundColor: g.estado_pago === 'PENDIENTE' ? '#e67e22' : '#f39c12', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>
                    {g.estado_pago}
                  </span>
                </td>
                <td style={{ padding: '12px' }}>{g.moneda==='PEN'?'S/':'$'} {parseFloat(g.monto_original).toFixed(2)}</td>
                <td style={{ padding: '12px', color: '#c0392b', fontWeight: 'bold' }}>{g.moneda==='PEN'?'S/':'$'} {g.saldo_restante.toFixed(2)}</td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <button 
                    onClick={() => openModal(g)}
                    style={{ backgroundColor: '#2ecc71', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    💸 Aplicar Pago
                  </button>
                </td>
              </tr>
            ))}
            {gastosPendientesFiltrados.length === 0 && (
              <tr><td colSpan="7" style={{ padding: '20px', textAlign: 'center', color: '#7f8c8d' }}>No hay gastos pendientes.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL DE PAGO */}
      {isModalOpen && selectedGasto && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ color: '#8e44ad', marginTop: 0, borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
              Aplicar Pago a Gasto #{selectedGasto.id_gasto}
            </h3>
            
            <div style={{ backgroundColor: '#f9f0fd', padding: '10px', borderRadius: '5px', marginBottom: '15px', color: '#68258c' }}>
              <strong>Importador:</strong> {selectedGasto.importador_nombre} <br/>
              <strong>Deuda Restante:</strong> {selectedGasto.moneda==='PEN'?'S/':'$'} {selectedGasto.saldo_restante.toFixed(2)} {selectedGasto.moneda}
            </div>

            <form onSubmit={registrarPago}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Voucher de {selectedGasto.importador_nombre} *</label>
                <Select 
                  options={opcionesVouchers} 
                  value={opcionesVouchers.find(op => op.value === form.voucher_id) || null} 
                  onChange={(op) => setForm({ ...form, voucher_id: op ? op.value : null })} 
                  placeholder="Seleccione el voucher disponible..." 
                  isClearable 
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Fecha de Pago *</label>
                  <input type="date" name="fecha_pago" value={form.fecha_pago} onChange={handleChangeTexto} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} required />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Moneda del Pago *</label>
                  <select name="moneda" value={form.moneda} onChange={handleChangeMoneda} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}>
                    <option value="USD">USD</option>
                    <option value="PEN">PEN</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Importe a Pagar ({form.moneda}) *</label>
                  <input type="number" step="0.01" name="importe" value={form.importe} onChange={handleChangeTexto} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '16px', fontWeight: 'bold' }} required />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Tipo de Cambio</label>
                  <input type="number" step="0.001" name="tipo_cambio" value={form.tipo_cambio} onChange={handleChangeTexto} disabled={form.moneda === 'USD'} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: form.moneda === 'USD' ? '#eee' : '#fff' }} />
                </div>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 'bold', color: '#8e44ad' }}>
                  <input type="checkbox" name="pago_moneda_cruzada" checked={form.pago_moneda_cruzada} onChange={handleChangeCheckbox} />
                  ¿Moneda cruzada? (Pago difiere de moneda origen)
                </label>
              </div>

              {form.pago_moneda_cruzada && (
                <div style={{ backgroundColor: '#fcf3cf', padding: '15px', borderRadius: '8px', border: '1px solid #f1c40f', marginBottom: '15px' }}>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Monto extraído del voucher *</label>
                  <input type="number" step="0.01" name="monto_moneda_origen" value={form.monto_moneda_origen} onChange={handleChangeTexto} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} placeholder="Lo que realmente cobró el banco" />
                  
                  {gastoFinancieroCálculo > 0 && (
                    <div style={{ color: '#c0392b', fontWeight: 'bold', marginTop: '10px' }}>
                      Pérdida Financiera: {gastoFinancieroCálculo.toFixed(2)}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
                <button type="button" onClick={closeModal} style={{ padding: '10px 20px', backgroundColor: '#95a5a6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={isSubmitting} style={{ padding: '10px 20px', backgroundColor: '#8e44ad', color: 'white', border: 'none', borderRadius: '4px', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                  {isSubmitting ? 'Procesando...' : 'Aplicar Pago'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Pagos;
