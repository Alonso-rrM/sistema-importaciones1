import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import useDebounce from '../hooks/useDebounce';

const Bancos = () => {
  const [bancos, setBancos] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [viewMode, setViewMode] = useState('DETALLE'); // 'DETALLE', 'NUEVO', 'MODIFICAR'
  
  const [busqueda, setBusqueda] = useState('');
  const debouncedSearch = useDebounce(busqueda, 300);
  const [filtroEstado, setFiltroEstado] = useState('ACTIVO'); // 'ACTIVO', 'INACTIVO', 'TODOS'

  const [isGuardando, setIsGuardando] = useState(false);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  const estadoInicial = {
    nombre: ''
  };
  const [formData, setFormData] = useState(estadoInicial);

  useEffect(() => {
    cargarBancos();
  }, [filtroEstado]);

  const cargarBancos = async () => {
    try {
      const mostrarInactivos = filtroEstado !== 'ACTIVO';
      const respuesta = await api.get(`/bancos/?mostrar_inactivos=${mostrarInactivos}`);
      const data = respuesta.data || [];
      setBancos(data);

      if (selectedId) {
        const found = data.find(b => b.id_banco === selectedId);
        if (found) {
          setFormData({ nombre: found.nombre || '' });
        }
      } else if (data.length > 0 && viewMode === 'DETALLE') {
        setSelectedId(data[0].id_banco);
        setFormData({ nombre: data[0].nombre || '' });
      }
    } catch (error) {
      console.error('Error al cargar bancos:', error);
      mostrarAlerta('No se pudo conectar con la base de datos.', 'error');
    }
  };

  const mostrarAlerta = (texto, tipo = 'info') => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);
  };

  const handleSelect = (b) => {
    setSelectedId(b.id_banco);
    setViewMode('DETALLE');
    setFormData({
      nombre: b.nombre || ''
    });
  };

  const handleNuevo = () => {
    setSelectedId(null);
    setViewMode('NUEVO');
    setFormData(estadoInicial);
  };

  const handleModificar = () => {
    if (!selectedBanco) return;
    setViewMode('MODIFICAR');
    setFormData({
      nombre: selectedBanco.nombre || ''
    });
  };

  const handleCancelarEdicion = () => {
    if (selectedBanco) {
      setViewMode('DETALLE');
      setFormData({
        nombre: selectedBanco.nombre || ''
      });
    } else {
      setViewMode('DETALLE');
      if (bancosFiltrados.length > 0) {
        handleSelect(bancosFiltrados[0]);
      }
    }
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!formData.nombre.trim()) {
      mostrarAlerta('El nombre de la entidad bancaria es obligatorio.', 'error');
      return;
    }

    setIsGuardando(true);
    try {
      const payload = {
        nombre: formData.nombre.trim()
      };

      if (viewMode === 'NUEVO') {
        const res = await api.post('/bancos/', payload);
        mostrarAlerta('✅ Banco registrado exitosamente.', 'exito');
        await cargarBancos();
        setSelectedId(res.data?.id_banco || null);
        setViewMode('DETALLE');
      } else if (viewMode === 'MODIFICAR') {
        await api.put(`/bancos/${selectedId}`, payload);
        mostrarAlerta('✅ Banco actualizado exitosamente.', 'exito');
        await cargarBancos();
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
    if (!selectedBanco) return;
    const confirmar = window.confirm(`¿Estás seguro de desactivar la entidad "${selectedBanco.nombre}"?\nEsta acción lo marcará como INACTIVO.`);
    if (!confirmar) return;

    try {
      await api.delete(`/bancos/${selectedId}`);
      mostrarAlerta(`✅ Banco "${selectedBanco.nombre}" desactivado correctamente.`, 'exito');
      await cargarBancos();
    } catch (error) {
      const detalle = error.response?.data?.detail || 'No se pudo desactivar.';
      mostrarAlerta(`❌ ${detalle}`, 'error');
    }
  };

  const handleRestaurar = async () => {
    if (!selectedBanco) return;
    try {
      await api.put(`/bancos/${selectedId}/restaurar`);
      mostrarAlerta(`✅ Banco "${selectedBanco.nombre}" restaurado a ACTIVO.`, 'exito');
      await cargarBancos();
    } catch (error) {
      const detalle = error.response?.data?.detail || 'No se pudo restaurar.';
      mostrarAlerta(`❌ ${detalle}`, 'error');
    }
  };

  const handleEliminarFisico = async () => {
    if (!selectedBanco) return;
    const confirmacion = window.confirm(
      `⚠️ ATENCIÓN: ¿Deseas eliminar DEFINITIVAMENTE el banco "${selectedBanco.nombre}"?\n\nEsta acción NO se puede deshacer y fallará si tiene vouchers vinculados.`
    );
    if (!confirmacion) return;

    try {
      await api.delete(`/bancos/${selectedId}/fisico`);
      mostrarAlerta(`✅ Banco "${selectedBanco.nombre}" eliminado definitivamente.`, 'exito');
      setSelectedId(null);
      await cargarBancos();
    } catch (error) {
      const detalle = error.response?.data?.detail || 'No se pudo eliminar definitivamente.';
      mostrarAlerta(`❌ ${detalle}`, 'error');
    }
  };

  const bancosFiltrados = useMemo(() => {
    return bancos.filter((b) => {
      const coincideBusqueda = (b.nombre || '').toLowerCase().includes(debouncedSearch.toLowerCase());

      if (filtroEstado === 'ACTIVO') return coincideBusqueda && b.estado_registro === 'ACTIVO';
      if (filtroEstado === 'INACTIVO') return coincideBusqueda && b.estado_registro === 'INACTIVO';
      return coincideBusqueda;
    });
  }, [bancos, debouncedSearch, filtroEstado]);

  const selectedBanco = useMemo(() => {
    return bancos.find(b => b.id_banco === selectedId) || null;
  }, [bancos, selectedId]);

  const esInactivoSeleccionado = selectedBanco?.estado_registro === 'INACTIVO';

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      
      {/* HEADER DE MÓDULO */}
      <header className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-xl shadow-inner">
            🏦
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-tight">Catálogo de Entidades Bancarias</h1>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                Módulo Catálogos
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Instituciones financieras autorizadas para emisión y registro de Vouchers de pago
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleNuevo}
            className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-lg transition-colors shadow-lg shadow-teal-600/20 flex items-center gap-1.5 cursor-pointer"
          >
            <span>+</span>
            <span>Nuevo Banco</span>
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
                placeholder="Buscar por Nombre del Banco..."
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
                Activos ({bancos.filter(b => b.estado_registro === 'ACTIVO').length})
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
                Inactivos ({bancos.filter(b => b.estado_registro === 'INACTIVO').length})
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
                Todos ({bancos.length})
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80 p-2 space-y-1 min-h-0">
            {bancosFiltrados.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No se encontraron bancos con los criterios indicados.
              </div>
            ) : (
              bancosFiltrados.map((b) => {
                const isSelected = selectedId === b.id_banco;
                const isInactivo = b.estado_registro === 'INACTIVO';

                return (
                  <div
                    key={b.id_banco}
                    onClick={() => handleSelect(b)}
                    className={`p-3 rounded-lg cursor-pointer transition-all border ${
                      isSelected
                        ? 'bg-teal-950/30 border-teal-500/80 shadow-md ring-1 ring-teal-500/20'
                        : 'bg-slate-900/60 hover:bg-slate-800/70 border-slate-800/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-teal-400">#{b.id_banco}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          isInactivo
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        }`}>
                          {b.estado_registro || 'ACTIVO'}
                        </span>
                      </div>
                    </div>

                    <div className="mt-1.5 text-xs font-semibold text-slate-200 truncate">
                      {b.nombre}
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

          {!selectedBanco && viewMode !== 'NUEVO' ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-500">
              <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-3xl mb-4 shadow-inner">
                🏦
              </div>
              <h3 className="text-base font-bold text-slate-300">Ficha de Entidad Bancaria</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1.5">
                Seleccione un banco de la bandeja izquierda para ver o modificar su denominación.
              </p>
              <button
                onClick={handleNuevo}
                className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-teal-600/20"
              >
                + Registrar Nuevo Banco
              </button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-5 space-y-5">
              
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-base font-bold text-white tracking-tight">
                      {viewMode === 'NUEVO' ? '✨ Nuevo Banco' : selectedBanco?.nombre}
                    </h2>
                    {viewMode !== 'NUEVO' && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        esInactivoSeleccionado
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      }`}>
                        {selectedBanco?.estado_registro || 'ACTIVO'}
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
                      <span className="font-mono text-slate-200">#{selectedBanco?.id_banco}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">Denominación</span>
                      <span className="text-teal-400 font-semibold truncate block">{selectedBanco?.nombre}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">Estado</span>
                      <span className="text-slate-200 font-semibold">{selectedBanco?.estado_registro}</span>
                    </div>
                  </div>
                )}
              </div>

              {viewMode === 'DETALLE' ? (
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                    <span className="text-teal-400 text-sm">📋</span>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      Datos de la Entidad Bancaria
                    </h3>
                  </div>

                  <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-lg space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Nombre Oficial</span>
                    <span className="font-bold text-slate-100 text-sm">{selectedBanco?.nombre}</span>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleGuardar} className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <span className="text-teal-400">✏️</span>
                      <span>{viewMode === 'NUEVO' ? 'Registro de Banco' : 'Edición de Banco'}</span>
                    </h3>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                        Nombre de la Institución Financiera *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.nombre}
                        onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                        placeholder="Ej. BCP, BBVA, Interbank, Scotiabank..."
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
                        <span>Guardar Banco</span>
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

export default Bancos;
