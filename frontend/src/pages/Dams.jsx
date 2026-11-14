import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import useDebounce from '../hooks/useDebounce';
import useConsulta from '../hooks/useConsulta';
import Paginador from '../components/Paginador';
import { descargarExcel } from '../utils/exportUtils';
import { Download, Clock, Search, Settings, FileText, Banknote, Trash2, Zap, CheckCircle2, AlertTriangle, Unlock, CreditCard } from 'lucide-react';
import { CANAL_CONTROL, ESTADO_DAM, ESTADO_PAGO, TIPO_VALOR } from '../constants';
import { useInteraccion } from '../context/interaccion';

const FORMULARIO_VACIO = {
  id_maestro: '',
  numero_de_dam: '',
  serie: '',
  canal_control: CANAL_CONTROL.VERDE,
  monto_valor_provisional_usd: '',
  estado_dam: ESTADO_DAM.NUMERADA
};

const formularioDesdeDam = (d) => ({
  id_maestro: d.id_maestro != null ? String(d.id_maestro) : '',
  numero_de_dam: d.numero_de_dam || '',
  serie: d.serie || '',
  canal_control: d.canal_control || CANAL_CONTROL.VERDE,
  monto_valor_provisional_usd: d.monto_valor_provisional_usd != null ? String(d.monto_valor_provisional_usd) : '',
  estado_dam: d.estado_dam || ESTADO_DAM.NUMERADA
});

/**
 * Estado inicial de la pantalla según cómo se llegó a ella: desde Logística se puede abrir una DAM
 * ya existente (fromDam) o empezar una nueva para un contenedor (fromMaestro).
 */
function estadoInicialDesde(navegacion) {
  if (navegacion?.fromDam) {
    const d = navegacion.fromDam;
    return { selectedId: d.id_dam, viewMode: 'MODIFICAR', formData: formularioDesdeDam(d), damGastos: d.numero_de_dam, cambios: false };
  }
  if (navegacion?.fromMaestro) {
    return {
      selectedId: null, viewMode: 'NUEVO', damGastos: null, cambios: true,
      formData: { ...FORMULARIO_VACIO, id_maestro: String(navegacion.fromMaestro.id_maestro || '') },
    };
  }
  return { selectedId: null, viewMode: null, formData: FORMULARIO_VACIO, damGastos: null, cambios: false };
}

