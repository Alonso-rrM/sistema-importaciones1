import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Select from 'react-select';

const Dams = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // --- ESTADOS DE VISTA Y SELECCIÓN ---
  const [viewMode, setViewMode] = useState('LISTA'); // LISTA, NUEVO, MODIFICAR, CONSULTAR
  const [selectedId, setSelectedId] = useState(null);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  // --- DATOS ---
  const [dams, setDams] = useState([]);
  const [maestros, setMaestros] = useState([]);
  const [opcionesMaestros, setOpcionesMaestros] = useState([]);
  const [inheritedMaestro, setInheritedMaestro] = useState(null);

  const estadoInicial = {
    id_maestro: null,
    numero_de_dam: '',
    serie: '',
    canal_control: 'VERDE',
    monto_valor_provisional_usd: '',
    aforo_realizado: false
  };

  const [formData, setFormData] = useState(estadoInicial);

  useEffect(() => {
    cargarMaestros();
    cargarDams();
  }, []);

  // Escuchar si viene heredado desde Logística
  useEffect(() => {
    if (location.state && location.state.fromMaestro) {
      const fromMaestro = location.state.fromMaestro;
      setInheritedMaestro(fromMaestro);
      setFormData({
        ...estadoInicial,
        id_maestro: fromMaestro.id_maestro
      });
      setViewMode('NUEVO');
      setSelectedId(null);
      
      // Limpiar el estado de navegación para evitar que al refrescar se fuerce de nuevo
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const cargarMaestros = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const response = await axios.get('http://127.0.0.1:8000/maestros/', config);
      setMaestros(response.data);
      setOpcionesMaestros(response.data.map(m => ({
        value: m.id_maestro,
        label: `Factura: ${m.numero_factura} - Contenedor: ${m.n_cont_fisico || 'N/A'} (${m.tipo_valor})`
      })));
    } catch (error) {
      console.error('Error al cargar maestros:', error);
    }
  };

  const cargarDams = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://127.0.0.1:8000/dams/', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setDams(data);
      }
    } catch (error) {
      console.error('Error al obtener DAMs:', error);
    }
  };

  const handleRowClick = (dam) => {
    if (viewMode !== 'LISTA') return;
    if (selectedId === dam.id_dam) {
      setSelectedId(null);
      setFormData(estadoInicial);
      setInheritedMaestro(null);
    } else {
      setSelectedId(dam.id_dam);
      const parentMaestro = maestros.find(m => m.id_maestro === dam.id_maestro);
      setInheritedMaestro(parentMaestro || null);
      setFormData({
        id_maestro: dam.id_maestro,
        numero_de_dam: dam.numero_de_dam || '',
        serie: dam.serie || '',
        canal_control: dam.canal_control || 'VERDE',
        monto_valor_provisional_usd: dam.monto_valor_provisional_usd || '',
        aforo_realizado: dam.aforo_realizado || false
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
      const response = await fetch(`http://127.0.0.1:8000/dams/${selectedId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ motivo: motivo.trim() })
      });
      if (response.ok) {
        alert("DAM eliminada exitosamente.");
        setSelectedId(null);
        setFormData(estadoInicial);
        setInheritedMaestro(null);
        cargarDams();
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
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setFormData({ ...formData, [e.target.name]: val });
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    setMensaje({ texto: 'Guardando...', tipo: 'info' });

    if (!formData.id_maestro) {
      setMensaje({ texto: '❌ Debe vincular la DAM a un Maestro de Importación.', tipo: 'error' });
      return;
    }

    const parentMaestro = maestros.find(m => m.id_maestro === formData.id_maestro);
    const isProvisional = parentMaestro?.tipo_valor === 'PROVISIONAL';

    // Validación cliente de regla provisional
    if (isProvisional && (!formData.monto_valor_provisional_usd || parseFloat(formData.monto_valor_provisional_usd) <= 0)) {
      setMensaje({ 
        texto: '❌ Operación rechazada. Al ser un Maestro PROVISIONAL, el Monto Provisional es obligatorio y mayor a 0 USD.', 
        tipo: 'error' 
      });
      return;
    }

    const payload = { ...formData };
    payload.monto_valor_provisional_usd = payload.monto_valor_provisional_usd ? parseFloat(payload.monto_valor_provisional_usd) : null;
    payload.serie = payload.serie || null;
    payload.canal_control = payload.canal_control || null;

    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      
      if (viewMode === 'NUEVO') {
        await axios.post('http://127.0.0.1:8000/dams/', payload, config);
        setMensaje({ texto: '✅ DAM registrada exitosamente.', tipo: 'exito' });
      } else if (viewMode === 'MODIFICAR') {
        await axios.put(`http://127.0.0.1:8000/dams/${selectedId}`, payload, config);
        setMensaje({ texto: '✅ DAM actualizada exitosamente.', tipo: 'exito' });
      }
      
      cargarDams();
      setViewMode('LISTA');
      setSelectedId(null);
      setFormData(estadoInicial);
      setInheritedMaestro(null);
      setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);
    } catch (error) {
      console.error(error);
      setMensaje({ texto: `❌ Error al guardar: ${error.response?.data?.detail || 'Revisa los datos'}`, tipo: 'error' });
    }
  };

  const isReadOnly = viewMode === 'CONSULTAR';
  const selectedParentMaestro = maestros.find(m => m.id_maestro === formData.id_maestro);
  const isParentProvisional = selectedParentMaestro?.tipo_valor === 'PROVISIONAL';

  // --- ESTILOS ---
  const containerStyle = { padding: '20px', fontFamily: 'Arial, sans-serif' };
  const commandBarStyle = { display: 'flex', gap: '10px', backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '20px', alignItems: 'center' };
  const getBtnStyle = (disabled, baseColor = '#9b59b6') => ({
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
      backgroundColor: state.isSelected 
        ? '#3498db' 
        : state.isFocused 
          ? '#e8f4fd' 
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
      <h2 style={{ color: '#2c3e50', borderBottom: '2px solid #9b59b6', paddingBottom: '10px' }}>Declaraciones de Importación (DAMs)</h2>

      {/* TOP COMMAND BAR */}
      <div style={commandBarStyle}>
        <button style={getBtnStyle(false, '#2ecc71')} onClick={() => { setViewMode('NUEVO'); setFormData(estadoInicial); setSelectedId(null); setInheritedMaestro(null); }}>➕ NUEVO</button>
        <button style={getBtnStyle(!selectedId, '#f39c12')} disabled={!selectedId} onClick={() => setViewMode('MODIFICAR')}>✏️ MODIFICAR</button>
        <button style={getBtnStyle(!selectedId, '#3498db')} disabled={!selectedId} onClick={() => setViewMode('CONSULTAR')}>👁️ CONSULTAR</button>
        <button style={getBtnStyle(!selectedId, '#e74c3c')} disabled={!selectedId} onClick={handleEliminar}>🗑️ ELIMINAR</button>
        
        {viewMode !== 'LISTA' && (
          <button style={{ ...getBtnStyle(false, '#95a5a6'), marginLeft: 'auto' }} onClick={() => { setViewMode('LISTA'); setSelectedId(null); setFormData(estadoInicial); setInheritedMaestro(null); }}>⬅️ VOLVER A LISTA</button>
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
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>ID DAM</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Nº DAM</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Serie</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Canal de Control</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Monto Provisional (USD)</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Aforo Realizado</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Factura Relacionada</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Contenedor</th>
              </tr>
            </thead>
            <tbody>
              {dams.map(d => {
                const parent = maestros.find(m => m.id_maestro === d.id_maestro);
                return (
                  <tr 
                    key={d.id_dam} 
                    onClick={() => handleRowClick(d)}
                    style={{ backgroundColor: selectedId === d.id_dam ? '#ebdcf2' : 'white', cursor: 'pointer', borderBottom: '1px solid #eee', transition: 'background-color 0.2s' }}
                  >
                    <td style={{ padding: '12px' }}>{d.id_dam}</td>
                    <td style={{ padding: '12px', fontWeight: 'bold' }}>{d.numero_de_dam}</td>
                    <td style={{ padding: '12px' }}>{d.serie || '-'}</td>
                    <td style={{ padding: '12px' }}>
                      <span style={{ 
                        backgroundColor: d.canal_control === 'VERDE' ? '#2ecc71' : d.canal_control === 'NARANJA' ? '#e67e22' : d.canal_control === 'ROJO' ? '#e74c3c' : '#bdc3c7', 
                        color: 'white', 
                        padding: '3px 8px', 
                        borderRadius: '4px', 
                        fontSize: '12px', 
                        fontWeight: 'bold' 
                      }}>
                        {d.canal_control || 'SIN CANAL'}
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      {d.monto_valor_provisional_usd ? `$${parseFloat(d.monto_valor_provisional_usd).toFixed(2)}` : '-'}
                    </td>
                    <td style={{ padding: '12px' }}>{d.aforo_realizado ? '✅ SÍ' : '❌ NO'}</td>
                    <td style={{ padding: '12px', fontWeight: '500' }}>{parent ? parent.numero_factura : `ID: ${d.id_maestro}`}</td>
                    <td style={{ padding: '12px' }}>{parent?.n_cont_fisico || '-'}</td>
                  </tr>
                );
              })}
              {dams.length === 0 && (
                <tr><td colSpan="8" style={{ padding: '20px', textAlign: 'center', color: '#7f8c8d' }}>No hay registros disponibles.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        // ======================= VISTA: NUEVO / MODIFICAR / CONSULTAR =======================
        <form onSubmit={handleGuardar} style={{ backgroundColor: '#fff', padding: '30px', borderRadius: '8px', border: '1px solid #ddd', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0, color: '#34495e', borderBottom: '1px solid #ecf0f1', paddingBottom: '10px', marginBottom: '20px' }}>
            {viewMode === 'NUEVO' ? '✨ Crear Nueva Declaración DAM' : viewMode === 'MODIFICAR' ? '✏️ Modificar Declaración DAM' : '👁️ Consultar Detalles de DAM'}
          </h3>

          {/* VINCULACIÓN A MAESTRO */}
          <div style={{ backgroundColor: '#f0f3f4', padding: '20px', borderRadius: '6px', marginBottom: '25px', borderLeft: '5px solid #9b59b6' }}>
            <h4 style={{ marginTop: 0, color: '#8e44ad', marginBottom: '15px' }}>1. Vincular a Operación de Embarque (Maestro)</h4>
            
            {inheritedMaestro ? (
              <div style={{ padding: '12px', backgroundColor: '#eef6fc', border: '1px solid #bce0fd', borderRadius: '5px', color: '#1d5e8f' }}>
                <strong>Vínculo Activo (Logística):</strong>
                <div style={{ marginTop: '5px', fontSize: '15px' }}>
                  📄 Factura: <strong>{inheritedMaestro.numero_factura}</strong> | 
                  📦 Contenedor: <strong>{inheritedMaestro.n_cont_fisico || 'N/A'}</strong> | 
                  💰 Valoración: <strong>{inheritedMaestro.tipo_valor}</strong>
                </div>
                <span style={{ fontSize: '11px', display: 'block', marginTop: '5px', color: '#7f8c8d' }}>
                  * El Maestro se ha importado desde la pantalla de Logística.
                </span>
              </div>
            ) : (
              <div style={{ zIndex: 10 }}>
                <label style={labelStyle}>Buscar y Seleccionar Factura o Contenedor *</label>
                <Select
                  options={opcionesMaestros}
                  value={opcionesMaestros.find(o => o.value === formData.id_maestro) || null}
                  onChange={op => {
                    setFormData({ ...formData, id_maestro: op ? op.value : null });
                    const selected = maestros.find(m => m.id_maestro === (op ? op.value : null));
                    setInheritedMaestro(selected || null);
                  }}
                  isDisabled={isReadOnly}
                  placeholder="Escriba factura o cont para filtrar..."
                  isClearable
                  styles={selectStyles}
                />
              </div>
            )}

            {isParentProvisional && (
              <div style={{ marginTop: '15px', padding: '12px', backgroundColor: '#fef9e7', border: '1px solid #f9e79f', borderRadius: '5px', color: '#7d6608', fontWeight: 'bold', fontSize: '13px' }}>
                ⚠️ El Maestro asociado es de Tipo Valor "PROVISIONAL". 
                El campo "Monto Valor Provisional" es OBLIGATORIO y debe ser mayor a $0 USD.
              </div>
            )}
          </div>

          {/* DATOS DE LA DECLARACIÓN */}
          <h4 style={{ color: '#2980b9', marginBottom: '15px' }}>2. Detalles de la DAM</h4>
          <div style={gridStyle}>
            <div>
              <label style={labelStyle}>N° de DAM *</label>
              <input 
                type="text" 
                name="numero_de_dam" 
                value={formData.numero_de_dam} 
                onChange={handleChangeTexto} 
                required 
                disabled={isReadOnly} 
                style={inputStyle} 
                placeholder="Ej: 118-2026-10-123456"
              />
            </div>
            <div>
              <label style={labelStyle}>Serie</label>
              <input 
                type="text" 
                name="serie" 
                value={formData.serie} 
                onChange={handleChangeTexto} 
                disabled={isReadOnly} 
                style={inputStyle} 
                placeholder="Ej: 1"
              />
            </div>
            <div>
              <label style={labelStyle}>Canal de Control</label>
              <select 
                name="canal_control" 
                value={formData.canal_control} 
                onChange={handleChangeTexto} 
                disabled={isReadOnly} 
                style={inputStyle}
              >
                <option value="VERDE">VERDE</option>
                <option value="NARANJA">NARANJA</option>
                <option value="ROJO">ROJO</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Monto Valor Provisional (USD) {isParentProvisional && '*'}</label>
              <input 
                type="number" 
                step="0.01" 
                name="monto_valor_provisional_usd" 
                value={formData.monto_valor_provisional_usd} 
                onChange={handleChangeTexto} 
                disabled={isReadOnly} 
                style={inputStyle} 
                placeholder="0.00"
              />
            </div>
          </div>

          {/* CONTROL DE CANAL ROJO */}
          {formData.canal_control === 'ROJO' && (
            <div style={{ backgroundColor: '#fdf2f2', padding: '15px', borderRadius: '5px', marginBottom: '20px', borderLeft: '4px solid #e74c3c' }}>
              <h5 style={{ margin: '0 0 8px 0', color: '#e74c3c' }}>Aforo Físico Obligatorio (Canal Rojo)</h5>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input 
                  type="checkbox" 
                  id="aforo_realizado" 
                  name="aforo_realizado" 
                  checked={formData.aforo_realizado} 
                  onChange={handleChangeTexto} 
                  disabled={isReadOnly}
                  style={{ width: '20px', height: '20px', cursor: isReadOnly ? 'not-allowed' : 'pointer' }}
                />
                <label htmlFor="aforo_realizado" style={{ fontSize: '14px', fontWeight: 'bold', color: '#7f241c', cursor: isReadOnly ? 'not-allowed' : 'pointer' }}>
                  ¿Se ha completado el Aforo Físico reglamentario?
                </label>
              </div>
              <p style={{ margin: '5px 0 0 30px', fontSize: '12px', color: '#c0392b' }}>
                * Nota: Si el embarque es DEFINITIVO, el aforo físico debe ser marcado como realizado antes de poder autorizar el levante.
              </p>
            </div>
          )}

          {/* BOTON GUARDAR */}
          {!isReadOnly && (
            <div style={{ marginTop: '30px', textAlign: 'right', borderTop: '1px solid #eee', paddingTop: '20px' }}>
              <button 
                type="submit" 
                style={{ 
                  padding: '12px 30px', 
                  backgroundColor: '#27ae60', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '5px', 
                  fontSize: '16px', 
                  fontWeight: 'bold', 
                  cursor: 'pointer', 
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)' 
                }}
              >
                💾 GUARDAR / ACTUALIZAR DAM
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
};

export default Dams;
