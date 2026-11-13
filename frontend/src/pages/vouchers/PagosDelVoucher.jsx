/** Pagos financiados por un voucher, con la opción de reversar cada uno (el saldo vuelve al voucher). */
import { useCallback, useState } from 'react';
import { CreditCard, Trash2 } from 'lucide-react';
import api from '../../services/api';
import useConsulta from '../../hooks/useConsulta';
import ModalAnularPago from '../../components/ModalAnularPago';
import { MONEDA } from '../../constants';

export default function PagosDelVoucher({ voucher, onPagoReversado }) {
  const [pagoAReversar, setPagoAReversar] = useState(null);
  const idVoucher = voucher.id_voucher;
  const consultar = useCallback(() => api.get(`/vouchers/${idVoucher}/pagos`).then((r) => r.data || []), [idVoucher]);
  const { datos: pagosVinculados, cargando, recargar } = useConsulta(consultar, {
    inicial: [], alFallar: (error) => console.error('Error al cargar pagos vinculados:', error),
  });

  return (
    <>
    <div className="pt-3 border-t border-slate-800 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <CreditCard size={14} className="shrink-0 text-purple-400" />
          <span>Pagos Financiados por este Voucher</span>
        </h4>
        <span className="text-[10px] font-mono text-slate-400">
          {pagosVinculados.length} {pagosVinculados.length === 1 ? 'pago' : 'pagos'}
        </span>
      </div>

      {cargando && pagosVinculados.length === 0 ? (
        <div className="py-4 text-center text-slate-500 text-xs">
          <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-1"></div>
          <span>Cargando pagos vinculados...</span>
        </div>
      ) : pagosVinculados.length === 0 ? (
        <div className="py-4 text-center text-slate-500 text-xs bg-slate-900/40 rounded-lg border border-slate-800/60">
          Este voucher no tiene pagos vinculados activos. Saldo 100% íntegro.
        </div>
      ) : (
        <div className="space-y-2">
          {pagosVinculados.map(pago => (
            <div
              key={pago.id_pago}
              className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-slate-200">Pago #{pago.id_pago}</span>
                  <span className="text-slate-500 text-[10px]">•</span>
                  <span className="font-mono text-slate-400 text-[10px]">{pago.fecha_pago || 'S/F'}</span>
                  <span className="text-slate-500 text-[10px]">•</span>
                  <span className="text-purple-300 font-semibold">{pago.concepto_nombre || 'Gasto'}</span>
                </div>
                <div className="text-[11px] text-slate-400 flex items-center gap-2">
                  <span>DAM: <strong className="text-slate-300 font-mono">{pago.dam_numero || 'S/D'}</strong></span>
                  <span>•</span>
                  <span>Comprobante: <span className="text-slate-300">{pago.gasto_documento || 'N/A'}</span></span>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                <div className="text-right">
                  <div className="font-mono font-bold text-emerald-400">
                    {pago.moneda === MONEDA.PEN ? 'S/' : '$'} {parseFloat(pago.importe).toFixed(2)}
                  </div>
                  {pago.pago_moneda_cruzada && (
                    <div className="text-[10px] text-amber-400 font-mono">
                      Debitado: {parseFloat(pago.monto_moneda_origen).toFixed(2)} {voucher.moneda}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setPagoAReversar(pago)}
                  className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Anular este pago y restituir el saldo al voucher"
                >
                  <Trash2 size={13} className="shrink-0" />
                  <span>Reversar</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
      {pagoAReversar && (
        <ModalAnularPago
          pago={pagoAReversar}
          titulo={`Reversar Pago #${pagoAReversar.id_pago}`}
          placeholder="Justifique la razón de reversión para auditoría..."
          textoConfirmar="Confirmar Reversión"
          onCerrar={() => setPagoAReversar(null)}
          onAnulado={() => Promise.all([recargar(), onPagoReversado()])}
        />
      )}
    </>
  );
}
