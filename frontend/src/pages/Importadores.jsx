import React, { useState, useEffect } from 'react';
import api from '../services/api';

const Importadores = () => {
  // --- ESTADOS DE VISTA Y SELECCIÓN ---
  const [viewMode, setViewMode] = useState('LISTA'); // LISTA, NUEVO, MODIFICAR, CONSULTAR
  const [selectedId, setSelectedId] = useState(null);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });
  const [busqueda, setBusqueda] = useState('');
  const [mostrarInactivos, setMostrarInactivos] = useState(false);

  // --- DATOS ---
  const [importadores, setImportadores] = useState([]);
  const [buscandoRuc, setBuscandoRuc] = useState(false);

  const estadoInicial = {
    ruc: '',
    nombre: ''
  };
  const [formData, setFormData] = useState(estadoInicial);

  // --- CARGA INICIAL ---
  useEffect(() => {
    cargarImportadores();
  }, [mostrarInactivos]);

  const cargarImportadores = async () => {
    try {
      const respuesta = await api.get(`/importadores/?mostrar_inactivos=${mostrarInactivos}`);
      setImportadores(respuesta.data);
    } catch (error) {
      console.error('Error al cargar:', error);
      setMensaje({ texto: 'No se pudo conectar con la base de datos.', tipo: 'error' });
    }
  };

  // --- MANEJO DE SELECCIÓN ---
  const handleRowClick = (imp) => {
    if (selectedId === imp.id_importador) {
      setSelectedId(null);
      setFormData(estadoInicial);
    } else {
      setSelectedId(imp.id_importador);
      setFormData({
        ruc: imp.ruc || '',
        nombre: imp.nombre || ''
      });
    }
  };

  // --- SUNAT RUC ---
  const buscarRuc = async () => {
    if (formData.ruc.length !== 11 || isNaN(formData.ruc)) {
      setMensaje({ texto: 'El RUC debe tener 11 dígitos numéricos.', tipo: 'error' });
      return;
    }
    setBuscandoRuc(true);
    setMensaje({ texto: 'Buscando RUC en SUNAT...', tipo: 'info' });
    try {
      const respuesta = await api.get(`/sunat/ruc/${formData.ruc}`);
      setFormData(prev => ({ ...prev, nombre: respuesta.data.razon_social }));
      setMensaje({ texto: 'RUC validado correctamente.', tipo: 'exito' });
    } catch (error) {
      console.error('Error al consultar RUC:', error);
      const errorMsg = error.response?.data?.detail || 'Error al consultar SUNAT.';
      setMensaje({ texto: `❌ ${errorMsg}`, tipo: 'error' });
      setFormData(prev => ({ ...prev, nombre: '' }));
    } finally {
      setBuscandoRuc(false);
    }
  };

  // --- GUARDAR ---
  const handleGuardar = async (e) => {
    e.preventDefault();
    setMensaje({ texto: 'Guardando...', tipo: 'info' });

    try {
      const payload = { ...formData };

      if (viewMode === 'NUEVO') {
        await api.post('/importadores/', payload);
        setMensaje({ texto: '✅ Importador registrado exitosamente.', tipo: 'exito' });
      } else if (viewMode === 'MODIFICAR') {
        await api.put(`/importadores/${selectedId}`, payload);
        setMensaje({ texto: '✅ Importador actualizado exitosamente.', tipo: 'exito' });
      }

      cargarImportadores();
      setViewMode('LISTA');
      setSelectedId(null);
      setFormData(estadoInicial);
      setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);
    } catch (error) {
      console.error('Error al guardar:', error);
      const errorMsg = error.response?.data?.detail || 'Revisa los datos.';
      setMensaje({ texto: `❌ Error al guardar: ${errorMsg}`, tipo: 'error' });
    }
  };

  // --- ELIMINAR (LÓGICO) ---
  const handleEliminar = async () => {
    const importadorSeleccionado = importadores.find(i => i.id_importador === selectedId);
    if (!importadorSeleccionado) return;

    const confirmar = window.confirm(`¿Estás seguro de desactivar el importador "${importadorSeleccionado.nombre}"?\nEsta acción lo marcará como INACTIVO.`);
    if (!confirmar) return;

    try {
      await api.delete(`/importadores/${selectedId}`);
      setMensaje({ texto: `✅ Importador "${importadorSeleccionado.nombre}" desactivado correctamente.`, tipo: 'exito' });
      cargarImportadores();
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
    const importadorSeleccionado = importadores.find(i => i.id_importador === selectedId);
    if (!importadorSeleccionado) return;

    try {
      await api.put(`/importadores/${selectedId}/restaurar`);
      setMensaje({ texto: `✅ Importador "${importadorSeleccionado.nombre}" restaurado correctamente.`, tipo: 'exito' });
      cargarImportadores();
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
    const importadorSeleccionado = importadores.find(i => i.id_importador === selectedId);
    if (!importadorSeleccionado) return;

    const confirmar = window.confirm(`⚠️ ¡ATENCIÓN! ⚠️\n¿Estás seguro de ELIMINAR DEFINITIVAMENTE el importador "${importadorSeleccionado.nombre}"?\nEsta acción NO se puede deshacer y fallará si el registro ya está en uso.`);
    if (!confirmar) return;

    try {
      await api.delete(`/importadores/${selectedId}/fisico`);
      setMensaje({ texto: `✅ Importador "${importadorSeleccionado.nombre}" eliminado definitivamente.`, tipo: 'exito' });
      cargarImportadores();
      setSelectedId(null);
      setFormData(estadoInicial);
      setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);
    } catch (error) {
      console.error('Error al eliminar físicamente:', error);
      const detalle = error.response?.data?.detail || 'No se pudo eliminar.';
      setMensaje({ texto: `❌ ${detalle}`, tipo: 'error' });
    }
  };

  const importadoresFiltrados = importadores.filter((imp) =>
    (imp.nombre || '').toLowerCase().includes(busqueda.toLowerCase()) ||
    (imp.ruc || '').includes(busqueda)
  );

  const isReadOnly = viewMode === 'CONSULTAR';
  const importadorActualmenteSeleccionado = importadores.find(i => i.id_importador === selectedId);
  const esInactivoSeleccionado = importadorActualmenteSeleccionado?.estado_registro === 'INACTIVO';

  return (
    <div className="page-container">
      <h2 className="page-title">Maestro de Importadores</h2>

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
            <h4 className="text-muted" style={{ margin: 0 }}>Importadores Registrados ({importadoresFiltrados.length})</h4>
            
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
                placeholder="🔍 Buscar por nombre o RUC..."
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
                  <th style={{ width: '160px' }}>RUC</th>
                  <th>Nombre del Importador</th>
                  <th style={{ width: '120px' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {importadoresFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="text-center text-muted">No hay Importadores registrados aún.</td>
                  </tr>
                ) : (
                  importadoresFiltrados.map((imp) => {
                    const esInactivo = imp.estado_registro === 'INACTIVO';
                    const isSelected = selectedId === imp.id_importador;
                    let trClasses = [];
                    if (isSelected) trClasses.push('selected');
                    if (esInactivo) trClasses.push('inactive');

                    return (
                      <tr 
                        key={imp.id_importador} 
                        onClick={() => handleRowClick(imp)}
                        className={trClasses.join(' ')}
                      >
                        <td>{imp.id_importador}</td>
                        <td className="font-bold">
                          <span className="truncate-text" title={imp.ruc}>{imp.ruc}</span>
                        </td>
                        <td>
                          <span className="truncate-text" title={imp.nombre}>{imp.nombre}</span>
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
            {viewMode === 'NUEVO' ? 'Registro de Nuevo Importador' : viewMode === 'MODIFICAR' ? 'Modificar Importador' : 'Detalle del Importador'}
          </h3>
          
          <form onSubmit={handleGuardar}>
            <div className="form-grid">
              <div>
                <label className="label-text">RUC *</label>
                <div className="flex-row">
                  <input
                    type="text"
                    value={formData.ruc}
                    onChange={(e) => setFormData(prev => ({ ...prev, ruc: e.target.value }))}
                    disabled={isReadOnly}
                    required
                    maxLength="11"
                    placeholder="11 dígitos"
                    className="form-input"
                  />
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={buscarRuc}
                      disabled={buscandoRuc}
                      className="btn btn-success"
                    >
                      {buscandoRuc ? '...' : '🔍 SUNAT'}
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="label-text">Nombre del Importador *</label>
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData(prev => ({ ...prev, nombre: e.target.value }))}
                  disabled={isReadOnly || viewMode === 'NUEVO' || viewMode === 'MODIFICAR'} 
                  required
                  placeholder="Razón Social desde SUNAT"
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

export default Importadores;
