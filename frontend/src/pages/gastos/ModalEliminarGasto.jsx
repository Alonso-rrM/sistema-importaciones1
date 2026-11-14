/**
 * Eliminación de un gasto con motivo obligatorio. Si tiene pagos, se anulan y el dinero vuelve a sus vouchers.
 * Escape cierra el modal.
 */
import { useEffect, useEffectEvent, useState } from 'react';

import api from '../../services/api';
import { LARGO_MINIMO_MOTIVO } from '../../components/ModalAnularPago';
import { mensajeDeError, useInteraccion } from '../../context/interaccion';

export default function ModalEliminarGasto({ gasto, onCerrar, onEliminado }) {
  const { avisar } = useInteraccion();
  const [motivo, setMotivo] = useState('');

  const cerrarConEscape = useEffectEvent((e) => { if (e.key === 'Escape') onCerrar(); });
  useEffect(() => {
    window.addEventListener('keydown', cerrarConEscape);
    return () => window.removeEventListener('keydown', cerrarConEscape);
  }, []);

  const eliminar = async () => {
    if (motivo.trim().length < LARGO_MINIMO_MOTIVO) {
      avisar(`Debe ingresar un motivo válido (mínimo ${LARGO_MINIMO_MOTIVO} caracteres).`, 'advertencia');
      return;
    }
    try {
      await api.delete(`/gastos/${gasto.id_gasto}?forzar_reversion_pagos=true`, { data: { motivo: motivo.trim() } });
      onCerrar();
      avisar(`✅ Gasto #${gasto.id_gasto} eliminado.`, 'exito');
      await onEliminado();
    } catch (error) {
      avisar(`Error al eliminar:\n${mensajeDeError(error)}`, 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden text-slate-100">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
            <span>⚠️</span>
            <h3>Eliminar Registro de Gasto #{gasto.id_gasto}</h3>
          </div>
          <button 
            onClick={onCerrar} 
            className="text-slate-400 hover:text-white text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          {gasto?.pagos_detalle && gasto.pagos_detalle.length > 0 && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-200 text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-amber-400">
                <span>⚡</span>
                <span>Reversión Automática de Pagos</span>
              </div>
              <p>
                Este gasto tiene <strong>{gasto.pagos_detalle.length} pago(s)</strong> asociado(s). 
                Al confirmar, todos los pagos serán <strong>anulados</strong> y el dinero será <strong>devuelto a sus vouchers bancarios</strong> automáticamente.
              </p>
            </div>
          )}

          <p className="text-xs text-slate-300">
            Esta acción registrará la anulación del gasto en la pista de auditoría contable. Por favor especifique el motivo:
          </p>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">
              Motivo de Anulación (Mín. 10 caracteres) *
            </label>
            <textarea 
              rows={3} 
              value={motivo} 
              onChange={(e) => setMotivo(e.target.value)} 
              placeholder="Indique la justificación de la anulación para auditoría..." 
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
            onClick={eliminar} 
            disabled={motivo.trim().length < 10} 
            className="px-4 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white rounded-lg transition-all shadow-md shadow-rose-600/20 cursor-pointer"
          >
            Confirmar Eliminación
          </button>
        </div>
      </div>
    </div>
  );
}
