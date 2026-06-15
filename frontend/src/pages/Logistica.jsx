import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Select from 'react-select';

const Logistica = () => {
  const navigate = useNavigate();
  // --- ESTADOS DE VISTA Y SELECCIÓN ---
  const [viewMode, setViewMode] = useState('LISTA'); // LISTA, NUEVO, MODIFICAR, CONSULTAR
  const [selectedId, setSelectedId] = useState(null);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  // --- DATOS ---
  const [maestros, setMaestros] = useState([]);
  const [opcionesImportadores, setOpcionesImportadores] = useState([]);
  const [opcionesAgentes, setOpcionesAgentes] = useState([]);
  const [opcionesProveedores, setOpcionesProveedores] = useState([]);
  const [opcionesAlmacenes, setOpcionesAlmacenes] = useState([]);

  const estadoInicial = {
    numero_factura: '',
    n_cont_fisico: '',
    id_agente: null,
    id_importador: null,
    id_proveedor: null,
    documento_transporte: '',
    fecha_embarque: '',
    fecha_arribo: '',
    status_llegada: 'EN TRÁNSITO',
    estado_levante: 'SIN LEVANTE',
    id_almacen: null,
    fob_usd: '',
    flete_usd: '',
    venta_sucesiva: '',
    tipo_valor: 'DEFINITIVO'
  };

  const [formData, setFormData] = useState(estadoInicial);

  useEffect(() => {
    cargarCatalogos();
    cargarMaestros();
  }, []);

  const cargarCatalogos = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const [resImp, resAg, resProv, resAlm] = await Promise.all([
        axios.get('http://127.0.0.1:8000/importadores/', config),
        axios.get('http://127.0.0.1:8000/agentes/', config),
        axios.get('http://127.0.0.1:8000/proveedores/', config),
        axios.get('http://127.0.0.1:8000/almacenes/', config)
      ]);
      setOpcionesImportadores(resImp.data.map(i => ({ value: i.id_importador, label: `${i.ruc} - ${i.nombre}` })));
      setOpcionesAgentes(resAg.data.map(a => ({ value: a.id_agente, label: a.nombre })));
      setOpcionesProveedores(resProv.data.map(p => ({ value: p.id_proveedor, label: `${p.ruc} - ${p.nombre}` })));
      setOpcionesAlmacenes(resAlm.data.map(a => ({ value: a.id_almacen, label: a.nombre })));
    } catch (error) {
      console.error('Error al cargar catálogos:', error);
    }
  };

  const cargarMaestros = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://127.0.0.1:8000/maestros/', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setMaestros(data);
      }
    } catch (error) {
      console.error('Error al obtener maestros:', error);
    }
  };

  const handleRowClick = (maestro) => {
    if (viewMode !== 'LISTA') return;
    if (selectedId === maestro.id_maestro) {
      setSelectedId(null);
      setFormData(estadoInicial);
    } else {
      setSelectedId(maestro.id_maestro);
      setFormData({
        numero_factura: maestro.numero_factura || '',
        n_cont_fisico: maestro.n_cont_fisico || '',
        id_agente: maestro.id_agente || null,
        id_importador: maestro.id_importador || null,
        id_proveedor: maestro.id_proveedor || null,
        documento_transporte: maestro.documento_transporte || '',
        fecha_embarque: maestro.fecha_embarque || '',
        fecha_arribo: maestro.fecha_arribo || '',
        status_llegada: maestro.status_llegada || 'EN TRÁNSITO',
        estado_levante: maestro.estado_levante || 'SIN LEVANTE',
        id_almacen: maestro.id_almacen || null,
        fob_usd: maestro.fob_usd || '',
        flete_usd: maestro.flete_usd || '',
        venta_sucesiva: maestro.venta_sucesiva || '',
        tipo_valor: maestro.tipo_valor || 'DEFINITIVO'
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
      const response = await fetch(`http://127.0.0.1:8000/maestros/${selectedId}`, {
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
        cargarMaestros();
      } else {
        const errorData = await response.json();
        alert(`Error: ${errorData.detail}`);
      }
    } catch (error) {
      console.error(error);
      alert('Error de conexión al eliminar');
    }
  };

  const handleRegistrarDam = () => {
    const selectedMaestro = maestros.find(m => m.id_maestro === selectedId);
    if (selectedMaestro) {
      navigate('/app/dams', { state: { fromMaestro: selectedMaestro } });
    }
  };

  const handleChangeTexto = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    setMensaje({ texto: 'Guardando...', tipo: 'info' });

    const payload = { ...formData };
    payload.fob_usd = payload.fob_usd ? parseFloat(payload.fob_usd) : null;
    payload.flete_usd = payload.flete_usd ? parseFloat(payload.flete_usd) : null;
    payload.fecha_embarque = payload.fecha_embarque || null;
    payload.fecha_arribo = payload.fecha_arribo || null;
    payload.n_cont_fisico = payload.n_cont_fisico || null;
    payload.documento_transporte = payload.documento_transporte || null;
    payload.venta_sucesiva = payload.venta_sucesiva || null;

    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      
      if (viewMode === 'NUEVO') {
        await axios.post('http://127.0.0.1:8000/maestros/', payload, config);
        setMensaje({ texto: '✅ Maestro registrado exitosamente.', tipo: 'exito' });
      } else if (viewMode === 'MODIFICAR') {
        await axios.put(`http://127.0.0.1:8000/maestros/${selectedId}`, payload, config);
        setMensaje({ texto: '✅ Maestro actualizado exitosamente.', tipo: 'exito' });
      }
      
      cargarMaestros();
      setViewMode('LISTA');
      setSelectedId(null);
      setFormData(estadoInicial);
      setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);
    } catch (error) {
      console.error(error);
      setMensaje({ texto: `❌ Error al guardar: ${error.response?.data?.detail || 'Revisa los datos'}`, tipo: 'error' });
    }
  };

  const cfrCalculado = (parseFloat(formData.fob_usd || 0) + parseFloat(formData.flete_usd || 0)).toFixed(2);
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

  // Estilos personalizados para react-select para asegurar legibilidad (texto oscuro sobre fondo blanco)
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
      <h2 style={{ color: '#2c3e50', borderBottom: '2px solid #3498db', paddingBottom: '10px' }}>Logística y Maestros de Importación</h2>

      {/* TOP COMMAND BAR */}
      <div style={commandBarStyle}>
        <button style={getBtnStyle(false, '#2ecc71')} onClick={() => { setViewMode('NUEVO'); setFormData(estadoInicial); setSelectedId(null); }}>➕ NUEVO</button>
        <button style={getBtnStyle(!selectedId, '#f39c12')} disabled={!selectedId} onClick={() => setViewMode('MODIFICAR')}>✏️ MODIFICAR</button>
        <button style={getBtnStyle(!selectedId, '#3498db')} disabled={!selectedId} onClick={() => setViewMode('CONSULTAR')}>👁️ CONSULTAR</button>
        <button style={getBtnStyle(!selectedId, '#e74c3c')} disabled={!selectedId} onClick={handleEliminar}>🗑️ ELIMINAR</button>
        <button style={getBtnStyle(!selectedId, '#9b59b6')} disabled={!selectedId} onClick={handleRegistrarDam}>📑 REGISTRAR DAM</button>
        
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
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Factura</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Doc. Transporte</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>FOB (USD)</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Flete (USD)</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Llegada</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Levante</th>
              </tr>
            </thead>
            <tbody>
              {maestros.map(m => (
                <tr 
                  key={m.id_maestro} 
                  onClick={() => handleRowClick(m)}
                  style={{ backgroundColor: selectedId === m.id_maestro ? '#d6eaf8' : 'white', cursor: 'pointer', borderBottom: '1px solid #eee', transition: 'background-color 0.2s' }}
                >
                  <td style={{ padding: '12px' }}>{m.id_maestro}</td>
                  <td style={{ padding: '12px', fontWeight: 'bold' }}>{m.numero_factura}</td>
                  <td style={{ padding: '12px' }}>{m.documento_transporte || '-'}</td>
                  <td style={{ padding: '12px' }}>${m.fob_usd || '0.00'}</td>
                  <td style={{ padding: '12px' }}>${m.flete_usd || '0.00'}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ backgroundColor: '#f1c40f', padding: '3px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>{m.status_llegada}</span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ backgroundColor: m.estado_levante === 'CON LEVANTE' ? '#2ecc71' : '#e74c3c', color: 'white', padding: '3px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>{m.estado_levante}</span>
                  </td>
                </tr>
              ))}
              {maestros.length === 0 && (
                <tr><td colSpan="7" style={{ padding: '20px', textAlign: 'center', color: '#7f8c8d' }}>No hay registros disponibles.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        // ======================= VISTA: NUEVO / MODIFICAR / CONSULTAR =======================
        <form onSubmit={handleGuardar} style={{ backgroundColor: '#fff', padding: '30px', borderRadius: '8px', border: '1px solid #ddd', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0, color: '#34495e', borderBottom: '1px solid #ecf0f1', paddingBottom: '10px', marginBottom: '20px' }}>
            {viewMode === 'NUEVO' ? '✨ Crear Nueva Cabecera de Importación' : viewMode === 'MODIFICAR' ? '✏️ Modificar Cabecera de Importación' : '👁️ Consultar Detalles de Importación'}
          </h3>

          {/* SECCIÓN 1: IDENTIFICACIÓN */}
          <h4 style={{ color: '#2980b9' }}>1. Identificación y Documentos</h4>
          <div style={gridStyle}>
            <div>
              <label style={labelStyle}>N° Factura *</label>
              <input type="text" name="numero_factura" value={formData.numero_factura} onChange={handleChangeTexto} required disabled={isReadOnly} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Documento Transporte (BL/AWB)</label>
              <input type="text" name="documento_transporte" value={formData.documento_transporte} onChange={handleChangeTexto} disabled={isReadOnly} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>N° Contenedor Físico</label>
              <input type="text" name="n_cont_fisico" value={formData.n_cont_fisico} onChange={handleChangeTexto} disabled={isReadOnly} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Venta Sucesiva</label>
              <input type="text" name="venta_sucesiva" value={formData.venta_sucesiva} onChange={handleChangeTexto} disabled={isReadOnly} style={inputStyle} placeholder="Opcional" />
            </div>
          </div>

          {/* SECCIÓN 2: VALORES Y FECHAS */}
          <h4 style={{ color: '#2980b9' }}>2. Valores y Tiempos</h4>
          <div style={gridStyle}>
            <div>
              <label style={labelStyle}>FOB (USD)</label>
              <input type="number" step="0.01" name="fob_usd" value={formData.fob_usd} onChange={handleChangeTexto} disabled={isReadOnly} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Flete (USD)</label>
              <input type="number" step="0.01" name="flete_usd" value={formData.flete_usd} onChange={handleChangeTexto} disabled={isReadOnly} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>CFR Total (Calculado)</label>
              <input type="text" value={cfrCalculado} disabled style={{ ...inputStyle, backgroundColor: '#e8f8f5', color: '#16a085', fontWeight: 'bold' }} />
            </div>
            <div>
              <label style={labelStyle}>Tipo Valor</label>
              <select name="tipo_valor" value={formData.tipo_valor} onChange={handleChangeTexto} disabled={isReadOnly} style={inputStyle}>
                <option value="DEFINITIVO">DEFINITIVO</option>
                <option value="PROVISIONAL">PROVISIONAL</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Fecha Embarque</label>
              <input type="date" name="fecha_embarque" value={formData.fecha_embarque} onChange={handleChangeTexto} disabled={isReadOnly} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Fecha Arribo</label>
              <input type="date" name="fecha_arribo" value={formData.fecha_arribo} onChange={handleChangeTexto} disabled={isReadOnly} style={inputStyle} />
            </div>
          </div>

          {/* SECCIÓN 3: STATUS OPERATIVO */}
          <h4 style={{ color: '#2980b9' }}>3. Estatus Operativo</h4>
          <div style={gridStyle}>
            <div>
              <label style={labelStyle}>Status de Llegada</label>
              <select name="status_llegada" value={formData.status_llegada} onChange={handleChangeTexto} disabled={isReadOnly} style={inputStyle}>
                <option value="EN TRÁNSITO">EN TRÁNSITO</option>
                <option value="EN PUERTO">EN PUERTO</option>
                <option value="EN ALMACÉN">EN ALMACÉN</option>
                <option value="ENTREGADO">ENTREGADO</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Estado Levante</label>
              <select name="estado_levante" value={formData.estado_levante} onChange={handleChangeTexto} disabled={isReadOnly} style={inputStyle}>
                <option value="SIN LEVANTE">SIN LEVANTE</option>
                <option value="CON LEVANTE">CON LEVANTE</option>
              </select>
            </div>
          </div>

          {/* SECCIÓN 4: ACTORES (SELECTS) */}
          <h4 style={{ color: '#2980b9' }}>4. Actores Involucrados</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div style={{ zIndex: 4 }}>
              <label style={labelStyle}>Proveedor (Shipper)</label>
              <Select 
                options={opcionesProveedores} 
                value={opcionesProveedores.find(o => o.value === formData.id_proveedor) || null} 
                onChange={op => setFormData({ ...formData, id_proveedor: op ? op.value : null })} 
                isDisabled={isReadOnly}
                isClearable 
                placeholder="Seleccione..."
                styles={selectStyles}
              />
            </div>
            <div style={{ zIndex: 3 }}>
              <label style={labelStyle}>Importador (Facturado a)</label>
              <Select 
                options={opcionesImportadores} 
                value={opcionesImportadores.find(o => o.value === formData.id_importador) || null} 
                onChange={op => setFormData({ ...formData, id_importador: op ? op.value : null })} 
                isDisabled={isReadOnly}
                isClearable 
                placeholder="Seleccione..."
                styles={selectStyles}
              />
            </div>
            <div style={{ zIndex: 2 }}>
              <label style={labelStyle}>Agente de Aduanas</label>
              <Select 
                options={opcionesAgentes} 
                value={opcionesAgentes.find(o => o.value === formData.id_agente) || null} 
                onChange={op => setFormData({ ...formData, id_agente: op ? op.value : null })} 
                isDisabled={isReadOnly}
                isClearable 
                placeholder="Seleccione..."
                styles={selectStyles}
              />
            </div>
            <div style={{ zIndex: 1 }}>
              <label style={labelStyle}>Almacén Destino</label>
              <Select 
                options={opcionesAlmacenes} 
                value={opcionesAlmacenes.find(o => o.value === formData.id_almacen) || null} 
                onChange={op => setFormData({ ...formData, id_almacen: op ? op.value : null })} 
                isDisabled={isReadOnly}
                isClearable 
                placeholder="Seleccione (Opcional)..."
                styles={selectStyles}
              />
            </div>
          </div>

          {/* BOTON GUARDAR */}
          {!isReadOnly && (
            <div style={{ marginTop: '30px', textAlign: 'right', borderTop: '1px solid #eee', paddingTop: '20px' }}>
              <button type="submit" style={{ padding: '12px 30px', backgroundColor: '#27ae60', color: 'white', border: 'none', borderRadius: '5px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                💾 GUARDAR / ACTUALIZAR
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
};

export default Logistica;
