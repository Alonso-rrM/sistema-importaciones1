import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import useDebounce from '../hooks/useDebounce';
import { acortarRazonSocial } from '../utils/textUtils';

const Agentes = () => {
  const [agentes, setAgentes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [viewMode, setViewMode] = useState('DETALLE'); // 'DETALLE', 'NUEVO', 'MODIFICAR'
  
  const [busqueda, setBusqueda] = useState('');
  const debouncedSearch = useDebounce(busqueda, 300);
  const [filtroEstado, setFiltroEstado] = useState('ACTIVO'); // 'ACTIVO', 'INACTIVO', 'TODOS'

  const [buscandoRuc, setBuscandoRuc] = useState(false);
  const [sunatData, setSunatData] = useState(null);
  const [isGuardando, setIsGuardando] = useState(false);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  const estadoInicial = {
    ruc: '',
    nombre: ''
  };
  const [formData, setFormData] = useState(estadoInicial);

  useEffect(() => {
    cargarAgentes();
  }, [filtroEstado]);

  const cargarAgentes = async () => {
    try {
      const mostrarInactivos = filtroEstado !== 'ACTIVO';
      const respuesta = await api.get(`/agentes/?mostrar_inactivos=${mostrarInactivos}`);
      const data = respuesta.data || [];
      setAgentes(data);

      if (selectedId) {
        const found = data.find(a => a.id_agente === selectedId);
        if (found) {
          setFormData({ ruc: found.ruc || '', nombre: found.nombre || '' });
        }
      } else if (data.length > 0 && viewMode === 'DETALLE') {
        setSelectedId(data[0].id_agente);
        setFormData({ ruc: data[0].ruc || '', nombre: data[0].nombre || '' });
      }
    } catch (error) {
      console.error('Error al cargar agentes:', error);
      mostrarAlerta('No se pudo conectar con la base de datos.', 'error');
    }
  };

  const mostrarAlerta = (texto, tipo = 'info') => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);
  };

  const handleSelect = (ag) => {
    setSelectedId(ag.id_agente);
    setViewMode('DETALLE');
    setFormData({
      ruc: ag.ruc || '',
      nombre: ag.nombre || ''
    });
  };

  const handleNuevo = () => {
    setSelectedId(null);
    setViewMode('NUEVO');
    setSunatData(null);
    setFormData(estadoInicial);
  };

  const handleModificar = () => {
    if (!selectedAgente) return;
    setViewMode('MODIFICAR');
    setSunatData(null);
    setFormData({
      ruc: selectedAgente.ruc || '',
      nombre: selectedAgente.nombre || ''
    });
  };

  const handleCancelarEdicion = () => {
    setSunatData(null);
    if (selectedAgente) {
      setViewMode('DETALLE');
      setFormData({
        ruc: selectedAgente.ruc || '',
        nombre: selectedAgente.nombre || ''
      });
    } else {
      setViewMode('DETALLE');
      if (agentesFiltrados.length > 0) {
        handleSelect(agentesFiltrados[0]);
      }
    }
  };

  // Búsqueda RUC en SUNAT con acortamiento inteligente
  const buscarRuc = async () => {
    if (formData.ruc.length !== 11 || isNaN(formData.ruc)) {
      mostrarAlerta('El RUC debe tener 11 dígitos numéricos.', 'error');
      return;
    }
    setBuscandoRuc(true);
    try {
      const respuesta = await api.get(`/sunat/ruc/${formData.ruc}`);
      if (respuesta.data.razon_social) {
        const original = respuesta.data.razon_social;
        const sugerido = respuesta.data.nombre_sugerido || acortarRazonSocial(original);
        setSunatData({ original, sugerido });
        setFormData(prev => ({
          ...prev,
          nombre: sugerido
        }));
        mostrarAlerta(`✅ SUNAT: RUC válido. Razón social acortada sugerida. Puedes editarla libremente.`, 'exito');
      } else {
        mostrarAlerta('RUC no encontrado en SUNAT.', 'info');
      }
    } catch (error) {
      mostrarAlerta('No se pudo consultar el RUC en SUNAT.', 'error');
    } finally {
      setBuscandoRuc(false);
    }
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!formData.nombre.trim()) {
      mostrarAlerta('El nombre de la Agencia de Aduanas es obligatorio.', 'error');
      return;
    }

    setIsGuardando(true);
    try {
      const payload = {
        ruc: formData.ruc.trim() || null,
        nombre: formData.nombre.trim()
      };

      if (viewMode === 'NUEVO') {
        const res = await api.post('/agentes/', payload);
        mostrarAlerta('✅ Agente registrado exitosamente.', 'exito');
        await cargarAgentes();
        setSelectedId(res.data?.id_agente || null);
        setViewMode('DETALLE');
      } else if (viewMode === 'MODIFICAR') {
        await api.put(`/agentes/${selectedId}`, payload);
        mostrarAlerta('✅ Agente actualizado exitosamente.', 'exito');
        await cargarAgentes();
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
    if (!selectedAgente) return;
    const confirmar = window.confirm(`¿Estás seguro de desactivar a la agencia "${selectedAgente.nombre}"?\nEsta acción lo marcará como INACTIVO.`);
    if (!confirmar) return;

    try {
      await api.delete(`/agentes/${selectedId}`);
      mostrarAlerta(`✅ Agente "${selectedAgente.nombre}" desactivado correctamente.`, 'exito');
      await cargarAgentes();
    } catch (error) {
      const detalle = error.response?.data?.detail || 'No se pudo desactivar.';
      mostrarAlerta(`❌ ${detalle}`, 'error');
    }
  };

  const handleRestaurar = async () => {
    if (!selectedAgente) return;
    try {
      await api.put(`/agentes/${selectedId}/restaurar`);
      mostrarAlerta(`✅ Agente "${selectedAgente.nombre}" restaurado a ACTIVO.`, 'exito');
      await cargarAgentes();
    } catch (error) {
      const detalle = error.response?.data?.detail || 'No se pudo restaurar.';
      mostrarAlerta(`❌ ${detalle}`, 'error');
    }
  };

  const handleEliminarFisico = async () => {
    if (!selectedAgente) return;
    const confirmacion = window.confirm(
      `⚠️ ATENCIÓN: ¿Deseas eliminar DEFINITIVAMENTE a la agencia "${selectedAgente.nombre}"?\n\nEsta acción NO se puede deshacer y fallará si tiene despachos asignados.`
    );
    if (!confirmacion) return;

    try {
      await api.delete(`/agentes/${selectedId}/fisico`);
      mostrarAlerta(`✅ Agente "${selectedAgente.nombre}" eliminado definitivamente.`, 'exito');
      setSelectedId(null);
      await cargarAgentes();
    } catch (error) {
      const detalle = error.response?.data?.detail || 'No se pudo eliminar definitivamente.';
      mostrarAlerta(`❌ ${detalle}`, 'error');
    }
  };

  const agentesFiltrados = useMemo(() => {
    return agentes.filter((ag) => {
      const coincideBusqueda = 
        (ag.nombre || '').toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        (ag.ruc || '').includes(debouncedSearch);

      if (filtroEstado === 'ACTIVO') return coincideBusqueda && ag.estado_registro === 'ACTIVO';
      if (filtroEstado === 'INACTIVO') return coincideBusqueda && ag.estado_registro === 'INACTIVO';
      return coincideBusqueda;
    });
  }, [agentes, debouncedSearch, filtroEstado]);

  const selectedAgente = useMemo(() => {
    return agentes.find(a => a.id_agente === selectedId) || null;
  }, [agentes, selectedId]);

  const esInactivoSeleccionado = selectedAgente?.estado_registro === 'INACTIVO';

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      
      {/* HEADER DE MÓDULO */}
      <header className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-xl shadow-inner">
            🛂
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-tight">Catálogo de Agentes de Aduana</h1>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                Módulo Catálogos
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Agencias autorizadas ante SUNAT para el desaduanamiento de mercancías
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleNuevo}
            className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-lg transition-colors shadow-lg shadow-teal-600/20 flex items-center gap-1.5 cursor-pointer"
          >
            <span>+</span>
            <span>Nuevo Agente</span>
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
                placeholder="Buscar por RUC o Nombre..."
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
                Activos ({agentes.filter(a => a.estado_registro === 'ACTIVO').length})
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
                Inactivos ({agentes.filter(a => a.estado_registro === 'INACTIVO').length})
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
                Todos ({agentes.length})
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80 p-2 space-y-1 min-h-0">
            {agentesFiltrados.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No se encontraron agentes de aduana con los criterios indicados.
              </div>
            ) : (
              agentesFiltrados.map((ag) => {
                const isSelected = selectedId === ag.id_agente;
                const isInactivo = ag.estado_registro === 'INACTIVO';

                return (
                  <div
                    key={ag.id_agente}
                    onClick={() => handleSelect(ag)}
                    className={`p-3 rounded-lg cursor-pointer transition-all border ${
                      isSelected
                        ? 'bg-teal-950/30 border-teal-500/80 shadow-md ring-1 ring-teal-500/20'
                        : 'bg-slate-900/60 hover:bg-slate-800/70 border-slate-800/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-teal-400">#{ag.id_agente}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          isInactivo
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        }`}>
                          {ag.estado_registro || 'ACTIVO'}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-slate-400">
                        {ag.ruc ? `RUC: ${ag.ruc}` : 'S/RUC'}
                      </span>
                    </div>

                    <div className="mt-1.5 text-xs font-semibold text-slate-200 truncate">
                      {ag.nombre}
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

          {!selectedAgente && viewMode !== 'NUEVO' ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-500">
              <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-3xl mb-4 shadow-inner">
                🛂
              </div>
              <h3 className="text-base font-bold text-slate-300">Ficha Maestra de Agencia de Aduanas</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1.5">
                Seleccione un agente de la bandeja izquierda para ver o actualizar sus datos operativos.
              </p>
              <button
                onClick={handleNuevo}
                className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-teal-600/20"
              >
                + Registrar Nuevo Agente
              </button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-5 space-y-5">
              
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-base font-bold text-white tracking-tight">
                      {viewMode === 'NUEVO' ? '✨ Nueva Agencia de Aduana' : selectedAgente?.nombre}
                    </h2>
                    {viewMode !== 'NUEVO' && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        esInactivoSeleccionado
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      }`}>
                        {selectedAgente?.estado_registro || 'ACTIVO'}
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
                      <span className="font-mono text-slate-200">#{selectedAgente?.id_agente}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">RUC</span>
                      <span className="font-mono text-teal-400 font-bold">{selectedAgente?.ruc || 'No declarado'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">Estado</span>
                      <span className="text-slate-200 font-semibold">{selectedAgente?.estado_registro}</span>
                    </div>
                  </div>
                )}
              </div>

              {viewMode === 'DETALLE' ? (
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                    <span className="text-teal-400 text-sm">📋</span>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      Datos de la Agencia
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-lg space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Razón Social</span>
                      <span className="font-bold text-slate-100 text-sm">{selectedAgente?.nombre}</span>
                    </div>

                    <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-lg space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">RUC</span>
                      <span className="font-mono font-bold text-teal-300 text-sm">{selectedAgente?.ruc || 'Sin RUC'}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleGuardar} className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <span className="text-teal-400">✏️</span>
                      <span>{viewMode === 'NUEVO' ? 'Registro de Agencia' : 'Edición de Agencia'}</span>
                    </h3>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                        RUC (11 Dígitos)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          maxLength={11}
                          value={formData.ruc}
                          onChange={(e) => setFormData({ ...formData, ruc: e.target.value.replace(/\D/g, '') })}
                          placeholder="Ej. 20111222333"
                          className="flex-1 text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-teal-500"
                        />
                        <button
                          type="button"
                          onClick={buscarRuc}
                          disabled={buscandoRuc || formData.ruc.length !== 11}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-teal-300 border border-teal-500/30 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          {buscandoRuc ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin"></div>
                              <span>Consultando...</span>
                            </>
                          ) : (
                            <>
                              <span>🔍</span>
                              <span>Validar SUNAT</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide">
                          Razón Social de la Agencia *
                        </label>
                        {sunatData?.original && (
                          <button
                            type="button"
                            onClick={() => {
                              const nuevoNombre = formData.nombre === sunatData.sugerido ? sunatData.original : sunatData.sugerido;
                              setFormData(prev => ({ ...prev, nombre: nuevoNombre }));
                            }}
                            className="text-[10px] text-teal-400 hover:text-teal-300 underline font-semibold cursor-pointer"
                          >
                            {formData.nombre === sunatData.sugerido ? '📄 Ver Razón Social Completa' : '✂️ Usar Nombre Acortado'}
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        required
                        value={formData.nombre}
                        onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                        placeholder="Nombre oficial o abreviado de la agencia de aduanas..."
                        className="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-teal-500 font-medium"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        💡 Puedes editar libremente este nombre para ajustarlo a tu estándar operativo.
                      </p>
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
                        <span>Guardar Agente</span>
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

export default Agentes;
