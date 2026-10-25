import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import useDebounce from '../hooks/useDebounce';

const Almacenes = () => {
  const [almacenes, setAlmacenes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [viewMode, setViewMode] = useState('DETALLE'); // 'DETALLE', 'NUEVO', 'MODIFICAR'
  
  const [busqueda, setBusqueda] = useState('');
  const debouncedSearch = useDebounce(busqueda, 300);
  const [filtroEstado, setFiltroEstado] = useState('ACTIVO'); // 'ACTIVO', 'INACTIVO', 'TODOS'

  const [isGuardando, setIsGuardando] = useState(false);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  const estadoInicial = {
    nombre: '',
    ubicacion: ''
  };
  const [formData, setFormData] = useState(estadoInicial);

  useEffect(() => {
    cargarAlmacenes();
  }, [filtroEstado]);

  const cargarAlmacenes = async () => {
    try {
      const mostrarInactivos = filtroEstado !== 'ACTIVO';
      const respuesta = await api.get(`/almacenes/?mostrar_inactivos=${mostrarInactivos}`);
      const data = respuesta.data || [];
      setAlmacenes(data);

      if (selectedId) {
        const found = data.find(a => a.id_almacen === selectedId);
        if (found) {
          setFormData({ nombre: found.nombre || '', ubicacion: found.ubicacion || '' });
        }
      } else if (data.length > 0 && viewMode === 'DETALLE') {
        setSelectedId(data[0].id_almacen);
        setFormData({ nombre: data[0].nombre || '', ubicacion: data[0].ubicacion || '' });
      }
    } catch (error) {
      console.error('Error al cargar almacenes:', error);
      mostrarAlerta('No se pudo conectar con la base de datos.', 'error');
    }
  };

  const mostrarAlerta = (texto, tipo = 'info') => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);
  };

  const handleSelect = (al) => {
    setSelectedId(al.id_almacen);
    setViewMode('DETALLE');
    setFormData({
      nombre: al.nombre || '',
      ubicacion: al.ubicacion || ''
    });
  };

  const handleNuevo = () => {
    setSelectedId(null);
    setViewMode('NUEVO');
    setFormData(estadoInicial);
  };

  const handleModificar = () => {
    if (!selectedAlmacen) return;
    setViewMode('MODIFICAR');
    setFormData({
      nombre: selectedAlmacen.nombre || '',
      ubicacion: selectedAlmacen.ubicacion || ''
    });
  };

  const handleCancelarEdicion = () => {
    if (selectedAlmacen) {
      setViewMode('DETALLE');
      setFormData({
        nombre: selectedAlmacen.nombre || '',
        ubicacion: selectedAlmacen.ubicacion || ''
      });
    } else {
      setViewMode('DETALLE');
      if (almacenesFiltrados.length > 0) {
        handleSelect(almacenesFiltrados[0]);
      }
    }
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!formData.nombre.trim()) {
      mostrarAlerta('El nombre del almacén es obligatorio.', 'error');
      return;
    }

    setIsGuardando(true);
    try {
      const payload = {
        nombre: formData.nombre.trim(),
        ubicacion: formData.ubicacion.trim() || null
      };

      if (viewMode === 'NUEVO') {
        const res = await api.post('/almacenes/', payload);
        mostrarAlerta('✅ Almacén registrado exitosamente.', 'exito');
        await cargarAlmacenes();
        setSelectedId(res.data?.id_almacen || null);
        setViewMode('DETALLE');
      } else if (viewMode === 'MODIFICAR') {
        await api.put(`/almacenes/${selectedId}`, payload);
        mostrarAlerta('✅ Almacén actualizado exitosamente.', 'exito');
        await cargarAlmacenes();
        setViewMode('DETALLE');
      }
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Error al guardar el registro.';
      mostrarAlerta(`❌ ${errorMsg}`, 'error');
    } finally {
      setIsGuardando(false);
    }
  };

  const handleEliminar = async () => {
    if (!selectedAlmacen) return;
    const confirmar = window.confirm(`¿Estás seguro de desactivar el almacén "${selectedAlmacen.nombre}"?\nEsta acción lo marcará como INACTIVO.`);
    if (!confirmar) return;

    try {
      await api.delete(`/almacenes/${selectedId}`);
      mostrarAlerta(`✅ Almacén "${selectedAlmacen.nombre}" desactivado correctamente.`, 'exito');
      await cargarAlmacenes();
    } catch (error) {
      const detalle = error.response?.data?.detail || 'No se pudo desactivar.';
      mostrarAlerta(`❌ ${detalle}`, 'error');
    }
  };

  const handleRestaurar = async () => {
    if (!selectedAlmacen) return;
    try {
      await api.put(`/almacenes/${selectedId}/restaurar`);
      mostrarAlerta(`✅ Almacén "${selectedAlmacen.nombre}" restaurado a ACTIVO.`, 'exito');
      await cargarAlmacenes();
    } catch (error) {
      const detalle = error.response?.data?.detail || 'No se pudo restaurar.';
      mostrarAlerta(`❌ ${detalle}`, 'error');
    }
  };

  const handleEliminarFisico = async () => {
    if (!selectedAlmacen) return;
    const confirmacion = window.confirm(
      `⚠️ ATENCIÓN: ¿Deseas eliminar DEFINITIVAMENTE el almacén "${selectedAlmacen.nombre}"?\n\nEsta acción NO se puede deshacer y fallará si tiene contenedores asociados.`
    );
    if (!confirmacion) return;

    try {
      await api.delete(`/almacenes/${selectedId}/fisico`);
      mostrarAlerta(`✅ Almacén "${selectedAlmacen.nombre}" eliminado definitivamente.`, 'exito');
      setSelectedId(null);
      await cargarAlmacenes();
    } catch (error) {
      const detalle = error.response?.data?.detail || 'No se pudo eliminar definitivamente.';
      mostrarAlerta(`❌ ${detalle}`, 'error');
    }
  };

  const almacenesFiltrados = useMemo(() => {
    return almacenes.filter((al) => {
      const coincideBusqueda = 
        (al.nombre || '').toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        (al.ubicacion || '').toLowerCase().includes(debouncedSearch.toLowerCase());

      if (filtroEstado === 'ACTIVO') return coincideBusqueda && al.estado_registro === 'ACTIVO';
      if (filtroEstado === 'INACTIVO') return coincideBusqueda && al.estado_registro === 'INACTIVO';
      return coincideBusqueda;
    });
  }, [almacenes, debouncedSearch, filtroEstado]);

  const selectedAlmacen = useMemo(() => {
    return almacenes.find(a => a.id_almacen === selectedId) || null;
  }, [almacenes, selectedId]);

  const esInactivoSeleccionado = selectedAlmacen?.estado_registro === 'INACTIVO';

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      
      {/* HEADER DE MÓDULO */}
      <header className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-xl shadow-inner">
            🏭
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-tight">Catálogo de Almacenes</h1>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                Módulo Catálogos
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Terminales portuarios, depósitos temporales y centros de distribución de carga
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleNuevo}
            className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-lg transition-colors shadow-lg shadow-teal-600/20 flex items-center gap-1.5 cursor-pointer"
          >
            <span>+</span>
            <span>Nuevo Almacén</span>
          </button>
        </div>
      </header>

      {/* MASTER-DETAIL GRID */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 p-5 min-h-0 overflow-hidden">
        
        {/* BANDEJA IZQUIERDA (38%) */}
        <section className="lg:col-span-5 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl min-h-0">
          
          <div className="p-3.5 border-b border-slate-800 bg-slate-900/60 space-y-2.5 shrink-0">
            <div className="relative">
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por Nombre o Ubicación..."
                className="w-full pl-9 pr-4 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all"
              />
              <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 text-xs">🔍</span>
              {busqueda && (
                <button onClick={() => setBusqueda('')} className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-white text-xs">✕</button>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => setFiltroEstado('ACTIVO')}
                className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                  filtroEstado === 'ACTIVO'
                    ? 'bg-teal-600 text-white shadow'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Activos ({almacenes.filter(a => a.estado_registro === 'ACTIVO').length})
              </button>
              <button
                type="button"
                onClick={() => setFiltroEstado('INACTIVO')}
                className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                  filtroEstado === 'INACTIVO'
                    ? 'bg-teal-600 text-white shadow'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Inactivos ({almacenes.filter(a => a.estado_registro === 'INACTIVO').length})
              </button>
              <button
                type="button"
                onClick={() => setFiltroEstado('TODOS')}
                className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                  filtroEstado === 'TODOS'
                    ? 'bg-teal-600 text-white shadow'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Todos ({almacenes.length})
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80 p-2 space-y-1 min-h-0">
            {almacenesFiltrados.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No se encontraron almacenes con los criterios indicados.
              </div>
            ) : (
              almacenesFiltrados.map((al) => {
                const isSelected = selectedId === al.id_almacen;
                const isInactivo = al.estado_registro === 'INACTIVO';

                return (
                  <div
                    key={al.id_almacen}
                    onClick={() => handleSelect(al)}
                    className={`p-3 rounded-lg cursor-pointer transition-all border ${
                      isSelected
                        ? 'bg-teal-950/30 border-teal-500/80 shadow-md ring-1 ring-teal-500/20'
                        : 'bg-slate-900/60 hover:bg-slate-800/70 border-slate-800/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-teal-400">#{al.id_almacen}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          isInactivo
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        }`}>
                          {al.estado_registro || 'ACTIVO'}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 truncate max-w-[140px]">
                        {al.ubicacion || 'Sin ubicación'}
                      </span>
                    </div>

                    <div className="mt-1.5 text-xs font-semibold text-slate-200 truncate">
                      {al.nombre}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* PANEL DERECHO WORKSTATION (62%) */}
        <section className="lg:col-span-7 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl min-h-0">
          
          {mensaje.texto && (
            <div className={`p-3 border-b text-xs flex items-center justify-between animate-fadeIn ${
              mensaje.tipo === 'exito'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : mensaje.tipo === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-teal-500/10 border-teal-500/30 text-teal-300'
            }`}>
              <span>{mensaje.texto}</span>
              <button onClick={() => setMensaje({ texto: '', tipo: '' })} className="hover:text-white">✕</button>
            </div>
          )}

          {!selectedAlmacen && viewMode !== 'NUEVO' ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-500">
              <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-3xl mb-4 shadow-inner">
                🏭
              </div>
              <h3 className="text-base font-bold text-slate-300">Ficha Maestra de Almacén</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1.5">
                Seleccione un depósito de la bandeja izquierda para ver o actualizar sus datos físicos.
              </p>
              <button
                onClick={handleNuevo}
                className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-teal-600/20"
              >
                + Registrar Nuevo Almacén
              </button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-5 space-y-5">
              
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-base font-bold text-white tracking-tight">
                      {viewMode === 'NUEVO' ? '✨ Nuevo Almacén' : selectedAlmacen?.nombre}
                    </h2>
                    {viewMode !== 'NUEVO' && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        esInactivoSeleccionado
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      }`}>
                        {selectedAlmacen?.estado_registro || 'ACTIVO'}
                      </span>
                    )}
                  </div>

                  {viewMode === 'DETALLE' && (
                    <div className="flex items-center gap-2">
                      {!esInactivoSeleccionado ? (
                        <>
                          <button
                            onClick={handleModificar}
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <span>✏️</span>
                            <span>Modificar</span>
                          </button>
                          <button
                            onClick={handleEliminar}
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <span>🗑️</span>
                            <span>Desactivar</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={handleRestaurar}
                            className="px-2.5 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <span>♻️</span>
                            <span>Restaurar</span>
                          </button>
                          <button
                            onClick={handleEliminarFisico}
                            className="px-2.5 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <span>🚫</span>
                            <span>Eliminar Definitivo</span>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {viewMode !== 'NUEVO' && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-1 border-t border-slate-800/80">
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">ID</span>
                      <span className="font-mono text-slate-200">#{selectedAlmacen?.id_almacen}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">Ubicación</span>
                      <span className="text-teal-400 font-semibold truncate block">{selectedAlmacen?.ubicacion || 'No especificada'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">Estado</span>
                      <span className="text-slate-200 font-semibold">{selectedAlmacen?.estado_registro}</span>
                    </div>
                  </div>
                )}
              </div>

              {viewMode === 'DETALLE' ? (
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                    <span className="text-teal-400 text-sm">📋</span>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      Datos del Almacén
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-lg space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Nombre del Almacén</span>
                      <span className="font-bold text-slate-100 text-sm">{selectedAlmacen?.nombre}</span>
                    </div>

                    <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-lg space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Ubicación / Dirección</span>
                      <span className="font-semibold text-slate-200 text-sm">{selectedAlmacen?.ubicacion || 'Sin dirección registrada'}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleGuardar} className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <span className="text-teal-400">✏️</span>
                      <span>{viewMode === 'NUEVO' ? 'Registro de Almacén' : 'Edición de Almacén'}</span>
                    </h3>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                        Nombre del Almacén / Depósito *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.nombre}
                        onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                        placeholder="Ej. DP World Callao, Ransa San Agustín..."
                        className="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-teal-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                        Ubicación / Distrito / Referencia
                      </label>
                      <input
                        type="text"
                        value={formData.ubicacion}
                        onChange={(e) => setFormData({ ...formData, ubicacion: e.target.value })}
                        placeholder="Ej. Av. Manco Cápac 123, Callao..."
                        className="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-teal-500"
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={handleCancelarEdicion}
                      className="px-4 py-2 border border-slate-700 text-slate-300 hover:bg-slate-800 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isGuardando}
                      className="px-6 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-teal-600/20 flex items-center gap-2 cursor-pointer"
                    >
                      {isGuardando ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Guardando...</span>
                        </>
                      ) : (
                        <span>Guardar Almacén</span>
                      )}
                    </button>
                  </div>
                </form>
              )}

            </div>
          )}
        </section>

      </div>
    </div>
  );
};

export default Almacenes;
