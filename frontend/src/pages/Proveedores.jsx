import React, { useState, useEffect } from 'react';
import api from '../services/api';

const Proveedores = () => {
  // --- ESTADOS DE VISTA Y SELECCIÓN ---
  const [viewMode, setViewMode] = useState('LISTA'); // LISTA, NUEVO, MODIFICAR, CONSULTAR
  const [selectedId, setSelectedId] = useState(null);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });
  const [busqueda, setBusqueda] = useState('');
  const [mostrarInactivos, setMostrarInactivos] = useState(false);

  // --- DATOS ---
  const [proveedores, setProveedores] = useState([]);
  const [buscandoRuc, setBuscandoRuc] = useState(false);

  const estadoInicial = {
    ruc: '',
    nombre: '',
    categoria: 'NACIONAL'
  };
  const [formData, setFormData] = useState(estadoInicial);

  // --- CARGA INICIAL ---
  useEffect(() => {
    cargarProveedores();
  }, [mostrarInactivos]);

  const cargarProveedores = async () => {
    try {
      const respuesta = await api.get(`/proveedores/?mostrar_inactivos=${mostrarInactivos}`);
      setProveedores(respuesta.data);
    } catch (error) {
      console.error('Error al cargar:', error);
      setMensaje({ texto: 'No se pudo conectar con la base de datos.', tipo: 'error' });
    }
  };

  // --- MANEJO DE SELECCIÓN ---
  const handleRowClick = (prov) => {
    if (selectedId === prov.id_proveedor) {
      setSelectedId(null);
      setFormData(estadoInicial);
    } else {
      setSelectedId(prov.id_proveedor);
      setFormData({
        ruc: prov.ruc || '',
        nombre: prov.nombre || '',
        categoria: prov.categoria || 'NACIONAL'
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
        await api.post('/proveedores/', payload);
        setMensaje({ texto: '✅ Proveedor registrado exitosamente.', tipo: 'exito' });
      } else if (viewMode === 'MODIFICAR') {
        await api.put(`/proveedores/${selectedId}`, payload);
        setMensaje({ texto: '✅ Proveedor actualizado exitosamente.', tipo: 'exito' });
      }

      cargarProveedores();
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

  // --- ELIMINAR ---
  const handleEliminar = async () => {
    const proveedorSeleccionado = proveedores.find(p => p.id_proveedor === selectedId);
    if (!proveedorSeleccionado) return;

    const confirmar = window.confirm(`¿Estás seguro de desactivar el proveedor "${proveedorSeleccionado.nombre}"?\nEsta acción lo marcará como INACTIVO.`);
    if (!confirmar) return;

    try {
      await api.delete(`/proveedores/${selectedId}`);
      setMensaje({ texto: `✅ Proveedor "${proveedorSeleccionado.nombre}" desactivado correctamente.`, tipo: 'exito' });
      cargarProveedores();
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
    const proveedorSeleccionado = proveedores.find(i => i.id_proveedor === selectedId);
    if (!proveedorSeleccionado) return;

    try {
      await api.put(`/proveedores/${selectedId}/restaurar`);
      setMensaje({ texto: `✅ Proveedor "${proveedorSeleccionado.nombre}" restaurado correctamente.`, tipo: 'exito' });
      cargarProveedores();
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
    const proveedorSeleccionado = proveedores.find(i => i.id_proveedor === selectedId);
    if (!proveedorSeleccionado) return;

    const confirmar = window.confirm(`⚠️ ¡ATENCIÓN! ⚠️\n¿Estás seguro de ELIMINAR DEFINITIVAMENTE el proveedor "${proveedorSeleccionado.nombre}"?\nEsta acción NO se puede deshacer y fallará si el registro ya está en uso.`);
    if (!confirmar) return;

    try {
      await api.delete(`/proveedores/${selectedId}/fisico`);
      setMensaje({ texto: `✅ Proveedor "${proveedorSeleccionado.nombre}" eliminado definitivamente.`, tipo: 'exito' });
      cargarProveedores();
      setSelectedId(null);
      setFormData(estadoInicial);
      setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);
    } catch (error) {
      console.error('Error al eliminar físicamente:', error);
      const detalle = error.response?.data?.detail || 'No se pudo eliminar.';
      setMensaje({ texto: `❌ ${detalle}`, tipo: 'error' });
    }
  };

  const proveedoresFiltrados = proveedores.filter((prov) =>
    (prov.nombre || '').toLowerCase().includes(busqueda.toLowerCase()) ||
    (prov.ruc || '').includes(busqueda) ||
    (prov.categoria || '').toLowerCase().includes(busqueda.toLowerCase())
  );

  const isReadOnly = viewMode === 'CONSULTAR';
  const proveedorActualmenteSeleccionado = proveedores.find(p => p.id_proveedor === selectedId);
  const esInactivoSeleccionado = proveedorActualmenteSeleccionado?.estado_registro === 'INACTIVO';

  return (
    <div className="page-container">
      <h2 className="page-title">Maestro de Proveedores</h2>

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
            <h4 className="text-muted" style={{ margin: 0 }}>Proveedores Registrados ({proveedoresFiltrados.length})</h4>
            
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
                placeholder="🔍 Buscar por nombre, RUC o categoría..."
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
                  <th style={{ width: '160px' }}>RUC / Tax ID</th>
                  <th>Nombre / Razón Social</th>
                  <th style={{ width: '130px' }}>Categoría</th>
                  <th style={{ width: '120px' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {proveedoresFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center text-muted">No hay Proveedores registrados aún.</td>
                  </tr>
                ) : (
                  proveedoresFiltrados.map((prov) => {
                    const esInactivo = prov.estado_registro === 'INACTIVO';
                    const isSelected = selectedId === prov.id_proveedor;
                    let trClasses = [];
                    if (isSelected) trClasses.push('selected');
                    if (esInactivo) trClasses.push('inactive');

                    return (
                      <tr 
                        key={prov.id_proveedor} 
                        onClick={() => handleRowClick(prov)}
                        className={trClasses.join(' ')}
                      >
                        <td>{prov.id_proveedor}</td>
                        <td className="font-bold">
                          <span className="truncate-text" title={prov.ruc}>{prov.ruc}</span>
                        </td>
                        <td>
                          <span className="truncate-text" title={prov.nombre}>{prov.nombre}</span>
                        </td>
                        <td className="no-strike">
                          <span className={`badge ${prov.categoria === 'NACIONAL' ? 'badge-info' : 'badge-warning'}`}>
                            {prov.categoria === 'NACIONAL' ? 'Nacional' : 'Extranjero'}
                          </span>
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
            {viewMode === 'NUEVO' ? 'Registro de Nuevo Proveedor' : viewMode === 'MODIFICAR' ? 'Modificar Proveedor' : 'Detalle del Proveedor'}
          </h3>
          
          <form onSubmit={handleGuardar}>
            <div className="form-grid">
              <div>
                <label className="label-text">RUC / Tax ID *</label>
                <div className="flex-row">
                  <input
                    type="text"
                    value={formData.ruc}
                    onChange={(e) => setFormData(prev => ({ ...prev, ruc: e.target.value }))}
                    disabled={isReadOnly}
                    required
                    maxLength="15"
                    placeholder="RUC o Tax ID"
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
                <label className="label-text">Razón Social *</label>
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData(prev => ({ ...prev, nombre: e.target.value }))}
                  disabled={isReadOnly || formData.categoria === 'NACIONAL'} 
                  required
                  placeholder="Nombre o Razón Social"
                  className="form-input"
                />
                <small className="text-muted mt-2" style={{ display: 'block' }}>
                  * Extranjeros pueden editar manualmente.
                </small>
              </div>

              <div>
                <label className="label-text">Categoría *</label>
                <select
                  value={formData.categoria}
                  onChange={(e) => setFormData(prev => ({ ...prev, categoria: e.target.value }))}
                  disabled={isReadOnly}
                  className="form-input"
                >
                  <option value="NACIONAL">🇵🇪 Nacional</option>
                  <option value="EXTRANJERO">✈️ Extranjero</option>
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

export default Proveedores;
