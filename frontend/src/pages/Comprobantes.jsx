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
      const data = respuesta.data?.data ?? (Array.isArray(respuesta.data) ? respuesta.data : []);
      setComprobantes(data);
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

  return (
    <div className="page-container">
      <h2 className="page-title">Catálogo de Tipos de Comprobante</h2>

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
            <h4 className="text-muted" style={{ margin: 0 }}>Comprobantes Registrados ({comprobantesFiltrados.length})</h4>
            
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
                placeholder="🔍 Buscar por nombre..."
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
                  <th>Nombre del Documento</th>
                  <th style={{ width: '200px' }}>Multiplicador Financiero</th>
                  <th style={{ width: '120px' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {comprobantesFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="text-center text-muted">No hay Tipos de Comprobante registrados aún.</td>
                  </tr>
                ) : (
                  comprobantesFiltrados.map((comp) => {
                    const esInactivo = comp.estado_registro === 'INACTIVO';
                    const isSelected = selectedId === comp.id_tipo_doc;
                    let trClasses = [];
                    if (isSelected) trClasses.push('selected');
                    if (esInactivo) trClasses.push('inactive');

                    return (
                      <tr 
                        key={comp.id_tipo_doc} 
                        onClick={() => handleRowClick(comp)}
                        className={trClasses.join(' ')}
                      >
                        <td>{comp.id_tipo_doc}</td>
                        <td className="font-bold">
                          <span className="truncate-text" title={comp.nombre_documento}>{comp.nombre_documento}</span>
                        </td>
                        <td className="text-muted">{comp.multiplicador_financiero}</td>
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
            {viewMode === 'NUEVO' ? 'Registro de Nuevo Comprobante' : viewMode === 'MODIFICAR' ? 'Modificar Comprobante' : 'Detalle del Comprobante'}
          </h3>
          
          <form onSubmit={handleGuardar}>
            <div className="form-grid">
              <div>
                <label className="label-text">Nombre del Documento * (Ej: Factura, BL, DUA)</label>
                <input
                  type="text"
                  value={formData.nombre_documento}
                  onChange={(e) => setFormData(prev => ({ ...prev, nombre_documento: e.target.value }))}
                  disabled={isReadOnly}
                  required
                  placeholder="Ej: Factura Comercial"
                  className="form-input"
                />
              </div>

              <div>
                <label className="label-text">Multiplicador Financiero * (Ej: 1 o -1)</label>
                <select
                  value={formData.multiplicador_financiero}
                  onChange={(e) => setFormData(prev => ({ ...prev, multiplicador_financiero: parseInt(e.target.value) }))}
                  disabled={isReadOnly}
                  required
                  className="form-input"
                >
                  <option value={1}>1 (Positivo)</option>
                  <option value={-1}>-1 (Negativo)</option>
                  <option value={0}>0 (Informativo)</option>
                </select>
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

export default Comprobantes;
