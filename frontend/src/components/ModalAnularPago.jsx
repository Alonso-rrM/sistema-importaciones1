/**
 * Modal para anular (reversar) un pago con motivo obligatorio. Lo usan Pagos, Gastos y Vouchers.
 * Devuelve el dinero al voucher y, si el pago había concedido un levante, avisa de la reversión.
 */
import { useState } from 'react';
import api from '../services/api';
import { MONEDA } from '../constants';
import { mensajeDeError, useInteraccion } from '../context/interaccion';
import { avisarReversionDam } from '../utils/reversion';

export const LARGO_MINIMO_MOTIVO = 10;

export default function ModalAnularPago({
  pago,
  onCerrar,
  onAnulado,
  titulo,
  placeholder = 'Justifique la razón de anulación para la auditoría de Tesorería...',
  textoConfirmar = 'Confirmar Anulación',
}) {
  const { avisar, confirmar } = useInteraccion();
  const [motivo, setMotivo] = useState('');
  const [anulando, setAnulando] = useState(false);

  const anular = async () => {
    if (motivo.trim().length < LARGO_MINIMO_MOTIVO) {
      avisar(`Debe ingresar un motivo de anulación válido (mínimo ${LARGO_MINIMO_MOTIVO} caracteres).`, 'advertencia');
      return;
    }
    setAnulando(true);
    try {
      const respuesta = await api.delete(`/pagos/${pago.id_pago}`, { data: { motivo: motivo.trim() } });
      onCerrar();
      avisar(`✅ Pago #${pago.id_pago} anulado y saldos restituidos exitosamente.`, 'exito');
      await onAnulado?.(respuesta);
      await avisarReversionDam(respuesta, confirmar);
    } catch (error) {
      avisar(`❌ ${mensajeDeError(error, 'Error al anular pago.')}`, 'error');
      setAnulando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden text-slate-100">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
            <span>🔄</span>
            <h3>{titulo || `Anular Pago #${pago?.id_pago}`}</h3>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="text-slate-400 hover:text-white text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Importe a Reversar:</span>
              <span className="font-mono font-bold text-emerald-400">
                {pago?.moneda === MONEDA.PEN ? 'S/' : '$'} {parseFloat(pago?.importe || 0).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Voucher / Op:</span>
              <span className="text-slate-200">
                {pago?.banco_nombre ? `${pago.banco_nombre} - ` : ''}
                {pago?.numero_operacion || 'S/V'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Gasto Afectado:</span>
              <span className="font-mono text-slate-200">
                {pago?.gasto_documento || (pago?.id_gasto ? `Gasto #${pago?.id_gasto}` : 'N/A')}
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-300">
            Al anular este pago, el dinero será devuelto íntegramente al saldo disponible del voucher bancario y el gasto asociado volverá a recalcular su saldo pendiente.
          </p>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">
              Motivo de Anulación (Mín. 10 caracteres) *
            </label>
            <textarea
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={placeholder}
              className="w-full text-xs p-3 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500 resize-none"
            />
          </div>
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
            onClick={anular}
            disabled={anulando || motivo.trim().length < 10}
            className="px-4 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white rounded-lg transition-all shadow-md shadow-rose-600/20 flex items-center gap-1.5 cursor-pointer"
          >
            {anulando ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Anulando...</span>
              </>
            ) : (
              <span>{textoConfirmar}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
