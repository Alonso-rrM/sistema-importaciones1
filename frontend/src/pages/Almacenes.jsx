import React, { useState, useEffect } from 'react';
import axios from 'axios';

const Almacenes = () => {
  // --- ESTADOS DE VISTA Y SELECCIÓN ---
  const [viewMode, setViewMode] = useState('LISTA'); // LISTA, NUEVO, MODIFICAR, CONSULTAR
  const [selectedId, setSelectedId] = useState(null);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });
  const [busqueda, setBusqueda] = useState('');
  const [mostrarInactivos, setMostrarInactivos] = useState(false);

  // --- DATOS ---
  const [almacenes, setAlmacenes] = useState([]);

  const estadoInicial = {
    nombre: '',
    ubicacion: ''
  };
  const [formData, setFormData] = useState(estadoInicial);

  // --- CARGA INICIAL ---
  useEffect(() => {
    cargarAlmacenes();
  }, [mostrarInactivos]);

  const cargarAlmacenes = async () => {
    try {
      const token = localStorage.getItem('token');
      const respuesta = await axios.get(`http://127.0.0.1:8000/almacenes/?mostrar_inactivos=${mostrarInactivos}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAlmacenes(respuesta.data);
    } catch (error) {
      console.error('Error al cargar:', error);
      setMensaje({ texto: 'No se pudo conectar con la base de datos.', tipo: 'error' });
    }
  };

  // --- MANEJO DE SELECCIÓN ---
  const handleRowClick = (al) => {
    if (selectedId === al.id_almacen) {
      setSelectedId(null);
      setFormData(estadoInicial);
    } else {
      setSelectedId(al.id_almacen);
      setFormData({
        nombre: al.nombre || '',
        ubicacion: al.ubicacion || ''
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
        ubicacion: formData.ubicacion || null
      };

      if (viewMode === 'NUEVO') {
        await axios.post('http://127.0.0.1:8000/almacenes/', payload, config);
        setMensaje({ texto: '✅ Almacén registrado exitosamente.', tipo: 'exito' });
      } else if (viewMode === 'MODIFICAR') {
        await axios.put(`http://127.0.0.1:8000/almacenes/${selectedId}`, payload, config);
        setMensaje({ texto: '✅ Almacén actualizado exitosamente.', tipo: 'exito' });
      }

      cargarAlmacenes();
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
    const almacenSeleccionado = almacenes.find(a => a.id_almacen === selectedId);
    if (!almacenSeleccionado) return;

    const confirmar = window.confirm(`¿Estás seguro de desactivar el almacén "${almacenSeleccionado.nombre}"?\nEsta acción lo marcará como INACTIVO.`);
    if (!confirmar) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`http://127.0.0.1:8000/almacenes/${selectedId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMensaje({ texto: `✅ Almacén "${almacenSeleccionado.nombre}" desactivado correctamente.`, tipo: 'exito' });
      cargarAlmacenes();
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
    const almacenSeleccionado = almacenes.find(i => i.id_almacen === selectedId);
    if (!almacenSeleccionado) return;

    try {
      const token = localStorage.getItem('token');
      await axios.put(`http://127.0.0.1:8000/almacenes/${selectedId}/restaurar`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMensaje({ texto: `✅ Almacén "${almacenSeleccionado.nombre}" restaurado correctamente.`, tipo: 'exito' });
      cargarAlmacenes();
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
    const almacenSeleccionado = almacenes.find(i => i.id_almacen === selectedId);
    if (!almacenSeleccionado) return;

    const confirmar = window.confirm(`⚠️ ¡ATENCIÓN! ⚠️\n¿Estás seguro de ELIMINAR DEFINITIVAMENTE el almacén "${almacenSeleccionado.nombre}"?\nEsta acción NO se puede deshacer y fallará si el registro ya está en uso.`);
    if (!confirmar) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`http://127.0.0.1:8000/almacenes/${selectedId}/fisico`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMensaje({ texto: `✅ Almacén "${almacenSeleccionado.nombre}" eliminado definitivamente.`, tipo: 'exito' });
      cargarAlmacenes();
      setSelectedId(null);
      setFormData(estadoInicial);
      setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);
    } catch (error) {
      console.error('Error al eliminar físicamente:', error);
      const detalle = error.response?.data?.detail || 'No se pudo eliminar.';
      setMensaje({ texto: `❌ ${detalle}`, tipo: 'error' });
    }
  };

  const almacenesFiltrados = almacenes.filter((al) =>
    (al.nombre || '').toLowerCase().includes(busqueda.toLowerCase()) ||
    (al.ubicacion || '').toLowerCase().includes(busqueda.toLowerCase())
  );

  const isReadOnly = viewMode === 'CONSULTAR';
  const almacenActualmenteSeleccionado = almacenes.find(a => a.id_almacen === selectedId);
  const esInactivoSeleccionado = almacenActualmenteSeleccionado?.estado_registro === 'INACTIVO';

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
      <h2 style={{ color: '#2c3e50', borderBottom: '2px solid #3498db', paddingBottom: '10px' }}>Catálogo de Almacenes</h2>

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
            <h4 style={{ color: '#7f8c8d', margin: 0 }}>Almacenes Registrados ({almacenesFiltrados.length})</h4>
            
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
                placeholder="🔍 Buscar por nombre o ubicación..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                style={{ padding: '8px 12px', border: '1px solid #ccc', borderRadius: '4px', width: '250px', fontSize: '14px' }}
              />
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#ecf0f1', textAlign: 'left' }}>
                  <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>ID</th>
                  <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Nombre del Almacén</th>
                  <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Ubicación</th>
                  <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {almacenesFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ padding: '15px', textAlign: 'center', color: '#7f8c8d' }}>No hay Almacenes registrados aún.</td>
                  </tr>
                ) : (
                  almacenesFiltrados.map((al) => {
                    const esInactivo = al.estado_registro === 'INACTIVO';
                    return (
                      <tr 
                        key={al.id_almacen} 
                        onClick={() => handleRowClick(al)}
                        style={{ 
                          backgroundColor: selectedId === al.id_almacen ? '#d6eaf8' : (esInactivo ? '#f9f9f9' : 'white'), 
                          color: esInactivo ? '#95a5a6' : 'inherit',
                          textDecoration: esInactivo && selectedId !== al.id_almacen ? 'line-through' : 'none',
                          cursor: 'pointer', 
                          borderBottom: '1px solid #eee', 
                          transition: 'background-color 0.2s' 
                        }}
                      >
                        <td style={{ padding: '12px' }}>{al.id_almacen}</td>
                        <td style={{ padding: '12px', fontWeight: 'bold' }}>{al.nombre}</td>
                        <td style={{ padding: '12px', color: '#7f8c8d' }}>{al.ubicacion || '—'}</td>
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
            {viewMode === 'NUEVO' ? 'Registro de Nuevo Almacén' : viewMode === 'MODIFICAR' ? 'Modificar Almacén' : 'Detalle del Almacén'}
          </h3>
          
          <form onSubmit={handleGuardar}>
            <div style={gridStyle}>
              <div>
                <label style={labelStyle}>Nombre del Almacén</label>
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData(prev => ({ ...prev, nombre: e.target.value }))}
                  disabled={isReadOnly}
                  required
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Ubicación (Opcional)</label>
                <input
                  type="text"
                  value={formData.ubicacion}
                  onChange={(e) => setFormData(prev => ({ ...prev, ubicacion: e.target.value }))}
                  disabled={isReadOnly}
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

export default Almacenes;
