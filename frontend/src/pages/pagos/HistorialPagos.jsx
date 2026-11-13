/** Pestaña Historial de Pagos Realizados: búsqueda, tabla paginada y anulación de pagos. */
import { useState } from 'react';

import Paginador from '../../components/Paginador';
import ModalAnularPago from '../../components/ModalAnularPago';
import { MONEDA } from '../../constants';

export default function HistorialPagos({ historial: h, onPagoAnulado }) {
  const [pagoAAnular, setPagoAAnular] = useState(null);
  return (
    <>
      <div className="flex-1 flex flex-col p-5 overflow-hidden space-y-4 min-h-0">
        {/* BARRA SUPERIOR DE BÚSQUEDA Y TOTAL */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl shrink-0">
          <div className="relative w-full sm:w-96">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 pointer-events-none text-xs">
              🔍
            </span>
            <input
              type="text"
              value={h.busqueda}
              onChange={(e) => {
                h.setBusqueda(e.target.value);
                h.setPagina(1);
              }}
              placeholder="Buscar por DAM, Voucher, Importador, Concepto, Observación, Comprobante..."
              className="w-full pl-8 pr-8 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-all"
            />
            {h.busqueda && (
              <button
                type="button"
                onClick={() => h.setBusqueda('')}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-500 hover:text-slate-300 text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span>Total Registros: <strong className="text-white font-mono">{h.totalRegistros}</strong></span>
            <button
              type="button"
              onClick={h.recargar}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Actualizar listado de pagos"
            >
              <span>🔄</span>
              <span>Actualizar</span>
            </button>
          </div>
        </div>

        {/* TABLA PRINCIPAL DE HISTORIAL */}
        <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col min-h-0 shadow-xl">
          <div className="flex-1 overflow-x-auto overflow-y-auto">
            <table className="w-full text-left text-xs text-slate-300 border-collapse">
              <thead className="bg-slate-950 sticky top-0 z-10 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">ID / Fecha</th>
                  <th className="py-3 px-4">DAM / Factura</th>
                  <th className="py-3 px-4">Importador</th>
                  <th className="py-3 px-4">Concepto / Proveedor</th>
                  <th className="py-3 px-4">Gasto / Comprobante</th>
                  <th className="py-3 px-4 text-right">Importe Pagado</th>
                  <th className="py-3 px-4">Voucher OP / Banco</th>
                  <th className="py-3 px-4 text-center">Tipo Cambio</th>
                  <th className="py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {h.cargando && h.pagos.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500">
                      <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                      <span>Cargando historial de pagos...</span>
                    </td>
                  </tr>
                ) : h.pagos.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500">
                      No se encontraron registros de pagos.
                    </td>
                  </tr>
                ) : (
                  h.pagos.map((pago) => (
                    <tr key={pago.id_pago} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-slate-100">#{pago.id_pago}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{pago.fecha_pago || 'S/F'}</div>
                        {pago.es_ajuste_sistema && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30">
                            Ajuste ZD
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-mono text-slate-200">{pago.dam_numero || 'Sin DAM'}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-purple-300 truncate max-w-[160px]" title={pago.importador_nombre}>
                          {pago.importador_nombre || 'N/A'}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-200">{pago.concepto_nombre || 'N/A'}</div>
                        {pago.gasto_observaciones && (
                          <div className="text-[10px] text-amber-400/90 italic truncate max-w-[180px]" title={pago.gasto_observaciones}>
                            💬 {pago.gasto_observaciones}
                          </div>
                        )}
                        <div className="text-[10px] text-slate-400 truncate max-w-[150px]">{pago.proveedor_nombre || ''}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-mono text-slate-300">{pago.gasto_documento || (pago.id_gasto ? `Gasto #${pago.id_gasto}` : 'N/A')}</div>
                        {pago.gasto_monto && (
                          <div className="text-[10px] text-slate-500 font-mono">
                            Total: {pago.gasto_moneda} {parseFloat(pago.gasto_monto).toFixed(2)}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="font-mono font-bold text-emerald-400 text-sm">
                          {pago.moneda === MONEDA.PEN ? 'S/' : '$'} {parseFloat(pago.importe).toFixed(2)}
                        </div>
                        {pago.pago_moneda_cruzada && (
                          <div className="text-[10px] text-amber-400 font-mono">
                            Cruzado (Orig: {parseFloat(pago.monto_moneda_origen).toFixed(2)})
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-mono text-teal-400 font-bold">{pago.numero_operacion || 'S/V'}</div>
                        <div className="text-[10px] text-slate-400">{pago.banco_nombre || 'Sin Banco'}</div>
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-slate-300">
                        {pago.tipo_cambio ? parseFloat(pago.tipo_cambio).toFixed(3) : '1.000'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => setPagoAAnular(pago)}
                          className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 mx-auto cursor-pointer"
                          title="Anular y reversar este pago"
                        >
                          <span>🗑️</span>
                          <span>Anular</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* PAGINADOR HISTORIAL */}
          <div className="p-3 bg-slate-950 border-t border-slate-800">
            <Paginador
              page={h.pagina}
              totalPages={h.totalPaginas}
              setPage={h.setPagina}
              limit={h.limite}
              setLimit={h.setLimite}
              totalRegistros={h.totalRegistros}
            />
          </div>
        </div>
      </div>
      {pagoAAnular && (
        <ModalAnularPago
          pago={pagoAAnular}
          onCerrar={() => setPagoAAnular(null)}
          onAnulado={() => Promise.all([h.recargar(), onPagoAnulado()])}
        />
      )}
    </>
  );
}
