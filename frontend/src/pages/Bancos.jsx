import React, { useState, useEffect } from 'react';
import api from '../services/api';

const Bancos = () => {
  // --- ESTADOS DE VISTA Y SELECCIÓN ---
  const [viewMode, setViewMode] = useState('LISTA'); // LISTA, NUEVO, MODIFICAR, CONSULTAR
  const [selectedId, setSelectedId] = useState(null);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });
  const [busqueda, setBusqueda] = useState('');
  const [mostrarInactivos, setMostrarInactivos] = useState(false);

  // --- DATOS ---
  const [bancos, setBancos] = useState([]);

  const estadoInicial = {
    nombre: ''
  };
  const [formData, setFormData] = useState(estadoInicial);

  // --- CARGA INICIAL ---
  useEffect(() => {
    cargarBancos();
  }, [mostrarInactivos]);

  const cargarBancos = async () => {
    try {
      const respuesta = await api.get(`/bancos/?mostrar_inactivos=${mostrarInactivos}`);
      setBancos(respuesta.data);
    } catch (error) {
      console.error('Error al cargar:', error);
      setMensaje({ texto: 'No se pudo conectar con la base de datos.', tipo: 'error' });
    }
  };

  // --- MANEJO DE SELECCIÓN ---
  const handleRowClick = (banco) => {
    if (selectedId === banco.id_banco) {
      setSelectedId(null);
      setFormData(estadoInicial);
    } else {
      setSelectedId(banco.id_banco);
      setFormData({
        nombre: banco.nombre || ''
      });
    }
  };

  // --- GUARDAR ---
  const handleGuardar = async (e) => {
    e.preventDefault();
    setMensaje({ texto: 'Guardando...', tipo: 'info' });

    try {
      const payload = { ...formData };

      if (viewMode === 'NUEVO') {
        await api.post('/bancos/', payload);
        setMensaje({ texto: '✅ Banco registrado exitosamente.', tipo: 'exito' });
      } else if (viewMode === 'MODIFICAR') {
        await api.put(`/bancos/${selectedId}`, payload);
        setMensaje({ texto: '✅ Banco actualizado exitosamente.', tipo: 'exito' });
      }

      cargarBancos();
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
    const bancoSeleccionado = bancos.find(b => b.id_banco === selectedId);
    if (!bancoSeleccionado) return;

    const confirmar = window.confirm(`¿Estás seguro de desactivar el banco "${bancoSeleccionado.nombre}"?\nEsta acción lo marcará como INACTIVO.`);
    if (!confirmar) return;

    try {
      await api.delete(`/bancos/${selectedId}`);
      setMensaje({ texto: `✅ Banco "${bancoSeleccionado.nombre}" desactivado correctamente.`, tipo: 'exito' });
      cargarBancos();
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
    const bancoSeleccionado = bancos.find(i => i.id_banco === selectedId);
    if (!bancoSeleccionado) return;

    try {
      await api.put(`/bancos/${selectedId}/restaurar`);
      setMensaje({ texto: `✅ Banco "${bancoSeleccionado.nombre}" restaurado correctamente.`, tipo: 'exito' });
      cargarBancos();
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
    const bancoSeleccionado = bancos.find(i => i.id_banco === selectedId);
    if (!bancoSeleccionado) return;

    const confirmar = window.confirm(`⚠️ ¡ATENCIÓN! ⚠️\n¿Estás seguro de ELIMINAR DEFINITIVAMENTE el banco "${bancoSeleccionado.nombre}"?\nEsta acción NO se puede deshacer y fallará si el registro ya está en uso.`);
    if (!confirmar) return;

    try {
      await api.delete(`/bancos/${selectedId}/fisico`);
      setMensaje({ texto: `✅ Banco "${bancoSeleccionado.nombre}" eliminado definitivamente.`, tipo: 'exito' });
      cargarBancos();
      setSelectedId(null);
      setFormData(estadoInicial);
      setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);
    } catch (error) {
      console.error('Error al eliminar físicamente:', error);
      const detalle = error.response?.data?.detail || 'No se pudo eliminar.';
      setMensaje({ texto: `❌ ${detalle}`, tipo: 'error' });
    }
  };

  const bancosFiltrados = bancos.filter((banco) =>
    (banco.nombre || '').toLowerCase().includes(busqueda.toLowerCase())
  );

  const isReadOnly = viewMode === 'CONSULTAR';
  const bancoActualmenteSeleccionado = bancos.find(b => b.id_banco === selectedId);
  const esInactivoSeleccionado = bancoActualmenteSeleccionado?.estado_registro === 'INACTIVO';

  return (
    <div className="page-container">
      <h2 className="page-title">Maestro de Bancos</h2>

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
            <h4 className="text-muted" style={{ margin: 0 }}>Bancos Registrados ({bancosFiltrados.length})</h4>
            
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
                  <th>Nombre del Banco</th>
                  <th style={{ width: '120px' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {bancosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan="3" className="text-center text-muted">No hay Bancos registrados aún.</td>
                  </tr>
                ) : (
                  bancosFiltrados.map((banco) => {
                    const esInactivo = banco.estado_registro === 'INACTIVO';
                    const isSelected = selectedId === banco.id_banco;
                    let trClasses = [];
                    if (isSelected) trClasses.push('selected');
                    if (esInactivo) trClasses.push('inactive');

                    return (
                      <tr 
                        key={banco.id_banco} 
                        onClick={() => handleRowClick(banco)}
                        className={trClasses.join(' ')}
                      >
                        <td>{banco.id_banco}</td>
                        <td className="font-bold">
                          <span className="truncate-text" title={banco.nombre}>{banco.nombre}</span>
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
            {viewMode === 'NUEVO' ? 'Registro de Nuevo Banco' : viewMode === 'MODIFICAR' ? 'Modificar Banco' : 'Detalle del Banco'}
          </h3>
          
          <form onSubmit={handleGuardar}>
            <div className="form-grid">
              <div>
                <label className="label-text">Nombre del Banco *</label>
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData(prev => ({ ...prev, nombre: e.target.value }))}
                  disabled={isReadOnly}
                  required
                  placeholder="Ej: BCP, BBVA, Interbank..."
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

export default Bancos;
