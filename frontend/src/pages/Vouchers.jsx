import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Select from 'react-select';

const Vouchers = () => {
  // --- ESTADOS DE VISTA Y SELECCIÓN ---
  const [viewMode, setViewMode] = useState('LISTA'); // LISTA, NUEVO, MODIFICAR, CONSULTAR
  const [selectedId, setSelectedId] = useState(null);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  // --- DATOS ---
  const [vouchers, setVouchers] = useState([]);
  const [opcionesBancos, setOpcionesBancos] = useState([]);

  const estadoInicial = {
    banco_id: null,
    numero_operacion: '',
    monto_total: '',
    moneda: 'USD',
    fecha_transferencia: ''
  };

  const [formData, setFormData] = useState(estadoInicial);

  useEffect(() => {
    cargarCatalogos();
    cargarVouchers();
  }, []);

  const cargarCatalogos = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const resBancos = await axios.get('http://127.0.0.1:8000/bancos/', config);
      setOpcionesBancos(resBancos.data.map(b => ({ value: b.id_banco, label: b.nombre })));
    } catch (error) {
      console.error('Error al cargar bancos:', error);
    }
  };

  const cargarVouchers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://127.0.0.1:8000/vouchers/', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setVouchers(data);
      }
    } catch (error) {
      console.error('Error al obtener vouchers:', error);
    }
  };

  const handleRowClick = (voucher) => {
    if (viewMode !== 'LISTA') return;
    if (selectedId === voucher.id_voucher) {
      setSelectedId(null);
      setFormData(estadoInicial);
    } else {
      setSelectedId(voucher.id_voucher);
      setFormData({
        banco_id: voucher.banco_id || null,
        numero_operacion: voucher.numero_operacion || '',
        monto_total: voucher.monto_total || '',
        moneda: voucher.moneda || 'USD',
        fecha_transferencia: voucher.fecha_transferencia || ''
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
      const token = localStorage.getItem('token');
      const response = await fetch(`http://127.0.0.1:8000/vouchers/${selectedId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ motivo: motivo.trim() })
      });
      if (response.ok) {
        alert("Registro eliminado exitosamente.");
        setSelectedId(null);
        setFormData(estadoInicial);
        cargarVouchers();
      } else {
        const errorData = await response.json();
        alert(`Error: ${errorData.detail}`);
      }
    } catch (error) {
      console.error(error);
      alert('Error de conexión al eliminar');
    }
  };

  const handleChangeTexto = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    setMensaje({ texto: 'Guardando...', tipo: 'info' });

    const payload = { ...formData };
    payload.monto_total = parseFloat(payload.monto_total);

    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      
      if (viewMode === 'NUEVO') {
        await axios.post('http://127.0.0.1:8000/vouchers/', payload, config);
        setMensaje({ texto: '✅ Voucher registrado exitosamente.', tipo: 'exito' });
      } else if (viewMode === 'MODIFICAR') {
        // En el futuro, si hay un endpoint PUT para vouchers
        setMensaje({ texto: '❌ La modificación directa de vouchers no está soportada todavía.', tipo: 'error' });
        return;
      }
      
      cargarVouchers();
      setViewMode('LISTA');
      setSelectedId(null);
      setFormData(estadoInicial);
      setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);
    } catch (error) {
      console.error(error);
      setMensaje({ texto: `❌ Error al guardar: ${error.response?.data?.detail || 'Revisa los datos'}`, tipo: 'error' });
    }
  };

  const isReadOnly = viewMode === 'CONSULTAR';

  // --- ESTILOS ---
  const containerStyle = { padding: '20px', fontFamily: 'Arial, sans-serif' };
  const commandBarStyle = { display: 'flex', gap: '10px', backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '20px', alignItems: 'center' };
  const getBtnStyle = (disabled, baseColor = '#3498db') => ({
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

  const selectStyles = {
    control: (base, state) => ({
      ...base,
      backgroundColor: isReadOnly ? '#f9f9f9' : '#fff',
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
      backgroundColor: state.isSelected ? '#3498db' : state.isFocused ? '#e8f4fd' : '#fff',
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
      <h2 style={{ color: '#2c3e50', borderBottom: '2px solid #3498db', paddingBottom: '10px' }}>Vouchers Bancarios</h2>

      {/* TOP COMMAND BAR */}
      <div style={commandBarStyle}>
        <button style={getBtnStyle(false, '#2ecc71')} onClick={() => { setViewMode('NUEVO'); setFormData(estadoInicial); setSelectedId(null); }}>➕ NUEVO</button>
        <button style={getBtnStyle(!selectedId, '#f39c12')} disabled={!selectedId} onClick={() => setViewMode('MODIFICAR')}>✏️ MODIFICAR</button>
        <button style={getBtnStyle(!selectedId, '#3498db')} disabled={!selectedId} onClick={() => setViewMode('CONSULTAR')}>👁️ CONSULTAR</button>
        <button style={getBtnStyle(!selectedId, '#e74c3c')} disabled={!selectedId} onClick={handleEliminar}>🗑️ ELIMINAR</button>
        
        {viewMode !== 'LISTA' && (
          <button style={{ ...getBtnStyle(false, '#95a5a6'), marginLeft: 'auto' }} onClick={() => { setViewMode('LISTA'); setSelectedId(null); setFormData(estadoInicial); }}>⬅️ VOLVER A LISTA</button>
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
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>ID</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Banco</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>N° Operación</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Moneda</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Monto Total</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Saldo Disponible</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Fecha Transferencia</th>
              </tr>
            </thead>
            <tbody>
              {vouchers.map(v => {
                const bancoName = opcionesBancos.find(b => b.value === v.banco_id)?.label || 'Desconocido';
                return (
                  <tr 
                    key={v.id_voucher} 
                    onClick={() => handleRowClick(v)}
                    style={{ backgroundColor: selectedId === v.id_voucher ? '#d6eaf8' : 'white', cursor: 'pointer', borderBottom: '1px solid #eee', transition: 'background-color 0.2s' }}
                  >
                    <td style={{ padding: '12px' }}>{v.id_voucher}</td>
                    <td style={{ padding: '12px', fontWeight: 'bold' }}>{bancoName}</td>
                    <td style={{ padding: '12px' }}>{v.numero_operacion}</td>
                    <td style={{ padding: '12px' }}>
                      <span style={{ fontWeight: 'bold', color: v.moneda === 'USD' ? '#27ae60' : '#e67e22' }}>{v.moneda}</span>
                    </td>
                    <td style={{ padding: '12px' }}>{v.monto_total}</td>
                    <td style={{ padding: '12px', fontWeight: 'bold', backgroundColor: v.saldo_disponible > 0 ? '#e8f8f5' : '#fdedec', color: v.saldo_disponible > 0 ? '#16a085' : '#c0392b' }}>
                      {v.saldo_disponible}
                    </td>
                    <td style={{ padding: '12px' }}>{v.fecha_transferencia}</td>
                  </tr>
                );
              })}
              {vouchers.length === 0 && (
                <tr><td colSpan="7" style={{ padding: '20px', textAlign: 'center', color: '#7f8c8d' }}>No hay registros disponibles.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        // ======================= VISTA: NUEVO / MODIFICAR / CONSULTAR =======================
        <form onSubmit={handleGuardar} style={{ backgroundColor: '#fff', padding: '30px', borderRadius: '8px', border: '1px solid #ddd', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0, color: '#34495e', borderBottom: '1px solid #ecf0f1', paddingBottom: '10px', marginBottom: '20px' }}>
            {viewMode === 'NUEVO' ? '✨ Crear Nuevo Voucher Bancario' : viewMode === 'MODIFICAR' ? '✏️ Modificar Voucher' : '👁️ Consultar Voucher'}
          </h3>

          <div style={gridStyle}>
            <div style={{ zIndex: 5 }}>
              <label style={labelStyle}>Banco *</label>
              <Select 
                options={opcionesBancos} 
                value={opcionesBancos.find(o => o.value === formData.banco_id) || null} 
                onChange={op => setFormData({ ...formData, banco_id: op ? op.value : null })} 
                isDisabled={isReadOnly}
                isClearable 
                placeholder="Seleccione el banco..."
                styles={selectStyles}
              />
            </div>
            <div>
              <label style={labelStyle}>N° Operación *</label>
              <input type="text" name="numero_operacion" value={formData.numero_operacion} onChange={handleChangeTexto} required disabled={isReadOnly} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Monto Total *</label>
              <input type="number" step="0.01" name="monto_total" value={formData.monto_total} onChange={handleChangeTexto} required disabled={isReadOnly} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Moneda *</label>
              <select name="moneda" value={formData.moneda} onChange={handleChangeTexto} disabled={isReadOnly} style={{ ...inputStyle, fontWeight: 'bold', color: formData.moneda === 'USD' ? '#27ae60' : '#e67e22' }}>
                <option value="USD">USD</option>
                <option value="PEN">PEN</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Fecha de Transferencia *</label>
              <input type="date" name="fecha_transferencia" value={formData.fecha_transferencia} onChange={handleChangeTexto} required disabled={isReadOnly} style={inputStyle} />
            </div>
          </div>

          {/* BOTON GUARDAR */}
          {!isReadOnly && (
            <div style={{ marginTop: '30px', textAlign: 'right', borderTop: '1px solid #eee', paddingTop: '20px' }}>
              <button type="submit" style={{ padding: '12px 30px', backgroundColor: '#27ae60', color: 'white', border: 'none', borderRadius: '5px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                💾 GUARDAR
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
};

export default Vouchers;
