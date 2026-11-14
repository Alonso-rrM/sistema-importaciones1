/** Bandeja de gastos: búsqueda, filtros rápidos y avanzados, lista y paginación. */

import { Building2, Search, Settings } from 'lucide-react';
import Paginador from '../../components/Paginador';

import { ESTADO_PAGO, MONEDA, TIPO_GASTO } from '../../constants';

export default function BandejaGastos({
  gastos, isLoading, selectedId, onSeleccionar, filtros, opcionesConceptos, opcionesProveedores,
  page, setPage, limit, setLimit, totalPages, totalRegistros,
}) {
  const {
    searchTerm, setSearchTerm, estadoFiltro, setEstadoFiltro, monedaFiltro, setMonedaFiltro, tipoGastoFiltro, setTipoGastoFiltro, conceptoFiltro, setConceptoFiltro, proveedorFiltro, setProveedorFiltro, vencimientoFiltro, setVencimientoFiltro, mostrarFiltros, setMostrarFiltros, limpiarFiltros, hayFiltrosActivos,
  } = filtros;
  return (
    <section className="lg:col-span-5 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl min-h-0">

      {/* BARRA DE BÚSQUEDA Y FILTROS */}
      <div className="p-3.5 border-b border-slate-800 bg-slate-900/60 space-y-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              placeholder="Buscar Documento, DAM, Concepto, Observación o Factura..."
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all"
            />
            <span className="absolute inset-y-0 left-2.5 flex items-center text-slate-400 text-xs"><Search size={13} className="inline-block shrink-0" /></span>
            {searchTerm && (
              <button onClick={() => { setSearchTerm(''); setPage(1); }} className="absolute inset-y-0 right-2.5 flex items-center text-slate-400 hover:text-white text-xs">✕</button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setMostrarFiltros(prev => !prev)}
            className={`px-2 py-1.5 rounded-lg border text-xs font-mono transition flex items-center gap-1 shrink-0 cursor-pointer ${
              hayFiltrosActivos 
                ? 'bg-teal-950/80 border-teal-500 text-teal-300 font-bold shadow-sm' 
                : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="Alternar filtros contables"
          >
            <Settings size={13} className="inline-block shrink-0" />
            {hayFiltrosActivos && <span className="w-1.5 h-1.5 rounded-full bg-teal-400"></span>}
          </button>
        </div>

        {/* FILTROS RÁPIDOS PRIMARIOS */}
        <div className="flex items-center gap-1.5">
          <select
            value={estadoFiltro}
            onChange={(e) => { setEstadoFiltro(e.target.value); setPage(1); }}
            className="w-1/2 py-1 px-2 text-[11px] bg-slate-950 border border-slate-700 rounded-md text-slate-300 font-medium focus:outline-none focus:border-teal-500"
          >
            <option value="">Todos los Estados</option>
            <option value={ESTADO_PAGO.PENDIENTE}>PENDIENTE</option>
            <option value={ESTADO_PAGO.PARCIAL}>PARCIAL</option>
            <option value={ESTADO_PAGO.PAGADO}>PAGADO</option>
          </select>

          <select
            value={monedaFiltro}
            onChange={(e) => { setMonedaFiltro(e.target.value); setPage(1); }}
            className="w-1/2 py-1 px-2 text-[11px] bg-slate-950 border border-slate-700 rounded-md text-slate-300 font-medium focus:outline-none focus:border-teal-500"
          >
            <option value="">Todas las Monedas</option>
            <option value={MONEDA.USD}>USD ($)</option>
            <option value={MONEDA.PEN}>PEN (S/)</option>
          </select>
        </div>

        {/* PANEL COLAPSABLE DE FILTROS AVANZADOS (2 COLUMNAS) */}
        {mostrarFiltros && (
          <div className="p-2 bg-slate-950/90 border border-slate-800 rounded-lg space-y-1.5 text-[10px]">
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className="block text-slate-500 uppercase font-bold text-[9px] mb-0.5">Etapa Logística</label>
                <select 
                  value={tipoGastoFiltro} 
                  onChange={e => { setTipoGastoFiltro(e.target.value); setPage(1); }}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-200 text-[10px]"
                >
                  <option value="">Todas las Etapas</option>
                  <option value={TIPO_GASTO.FIJO_DESPACHO}>Fijo Despacho</option>
                  <option value={TIPO_GASTO.POST_LEVANTE}>Post-Levante</option>
                  <option value={TIPO_GASTO.EXTRAORDINARIO}>Extraordinario</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-500 uppercase font-bold text-[9px] mb-0.5">Vencimiento</label>
                <select 
                  value={vencimientoFiltro} 
                  onChange={e => { setVencimientoFiltro(e.target.value); setPage(1); }}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-200 text-[10px]"
                >
                  <option value="">Todos</option>
                  <option value="VENCIDOS">🚨 Vencidos</option>
                  <option value="POR_VENCER_7D">⏳ Próximos 7 días</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-500 uppercase font-bold text-[9px] mb-0.5">Concepto</label>
                <select 
                  value={conceptoFiltro} 
                  onChange={e => { setConceptoFiltro(e.target.value); setPage(1); }}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-200 text-[10px] truncate"
                >
                  <option value="">Todos</option>
                  {opcionesConceptos.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-500 uppercase font-bold text-[9px] mb-0.5">Proveedor</label>
                <select 
                  value={proveedorFiltro} 
                  onChange={e => { setProveedorFiltro(e.target.value); setPage(1); }}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-200 text-[10px] truncate"
                >
                  <option value="">Todos</option>
                  {opcionesProveedores.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
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

      {/* LISTA DENSA DE GASTOS */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80 p-2 space-y-1 min-h-0">
        {isLoading && gastos.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
            <span>Cargando registros contables...</span>
          </div>
        ) : gastos.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            No se encontraron registros de gastos con los filtros actuales.
          </div>
        ) : (
          gastos.map((g) => {
            const isSelected = selectedId === g.id_gasto;
            const saldoNum = parseFloat(g.saldo_pendiente ?? g.monto_original);
            const originalNum = parseFloat(g.monto_original);
            const simbolo = g.moneda === MONEDA.PEN ? 'S/' : '$';

            return (
              <div
                key={g.id_gasto}
                onClick={() => {
                  onSeleccionar(g);
                }}
                className={`p-3 rounded-lg cursor-pointer transition-all border ${
                  isSelected
                    ? 'row-selected'
                    : 'bg-white dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-800/70 border-slate-200 dark:border-slate-800/80'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs text-teal-400">#{g.id_gasto}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      g.estado_pago === ESTADO_PAGO.PENDIENTE
                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        : g.estado_pago === ESTADO_PAGO.PARCIAL
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    }`}>
                      {g.estado_pago}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                      {g.moneda}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block">Saldo</span>
                    <span className={`font-mono font-bold text-xs tabular-nums ${saldoNum > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {simbolo} {saldoNum.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="mt-2 text-xs">
                  <div className="font-semibold text-slate-200 truncate">
                    {g.concepto_nombre || 'Gasto General'}
                  </div>
                  {g.observaciones && (
                    <div className="text-[11px] text-amber-400/90 italic truncate mt-0.5" title={g.observaciones}>
                      💬 {g.observaciones}
                    </div>
                  )}
                  <div className="text-[11px] text-slate-400 truncate flex items-center gap-1.5 mt-0.5">
                    <Building2 size={12} className="inline-block shrink-0" />
                    <span className="truncate">{g.proveedor_nombre || 'Sin Proveedor'}</span>
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                  <div className="flex items-center gap-2 truncate">
                    <span className="bg-slate-800 px-1.5 py-0.5 rounded font-mono text-[10px] text-slate-300">
                      DAM: {g.dam_numero || 'N/A'}
                    </span>
                    <span className="truncate text-slate-500 font-mono text-[10px]">
                      Doc: {g.numero_documento || 'S/N'}
                    </span>
                  </div>
                  <div className="text-right text-[10px] font-mono text-slate-400">
                    Total: {simbolo} {originalNum.toFixed(2)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* PAGINADOR */}
      <div className="p-2 border-t border-slate-800 bg-slate-900/90 shrink-0">
        <Paginador
          page={page}
          totalPages={totalPages}
          setPage={setPage}
          limit={limit}
          setLimit={setLimit}
          totalRegistros={totalRegistros}
        />
      </div>
    </section>
  );
}
