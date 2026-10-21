import React, { useState, useEffect } from 'react';
import api from '../services/api';

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
      const respuesta = await api.get(`/almacenes/?mostrar_inactivos=${mostrarInactivos}`);
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
      const payload = {
        nombre: formData.nombre,
        ubicacion: formData.ubicacion || null
      };

      if (viewMode === 'NUEVO') {
        await api.post('/almacenes/', payload);
        setMensaje({ texto: '✅ Almacén registrado exitosamente.', tipo: 'exito' });
      } else if (viewMode === 'MODIFICAR') {
        await api.put(`/almacenes/${selectedId}`, payload);
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
      await api.delete(`/almacenes/${selectedId}`);
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
      await api.put(`/almacenes/${selectedId}/restaurar`);
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
      await api.delete(`/almacenes/${selectedId}/fisico`);
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

  return (
    <div className="page-container">
      <h2 className="page-title">Catálogo de Almacenes</h2>

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
            <h4 className="text-muted" style={{ margin: 0 }}>Almacenes Registrados ({almacenesFiltrados.length})</h4>
            
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
                placeholder="🔍 Buscar por nombre o ubicación..."
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
                  <th>Ubicación</th>
                  <th style={{ width: '120px' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {almacenesFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="text-center text-muted">No hay Almacenes registrados aún.</td>
                  </tr>
                ) : (
                  almacenesFiltrados.map((al) => {
                    const esInactivo = al.estado_registro === 'INACTIVO';
                    const isSelected = selectedId === al.id_almacen;
                    let trClasses = [];
                    if (isSelected) trClasses.push('selected');
                    if (esInactivo) trClasses.push('inactive');

                    return (
                      <tr 
                        key={al.id_almacen} 
                        onClick={() => handleRowClick(al)}
                        className={trClasses.join(' ')}
                      >
                        <td>{al.id_almacen}</td>
                        <td className="font-bold">
                          <span className="truncate-text" title={al.nombre}>{al.nombre}</span>
                        </td>
                        <td className="text-muted">
                          <span className="truncate-text" title={al.ubicacion || '—'}>{al.ubicacion || '—'}</span>
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
            {viewMode === 'NUEVO' ? 'Registro de Nuevo Almacén' : viewMode === 'MODIFICAR' ? 'Modificar Almacén' : 'Detalle del Almacén'}
          </h3>
          
          <form onSubmit={handleGuardar}>
            <div className="form-grid">
              <div>
                <label className="label-text">Nombre del Almacén *</label>
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData(prev => ({ ...prev, nombre: e.target.value }))}
                  disabled={isReadOnly}
                  required
                  placeholder="Ej: Ransa, Neptunia, Alconsa..."
                  className="form-input"
                />
              </div>

              <div>
                <label className="label-text">Ubicación (Opcional)</label>
                <input
                  type="text"
                  value={formData.ubicacion}
                  onChange={(e) => setFormData(prev => ({ ...prev, ubicacion: e.target.value }))}
                  disabled={isReadOnly}
                  placeholder="Ej: Callao, Lurín, Paita..."
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

export default Almacenes;
