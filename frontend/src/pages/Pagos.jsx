import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Select from 'react-select';

const Pagos = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // --- ESTADOS DE VISTA Y SELECCIÓN ---
  const [viewMode, setViewMode] = useState('LISTA'); // LISTA, NUEVO, MODIFICAR, CONSULTAR
  const [selectedId, setSelectedId] = useState(null);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  // --- DATOS ---
  const [pagosLista, setPagosLista] = useState([]);
  const [gastosRaw, setGastosRaw] = useState([]);
  const [opcionesGastos, setOpcionesGastos] = useState([]);
  const [opcionesBancos, setOpcionesBancos] = useState([]);
  const [opcionesEmpresas, setOpcionesEmpresas] = useState([]);
  
  const [inheritedGasto, setInheritedGasto] = useState(null);

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
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    cargarListaPagos();
    cargarCatalogos();
  }, []);

  // Escuchar si viene un gasto heredado (por query params o por location.state)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const queryGastoId = params.get('gasto_id');
    const stateGasto = location.state?.fromGasto;

    if (queryGastoId || stateGasto) {
      const targetGastoId = stateGasto ? stateGasto.id_gasto : parseInt(queryGastoId, 10);
      
      if (targetGastoId && gastosRaw.length > 0) {
        const foundGasto = gastosRaw.find(g => g.id_gasto === targetGastoId);
        if (foundGasto) {
          setInheritedGasto(foundGasto);
          
          // Calcular el saldo pendiente del gasto para proponerlo como importe inicial
          const pagosAsociados = pagosLista.filter(p => p.id_gasto === targetGastoId);
          let totalYaPagado = 0;
          pagosAsociados.forEach(p => {
            const importe = parseFloat(p.importe) || 0;
            const tc = parseFloat(p.tipo_cambio_aplicado || p.tipo_cambio) || 1;
            if (p.moneda === 'USD') {
              totalYaPagado += importe;
            } else if (p.moneda === 'PEN') {
              totalYaPagado += (importe / tc);
            }
          });
          const saldoRestante = Math.max(0, parseFloat(foundGasto.monto_usd) - totalYaPagado);

          setForm(prev => ({
            ...prev,
            id_gasto: foundGasto.id_gasto,
            importe: saldoRestante.toFixed(2),
            moneda: 'USD',
            tipo_cambio: '1.00'
          }));
          
          setViewMode('NUEVO');
          setSelectedId(null);
          
          // Limpiar URL y estado para evitar re-triggers en refrescos
          window.history.replaceState({}, document.title);
        }
      }
    }
  }, [location.search, location.state, gastosRaw, pagosLista]);

  const cargarListaPagos = async () => {
    try {
      const token = localStorage.getItem("token") || "";
      const response = await fetch("http://127.0.0.1:8000/pagos/", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setPagosLista(data);
      }
    } catch (error) {
      console.error("Error al obtener pagos:", error);
    }
  };

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
      
      const gastosPendientes = resGastos.data.filter(g => g.estado_pago !== 'PAGADO');
      
      setOpcionesGastos(resGastos.data.map(g => ({ 
        value: g.id_gasto, 
        label: `[Gasto #${g.id_gasto}] Doc: ${g.numero_documento || 'S/N'} — Deuda original: $${parseFloat(g.monto_usd).toFixed(2)} USD (${g.estado_pago})` 
      })));
      
      setOpcionesBancos(resBancos.data.map(b => ({ value: b.id_banco, label: b.nombre })));
      setOpcionesEmpresas(resEmpresas.data.map(e => ({ value: e.id_empresa, label: `${e.ruc} - ${e.nombre}` })));

    } catch (error) {
      console.error('Error al cargar catálogos:', error);
      setMensaje({ texto: 'Error de conexión al cargar catálogos.', tipo: 'error' });
    }
  };

  const handleChangeTexto = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleChangeMoneda = (e) => {
    const nuevaMoneda = e.target.value;
    setForm({ 
      ...form, 
      moneda: nuevaMoneda,
      tipo_cambio: nuevaMoneda === 'USD' ? '1.00' : ''
    });
  };

  const handleRowClick = (pago) => {
    if (viewMode !== 'LISTA') return;
    if (selectedId === pago.id_pago) {
      setSelectedId(null);
      setForm(estadoInicialForm);
      setInheritedGasto(null);
    } else {
      setSelectedId(pago.id_pago);
      const parentGasto = gastosRaw.find(g => g.id_gasto === pago.id_gasto);
      setInheritedGasto(parentGasto || null);
      setForm({
        id_gasto: pago.id_gasto,
        id_empresa: pago.id_empresa,
        id_banco: pago.id_banco,
        numero_operacion: pago.numero_operacion || '',
        fecha_pago: pago.fecha_pago || '',
        moneda: pago.moneda || 'USD',
        tipo_cambio: pago.tipo_cambio_aplicado || pago.tipo_cambio || '1.00',
        importe: pago.importe || ''
      });
    }
  };

  const handleEliminar = async () => {
    if (!selectedId) return;
    const motivo = window.prompt("Ingrese el motivo de eliminación (Mín. 10 caracteres):");
    if (!motivo || motivo.trim().length < 10) {
      alert("Acción bloqueada: Debe ingresar un motivo válido de al menos 10 caracteres.");
      return;
    }
    try {
      const token = localStorage.getItem("token") || ""; 
      const response = await fetch(`http://127.0.0.1:8000/pagos/${selectedId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ motivo: motivo.trim() })
      });

      if (response.ok) {
        alert("Pago eliminado / Extornado exitosamente.");
        setSelectedId(null);
        setForm(estadoInicialForm);
        setInheritedGasto(null);
        cargarListaPagos();
        cargarCatalogos();
      } else {
        const errorData = await response.json();
        alert(`Error al eliminar: ${errorData.detail || "Error desconocido"}`);
      }
    } catch (error) {
      console.error("Error en la solicitud DELETE:", error);
      alert("Error de conexión al intentar eliminar el registro.");
    }
  };

  const registrarPago = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!form.id_gasto || !form.id_empresa || !form.id_banco || !form.fecha_pago) {
      setMensaje({ texto: '❌ Faltan catálogos obligatorios o fecha de pago.', tipo: 'error' });
      return;
    }
    if (form.moneda === 'PEN' && (!form.tipo_cambio || parseFloat(form.tipo_cambio) <= 0)) {
      setMensaje({ texto: '❌ Para pagos en Soles, el tipo de cambio debe ser mayor a 0.', tipo: 'error' });
      return;
    }
    if (!form.importe || parseFloat(form.importe) <= 0) {
      setMensaje({ texto: '❌ El importe debe ser mayor a 0.', tipo: 'error' });
      return;
    }

    setIsSubmitting(true);
    setMensaje({ texto: 'Procesando pago...', tipo: 'info' });

    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      
      if (viewMode === 'NUEVO') {
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
        setMensaje({ texto: '✅ Pago registrado con éxito.', tipo: 'exito' });
      } else if (viewMode === 'MODIFICAR') {
        // El backend no permite cambiar importe ni moneda en el PUT. Enviamos solo los autorizados.
        const payloadUpdate = {
          numero_operacion: form.numero_operacion || null,
          id_banco: form.id_banco,
          id_empresa: form.id_empresa,
          fecha_pago: form.fecha_pago || null,
          tipo_cambio: parseFloat(form.tipo_cambio)
        };
        await axios.put(`http://127.0.0.1:8000/pagos/${selectedId}`, payloadUpdate, config);
        setMensaje({ texto: '✅ Pago actualizado con éxito.', tipo: 'exito' });
      }

      cargarListaPagos();
      cargarCatalogos();
      setViewMode('LISTA');
      setSelectedId(null);
      setForm(estadoInicialForm);
      setInheritedGasto(null);
      setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);

    } catch (error) {
      console.error(error);
      if (error.response && error.response.data && error.response.data.detail) {
        setMensaje({ texto: `❌ Error: ${error.response.data.detail}`, tipo: 'error' });
      } else {
        setMensaje({ texto: '❌ Error de conexión al registrar el pago.', tipo: 'error' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const isReadOnly = viewMode === 'CONSULTAR';
  const isModifying = viewMode === 'MODIFICAR';
  const gastoSeleccionado = gastosRaw.find(g => g.id_gasto === form.id_gasto);
  
  const importeNum = parseFloat(form.importe) || 0;
  const tcNum = parseFloat(form.tipo_cambio) || 0;
  const amortizacionCalculada = tcNum > 0 ? (form.moneda === 'USD' ? importeNum : importeNum / tcNum).toFixed(2) : '0.00';

  const colorMoneda = form.moneda === 'USD' ? '#27ae60' : '#e67e22';
  const simboloMoneda = form.moneda === 'USD' ? '$' : 'S/';

  // --- ESTILOS ---
  const containerStyle = { padding: '20px', fontFamily: 'Arial, sans-serif' };
  const commandBarStyle = { display: 'flex', gap: '10px', backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '20px', alignItems: 'center' };
  const getBtnStyle = (disabled, baseColor = '#8e44ad') => ({
    padding: '10px 20px',
    backgroundColor: disabled ? '#bdc3c7' : baseColor,
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 'bold',
    transition: 'background-color 0.2s'
  });
  const inputStyle = { width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box', backgroundColor: isReadOnly ? '#f9f9f9' : '#fff', color: '#2c3e50' };
  const labelStyle = { display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px', color: '#34495e' };
  const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '20px' };

  // Estilos react-select
  const selectStyles = {
    control: (base, state) => ({
      ...base,
      backgroundColor: (isReadOnly || isModifying) ? '#f9f9f9' : '#fff',
      borderColor: state.isFocused ? '#3498db' : '#ccc',
      boxShadow: state.isFocused ? '0 0 0 1px #3498db' : null,
      '&:hover': {
        borderColor: '#3498db'
      }
    }),
    singleValue: (base) => ({
      ...base,
      color: '#2c3e50'
    }),
    input: (base) => ({
      ...base,
      color: '#2c3e50'
    }),
    placeholder: (base) => ({
      ...base,
      color: '#95a5a6'
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected 
        ? '#3498db' 
        : state.isFocused 
          ? '#ebdcf9' 
          : '#fff',
      color: state.isSelected ? '#fff' : '#2c3e50',
      '&:active': {
        backgroundColor: '#3498db'
      }
    }),
    menu: (base) => ({
      ...base,
      backgroundColor: '#fff',
      zIndex: 9999
    })
  };

  return (
    <div style={containerStyle}>
      <h2 style={{ color: '#2c3e50', borderBottom: '2px solid #8e44ad', paddingBottom: '10px' }}>Liquidación y Registro de Pagos</h2>

      {/* TOP COMMAND BAR */}
      <div style={commandBarStyle}>
        <button style={getBtnStyle(false, '#2ecc71')} onClick={() => { setViewMode('NUEVO'); setForm(estadoInicialForm); setSelectedId(null); setInheritedGasto(null); }}>➕ NUEVO</button>
        <button style={getBtnStyle(!selectedId, '#f39c12')} disabled={!selectedId} onClick={() => setViewMode('MODIFICAR')}>✏️ MODIFICAR</button>
        <button style={getBtnStyle(!selectedId, '#3498db')} disabled={!selectedId} onClick={() => setViewMode('CONSULTAR')}>👁️ CONSULTAR</button>
        <button style={getBtnStyle(!selectedId, '#e74c3c')} disabled={!selectedId} onClick={handleEliminar}>🗑️ ELIMINAR</button>
        
        {viewMode !== 'LISTA' && (
          <button style={{ ...getBtnStyle(false, '#95a5a6'), marginLeft: 'auto' }} onClick={() => { setViewMode('LISTA'); setSelectedId(null); setForm(estadoInicialForm); setInheritedGasto(null); }}>⬅️ VOLVER A LISTA</button>
        )}
      </div>

      {mensaje.texto && (
        <div style={{ padding: '15px', marginBottom: '20px', borderRadius: '5px', backgroundColor: mensaje.tipo === 'error' ? '#f8d7da' : mensaje.tipo === 'exito' ? '#d4edda' : '#d1ecf1', color: mensaje.tipo === 'error' ? '#721c24' : mensaje.tipo === 'exito' ? '#155724' : '#0c5460', fontWeight: 'bold' }}>
          {mensaje.texto}
        </div>
      )}

      {viewMode === 'LISTA' ? (
        // ======================= VISTA: LISTA =======================
        <div style={{ overflowX: 'auto', backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#ecf0f1', textAlign: 'left' }}>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>ID Pago</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Moneda</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Importe</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Fecha Pago</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>N° Operación</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Gasto Asociado</th>
              </tr>
            </thead>
            <tbody>
              {pagosLista.map(p => (
                <tr 
                  key={p.id_pago} 
                  onClick={() => handleRowClick(p)}
                  style={{ backgroundColor: selectedId === p.id_pago ? '#f5ebfa' : 'white', cursor: 'pointer', borderBottom: '1px solid #eee', transition: 'background-color 0.2s' }}
                >
                  <td style={{ padding: '12px' }}>{p.id_pago}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ fontWeight: 'bold', color: p.moneda === 'USD' ? '#27ae60' : '#e67e22' }}>{p.moneda}</span>
                  </td>
                  <td style={{ padding: '12px', fontWeight: '500' }}>{p.moneda === 'USD' ? '$' : 'S/'} {parseFloat(p.importe).toFixed(2)}</td>
                  <td style={{ padding: '12px' }}>{p.fecha_pago}</td>
                  <td style={{ padding: '12px' }}>{p.numero_operacion || '-'}</td>
                  <td style={{ padding: '12px', fontWeight: 'bold' }}>Gasto #{p.id_gasto}</td>
                </tr>
              ))}
              {pagosLista.length === 0 && (
                <tr><td colSpan="6" style={{ padding: '20px', textAlign: 'center', color: '#7f8c8d' }}>No hay registros disponibles.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        // ======================= VISTA: NUEVO / MODIFICAR / CONSULTAR =======================
        <form onSubmit={registrarPago} style={{ backgroundColor: '#fff', padding: '30px', borderRadius: '8px', border: '1px solid #ddd', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0, color: '#34495e', borderBottom: '1px solid #ecf0f1', paddingBottom: '10px', marginBottom: '20px' }}>
            {viewMode === 'NUEVO' ? '✨ Registrar Nuevo Pago Financiero' : viewMode === 'MODIFICAR' ? '✏️ Modificar Registro de Pago' : '👁️ Consultar Detalles de Pago'}
          </h3>

          {/* FASE A: ENLACE AL GASTO */}
          <div style={{ backgroundColor: '#fdf3fd', padding: '20px', borderRadius: '6px', marginBottom: '25px', borderLeft: '5px solid #8e44ad' }}>
            <h4 style={{ marginTop: 0, color: '#8e44ad', marginBottom: '15px' }}>1. Vincular a Cuenta por Pagar (Gasto Logístico)</h4>
            
            {inheritedGasto ? (
              <div style={{ padding: '12px', backgroundColor: '#f9f0fd', border: '1px solid #d5b8d5', borderRadius: '5px', color: '#68258c' }}>
                <strong>Vínculo Activo (Cuentas por Pagar):</strong>
                <div style={{ marginTop: '5px', fontSize: '15px' }}>
                  📄 Gasto ID: <strong>#{inheritedGasto.id_gasto}</strong> | 
                  Documento: <strong>{inheritedGasto.numero_documento || 'S/N'}</strong> | 
                  Deuda Original: <strong>${parseFloat(inheritedGasto.monto_usd).toFixed(2)} USD</strong>
                </div>
                <span style={{ fontSize: '11px', display: 'block', marginTop: '5px', color: '#7f8c8d' }}>
                  * El Gasto ha sido pre-seleccionado desde el Puente de Acción del Módulo de Gastos.
                </span>
              </div>
            ) : (
              <div style={{ zIndex: 10 }}>
                <label style={labelStyle}>Buscar y Seleccionar Gasto Pendiente *</label>
                <Select
                  options={opcionesGastos}
                  value={opcionesGastos.find(o => o.value === form.id_gasto) || null}
                  onChange={op => {
                    setFormData({ ...form, id_gasto: op ? op.value : null });
                    setForm(prev => ({ ...prev, id_gasto: op ? op.value : null }));
                    const selected = gastosRaw.find(g => g.id_gasto === (op ? op.value : null));
                    setInheritedGasto(selected || null);
                  }}
                  isDisabled={isReadOnly || isModifying}
                  placeholder="Escriba ID o Documento del Gasto..."
                  isClearable
                  styles={selectStyles}
                />
              </div>
            )}

            {gastoSeleccionado && (
              <div style={{ marginTop: '12px', padding: '10px', backgroundColor: '#fff', borderRadius: '5px', border: '1px solid #d5b8d5', fontSize: '13px', color: '#2c3e50' }}>
                <strong>Deuda del Gasto:</strong> Original: <strong style={{ color: '#c0392b' }}>${parseFloat(gastoSeleccionado.monto_usd).toFixed(2)} USD</strong> 
                {' | '}Estado: <strong style={{ color: gastoSeleccionado.estado_pago === 'PENDIENTE' ? '#e67e22' : '#27ae60' }}>{gastoSeleccionado.estado_pago}</strong>
                {' | '}Doc: {gastoSeleccionado.numero_documento || 'S/N'}
              </div>
            )}
          </div>

          {/* FASE B: ORIGEN DE FONDOS */}
          <h4 style={{ color: '#7f8c8d', marginBottom: '15px' }}>2. Origen de los Fondos</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '25px' }}>
            <div style={{ zIndex: 5 }}>
              <label style={labelStyle}>Empresa Pagadora *</label>
              <Select 
                options={opcionesEmpresas} 
                value={opcionesEmpresas.find(op => op.value === form.id_empresa) || null} 
                onChange={(op) => setForm({ ...form, id_empresa: op ? op.value : null })} 
                placeholder="Empresa que emite el pago..." 
                isClearable 
                isDisabled={isReadOnly}
                styles={selectStyles} 
              />
            </div>
            <div style={{ zIndex: 4 }}>
              <label style={labelStyle}>Banco de Origen *</label>
              <Select 
                options={opcionesBancos} 
                value={opcionesBancos.find(op => op.value === form.id_banco) || null} 
                onChange={(op) => setForm({ ...form, id_banco: op ? op.value : null })} 
                placeholder="Selecciona el banco..." 
                isClearable 
                isDisabled={isReadOnly}
                styles={selectStyles} 
              />
            </div>
          </div>

          {/* FASE C: DATOS TRANSACCIONALES */}
          <h4 style={{ color: '#2980b9', marginBottom: '15px' }}>3. Datos de la Transacción</h4>
          <div style={gridStyle}>
            <div>
              <label style={labelStyle}>Fecha de Pago *</label>
              <input 
                type="date" 
                name="fecha_pago" 
                value={form.fecha_pago} 
                onChange={handleChangeTexto} 
                style={inputStyle} 
                disabled={isReadOnly}
              />
            </div>
            <div>
              <label style={labelStyle}>N° Operación (Voucher)</label>
              <input 
                type="text" 
                name="numero_operacion" 
                value={form.numero_operacion} 
                onChange={handleChangeTexto} 
                style={inputStyle} 
                placeholder="Ej: OP-998877" 
                disabled={isReadOnly}
              />
            </div>
            <div>
              <label style={labelStyle}>Moneda del Pago *</label>
              <select 
                name="moneda" 
                value={form.moneda} 
                onChange={handleChangeMoneda} 
                style={{ ...inputStyle, fontWeight: 'bold', color: colorMoneda }}
                disabled={isReadOnly || isModifying}
              >
                <option value="USD">Dólares (USD)</option>
                <option value="PEN">Soles (PEN)</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Tipo de Cambio</label>
              <input 
                type="number" 
                step="0.001" 
                name="tipo_cambio" 
                value={form.tipo_cambio} 
                onChange={handleChangeTexto} 
                disabled={form.moneda === 'USD' || isReadOnly} 
                style={{ ...inputStyle, backgroundColor: form.moneda === 'USD' ? '#f2f2f2' : '#fff' }} 
              />
            </div>
          </div>

          {/* CUADRO DE IMPORTES */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: '#f4f6f7', padding: '20px', borderRadius: '8px', border: `2px solid ${colorMoneda}` }}>
              <div style={{ position: 'relative' }}>
                <label style={{ fontSize: '16px', fontWeight: 'bold', color: colorMoneda }}>Importe a Pagar ({form.moneda}) *</label>
                <span style={{ position: 'absolute', left: '15px', top: '38px', color: '#34495e', fontWeight: 'bold', fontSize: '18px' }}>{simboloMoneda}</span>
                <input 
                  type="number" 
                  step="0.01" 
                  name="importe" 
                  value={form.importe} 
                  onChange={handleChangeTexto} 
                  style={{ width: '100%', padding: '12px 12px 12px 40px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '18px', fontWeight: 'bold', boxSizing: 'border-box', color: '#2c3e50', backgroundColor: (isReadOnly || isModifying) ? '#f2f2f2' : '#fff' }} 
                  placeholder="0.00" 
                  disabled={isReadOnly || isModifying}
                />
              </div>
              <div style={{ marginTop: '10px', textAlign: 'right' }}>
                <span style={{ fontSize: '12px', color: '#7f8c8d' }}>Amortización estimada a la deuda: </span>
                <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#27ae60' }}>$ {amortizacionCalculada} USD</span>
              </div>
              
              {gastoSeleccionado && parseFloat(amortizacionCalculada) > (parseFloat(gastoSeleccionado.monto_usd) + 0.05) && (
                <div style={{ padding: '6px 10px', backgroundColor: '#ffcccc', borderRadius: '4px', fontSize: '12px', color: '#cc0000', fontWeight: 'bold' }}>
                  ⚠️ ALERTA: El importe supera la deuda original permitida. El sistema rechazará sobrepagos en el backend.
                </div>
              )}
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '20px', border: '1px dashed #ccc', borderRadius: '8px', backgroundColor: '#fcfcfc', fontSize: '13px', color: '#7f8c8d' }}>
              <p style={{ margin: '0 0 5px 0' }}><strong>ℹ️ Reglas de Auditoría Aplicadas:</strong></p>
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                <li>No se permite modificar el Importe ni la Moneda de un pago ya emitido.</li>
                <li>Si no provee Tipo de Cambio en Soles, se usará el TC oficial de SUNAT.</li>
                <li>Diferencias menores a $0.05 USD serán liquidadas automáticamente con ajuste ZD.</li>
              </ul>
            </div>
          </div>

          {/* BOTON GUARDAR */}
          {!isReadOnly && (
            <div style={{ marginTop: '30px', textAlign: 'right', borderTop: '1px solid #eee', paddingTop: '20px' }}>
              <button 
                type="submit" 
                disabled={isSubmitting} 
                style={{ 
                  padding: '12px 30px', 
                  backgroundColor: '#8e44ad', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '5px', 
                  fontSize: '16px', 
                  fontWeight: 'bold', 
                  cursor: isSubmitting ? 'not-allowed' : 'pointer', 
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)' 
                }}
              >
                {isSubmitting ? '⏳ PROCESANDO...' : '🏦 APLICAR PAGO Y LIQUIDAR'}
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
};

export default Pagos;
