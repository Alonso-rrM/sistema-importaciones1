import React, { useState, useEffect } from 'react';
import api from '../services/api';

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
      const respuesta = await api.get(`/conceptos/?mostrar_inactivos=${mostrarInactivos}`);
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
      const payload = {
        nombre: formData.nombre,
        descripcion: formData.descripcion || null
      };

      if (viewMode === 'NUEVO') {
        await api.post('/conceptos/', payload);
        setMensaje({ texto: '✅ Concepto de gasto registrado exitosamente.', tipo: 'exito' });
      } else if (viewMode === 'MODIFICAR') {
        await api.put(`/conceptos/${selectedId}`, payload);
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
      await api.delete(`/conceptos/${selectedId}`);
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
      await api.put(`/conceptos/${selectedId}/restaurar`);
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
      await api.delete(`/conceptos/${selectedId}/fisico`);
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

  return (
    <div className="page-container">
      <h2 className="page-title">Catálogo de Conceptos de Gasto</h2>

      {/* TOP COMMAND BAR */}
      <div className="toolbar">
        <button 
          className="btn btn-success" 
          onClick={() => { setViewMode('NUEVO'); setFormData(estadoInicial); setSelectedId(null); }}
        >
          ➕ NUEVO
        </button>
        
        {!esInactivoSeleccionado && (
          <>
            <button 
              className="btn btn-warning" 
              disabled={!selectedId} 
              onClick={() => setViewMode('MODIFICAR')}
            >
              ✏️ MODIFICAR
            </button>
            <button 
              className="btn btn-primary" 
              disabled={!selectedId} 
              onClick={() => setViewMode('CONSULTAR')}
            >
              👁️ CONSULTAR
            </button>
            <button 
              className="btn btn-danger" 
              disabled={!selectedId} 
              onClick={handleEliminar}
            >
              🗑️ ELIMINAR
            </button>
          </>
        )}

        {esInactivoSeleccionado && (
          <>
            <button className="btn btn-primary" onClick={() => setViewMode('CONSULTAR')}>
              👁️ CONSULTAR
            </button>
            <button className="btn btn-purple" onClick={handleRestaurar}>
              ♻️ RESTAURAR
            </button>
            <button className="btn btn-danger" onClick={handleEliminarFisico}>
              🚫 ELIMINAR DEFINITIVAMENTE
            </button>
          </>
        )}
        
        {viewMode !== 'LISTA' && (
          <button 
            className="btn btn-secondary ml-auto" 
            onClick={() => { setViewMode('LISTA'); setSelectedId(null); setFormData(estadoInicial); }}
          >
            ⬅️ VOLVER A LISTA
          </button>
        )}
      </div>

      {mensaje.texto && (
        <div className={`alert ${mensaje.tipo === 'error' ? 'alert-error' : mensaje.tipo === 'exito' ? 'alert-success' : 'alert-info'}`}>
          {mensaje.texto}
        </div>
      )}

      {viewMode === 'LISTA' ? (
        // ======================= VISTA: LISTA =======================
        <div className="card">
          <div className="flex-between mb-3" style={{ flexWrap: 'wrap', gap: '10px' }}>
            <h4 className="text-muted" style={{ margin: 0 }}>Conceptos Registrados ({conceptosFiltrados.length})</h4>
            
            <div className="flex-row">
              <label className="flex-row font-bold text-muted" style={{ cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={mostrarInactivos} 
                  onChange={(e) => { setMostrarInactivos(e.target.checked); setSelectedId(null); }}
                />
                Mostrar eliminados (Inactivos)
              </label>

              <input
                type="text"
                placeholder="🔍 Buscar por nombre o descripción..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="toolbar-search"
              />
            </div>
          </div>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '80px' }}>ID</th>
                  <th style={{ width: '250px' }}>Nombre</th>
                  <th>Descripción</th>
                  <th style={{ width: '120px' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {conceptosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="text-center text-muted">No hay Conceptos de gasto registrados aún.</td>
                  </tr>
                ) : (
                  conceptosFiltrados.map((concepto) => {
                    const esInactivo = concepto.estado_registro === 'INACTIVO';
                    const isSelected = selectedId === concepto.id_concepto;
                    let trClasses = [];
                    if (isSelected) trClasses.push('selected');
                    if (esInactivo) trClasses.push('inactive');

                    return (
                      <tr 
                        key={concepto.id_concepto} 
                        onClick={() => handleRowClick(concepto)}
                        className={trClasses.join(' ')}
                      >
                        <td>{concepto.id_concepto}</td>
                        <td className="font-bold">
                          <span className="truncate-text" title={concepto.nombre}>{concepto.nombre}</span>
                        </td>
                        <td className="text-muted">
                          <span className="truncate-text" title={concepto.descripcion || '—'}>{concepto.descripcion || '—'}</span>
                        </td>
                        <td className="no-strike">
                          <span className={`badge ${esInactivo ? 'badge-danger' : 'badge-success'}`}>
                            {esInactivo ? 'INACTIVO' : 'ACTIVO'}
                          </span>
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
        <div className="card">
          <h3 className="section-title">
            {viewMode === 'NUEVO' ? 'Registro de Nuevo Concepto' : viewMode === 'MODIFICAR' ? 'Modificar Concepto' : 'Detalle del Concepto'}
          </h3>
          
          <form onSubmit={handleGuardar}>
            <div className="form-grid">
              <div>
                <label className="label-text">Nombre del Concepto *</label>
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData(prev => ({ ...prev, nombre: e.target.value }))}
                  disabled={isReadOnly}
                  required
                  placeholder="Ej: Flete Marítimo, Seguro..."
                  className="form-input"
                />
              </div>

              <div>
                <label className="label-text">Descripción (Opcional)</label>
                <input
                  type="text"
                  value={formData.descripcion}
                  onChange={(e) => setFormData(prev => ({ ...prev, descripcion: e.target.value }))}
                  disabled={isReadOnly}
                  placeholder="Breve descripción del concepto..."
                  className="form-input"
                />
              </div>
            </div>

            {!isReadOnly && (
              <div className="form-actions">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => { setViewMode('LISTA'); setSelectedId(null); setFormData(estadoInicial); }}
                >
                  CANCELAR
                </button>
                <button type="submit" className="btn btn-success">
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
