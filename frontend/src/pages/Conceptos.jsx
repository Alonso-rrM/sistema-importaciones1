import React, { useState, useEffect } from 'react';
import axios from 'axios';

const Conceptos = () => {
  // --- ESTADOS DE VISTA Y SELECCIÓN ---
  const [viewMode, setViewMode] = useState('LISTA'); // LISTA, NUEVO, MODIFICAR, CONSULTAR
  const [selectedId, setSelectedId] = useState(null);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });
  const [busqueda, setBusqueda] = useState('');
  const [mostrarInactivos, setMostrarInactivos] = useState(false);

  // --- DATOS ---
  const [conceptos, setConceptos] = useState([]);

  const estadoInicial = {
    nombre: '',
    descripcion: ''
  };
  const [formData, setFormData] = useState(estadoInicial);

  // --- CARGA INICIAL ---
  useEffect(() => {
    cargarConceptos();
  }, [mostrarInactivos]);

  const cargarConceptos = async () => {
    try {
      const token = localStorage.getItem('token');
      const respuesta = await axios.get(`http://127.0.0.1:8000/conceptos/?mostrar_inactivos=${mostrarInactivos}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setConceptos(respuesta.data);
    } catch (error) {
      console.error('Error al cargar:', error);
      setMensaje({ texto: 'No se pudo conectar con la base de datos.', tipo: 'error' });
    }
  };

  // --- MANEJO DE SELECCIÓN ---
  const handleRowClick = (concepto) => {
    if (selectedId === concepto.id_concepto) {
      setSelectedId(null);
      setFormData(estadoInicial);
    } else {
      setSelectedId(concepto.id_concepto);
      setFormData({
        nombre: concepto.nombre || '',
        descripcion: concepto.descripcion || ''
      });
    }
  };

  // --- GUARDAR ---
  const handleGuardar = async (e) => {
    e.preventDefault();
    setMensaje({ texto: 'Guardando...', tipo: 'info' });

    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      
      const payload = {
        nombre: formData.nombre,
        descripcion: formData.descripcion || null
      };

      if (viewMode === 'NUEVO') {
        await axios.post('http://127.0.0.1:8000/conceptos/', payload, config);
        setMensaje({ texto: '✅ Concepto de gasto registrado exitosamente.', tipo: 'exito' });
      } else if (viewMode === 'MODIFICAR') {
        await axios.put(`http://127.0.0.1:8000/conceptos/${selectedId}`, payload, config);
        setMensaje({ texto: '✅ Concepto actualizado exitosamente.', tipo: 'exito' });
      }

      cargarConceptos();
      setViewMode('LISTA');
      setSelectedId(null);
      setFormData(estadoInicial);
      setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);
    } catch (error) {
      console.error('Error al guardar:', error);
      const errorMsg = error.response?.data?.detail || 'Revisa que no esté duplicado.';
      setMensaje({ texto: `❌ Error al guardar: ${errorMsg}`, tipo: 'error' });
    }
  };

  // --- ELIMINAR (LÓGICO) ---
  const handleEliminar = async () => {
    const conceptoSeleccionado = conceptos.find(c => c.id_concepto === selectedId);
    if (!conceptoSeleccionado) return;

    const confirmar = window.confirm(`¿Estás seguro de desactivar el concepto "${conceptoSeleccionado.nombre}"?\nEsta acción lo marcará como INACTIVO.`);
    if (!confirmar) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`http://127.0.0.1:8000/conceptos/${selectedId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMensaje({ texto: `✅ Concepto "${conceptoSeleccionado.nombre}" desactivado correctamente.`, tipo: 'exito' });
      cargarConceptos();
      setSelectedId(null);
      setFormData(estadoInicial);
      setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);
    } catch (error) {
      console.error('Error al eliminar:', error);
      const detalle = error.response?.data?.detail || 'No se pudo desactivar.';
      setMensaje({ texto: `❌ ${detalle}`, tipo: 'error' });
    }
  };

  // --- RESTAURAR ---
  const handleRestaurar = async () => {
    const conceptoSeleccionado = conceptos.find(i => i.id_concepto === selectedId);
    if (!conceptoSeleccionado) return;

    try {
      const token = localStorage.getItem('token');
      await axios.put(`http://127.0.0.1:8000/conceptos/${selectedId}/restaurar`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMensaje({ texto: `✅ Concepto "${conceptoSeleccionado.nombre}" restaurado correctamente.`, tipo: 'exito' });
      cargarConceptos();
      setSelectedId(null);
      setFormData(estadoInicial);
      setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);
    } catch (error) {
      console.error('Error al restaurar:', error);
      setMensaje({ texto: `❌ Error al restaurar el registro.`, tipo: 'error' });
    }
  };

  // --- ELIMINAR FÍSICO ---
  const handleEliminarFisico = async () => {
    const conceptoSeleccionado = conceptos.find(i => i.id_concepto === selectedId);
    if (!conceptoSeleccionado) return;

    const confirmar = window.confirm(`⚠️ ¡ATENCIÓN! ⚠️\n¿Estás seguro de ELIMINAR DEFINITIVAMENTE el concepto "${conceptoSeleccionado.nombre}"?\nEsta acción NO se puede deshacer y fallará si el registro ya está en uso.`);
    if (!confirmar) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`http://127.0.0.1:8000/conceptos/${selectedId}/fisico`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMensaje({ texto: `✅ Concepto "${conceptoSeleccionado.nombre}" eliminado definitivamente.`, tipo: 'exito' });
      cargarConceptos();
      setSelectedId(null);
      setFormData(estadoInicial);
      setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);
    } catch (error) {
      console.error('Error al eliminar físicamente:', error);
      const detalle = error.response?.data?.detail || 'No se pudo eliminar.';
      setMensaje({ texto: `❌ ${detalle}`, tipo: 'error' });
    }
  };

  const conceptosFiltrados = conceptos.filter((c) =>
    (c.nombre || '').toLowerCase().includes(busqueda.toLowerCase()) ||
    (c.descripcion || '').toLowerCase().includes(busqueda.toLowerCase())
  );

  const isReadOnly = viewMode === 'CONSULTAR';
  const conceptoActualmenteSeleccionado = conceptos.find(c => c.id_concepto === selectedId);
  const esInactivoSeleccionado = conceptoActualmenteSeleccionado?.estado_registro === 'INACTIVO';

  // --- ESTILOS ---
  const containerStyle = { padding: '20px', fontFamily: 'Arial, sans-serif' };
  const commandBarStyle = { display: 'flex', gap: '10px', backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' };
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

  return (
    <div style={containerStyle}>
      <h2 style={{ color: '#2c3e50', borderBottom: '2px solid #3498db', paddingBottom: '10px' }}>Catálogo de Conceptos de Gasto</h2>

      {/* TOP COMMAND BAR */}
      <div style={commandBarStyle}>
        <button style={getBtnStyle(false, '#2ecc71')} onClick={() => { setViewMode('NUEVO'); setFormData(estadoInicial); setSelectedId(null); }}>➕ NUEVO</button>
        
        {!esInactivoSeleccionado && (
          <>
            <button style={getBtnStyle(!selectedId, '#f39c12')} disabled={!selectedId} onClick={() => setViewMode('MODIFICAR')}>✏️ MODIFICAR</button>
            <button style={getBtnStyle(!selectedId, '#3498db')} disabled={!selectedId} onClick={() => setViewMode('CONSULTAR')}>👁️ CONSULTAR</button>
            <button style={getBtnStyle(!selectedId, '#e74c3c')} disabled={!selectedId} onClick={handleEliminar}>🗑️ ELIMINAR</button>
          </>
        )}

        {esInactivoSeleccionado && (
          <>
            <button style={getBtnStyle(false, '#3498db')} onClick={() => setViewMode('CONSULTAR')}>👁️ CONSULTAR</button>
            <button style={getBtnStyle(false, '#8e44ad')} onClick={handleRestaurar}>♻️ RESTAURAR</button>
            <button style={getBtnStyle(false, '#c0392b')} onClick={handleEliminarFisico}>🚫 ELIMINAR DEFINITIVAMENTE</button>
          </>
        )}
        
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
        <div style={{ backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '8px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
            <h4 style={{ color: '#7f8c8d', margin: 0 }}>Conceptos Registrados ({conceptosFiltrados.length})</h4>
            
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', color: '#7f8c8d', fontWeight: 'bold' }}>
                <input 
                  type="checkbox" 
                  checked={mostrarInactivos} 
                  onChange={(e) => { setMostrarInactivos(e.target.checked); setSelectedId(null); }}
                  style={{ width: '16px', height: '16px' }}
                />
                Mostrar eliminados (Inactivos)
              </label>

              <input
                type="text"
                placeholder="🔍 Buscar por nombre o descripción..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                style={{ padding: '8px 12px', border: '1px solid #ccc', borderRadius: '4px', width: '300px', fontSize: '14px' }}
              />
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#ecf0f1', textAlign: 'left' }}>
                  <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>ID</th>
                  <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Nombre</th>
                  <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Descripción</th>
                  <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {conceptosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ padding: '15px', textAlign: 'center', color: '#7f8c8d' }}>No hay Conceptos de gasto registrados aún.</td>
                  </tr>
                ) : (
                  conceptosFiltrados.map((concepto) => {
                    const esInactivo = concepto.estado_registro === 'INACTIVO';
                    return (
                      <tr 
                        key={concepto.id_concepto} 
                        onClick={() => handleRowClick(concepto)}
                        style={{ 
                          backgroundColor: selectedId === concepto.id_concepto ? '#d6eaf8' : (esInactivo ? '#f9f9f9' : 'white'), 
                          color: esInactivo ? '#95a5a6' : 'inherit',
                          textDecoration: esInactivo && selectedId !== concepto.id_concepto ? 'line-through' : 'none',
                          cursor: 'pointer', 
                          borderBottom: '1px solid #eee', 
                          transition: 'background-color 0.2s' 
                        }}
                      >
                        <td style={{ padding: '12px' }}>{concepto.id_concepto}</td>
                        <td style={{ padding: '12px', fontWeight: 'bold' }}>{concepto.nombre}</td>
                        <td style={{ padding: '12px', color: '#7f8c8d' }}>{concepto.descripcion || '—'}</td>
                        <td style={{ padding: '12px' }}>
                          {esInactivo ? (
                            <span style={{ backgroundColor: '#ffcccc', color: '#cc0000', padding: '3px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>INACTIVO</span>
                          ) : (
                            <span style={{ backgroundColor: '#ccffcc', color: '#006600', padding: '3px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>ACTIVO</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        // ======================= VISTA: FORMULARIO =======================
        <div style={{ backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '8px', padding: '20px' }}>
          <h3 style={{ marginTop: 0, color: '#34495e', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
            {viewMode === 'NUEVO' ? 'Registro de Nuevo Concepto' : viewMode === 'MODIFICAR' ? 'Modificar Concepto' : 'Detalle del Concepto'}
          </h3>
          
          <form onSubmit={handleGuardar}>
            <div style={gridStyle}>
              <div>
                <label style={labelStyle}>Nombre del Concepto</label>
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData(prev => ({ ...prev, nombre: e.target.value }))}
                  disabled={isReadOnly}
                  required
                  placeholder="Ej: Flete Marítimo, Seguro..."
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Descripción (Opcional)</label>
                <input
                  type="text"
                  value={formData.descripcion}
                  onChange={(e) => setFormData(prev => ({ ...prev, descripcion: e.target.value }))}
                  disabled={isReadOnly}
                  placeholder="Breve descripción del concepto..."
                  style={inputStyle}
                />
              </div>
            </div>

            {!isReadOnly && (
              <div style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" style={getBtnStyle(false, '#95a5a6')} onClick={() => { setViewMode('LISTA'); setSelectedId(null); setFormData(estadoInicial); }}>
                  CANCELAR
                </button>
                <button type="submit" style={getBtnStyle(false, '#2ecc71')}>
                  💾 GUARDAR
                </button>
              </div>
            )}
          </form>
        </div>
      )}
    </div>
  );
};

export default Conceptos;
