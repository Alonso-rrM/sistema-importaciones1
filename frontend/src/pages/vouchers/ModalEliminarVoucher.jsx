/** Eliminación de un voucher con motivo obligatorio (solo si no tiene saldo consumido). */
import { useState } from 'react';
import { AlertTriangle, Ban } from 'lucide-react';
import api from '../../services/api';
import { LARGO_MINIMO_MOTIVO } from '../../components/ModalAnularPago';
import { mensajeDeError, useInteraccion } from '../../context/interaccion';

export default function ModalEliminarVoucher({ voucher, voucherTieneUso, onCerrar, onEliminado }) {
  const { avisar } = useInteraccion();
  const [motivo, setMotivo] = useState('');
  const [eliminando, setEliminando] = useState(false);

  const eliminar = async () => {
    if (motivo.trim().length < LARGO_MINIMO_MOTIVO) {
      avisar(`Debe ingresar un motivo de eliminación válido (mínimo ${LARGO_MINIMO_MOTIVO} caracteres).`, 'advertencia');
      return;
    }
    setEliminando(true);
    try {
      await api.delete(`/vouchers/${voucher.id_voucher}`, { data: { motivo: motivo.trim() } });
      avisar(`✅ Voucher #${voucher.id_voucher} eliminado correctamente.`, 'exito');
      onCerrar();
      await onEliminado();
    } catch (error) {
      avisar(`❌ ${mensajeDeError(error, 'No se pudo eliminar el voucher.')}`, 'error');
      setEliminando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden text-slate-100">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
            <AlertTriangle size={16} className="shrink-0" />
            <h3>Eliminar Voucher #{voucher?.id_voucher}</h3>
          </div>
          <button onClick={onCerrar} className="text-slate-400 hover:text-white text-xs">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {voucherTieneUso ? (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300 text-xs space-y-2">
              <div className="font-bold flex items-center gap-1.5 text-rose-400 text-sm">
                <Ban size={15} className="shrink-0" />
                <span>Eliminación Bloqueada</span>
              </div>
              <p>
                Este voucher no puede eliminarse porque tiene un saldo consumido de <strong>{voucher?.moneda} {(parseFloat(voucher?.monto_total || 0) - parseFloat(voucher?.saldo_disponible || 0)).toFixed(2)}</strong>.
              </p>
              <p className="text-slate-300">
                Para poder eliminar este voucher, primero debe anular o reversar los pagos asociados que consumieron dicho saldo (usando los botones <em>"Reversar"</em> en la sección de Pagos Financiados).
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-300">
                La eliminación de un voucher bancario es auditada por Tesorería. Por favor justifique el motivo de anulación:
              </p>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">
                  Motivo de Anulación (Mínimo 10 caracteres) *
                </label>
                <textarea
                  rows={3}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Explique detalladamente la razón de anulación del voucher..."
                  className="w-full text-xs p-3 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500 resize-none"
                />
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCerrar}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={eliminar}
            disabled={voucherTieneUso || eliminando || motivo.trim().length < 10}
            className="px-4 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white rounded-lg transition-all shadow-md shadow-rose-600/20 flex items-center gap-1.5 cursor-pointer"
          >
            {eliminando ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Eliminando...</span>
              </>
            ) : (
              <span>Confirmar Eliminación</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
