/** Bandeja de expedientes (contenedores): búsqueda, filtros, lista con alertas de levante y paginación. */
import { differenceInDays, parseISO } from 'date-fns';
import { Clock, Download, Search, Settings } from 'lucide-react';
import { ESTADO_DOCUMENTARIO, ESTADO_LEVANTE, STATUS_LLEGADA, TIPO_VALOR } from '../../constants';
import Paginador from '../../components/Paginador';

export default function BandejaExpedientes({
  maestros, selectedId, viewMode, onSeleccionar, onNuevo, onExportar, isExportando, filtros,
  opcionesImportadores, proveedoresMap, importadoresMap, page, setPage, limit, setLimit, totalPages, totalRegistros,
}) {
  const {
    searchTerm, setSearchTerm, estadoLevanteFiltro, setEstadoLevanteFiltro, statusLlegadaFiltro, setStatusLlegadaFiltro,
    importadorFiltro, setImportadorFiltro, tipoValorFiltro, setTipoValorFiltro, mostrarFiltros, setMostrarFiltros,
    limpiarFiltros, hayFiltrosActivos,
  } = filtros;
  return (
    <section className={`w-full lg:w-[42%] 2xl:w-[38%] border-r border-slate-800 bg-slate-900/60 flex-col shrink-0 overflow-hidden ${viewMode ? 'hidden lg:flex' : 'flex'}`}>
      <div className="p-3 border-b border-slate-800 bg-slate-800/50 flex flex-col gap-2.5 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">Expedientes</h2>
            <span className="px-1.5 py-0.5 rounded bg-slate-700 text-[10px] font-mono text-slate-300">{totalRegistros}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onExportar}
              disabled={isExportando}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded bg-emerald-700/80 hover:bg-emerald-600 text-white shadow-sm transition-all disabled:opacity-50 cursor-pointer"
              title="Descargar todos los expedientes filtrados a Excel"
            >
              <span>{isExportando ? <Clock size={13} className="inline-block shrink-0 animate-spin" /> : <Download size={13} className="inline-block shrink-0" />}</span>
              <span>{isExportando ? 'Exportando...' : 'Excel'}</span>
            </button>
            <button onClick={onNuevo} className="inline-flex items-center px-2.5 py-1 text-[11px] font-bold rounded bg-teal-600 hover:bg-teal-500 text-white shadow-sm transition-all">+ Nuevo</button>
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
              placeholder="Buscar Factura, BL o Contenedor..."
            />
          </div>
          <button
            type="button"
            onClick={() => setMostrarFiltros(prev => !prev)}
            className={`px-2 py-1.5 rounded border text-xs font-mono transition flex items-center gap-1 shrink-0 cursor-pointer ${hayFiltrosActivos
              ? 'bg-teal-950/80 border-teal-500 text-teal-300 font-bold shadow-sm'
              : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            title="Alternar filtros avanzados"
          >
            <Settings size={13} className="inline-block shrink-0" />
            {hayFiltrosActivos && <span className="w-1.5 h-1.5 rounded-full bg-teal-400"></span>}
          </button>
        </div>

        {/* PANEL COLAPSABLE DE FILTROS COMPACTOS (2 COLUMNAS) */}
        {mostrarFiltros && (
          <div className="p-2 bg-slate-950/90 border border-slate-800 rounded-md space-y-1.5 text-[10px]">
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className="block text-slate-500 uppercase font-bold text-[9px] mb-0.5">Levante</label>
                <select
                  value={estadoLevanteFiltro}
                  onChange={e => { setEstadoLevanteFiltro(e.target.value); setPage(1); }}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-200 text-[10px]"
                >
                  <option value="">Todos</option>
                  <option value={ESTADO_LEVANTE.SIN_LEVANTE}>Sin Levante</option>
                  <option value={ESTADO_LEVANTE.CON_LEVANTE}>Con Levante</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-500 uppercase font-bold text-[9px] mb-0.5">Llegada</label>
                <select
                  value={statusLlegadaFiltro}
                  onChange={e => { setStatusLlegadaFiltro(e.target.value); setPage(1); }}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-200 text-[10px]"
                >
                  <option value="">Todos</option>
                  <option value={STATUS_LLEGADA.EN_TRANSITO}>En Tránsito</option>
                  <option value={STATUS_LLEGADA.EN_PUERTO}>En Puerto</option>
                  <option value={STATUS_LLEGADA.EN_ALMACEN_TEMPORAL}>En Almacén Temporal</option>
                  <option value={STATUS_LLEGADA.RETIRO_PROGRAMADO}>Retiro Programado</option>
                  <option value={STATUS_LLEGADA.EN_ALMACEN}>En Almacén</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-500 uppercase font-bold text-[9px] mb-0.5">Importador</label>
                <select
                  value={importadorFiltro}
                  onChange={e => { setImportadorFiltro(e.target.value); setPage(1); }}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-200 text-[10px] truncate"
                >
                  <option value="">Todos</option>
                  {opcionesImportadores.map(imp => (
                    <option key={imp.id_importador} value={imp.id_importador}>{imp.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-500 uppercase font-bold text-[9px] mb-0.5">Tipo Valor</label>
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
        {maestros.map(m => {
          const isActive = selectedId === m.id_maestro;
          const provNombre = proveedoresMap[m.id_proveedor];
          const impNombre = importadoresMap[m.id_importador];

          return (
            <article key={m.id_maestro} onClick={() => onSeleccionar(m)} className={`p-3 cursor-pointer transition-all group ${isActive ? 'row-selected' : 'border-l-4 border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}>
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <span className={`font-mono text-[10px] font-medium px-1 rounded border ${isActive ? 'text-teal-400 bg-teal-500/10 border-teal-500/20' : 'text-slate-400 bg-slate-700 border-slate-600'}`}>#{m.id_maestro}</span>
                  <span className={`text-sm font-bold font-mono tracking-tight ${isActive ? 'text-teal-300' : 'text-slate-200'}`}>FAC: {m.numero_factura}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded border ${m.estado_documentario?.includes(ESTADO_DOCUMENTARIO.ATENCION_TOTAL) || m.estado_documentario?.includes('CON LEVANTE') ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' :
                    m.estado_documentario?.includes(ESTADO_DOCUMENTARIO.ATENCION_PARCIAL) ? 'bg-amber-500/15 border-amber-500/30 text-amber-300' :
                      m.estado_documentario === ESTADO_DOCUMENTARIO.EN_PROCESO ? 'bg-blue-500/15 border-blue-500/30 text-blue-300' :
                        'bg-slate-700/40 border-slate-600 text-slate-400'
                    }`}>
                    {m.estado_documentario || ESTADO_DOCUMENTARIO.SIN_NUMERAR}
                  </span>
                </div>
              </div>
              {m.estado_documentario === ESTADO_DOCUMENTARIO.CON_LEVANTE_PENDIENTE_INGRESO && (m.status_llegada === STATUS_LLEGADA.EN_ALMACEN_TEMPORAL || m.status_llegada === STATUS_LLEGADA.EN_PUERTO) && m.fecha_levante_maestro && (() => {
                const dias = differenceInDays(new Date(), parseISO(m.fecha_levante_maestro));
                if (dias >= 2) return <div className="mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-400 animate-pulse">🚨 DURMIENDO: {dias} días en Temp.</div>;
                if (dias >= 0) return <div className="mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300">⚠️ {dias} días con Levante</div>;
                return null;
              })()}
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1 font-mono">
                <span className="truncate">BL: {m.documento_transporte || 'S/N'}</span>
                <span>{m.n_cont_fisico || 'S/Cont'}</span>
              </div>
              {(provNombre || impNombre) && (
                <div className="text-[10px] text-slate-500 truncate">
                  {provNombre && <span>Prov: <strong className="text-slate-400">{provNombre}</strong></span>}
                  {provNombre && impNombre && <span className="mx-1">•</span>}
                  {impNombre && <span>Imp: <strong className="text-slate-400">{impNombre}</strong></span>}
                </div>
              )}
            </article>
          );
        })}
        {maestros.length === 0 && <div className="p-6 text-center text-slate-500 text-xs">No se encontraron expedientes.</div>}
      </div>
      <footer className="p-2 border-t border-slate-800 bg-slate-800/50 shrink-0">
        <Paginador page={page} totalPages={totalPages} setPage={setPage} limit={limit} setLimit={setLimit} totalRegistros={totalRegistros} />
      </footer>
    </section>
  );
}