const Dams = () => {
  const { avisar, confirmar } = useInteraccion();
  const location = useLocation();
  const navigate = useNavigate();
  const [inicio] = useState(() => estadoInicialDesde(location.state));

  const [selectedId, setSelectedId] = useState(inicio.selectedId);
  const [viewMode, setViewMode] = useState(inicio.viewMode); // null = Solo bandeja, 'NUEVO', 'MODIFICAR'

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 400);

  // Filtros Avanzados de Bandeja
  const [canalFiltro, setCanalFiltro] = useState('');
  const [aforoFiltro, setAforoFiltro] = useState('');
  const [tipoValorFiltro, setTipoValorFiltro] = useState('');
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  // DAM cuyos gastos se muestran en la ficha (por su número)
  const [damGastos, setDamGastos] = useState(inicio.damGastos);

  const [isGuardando, setIsGuardando] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(inicio.cambios);
  const [modalEliminar, setModalEliminar] = useState({ open: false, id: null, motivo: '' });
  const [isExportando, setIsExportando] = useState(false);

  const [formData, setFormData] = useState(inicio.formData);

  // Rol del usuario decodificado
  // Rol solo para la interfaz (los permisos reales los valida el backend)


  const consultarMaestros = useCallback(() => api.get('/maestros/lookup').then((r) => r.data || []), []);
  const { datos: maestros } = useConsulta(consultarMaestros, {
    inicial: [], alFallar: (error) => console.error('Error al cargar maestros lookup:', error),
  });

  const maestrosMap = useMemo(() => {
    const map = {};
    maestros.forEach(m => { map[m.id_maestro] = m; });
    return map;
  }, [maestros]);

  const consultarDams = useCallback(() => {
    const aforoBool = aforoFiltro === 'REALIZADO' ? true : aforoFiltro === 'PENDIENTE' ? false : undefined;
    return api.get('/dams/', {
      params: {
        search: debouncedSearch.trim() || undefined,
        page,
        limit,
        canal_control: canalFiltro || undefined,
        aforo_realizado: aforoBool,
        tipo_valor: tipoValorFiltro || undefined
      }
    }).then((r) => r.data);
  }, [debouncedSearch, page, limit, canalFiltro, aforoFiltro, tipoValorFiltro]);
  const { datos: paginaDams, recargar: recargarDams } = useConsulta(consultarDams, {
    alFallar: (error) => console.error('Error al cargar DAMs:', error),
  });
  const dams = paginaDams?.data || [];
  const totalPages = paginaDams?.total_paginas || 1;
  const totalRegistros = paginaDams?.total_registros || 0;
  const cargarDams = () => recargarDams().catch((error) => console.error('Error al cargar DAMs:', error));

  const consultarGastos = useCallback(
    () => api.get('/gastos/', { params: { search: damGastos, limit: 100 } }).then((r) => r.data?.data || []),
    [damGastos],
  );
  const { datos: gastosVinculados, cargando: isLoadingGastos, recargar: recargarGastos } = useConsulta(
    damGastos ? consultarGastos : null,
    { inicial: [], alFallar: (error) => console.error('Error al cargar gastos de DAM:', error) },
  );
  const mostrarGastosDe = (numeroDam) => {
    if (numeroDam === damGastos) recargarGastos().catch(() => {});
    else setDamGastos(numeroDam || null);
  };

  // Si se llegó desde Logística con datos precargados, se limpian del historial para que no se repitan
  useEffect(() => {
    if (location.state?.fromDam || location.state?.fromMaestro) window.history.replaceState({}, document.title);
  }, [location.state]);

  const limpiarFiltros = () => {
    setSearchTerm('');
    setCanalFiltro('');
    setAforoFiltro('');
    setTipoValorFiltro('');
    setPage(1);
  };
  const hayFiltrosActivos = !!(searchTerm || canalFiltro || aforoFiltro || tipoValorFiltro);

  // Abre Gastos con el formulario de registro ya apuntando a esta DAM (y a su contenedor)
  const irARegistrarGasto = () => navigate('/app/gastos', {
    state: { fromDam: { id_dam: selectedId, id_maestro: Number(formData.id_maestro) || null, numero_de_dam: formData.numero_de_dam } },
  });

  const handleFormChange = (campo, valor) => {
    setFormData(prev => ({ ...prev, [campo]: valor }));
    setHasUnsavedChanges(true);
  };

  const handleSelect = async (d) => {
    if (hasUnsavedChanges && !(await confirmar({ titulo: 'Cambios sin guardar', mensaje: 'Tienes cambios sin guardar. ¿Deseas descartarlos y cambiar de registro?', textoAceptar: 'Descartar cambios', peligro: true }))) return;
    setSelectedId(d.id_dam);
    setViewMode('MODIFICAR');
    setFormData(formularioDesdeDam(d));
    setHasUnsavedChanges(false);
    mostrarGastosDe(d.numero_de_dam);
  };

  const handleNuevo = async () => {
    if (hasUnsavedChanges && !(await confirmar({ titulo: 'Cambios sin guardar', mensaje: 'Tienes cambios sin guardar. ¿Deseas descartarlos y crear uno nuevo?', textoAceptar: 'Descartar cambios', peligro: true }))) return;
    setSelectedId(null);
    setViewMode('NUEVO');
    setFormData(FORMULARIO_VACIO);
    setHasUnsavedChanges(true);
    setDamGastos(null);
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!formData.id_maestro) return avisar("Debe seleccionar un Maestro de Importación.", 'advertencia');
    if (!formData.numero_de_dam.trim()) return avisar("El N° de DAM es obligatorio.", 'advertencia');

    setIsGuardando(true);
    try {
      const payload = {
        id_maestro: parseInt(formData.id_maestro, 10),
        numero_de_dam: formData.numero_de_dam.trim(),
        serie: formData.serie?.trim() || null,
        canal_control: formData.canal_control || CANAL_CONTROL.VERDE,
        monto_valor_provisional_usd: formData.monto_valor_provisional_usd !== '' && formData.monto_valor_provisional_usd != null 
          ? parseFloat(formData.monto_valor_provisional_usd) 
          : null,
        estado_dam: formData.estado_dam || ESTADO_DAM.NUMERADA
      };

      if (viewMode === 'NUEVO') {
        const res = await api.post('/dams/', payload);
        setSelectedId(res.data.id_dam);
        setViewMode('MODIFICAR');
        mostrarGastosDe(payload.numero_de_dam);
      } else {
        await api.put(`/dams/${selectedId}`, payload);
      }

      await recargarDams();
      setHasUnsavedChanges(false);
      avisar("✅ Declaración DAM guardada exitosamente.", 'exito');
    } catch (error) {
      const detail = error.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : (Array.isArray(detail) ? detail.map(d => `${d.loc ? d.loc.slice(-1) : 'campo'}: ${d.msg}`).join('\n') : 'Error al guardar');
      avisar(`Error al guardar:\n${msg}`, 'error');
    } finally {
      setIsGuardando(false);
    }
  };

  const handleCambiarEstadoDam = async (nuevoEstado) => {
    if (!(await confirmar({
      titulo: 'Cambiar estado de la DAM',
      mensaje: `¿Cambiar el estado de la DAM a: ${nuevoEstado}?`,
      textoAceptar: 'Cambiar estado',
    }))) return;
    try {
      await api.put(`/dams/${selectedId}`, { estado_dam: nuevoEstado });
      setFormData(prev => ({ ...prev, estado_dam: nuevoEstado }));
      cargarDams();
    } catch (err) {
      avisar(`Error al actualizar estado: ${err.response?.data?.detail || 'Error desconocido'}`, 'error');
    }
  };

  const handleEliminarConfirm = async () => {
    if (!modalEliminar.motivo || modalEliminar.motivo.length < 10) return avisar("Debe ingresar un motivo válido de al menos 10 caracteres.", 'advertencia');
    try {
      await api.delete(`/dams/${modalEliminar.id}`, { data: { motivo: modalEliminar.motivo } });
      setModalEliminar({ open: false, id: null, motivo: '' });
      setSelectedId(null);
      setViewMode(null);
      cargarDams();
      avisar("✅ Declaración DAM eliminada.", 'exito');
    } catch (error) {
      avisar(`Error al eliminar: ${error.response?.data?.detail || 'Error desconocido'}`, 'error');
    }
  };

  const maestroActual = maestrosMap[formData.id_maestro];
  const esGarantizado = maestroActual?.tipo_valor === TIPO_VALOR.GARANTIZADO;

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
      avisar(`Error al exportar reporte: ${error.response?.data?.detail || error.message || 'Error desconocido'}`, 'error');
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
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded bg-emerald-700/80 hover:bg-emerald-600 text-white shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                title="Descargar todas las DAMs filtradas a Excel"
              >
                <span>{isExportando ? <Clock size={13} className="inline-block shrink-0 animate-spin" /> : <Download size={13} className="inline-block shrink-0" />}</span>
                <span>{isExportando ? 'Exportando...' : 'Excel'}</span>
              </button>
              <button onClick={handleNuevo} className="inline-flex items-center px-2.5 py-1 text-[11px] font-bold rounded bg-teal-600 hover:bg-teal-500 text-white shadow-sm transition-all">+ Nueva DAM</button>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-500 text-xs"><Search size={13} className="inline-block shrink-0" /></span>
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
              <Settings size={13} className="inline-block shrink-0" />
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
                    <option value={CANAL_CONTROL.VERDE}>🟢 Verde</option>
                    <option value={CANAL_CONTROL.NARANJA}>🟠 Naranja</option>
                    <option value={CANAL_CONTROL.ROJO}>🔴 Rojo</option>
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
                    <option value={TIPO_VALOR.DEFINITIVO}>Definitivo</option>
                    <option value={TIPO_VALOR.GARANTIZADO}>Garantizado</option>
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
            const pendienteAforo = d.estado_dam === ESTADO_DAM.PENDIENTE_AFORO;

            return (
              <article key={d.id_dam} onClick={() => handleSelect(d)} className={`p-3 cursor-pointer transition-all group ${isActive ? 'row-selected' : 'border-l-4 border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-[10px] font-medium px-1 rounded border ${isActive ? 'text-teal-400 bg-teal-500/10 border-teal-500/20' : 'text-slate-400 bg-slate-700 border-slate-600'}`}>#{d.id_dam}</span>
                    <span className={`text-sm font-bold font-mono tracking-tight ${isActive ? 'text-teal-300' : 'text-slate-200'}`}>DAM: {d.numero_de_dam}</span>
                    {pendienteAforo && <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" title="Aforo pendiente"></span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded border ${d.canal_control === CANAL_CONTROL.VERDE ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' : d.canal_control === CANAL_CONTROL.ROJO ? 'bg-rose-500/15 border-rose-500/30 text-rose-300' : 'bg-orange-500/15 border-orange-500/30 text-orange-300'}`}>
                      {d.canal_control}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mb-1">
                  <span>Serie: {d.serie || 'S/N'}</span>
                  <span>Factura: <strong className="text-slate-300">{m?.numero_factura || `ID #${d.id_maestro}`}</strong></span>
                </div>

                <div className="mt-1 flex items-center justify-between text-[10px]">
                  <span className={`px-1.5 py-0.5 font-bold uppercase rounded border ${
                    d.estado_dam?.includes('LEVANTE') || d.estado_dam?.includes('LIQUIDADA') ? 'bg-emerald-900/40 text-emerald-400 border-emerald-800' :
                    d.estado_dam?.includes('OBSERVADA') ? 'bg-rose-900/40 text-rose-400 border-rose-800' :
                    'bg-amber-900/40 text-amber-400 border-amber-800'
                  }`}>
                    {d.estado_dam || ESTADO_DAM.NUMERADA}
                  </span>
                  {d.monto_valor_provisional_usd && <span className="text-emerald-400 font-bold font-mono">${parseFloat(d.monto_valor_provisional_usd).toFixed(2)}</span>}
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
              <FileText size={40} className="mx-auto text-slate-600 mb-2" />
              <p className="mt-3 text-sm font-medium">Seleccione una declaración DAM de la bandeja o pulse "+ Nueva DAM".</p>
            </div>
          </div>
        ) : (
          <>
            <header className="p-4 border-b border-slate-800 bg-slate-800/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <button onClick={async () => { if (!hasUnsavedChanges || await confirmar({ titulo: 'Cambios sin guardar', mensaje: '¿Descartar los cambios sin guardar?', textoAceptar: 'Descartar cambios', peligro: true })) { setViewMode(null); setHasUnsavedChanges(false); } }} className="lg:hidden p-1.5 bg-slate-700 text-slate-300 rounded hover:bg-slate-600">⬅</button>
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
                    <button onClick={() => irARegistrarGasto()} className="px-3 py-1.5 rounded bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5">
                      <Banknote size={15} className="inline-block shrink-0" /> <span>+ Registrar Gasto</span>
                    </button>
                    <button onClick={() => setModalEliminar({ open: true, id: selectedId, motivo: '' })} className="px-2 py-1.5 rounded text-rose-400 hover:bg-rose-500/10 transition-colors" title="Eliminar DAM">
                      <Trash2 size={15} className="inline-block shrink-0" />
                    </button>
                  </>
                )}
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* KPIs ADUANEROS DE LA DAM */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-2.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Canal de Control</span>
                  <div className={`text-base font-bold font-mono uppercase ${formData.canal_control === CANAL_CONTROL.VERDE ? 'text-emerald-400' : formData.canal_control === CANAL_CONTROL.ROJO ? 'text-rose-400' : 'text-orange-400'}`}>
                    {formData.canal_control}
                  </div>
                </div>
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-2.5 col-span-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Estado Legal de la DAM</span>
                  <div className="text-sm font-bold font-mono text-teal-300">
                    {formData.estado_dam || 'SIN NUMERAR'}
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
                    {maestroActual?.tipo_valor || TIPO_VALOR.DEFINITIVO}
                  </div>
                </div>
              </div>

              {/* FORMULARIO MASTER DE LA DAM */}
              <form onSubmit={handleGuardar} className="space-y-4">
                <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-teal-400 border-b border-slate-700/80 pb-1.5 flex items-center gap-1.5">
                    <FileText size={15} className="inline-block shrink-0" /> <span>Datos Oficiales de la DAM</span>
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
                        <option value={CANAL_CONTROL.VERDE}>VERDE</option>
                        <option value={CANAL_CONTROL.NARANJA}>NARANJA</option>
                        <option value={CANAL_CONTROL.ROJO}>ROJO</option>
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

                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-700">
                  <button type="submit" disabled={!hasUnsavedChanges || isGuardando} className="px-5 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded text-xs transition-all disabled:opacity-50 disabled:bg-slate-700 shadow-md">
                    {isGuardando ? 'Procesando...' : (viewMode === 'NUEVO' ? 'Crear Declaración DAM' : 'Guardar Cambios')}
                  </button>
                </div>
              </form>

              {/* PANEL DE ACCIONES ADUANERAS (MÁQUINA DE ESTADOS) */}
              {viewMode === 'MODIFICAR' && (
                <div className="bg-slate-800/60 border border-teal-500/30 rounded-lg p-3.5 space-y-2 mt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-teal-300 flex items-center gap-1.5">
                      <Zap size={15} className="inline-block shrink-0 text-amber-400" /> Panel de Operaciones Aduaneras
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">Estado Actual: <strong className="text-white">{formData.estado_dam}</strong></span>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {formData.estado_dam === ESTADO_DAM.PENDIENTE_AFORO && (
                      <>
                        <button type="button" onClick={() => handleCambiarEstadoDam(ESTADO_DAM.CON_LEVANTE)} className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-xs font-bold transition-all shadow-sm flex items-center gap-1.5">
                          <CheckCircle2 size={14} className="inline-block shrink-0" /> Aforo Conforme (Otorgar Levante)
                        </button>
                        <button type="button" onClick={() => handleCambiarEstadoDam(ESTADO_DAM.OBSERVADA)} className="px-3 py-1.5 bg-rose-700 hover:bg-rose-600 text-white rounded text-xs font-bold transition-all shadow-sm flex items-center gap-1.5">
                          <AlertTriangle size={14} className="inline-block shrink-0" /> Reportar Observación SUNAT
                        </button>
                      </>
                    )}

                    {formData.estado_dam === ESTADO_DAM.OBSERVADA && (
                      <>
                        {maestroActual?.tipo_valor === TIPO_VALOR.GARANTIZADO ? (
                          <button type="button" onClick={() => handleCambiarEstadoDam(ESTADO_DAM.CON_LEVANTE_GARANTIA_ACTIVA)} className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 text-white rounded text-xs font-bold transition-all shadow-sm flex items-center gap-1.5">
                            <Unlock size={14} className="inline-block shrink-0" /> Otorgar Levante con Garantía (Art. 160)
                          </button>
                        ) : (
                          <button type="button" onClick={() => handleCambiarEstadoDam(ESTADO_DAM.EN_REVISION)} className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-white rounded text-xs font-bold transition-all shadow-sm flex items-center gap-1.5">
                            <Clock size={14} className="inline-block shrink-0" /> Subir Sustento (Pasar a En Revisión)
                          </button>
                        )}
                      </>
                    )}

                    {formData.estado_dam === ESTADO_DAM.EN_REVISION && (
                      <button type="button" onClick={() => handleCambiarEstadoDam(ESTADO_DAM.CON_LEVANTE)} className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-xs font-bold transition-all shadow-sm flex items-center gap-1.5">
                        <CheckCircle2 size={14} className="inline-block shrink-0" /> Diligencia Conforme (Otorgar Levante)
                      </button>
                    )}

                    {formData.estado_dam === ESTADO_DAM.CON_LEVANTE_GARANTIA_ACTIVA && (
                      <>
                        <button type="button" onClick={() => handleCambiarEstadoDam(ESTADO_DAM.EN_REVISION_OMC)} className="px-3 py-1.5 bg-orange-700 hover:bg-orange-600 text-white rounded text-xs font-bold transition-all shadow-sm flex items-center gap-1.5">
                          <Search size={14} className="inline-block shrink-0" /> Iniciar Revisión OMC SUNAT
                        </button>
                        <button type="button" onClick={() => handleCambiarEstadoDam(ESTADO_DAM.GARANTIA_CERRADA)} className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-700 text-white rounded text-xs font-bold transition-all shadow-sm flex items-center gap-1.5">
                          <CheckCircle2 size={14} className="inline-block shrink-0" /> Cerrar Garantía (Sin Observación)
                        </button>
                      </>
                    )}

                    {formData.estado_dam === ESTADO_DAM.EN_REVISION_OMC && (
                      <button type="button" onClick={() => handleCambiarEstadoDam(ESTADO_DAM.GARANTIA_CERRADA)} className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-xs font-bold transition-all shadow-sm flex items-center gap-1.5">
                        <CheckCircle2 size={14} className="inline-block shrink-0" /> Descarte OMC / Garantía Liberada
                      </button>
                    )}

                    {![ESTADO_DAM.PENDIENTE_AFORO, ESTADO_DAM.OBSERVADA, ESTADO_DAM.EN_REVISION, ESTADO_DAM.CON_LEVANTE_GARANTIA_ACTIVA, ESTADO_DAM.EN_REVISION_OMC].includes(formData.estado_dam) && (
                      <p className="text-xs text-slate-400 italic">No se requieren acciones aduaneras manuales para este estado (Esperando pagos o procesos automáticos).</p>
                    )}
                  </div>
                </div>
              )}

              {/* SUB-TABLA DE GASTOS ASOCIADOS A ESTA DAM */}
              {viewMode === 'MODIFICAR' && (
                <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden flex flex-col mt-4">
                  <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800/80 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-teal-300 uppercase">Gastos Asignados a esta DAM</span>
                      <span className="px-1.5 py-0.5 rounded-full bg-slate-950 text-[10px] font-mono text-slate-300">{gastosVinculados.length}</span>
                    </div>
                    <button 
                      onClick={() => irARegistrarGasto()}
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
                              <td className="px-3 py-2 font-bold text-teal-300 max-w-[180px]" title={g.observaciones ? `${g.concepto_nombre} — Obs: ${g.observaciones}` : g.concepto_nombre}>
                                <div className="truncate">{g.concepto_nombre || 'N/A'}</div>
                                {g.observaciones && (
                                  <div className="text-[10px] text-amber-400/90 font-normal italic truncate">💬 {g.observaciones}</div>
                                )}
                              </td>
                              <td className="px-3 py-2 font-mono text-slate-300">{g.numero_documento || 'S/N'}</td>
                              <td className="px-3 py-2 text-right font-mono font-bold text-slate-200">{parseFloat(g.monto_original || 0).toFixed(2)}</td>
                              <td className="px-3 py-2 text-center font-bold text-slate-400">{g.moneda}</td>
                              <td className="px-3 py-2 text-center">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${g.estado_pago === ESTADO_PAGO.PAGADO ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800' : g.estado_pago === ESTADO_PAGO.PENDIENTE ? 'bg-rose-900/30 text-rose-400 border-rose-800' : 'bg-amber-900/30 text-amber-400 border-amber-800'}`}>
                                  {g.estado_pago}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-center">
                                {g.estado_pago !== ESTADO_PAGO.PAGADO ? (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); navigate(`/app/pagos?gasto_id=${g.id_gasto}`); }}
                                    className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded border transition-all duration-150 shadow-sm bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-700 hover:text-white hover:border-purple-700 dark:bg-purple-600/30 dark:text-purple-300 dark:border-purple-500/40 dark:hover:bg-purple-600 dark:hover:text-white cursor-pointer"
                                    title="Registrar pago de este gasto"
                                  >
                                    <CreditCard className="shrink-0" size={14}/> Pagar
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
            <div className="bg-rose-950/30 border-b border-rose-900/50 p-4"><h3 className="text-rose-400 font-bold flex items-center gap-1.5"><AlertTriangle size={16} className="inline-block shrink-0" /> Confirmar Eliminación</h3></div>
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
