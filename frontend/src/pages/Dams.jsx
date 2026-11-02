import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import useDebounce from '../hooks/useDebounce';
import Paginador from '../components/Paginador';
import { descargarExcel } from '../utils/exportUtils';

const Dams = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const [dams, setDams] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [viewMode, setViewMode] = useState(null); // null = Solo bandeja, 'NUEVO', 'MODIFICAR'

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 400);

  // Filtros Avanzados de Bandeja
  const [canalFiltro, setCanalFiltro] = useState('');
  const [aforoFiltro, setAforoFiltro] = useState('');
  const [tipoValorFiltro, setTipoValorFiltro] = useState('');
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRegistros, setTotalRegistros] = useState(0);

  const [maestros, setMaestros] = useState([]);
  const [gastosVinculados, setGastosVinculados] = useState([]);
  const [isLoadingGastos, setIsLoadingGastos] = useState(false);

  const [isGuardando, setIsGuardando] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [modalEliminar, setModalEliminar] = useState({ open: false, id: null, motivo: '' });
  const [isExportando, setIsExportando] = useState(false);

  const estadoInicial = {
    id_maestro: '',
    numero_de_dam: '',
    serie: '',
    canal_control: 'VERDE',
    monto_valor_provisional_usd: '',
    aforo_realizado: false
  };

  const [formData, setFormData] = useState(estadoInicial);

  // Rol del usuario decodificado
  const userRole = useMemo(() => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return null;
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
      return JSON.parse(jsonPayload)?.id_rol;
    } catch { return null; }
  }, []);

  const maestrosMap = useMemo(() => {
    const map = {};
    maestros.forEach(m => { map[m.id_maestro] = m; });
    return map;
  }, [maestros]);

  useEffect(() => {
    cargarMaestros();
  }, []);

  useEffect(() => {
    cargarDams();
  }, [debouncedSearch, page, limit, canalFiltro, aforoFiltro, tipoValorFiltro]);

  // Si proviene desde Logistica.jsx con estado precargado
  useEffect(() => {
    if (location.state?.fromMaestro) {
      const fromM = location.state.fromMaestro;
      setSelectedId(null);
      setViewMode('NUEVO');
      setFormData({
        ...estadoInicial,
        id_maestro: String(fromM.id_maestro || '')
      });
      setHasUnsavedChanges(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const cargarMaestros = async () => {
    try {
      const response = await api.get('/maestros/lookup');
      setMaestros(response.data || []);
    } catch (error) {
      console.error("Error al cargar maestros lookup:", error);
    }
  };

  const cargarDams = async () => {
    try {
      const aforoBool = aforoFiltro === 'REALIZADO' ? true : aforoFiltro === 'PENDIENTE' ? false : undefined;
      const response = await api.get('/dams/', {
        params: { 
          search: debouncedSearch.trim() || undefined, 
          page, 
          limit,
          canal_control: canalFiltro || undefined,
          aforo_realizado: aforoBool,
          tipo_valor: tipoValorFiltro || undefined
        }
      });
      setDams(response.data?.data || []);
      setTotalPages(response.data?.total_paginas || 1);
      setTotalRegistros(response.data?.total_registros || 0);
    } catch (error) {
      console.error("Error al cargar DAMs:", error);
    }
  };

  const limpiarFiltros = () => {
    setSearchTerm('');
    setCanalFiltro('');
    setAforoFiltro('');
    setTipoValorFiltro('');
    setPage(1);
  };
  const hayFiltrosActivos = !!(searchTerm || canalFiltro || aforoFiltro || tipoValorFiltro);

  const cargarGastosDeDam = async (dam_numero) => {
    if (!dam_numero) return;
    setIsLoadingGastos(true);
    try {
      const res = await api.get('/gastos/', { params: { search: dam_numero, limit: 100 } });
      setGastosVinculados(res.data?.data || []);
    } catch (error) {
      console.error("Error al cargar gastos de DAM:", error);
    } finally {
      setIsLoadingGastos(false);
    }
  };

  const handleFormChange = (campo, valor) => {
    setFormData(prev => ({ ...prev, [campo]: valor }));
    setHasUnsavedChanges(true);
  };

  const handleSelect = (d) => {
    if (hasUnsavedChanges && !window.confirm("⚠️ Tienes cambios sin guardar. ¿Deseas descartarlos y cambiar de registro?")) return;
    setSelectedId(d.id_dam);
    setViewMode('MODIFICAR');
    setFormData({
      id_maestro: d.id_maestro != null ? String(d.id_maestro) : '',
      numero_de_dam: d.numero_de_dam || '',
      serie: d.serie || '',
      canal_control: d.canal_control || 'VERDE',
      monto_valor_provisional_usd: d.monto_valor_provisional_usd != null ? String(d.monto_valor_provisional_usd) : '',
      aforo_realizado: Boolean(d.aforo_realizado)
    });
    setHasUnsavedChanges(false);
    cargarGastosDeDam(d.numero_de_dam);
  };

  const handleNuevo = () => {
    if (hasUnsavedChanges && !window.confirm("⚠️ Tienes cambios sin guardar. ¿Deseas descartarlos y crear uno nuevo?")) return;
    setSelectedId(null);
    setViewMode('NUEVO');
    setFormData(estadoInicial);
    setHasUnsavedChanges(true);
    setGastosVinculados([]);
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!formData.id_maestro) return alert("Debe seleccionar un Maestro de Importación.");
    if (!formData.numero_de_dam.trim()) return alert("El N° de DAM es obligatorio.");

    setIsGuardando(true);
    try {
      const payload = {
        id_maestro: parseInt(formData.id_maestro, 10),
        numero_de_dam: formData.numero_de_dam.trim(),
        serie: formData.serie?.trim() || null,
        canal_control: formData.canal_control || 'VERDE',
        monto_valor_provisional_usd: formData.monto_valor_provisional_usd !== '' && formData.monto_valor_provisional_usd != null 
          ? parseFloat(formData.monto_valor_provisional_usd) 
          : null,
        aforo_realizado: Boolean(formData.aforo_realizado)
      };

      if (viewMode === 'NUEVO') {
        const res = await api.post('/dams/', payload);
        setSelectedId(res.data.id_dam);
        setViewMode('MODIFICAR');
        cargarGastosDeDam(payload.numero_de_dam);
      } else {
        await api.put(`/dams/${selectedId}`, payload);
      }

      await cargarDams();
      setHasUnsavedChanges(false);
      alert("✅ Declaración DAM guardada exitosamente.");
    } catch (error) {
      const detail = error.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : (Array.isArray(detail) ? detail.map(d => `${d.loc ? d.loc.slice(-1) : 'campo'}: ${d.msg}`).join('\n') : 'Error al guardar');
      alert(`Error al guardar:\n${msg}`);
    } finally {
      setIsGuardando(false);
    }
  };

  const handleToggleAforo = async () => {
    if (userRole !== 1 && userRole !== 3) return alert("Solo Administradores o personal de Logística pueden certificar el Aforo Físico.");
    const nuevoEstado = !formData.aforo_realizado;
    if (!window.confirm(`¿Certificar aforo físico como ${nuevoEstado ? 'REALIZADO' : 'PENDIENTE'}?`)) return;
    try {
      await api.put(`/dams/${selectedId}`, { aforo_realizado: nuevoEstado });
      setFormData(prev => ({ ...prev, aforo_realizado: nuevoEstado }));
      cargarDams();
      alert("✅ Estado de Aforo actualizado.");
    } catch (err) {
      alert(`Error al actualizar aforo: ${err.response?.data?.detail || 'Error desconocido'}`);
    }
  };

  const handleEliminarConfirm = async () => {
    if (!modalEliminar.motivo || modalEliminar.motivo.length < 10) return alert("Debe ingresar un motivo válido de al menos 10 caracteres.");
    try {
      await api.delete(`/dams/${modalEliminar.id}`, { data: { motivo: modalEliminar.motivo } });
      setModalEliminar({ open: false, id: null, motivo: '' });
      setSelectedId(null);
      setViewMode(null);
      cargarDams();
      alert("Declaración DAM eliminada.");
    } catch (error) {
      alert(`Error al eliminar: ${error.response?.data?.detail || 'Error desconocido'}`);
    }
  };

  const maestroActual = maestrosMap[formData.id_maestro];
  const esGarantizado = maestroActual?.tipo_valor === 'GARANTIZADO';

  const handleExportarExcel = async () => {
    setIsExportando(true);
    try {
      const params = {};
      if (debouncedSearch) params.search = debouncedSearch;
      if (canalFiltro) params.canal_control = canalFiltro;
      if (aforoFiltro !== '') params.aforo_realizado = aforoFiltro === 'SI';
      if (tipoValorFiltro) params.tipo_valor = tipoValorFiltro;

      await descargarExcel('/dams/exportar', params, 'Reporte_Dams.xlsx');
    } catch (error) {
      alert(`Error al exportar reporte: ${error.response?.data?.detail || error.message || 'Error desconocido'}`);
    } finally {
      setIsExportando(false);
    }
  };

  return (
    <main className="flex-1 flex overflow-hidden h-full">
      {/* BANDEJA IZQUIERDA (38%) */}
      <section className={`w-full lg:w-[42%] 2xl:w-[38%] border-r border-slate-800 bg-slate-900/60 flex-col shrink-0 overflow-hidden ${viewMode ? 'hidden lg:flex' : 'flex'}`}>
        <div className="p-3 border-b border-slate-800 bg-slate-800/50 flex flex-col gap-2.5 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">Declaraciones DAMs</h2>
              <span className="px-1.5 py-0.5 rounded bg-slate-700 text-[10px] font-mono text-slate-300">{totalRegistros}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button 
                type="button" 
                onClick={handleExportarExcel} 
                disabled={isExportando}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded bg-emerald-700/80 hover:bg-emerald-600 text-white shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                title="Descargar todas las DAMs filtradas a Excel"
              >
                <span>{isExportando ? '⏳' : '📥'}</span>
                <span>{isExportando ? 'Exportando...' : 'Excel'}</span>
              </button>
              <button onClick={handleNuevo} className="inline-flex items-center px-2.5 py-1 text-[11px] font-bold rounded bg-teal-600 hover:bg-teal-500 text-white shadow-sm transition-all">+ Nueva DAM</button>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-500 text-xs">🔍</span>
              <input 
                type="text" 
                value={searchTerm} 
                onChange={e => { setSearchTerm(e.target.value); setPage(1); }} 
                className="w-full bg-slate-900 border border-slate-700 focus:border-teal-500 text-xs text-slate-200 placeholder-slate-500 rounded-md pl-8 pr-2 py-1.5" 
                placeholder="Buscar Nº DAM, Serie o Factura..." 
              />
            </div>
            <button
              type="button"
              onClick={() => setMostrarFiltros(prev => !prev)}
              className={`px-2 py-1.5 rounded border text-xs font-mono transition flex items-center gap-1 shrink-0 cursor-pointer ${
                hayFiltrosActivos 
                  ? 'bg-teal-950/80 border-teal-500 text-teal-300 font-bold shadow-sm' 
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
              title="Alternar filtros avanzados"
            >
              <span>⚙️</span>
              {hayFiltrosActivos && <span className="w-1.5 h-1.5 rounded-full bg-teal-400"></span>}
            </button>
          </div>

          {/* PANEL COLAPSABLE DE FILTROS COMPACTOS (DAMS) */}
          {mostrarFiltros && (
            <div className="p-2 bg-slate-950/90 border border-slate-800 rounded-md space-y-1.5 text-[10px]">
              <div className="grid grid-cols-3 gap-1.5">
                <div>
                  <label className="block text-slate-500 uppercase font-bold text-[9px] mb-0.5">Canal</label>
                  <select 
                    value={canalFiltro} 
                    onChange={e => { setCanalFiltro(e.target.value); setPage(1); }}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-200 text-[10px]"
                  >
                    <option value="">Todos</option>
                    <option value="VERDE">🟢 Verde</option>
                    <option value="NARANJA">🟠 Naranja</option>
                    <option value="ROJO">🔴 Rojo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 uppercase font-bold text-[9px] mb-0.5">Aforo</label>
                  <select 
                    value={aforoFiltro} 
                    onChange={e => { setAforoFiltro(e.target.value); setPage(1); }}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-200 text-[10px]"
                  >
                    <option value="">Todos</option>
                    <option value="PENDIENTE">⏳ Pendiente</option>
                    <option value="REALIZADO">✅ Realizado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 uppercase font-bold text-[9px] mb-0.5">Régimen</label>
                  <select 
                    value={tipoValorFiltro} 
                    onChange={e => { setTipoValorFiltro(e.target.value); setPage(1); }}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-200 text-[10px]"
                  >
                    <option value="">Todos</option>
                    <option value="DEFINITIVO">Definitivo</option>
                    <option value="GARANTIZADO">Garantizado</option>
                  </select>
                </div>
              </div>
              {hayFiltrosActivos && (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={limpiarFiltros}
                    className="text-[10px] text-rose-400 hover:text-rose-300 font-mono hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    ✕ Limpiar filtros
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-800">
          {dams.map(d => {
            const isActive = selectedId === d.id_dam;
            const m = maestrosMap[d.id_maestro];
            const requiereAforo = d.canal_control === 'ROJO' && !d.aforo_realizado;

            return (
              <article key={d.id_dam} onClick={() => handleSelect(d)} className={`p-3 border-l-2 cursor-pointer transition-colors group ${isActive ? 'bg-teal-900/20 border-teal-500' : 'border-transparent hover:bg-slate-800/40'}`}>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-[10px] font-medium px-1 rounded border ${isActive ? 'text-teal-400 bg-teal-500/10 border-teal-500/20' : 'text-slate-400 bg-slate-700 border-slate-600'}`}>#{d.id_dam}</span>
                    <span className={`text-sm font-bold font-mono tracking-tight ${isActive ? 'text-teal-300' : 'text-slate-200'}`}>DAM: {d.numero_de_dam}</span>
                    {requiereAforo && <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" title="Aforo pendiente"></span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded border ${d.canal_control === 'VERDE' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' : d.canal_control === 'ROJO' ? 'bg-rose-500/15 border-rose-500/30 text-rose-300' : 'bg-orange-500/15 border-orange-500/30 text-orange-300'}`}>
                      {d.canal_control}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mb-1">
                  <span>Serie: {d.serie || 'S/N'}</span>
                  <span>Aforo: {d.aforo_realizado ? '✅ Sí' : '❌ No'}</span>
                </div>

                <div className="text-[10px] text-slate-500 font-mono flex items-center justify-between">
                  <span>Factura: <strong className="text-slate-300">{m?.numero_factura || `ID #${d.id_maestro}`}</strong></span>
                  {d.monto_valor_provisional_usd && <span className="text-emerald-400 font-bold">${parseFloat(d.monto_valor_provisional_usd).toFixed(2)}</span>}
                </div>
              </article>
            );
          })}
          {dams.length === 0 && <div className="p-6 text-center text-slate-500 text-xs">No se encontraron declaraciones DAMs.</div>}
        </div>
        <footer className="p-2 border-t border-slate-800 bg-slate-800/50 shrink-0">
          <Paginador page={page} totalPages={totalPages} setPage={setPage} limit={limit} setLimit={setLimit} totalRegistros={totalRegistros} />
        </footer>
      </section>

      {/* PANEL DERECHO: DETALLES (62%) */}
      <section className={`flex-1 flex-col h-full bg-slate-900 overflow-hidden ${!viewMode ? 'hidden lg:flex' : 'flex'}`}>
        {!viewMode ? (
          <div className="flex-1 flex items-center justify-center text-slate-600">
            <div className="text-center">
              <span className="text-4xl">📑</span>
              <p className="mt-3 text-sm font-medium">Seleccione una declaración DAM de la bandeja o pulse "+ Nueva DAM".</p>
            </div>
          </div>
        ) : (
          <>
            <header className="p-4 border-b border-slate-800 bg-slate-800/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <button onClick={() => { if (!hasUnsavedChanges || window.confirm("¿Descartar cambios?")) { setViewMode(null); setHasUnsavedChanges(false); } }} className="lg:hidden p-1.5 bg-slate-700 text-slate-300 rounded hover:bg-slate-600">⬅</button>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-base font-bold font-mono text-white">
                      {viewMode === 'NUEVO' ? 'Nueva Declaración DAM' : `DAM ${formData.numero_de_dam}`}
                    </h1>
                    {hasUnsavedChanges && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="Cambios sin guardar"></span>}
                  </div>
                  {viewMode === 'MODIFICAR' && (
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      ID DAM: #{selectedId} • Maestro: <span className="text-teal-400">{maestroActual?.numero_factura || formData.id_maestro}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {viewMode === 'MODIFICAR' && (
                  <>
                    <button onClick={() => navigate('/app/gastos', { state: { fromDam: formData } })} className="px-3 py-1.5 rounded bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1">
                      <span>💸</span> + Registrar Gasto
                    </button>
                    <button onClick={() => setModalEliminar({ open: true, id: selectedId, motivo: '' })} className="px-2 py-1.5 rounded text-rose-400 hover:bg-rose-500/10 transition-colors" title="Eliminar DAM">🗑️</button>
                  </>
                )}
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* KPIs ADUANEROS DE LA DAM */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-2.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Canal de Control</span>
                  <div className={`text-base font-bold font-mono uppercase ${formData.canal_control === 'VERDE' ? 'text-emerald-400' : formData.canal_control === 'ROJO' ? 'text-rose-400' : 'text-orange-400'}`}>
                    {formData.canal_control}
                  </div>
                </div>
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-2.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Aforo Físico</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-base font-bold font-mono ${formData.aforo_realizado ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formData.aforo_realizado ? '✅ Realizado' : '❌ Pendiente'}
                    </span>
                    {viewMode === 'MODIFICAR' && (userRole === 1 || userRole === 3) && (
                      <button onClick={handleToggleAforo} className="text-[10px] text-teal-400 underline hover:text-teal-300">Alternar</button>
                    )}
                  </div>
                </div>
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-2.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Valor Provisional / Gtdo.</span>
                  <div className="text-base font-bold font-mono text-emerald-400">
                    ${formData.monto_valor_provisional_usd ? parseFloat(formData.monto_valor_provisional_usd).toFixed(2) : '0.00'}
                  </div>
                </div>
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-2.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Régimen Maestro</span>
                  <div className="text-base font-bold font-mono text-teal-300">
                    {maestroActual?.tipo_valor || 'DEFINITIVO'}
                  </div>
                </div>
              </div>

              {/* FORMULARIO MASTER DE LA DAM */}
              <form onSubmit={handleGuardar} className="space-y-4">
                <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-teal-400 border-b border-slate-700/80 pb-1.5 flex items-center gap-1.5">
                    <span>📑</span> Datos Oficiales de la DAM
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Maestro de Importación (Factura) *</label>
                      <select 
                        required
                        value={formData.id_maestro} 
                        onChange={e => handleFormChange('id_maestro', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-600 focus:border-teal-500 text-slate-200 text-xs rounded px-2.5 py-2 font-mono font-bold"
                      >
                        <option value="">-- Seleccionar Factura --</option>
                        {maestros.map(m => (
                          <option key={m.id_maestro} value={m.id_maestro}>
                            Factura: {m.numero_factura} ({m.tipo_valor})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">N° de DAM *</label>
                      <input 
                        type="text" 
                        required
                        value={formData.numero_de_dam} 
                        onChange={e => handleFormChange('numero_de_dam', e.target.value)}
                        placeholder="Ej: 118-2026-10-123456" 
                        className="w-full bg-slate-900 border border-slate-600 focus:border-teal-500 text-slate-100 font-mono text-xs rounded px-2.5 py-2 font-bold" 
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Serie</label>
                      <input 
                        type="text" 
                        value={formData.serie} 
                        onChange={e => handleFormChange('serie', e.target.value)}
                        placeholder="001" 
                        className="w-full bg-slate-900 border border-slate-600 focus:border-teal-500 text-slate-100 font-mono text-xs rounded px-2.5 py-2" 
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Canal de Control</label>
                      <select 
                        value={formData.canal_control} 
                        onChange={e => handleFormChange('canal_control', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-600 focus:border-teal-500 text-slate-100 text-xs rounded px-2.5 py-2 font-bold"
                      >
                        <option value="VERDE">VERDE</option>
                        <option value="NARANJA">NARANJA</option>
                        <option value="ROJO">ROJO</option>
                      </select>
                    </div>

                    {esGarantizado && (
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Monto Valor Garantizado (USD) *</label>
                        <input 
                          type="number" 
                          step="0.01"
                          required
                          value={formData.monto_valor_provisional_usd} 
                          onChange={e => handleFormChange('monto_valor_provisional_usd', e.target.value)}
                          placeholder="0.00" 
                          className="w-full bg-slate-900 border border-slate-600 focus:border-teal-500 text-emerald-400 font-mono text-xs rounded px-2.5 py-2 text-right font-bold" 
                        />
                      </div>
                    )}

                    <div className="flex items-center pt-5">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          checked={formData.aforo_realizado} 
                          onChange={e => handleFormChange('aforo_realizado', e.target.checked)}
                          className="rounded bg-slate-900 border-slate-600 text-teal-600 focus:ring-teal-500" 
                        />
                        <span className="text-xs text-slate-300 font-bold">Aforo Físico Realizado</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-700">
                  <button type="submit" disabled={!hasUnsavedChanges || isGuardando} className="px-5 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded text-xs transition-all disabled:opacity-50 disabled:bg-slate-700 shadow-md">
                    {isGuardando ? 'Procesando...' : (viewMode === 'NUEVO' ? 'Crear Declaración DAM' : 'Guardar Cambios')}
                  </button>
                </div>
              </form>

              {/* SUB-TABLA DE GASTOS ASOCIADOS A ESTA DAM */}
              {viewMode === 'MODIFICAR' && (
                <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden flex flex-col mt-4">
                  <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800/80 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-teal-300 uppercase">Gastos Asignados a esta DAM</span>
                      <span className="px-1.5 py-0.5 rounded-full bg-slate-950 text-[10px] font-mono text-slate-300">{gastosVinculados.length}</span>
                    </div>
                    <button 
                      onClick={() => navigate('/app/gastos', { state: { fromDam: formData } })}
                      className="px-2.5 py-1 bg-teal-600 hover:bg-teal-500 text-white rounded text-[10px] font-bold shadow-sm transition-all"
                    >
                      + Registrar Gasto
                    </button>
                  </div>

                  <div className="p-0 overflow-x-auto min-h-[140px]">
                    {isLoadingGastos ? (
                      <div className="p-6 text-center text-teal-500 text-xs font-bold animate-pulse">Cargando gastos asociados...</div>
                    ) : (
                      <table className="w-full text-left text-[11px] whitespace-nowrap">
                        <thead className="bg-slate-950 text-slate-400 uppercase text-[9px] font-bold border-b border-slate-800">
                          <tr>
                            <th className="px-3 py-2 w-12">ID</th>
                            <th className="px-3 py-2 max-w-[140px]">Proveedor</th>
                            <th className="px-3 py-2 max-w-[140px]">Concepto</th>
                            <th className="px-3 py-2">Documento</th>
                            <th className="px-3 py-2 text-right">Monto</th>
                            <th className="px-3 py-2 text-center w-16">Moneda</th>
                            <th className="px-3 py-2 text-center w-24">Estado Pago</th>
                            <th className="px-3 py-2 text-center w-20">Acción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/80 text-slate-300">
                          {gastosVinculados.map(g => (
                            <tr key={g.id_gasto} className="hover:bg-slate-800/50 transition-colors cursor-pointer group">
                              <td className="px-3 py-2 font-mono text-slate-500 group-hover:text-teal-400">#{g.id_gasto}</td>
                              <td className="px-3 py-2 font-bold text-slate-200 truncate max-w-[140px]" title={g.proveedor_nombre}>{g.proveedor_nombre || 'N/A'}</td>
                              <td className="px-3 py-2 font-bold text-teal-300 truncate max-w-[140px]" title={g.concepto_nombre}>{g.concepto_nombre || 'N/A'}</td>
                              <td className="px-3 py-2 font-mono text-slate-300">{g.numero_documento || 'S/N'}</td>
                              <td className="px-3 py-2 text-right font-mono font-bold text-slate-200">{parseFloat(g.monto_original || 0).toFixed(2)}</td>
                              <td className="px-3 py-2 text-center font-bold text-slate-400">{g.moneda}</td>
                              <td className="px-3 py-2 text-center">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${g.estado_pago === 'PAGADO' ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800' : g.estado_pago === 'PENDIENTE' ? 'bg-rose-900/30 text-rose-400 border-rose-800' : 'bg-amber-900/30 text-amber-400 border-amber-800'}`}>
                                  {g.estado_pago}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-center">
                                {g.estado_pago !== 'PAGADO' ? (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); navigate(`/app/pagos?gasto_id=${g.id_gasto}`); }}
                                    className="px-2 py-0.5 rounded bg-purple-600/30 hover:bg-purple-600 text-purple-300 hover:text-white text-[10px] font-bold border border-purple-500/40 transition-all shadow-sm"
                                  >
                                    💸 Pagar
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-emerald-400 font-bold">Liquidado</span>
                                )}
                              </td>
                            </tr>
                          ))}
                          {gastosVinculados.length === 0 && <tr><td colSpan="8" className="px-3 py-6 text-center text-slate-500 italic">No hay Gastos registrados para esta DAM.</td></tr>}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* Modal Nativo Eliminar */}
      {modalEliminar.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-rose-950/30 border-b border-rose-900/50 p-4"><h3 className="text-rose-400 font-bold">⚠️ Confirmar Eliminación</h3></div>
            <div className="p-5">
              <textarea autoFocus value={modalEliminar.motivo} onChange={(e) => setModalEliminar({...modalEliminar, motivo: e.target.value})} rows="3" className="w-full text-sm bg-slate-950 border border-slate-700 text-slate-200 rounded p-2 focus:border-rose-500" placeholder="Motivo de auditoría (mín 10 caracteres)..."></textarea>
            </div>
            <div className="bg-slate-800/50 p-4 flex justify-end gap-3"><button onClick={() => setModalEliminar({open:false, id:null, motivo:''})} className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-slate-200">Cancelar</button><button onClick={handleEliminarConfirm} className="px-4 py-2 text-sm font-bold text-white bg-rose-600 rounded">Eliminar DAM</button></div>
          </div>
        </div>
      )}
    </main>
  );
};

export default Dams;
