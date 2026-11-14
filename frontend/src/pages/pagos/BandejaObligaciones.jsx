import { Search } from 'lucide-react';
import Paginador from '../../components/Paginador';
import { ESTADO_PAGO, MONEDA } from '../../constants';

export const FILTRO_PENDIENTES = `${ESTADO_PAGO.PENDIENTE},${ESTADO_PAGO.PARCIAL}`;

/** Bandeja de obligaciones (gastos) por pagar, con búsqueda, filtro por estado y paginación. */
export default function BandejaObligaciones({
  gastos, cargando, seleccionado, onSeleccionar,
  busqueda, setBusqueda, filtro, setFiltro,
  pagina, setPagina, limite, setLimite, totalPaginas, totalRegistros,
}) {
  return (
    <section className="lg:col-span-5 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl min-h-0">

      {/* BARRA DE BÚSQUEDA Y FILTROS RÁPIDOS */}
      <div className="p-3.5 border-b border-slate-800 bg-slate-900/60 space-y-2.5 shrink-0">
        <div className="relative">
          <input
            type="text"
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }}
            placeholder="Buscar por DAM, Factura, Proveedor, Importador..."
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-all"
          />
          <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 text-xs"><Search size={14} className="inline-block shrink-0" /></span>
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-white text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* FILTROS POR ESTADO DE PAGO */}
        <div className="flex items-center gap-1.5 text-[11px]">
          <button
            type="button"
            onClick={() => { setFiltro(FILTRO_PENDIENTES); setPagina(1); }}
            className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${filtro === FILTRO_PENDIENTES
                ? 'bg-purple-600 text-white shadow'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
          >
            Pendientes ({totalRegistros})
          </button>
          <button
            type="button"
            onClick={() => { setFiltro(''); setPagina(1); }}
            className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${filtro === ''
                ? 'bg-purple-600 text-white shadow'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => { setFiltro(ESTADO_PAGO.PAGADO); setPagina(1); }}
            className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${filtro === ESTADO_PAGO.PAGADO
                ? 'bg-purple-600 text-white shadow'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
          >
            Liquidados
          </button>
        </div>
      </div>

      {/* LISTA DE OBLIGACIONES */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80 p-2 space-y-1 min-h-0">
        {cargando && gastos.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
            <span>Cargando obligaciones financieras...</span>
          </div>
        ) : gastos.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            No se encontraron obligaciones financieras con los criterios seleccionados.
          </div>
        ) : (
          gastos.map((g) => {
            const isSelected = seleccionado?.id_gasto === g.id_gasto;
            const saldoNum = parseFloat(g.saldo_pendiente ?? g.monto_original);
            const originalNum = parseFloat(g.monto_original);
            const simboloMoneda = g.moneda === MONEDA.PEN ? 'S/' : '$';

            return (
              <div
                key={g.id_gasto}
                onClick={() => onSeleccionar(g)}
                className={`p-3 rounded-lg cursor-pointer transition-all border ${isSelected
                    ? 'row-selected'
                    : 'bg-white dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-800/70 border-slate-200 dark:border-slate-800/80'
                  }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs text-purple-400">#{g.id_gasto}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${g.estado_pago === ESTADO_PAGO.PENDIENTE
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
                    <span className="text-[10px] text-slate-400 block">Saldo Restante</span>
                    <span className="font-mono font-bold text-xs text-rose-400 tabular-nums">
                      {simboloMoneda} {saldoNum.toFixed(2)}
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
                    <span>🏢</span>
                    <span className="truncate">{g.proveedor_nombre || 'Proveedor Sin Especificar'}</span>
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                  <div className="flex items-center gap-2 truncate">
                    <span className="bg-slate-800 px-1.5 py-0.5 rounded font-mono text-[10px] text-slate-300">
                      DAM: {g.dam_numero || 'N/A'}
                    </span>
                    <span className="truncate text-slate-500 font-mono text-[10px]">
                      F: {g.maestro_factura || 'N/A'}
                    </span>
                    {g.numero_documento && (
                      <span className="truncate text-slate-400 font-mono text-[10px]" title={g.tipo_doc_nombre || 'Documento'}>
                        Doc: {g.numero_documento}
                      </span>
                    )}
                  </div>
                  <div className="text-right text-[10px] font-mono text-slate-400">
                    Deuda: {simboloMoneda} {originalNum.toFixed(2)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* PAGINADOR DE LA BANDEJA */}
      <div className="p-2 border-t border-slate-800 bg-slate-900/90 shrink-0">
        <Paginador
          page={pagina}
          totalPages={totalPaginas}
          setPage={setPagina}
          limit={limite}
          setLimit={setLimite}
          totalRegistros={totalRegistros}
        />
      </div>
    </section>
  );
}
