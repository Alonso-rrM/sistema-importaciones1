import React, { useState, useEffect } from 'react';
import api from '../services/api';

const Comprobantes = () => {
  // --- ESTADOS DE VISTA Y SELECCIÓN ---
  const [viewMode, setViewMode] = useState('LISTA'); // LISTA, NUEVO, MODIFICAR, CONSULTAR
  const [selectedId, setSelectedId] = useState(null);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });
  const [busqueda, setBusqueda] = useState('');
  const [mostrarInactivos, setMostrarInactivos] = useState(false);

  // --- DATOS ---
  const [comprobantes, setComprobantes] = useState([]);

  const estadoInicial = {
    nombre_documento: '',
    multiplicador_financiero: 1
  };
  const [formData, setFormData] = useState(estadoInicial);

  // --- CARGA INICIAL ---
  useEffect(() => {
    cargarComprobantes();
  }, [mostrarInactivos]);

  const cargarComprobantes = async () => {
    try {
      const respuesta = await api.get(`/tipos-documento/?mostrar_inactivos=${mostrarInactivos}`);
      setComprobantes(respuesta.data);
    } catch (error) {
      console.error('Error al cargar:', error);
      setMensaje({ texto: 'No se pudo conectar con la base de datos.', tipo: 'error' });
    }
  };

  // --- MANEJO DE SELECCIÓN ---
  const handleRowClick = (comp) => {
    if (selectedId === comp.id_tipo_doc) {
      setSelectedId(null);
      setFormData(estadoInicial);
    } else {
      setSelectedId(comp.id_tipo_doc);
      setFormData({
        nombre_documento: comp.nombre_documento || '',
        multiplicador_financiero: comp.multiplicador_financiero || 1
      });
    }
  };

  // --- GUARDAR ---
  const handleGuardar = async (e) => {
    e.preventDefault();
    setMensaje({ texto: 'Guardando...', tipo: 'info' });

    try {
      const payload = {
        nombre_documento: formData.nombre_documento,
        multiplicador_financiero: parseInt(formData.multiplicador_financiero)
      };

      if (viewMode === 'NUEVO') {
        await api.post('/tipos-documento/', payload);
        setMensaje({ texto: '✅ Tipo de Comprobante registrado exitosamente.', tipo: 'exito' });
      } else if (viewMode === 'MODIFICAR') {
        await api.put(`/tipos-documento/${selectedId}`, payload);
        setMensaje({ texto: '✅ Tipo de Comprobante actualizado exitosamente.', tipo: 'exito' });
      }

      cargarComprobantes();
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
    const compSeleccionado = comprobantes.find(c => c.id_tipo_doc === selectedId);
    if (!compSeleccionado) return;

    const confirmar = window.confirm(`¿Estás seguro de desactivar el comprobante "${compSeleccionado.nombre_documento}"?\nEsta acción lo marcará como INACTIVO.`);
    if (!confirmar) return;

    try {
      await api.delete(`/tipos-documento/${selectedId}`);
      setMensaje({ texto: `✅ Comprobante "${compSeleccionado.nombre_documento}" desactivado correctamente.`, tipo: 'exito' });
      cargarComprobantes();
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
    const compSeleccionado = comprobantes.find(i => i.id_tipo_doc === selectedId);
    if (!compSeleccionado) return;

    try {
      await api.put(`/tipos-documento/${selectedId}/restaurar`);
      setMensaje({ texto: `✅ Comprobante "${compSeleccionado.nombre_documento}" restaurado correctamente.`, tipo: 'exito' });
      cargarComprobantes();
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
    const compSeleccionado = comprobantes.find(i => i.id_tipo_doc === selectedId);
    if (!compSeleccionado) return;

    const confirmar = window.confirm(`⚠️ ¡ATENCIÓN! ⚠️\n¿Estás seguro de ELIMINAR DEFINITIVAMENTE el comprobante "${compSeleccionado.nombre_documento}"?\nEsta acción NO se puede deshacer y fallará si el registro ya está en uso.`);
    if (!confirmar) return;

    try {
      await api.delete(`/tipos-documento/${selectedId}/fisico`);
      setMensaje({ texto: `✅ Comprobante "${compSeleccionado.nombre_documento}" eliminado definitivamente.`, tipo: 'exito' });
      cargarComprobantes();
      setSelectedId(null);
      setFormData(estadoInicial);
      setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);
    } catch (error) {
      console.error('Error al eliminar físicamente:', error);
      const detalle = error.response?.data?.detail || 'No se pudo eliminar.';
      setMensaje({ texto: `❌ ${detalle}`, tipo: 'error' });
    }
  };

  const comprobantesFiltrados = comprobantes.filter((c) =>
    (c.nombre_documento || '').toLowerCase().includes(busqueda.toLowerCase())
  );

  const isReadOnly = viewMode === 'CONSULTAR';
  const compActualmenteSeleccionado = comprobantes.find(c => c.id_tipo_doc === selectedId);
  const esInactivoSeleccionado = compActualmenteSeleccionado?.estado_registro === 'INACTIVO';

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
      <h2 style={{ color: '#2c3e50', borderBottom: '2px solid #3498db', paddingBottom: '10px' }}>Catálogo de Tipos de Comprobante</h2>

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
            <h4 style={{ color: '#7f8c8d', margin: 0 }}>Comprobantes Registrados ({comprobantesFiltrados.length})</h4>
            
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
                placeholder="🔍 Buscar por nombre..."
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
                  <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Nombre del Documento</th>
                  <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Multiplicador Financiero</th>
                  <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {comprobantesFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ padding: '15px', textAlign: 'center', color: '#7f8c8d' }}>No hay Tipos de Comprobante registrados aún.</td>
                  </tr>
                ) : (
                  comprobantesFiltrados.map((comp) => {
                    const esInactivo = comp.estado_registro === 'INACTIVO';
                    return (
                      <tr 
                        key={comp.id_tipo_doc} 
                        onClick={() => handleRowClick(comp)}
                        style={{ 
                          backgroundColor: selectedId === comp.id_tipo_doc ? '#d6eaf8' : (esInactivo ? '#f9f9f9' : 'white'), 
                          color: esInactivo ? '#95a5a6' : 'inherit',
                          textDecoration: esInactivo && selectedId !== comp.id_tipo_doc ? 'line-through' : 'none',
                          cursor: 'pointer', 
                          borderBottom: '1px solid #eee', 
                          transition: 'background-color 0.2s' 
                        }}
                      >
                        <td style={{ padding: '12px' }}>{comp.id_tipo_doc}</td>
                        <td style={{ padding: '12px', fontWeight: 'bold' }}>{comp.nombre_documento}</td>
                        <td style={{ padding: '12px', color: '#7f8c8d' }}>{comp.multiplicador_financiero}</td>
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
            {viewMode === 'NUEVO' ? 'Registro de Nuevo Comprobante' : viewMode === 'MODIFICAR' ? 'Modificar Comprobante' : 'Detalle del Comprobante'}
          </h3>
          
          <form onSubmit={handleGuardar}>
            <div style={gridStyle}>
              <div>
                <label style={labelStyle}>Nombre del Documento (Ej: Factura, BL, DUA)</label>
                <input
                  type="text"
                  value={formData.nombre_documento}
                  onChange={(e) => setFormData(prev => ({ ...prev, nombre_documento: e.target.value }))}
                  disabled={isReadOnly}
                  required
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Multiplicador Financiero (Ej: 1 o -1)</label>
                <select
                  value={formData.multiplicador_financiero}
                  onChange={(e) => setFormData(prev => ({ ...prev, multiplicador_financiero: parseInt(e.target.value) }))}
                  disabled={isReadOnly}
                  required
                  style={inputStyle}
                >
                  <option value={1}>1 (Positivo)</option>
                  <option value={-1}>-1 (Negativo)</option>
                  <option value={0}>0 (Informativo)</option>
                </select>
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

export default Comprobantes;
