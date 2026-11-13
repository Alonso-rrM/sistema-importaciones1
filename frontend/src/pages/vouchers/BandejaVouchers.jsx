/** Bandeja de vouchers: búsqueda por N° de operación, filtro por saldo y paginación. */
import { Building2, Search } from 'lucide-react';
import Paginador from '../../components/Paginador';
import { FILTRO_SALDO } from './filtros';
import { MONEDA } from '../../constants';

export default function BandejaVouchers({
  vouchers, isLoading, selectedId, handleSelect, opcionesBancos, opcionesImportadores,
  searchTerm, setSearchTerm, filtroSaldo, setFiltroSaldo,
  page, setPage, limit, setLimit, totalPages, totalRegistros,
}) {
  return (
    <section className="lg:col-span-5 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl min-h-0">

      <div className="p-3.5 border-b border-slate-800 bg-slate-900/60 space-y-2.5 shrink-0">
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            placeholder="Buscar por Nº de Operación..."
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all"
          />
          <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 text-xs">
            <Search size={14} className="inline-block shrink-0" />
          </span>
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-white text-xs">✕</button>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-[11px]">
          <button
            type="button"
            onClick={() => { setFiltroSaldo(FILTRO_SALDO.CON_SALDO); setPage(1); }}
            className={`px-3 py-1 rounded-md font-semibold transition-colors ${
              filtroSaldo === FILTRO_SALDO.CON_SALDO
                ? 'bg-teal-600 text-white shadow'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Con Saldo
          </button>
          <button
            type="button"
            onClick={() => { setFiltroSaldo(FILTRO_SALDO.TODOS); setPage(1); }}
            className={`px-3 py-1 rounded-md font-semibold transition-colors ${
              filtroSaldo === FILTRO_SALDO.TODOS
                ? 'bg-teal-600 text-white shadow'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Todos ({totalRegistros})
          </button>
          <button
            type="button"
            onClick={() => { setFiltroSaldo(FILTRO_SALDO.AGOTADOS); setPage(1); }}
            className={`px-3 py-1 rounded-md font-semibold transition-colors ${
              filtroSaldo === FILTRO_SALDO.AGOTADOS
                ? 'bg-teal-600 text-white shadow'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Agotados
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80 p-2 space-y-1 min-h-0">
        {isLoading && vouchers.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
            <span>Cargando vouchers bancarios...</span>
          </div>
        ) : vouchers.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            No se encontraron vouchers con los criterios seleccionados.
          </div>
        ) : (
          vouchers.map((v) => {
            const isSelected = selectedId === v.id_voucher;
            const saldoNum = parseFloat(v.saldo_disponible);
            const totalNum = parseFloat(v.monto_total);
            const simbolo = v.moneda === MONEDA.PEN ? 'S/' : '$';
            const tieneSaldo = saldoNum > 0.009;

            const bName = opcionesBancos.find(b => b.value === v.banco_id)?.label || 'Banco';
            const iName = opcionesImportadores.find(i => i.value === v.id_importador)?.label || 'Importador';

            return (
              <div
                key={v.id_voucher}
                onClick={() => handleSelect(v)}
                className={`p-3 rounded-lg cursor-pointer transition-all border ${
                  isSelected
                    ? 'row-selected'
                    : 'bg-white dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-800/70 border-slate-200 dark:border-slate-800/80'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs text-teal-400">#{v.id_voucher}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      tieneSaldo
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`}>
                      {tieneSaldo ? 'DISPONIBLE' : 'AGOTADO'}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                      {v.moneda}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block">Saldo</span>
                    <span className={`font-mono font-bold text-xs tabular-nums ${tieneSaldo ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {simbolo} {saldoNum.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="mt-2 text-xs">
                  <div className="font-semibold text-slate-200 truncate">
                    {bName} · Op: {v.numero_operacion}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate mt-0.5 flex items-center">
                    <Building2 size={12} className="inline-block shrink-0 mr-1 text-slate-400" />
                    <span>{iName}</span>
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="text-[10px] font-mono text-slate-500">
                    Fecha: {v.fecha_transferencia || 'S/F'}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Total: {simbolo} {totalNum.toFixed(2)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

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
