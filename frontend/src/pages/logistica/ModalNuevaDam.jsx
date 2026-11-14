/** Registro rápido de una DAM para el expediente abierto. Escape cierra el modal. */
import { useEffect, useEffectEvent, useState } from 'react';
import api from '../../services/api';
import { CANAL_CONTROL, TIPO_VALOR } from '../../constants';
import { mensajeDeError, useInteraccion } from '../../context/interaccion';
import { validarMonto, validarNumeroDam } from '../../utils/validaciones';

const DAM_VACIA = Object.freeze({ numero_de_dam: '', serie: '', canal_control: CANAL_CONTROL.VERDE, monto_valor_provisional_usd: '' });

export default function ModalNuevaDam({ expediente, onCerrar, onCreada }) {
  const { avisar } = useInteraccion();
  const [dam, setDam] = useState(DAM_VACIA);
  const [guardando, setGuardando] = useState(false);

  const cerrarConEscape = useEffectEvent((e) => { if (e.key === 'Escape') onCerrar(); });
  useEffect(() => {
    window.addEventListener('keydown', cerrarConEscape);
    return () => window.removeEventListener('keydown', cerrarConEscape);
  }, []);

  const crear = async (e) => {
    e.preventDefault();
    const numero = validarNumeroDam(dam.numero_de_dam);
    const monto = validarMonto(dam.monto_valor_provisional_usd, { etiqueta: 'El monto garantizado', opcional: true });
    const error = numero.error || monto.error;
    if (error) {
      avisar(error, 'advertencia');
      return;
    }
    setGuardando(true);
    try {
      await api.post('/dams/', {
        id_maestro: expediente.id_maestro,
        numero_de_dam: numero.valor,
        serie: dam.serie?.trim() || null,
        canal_control: dam.canal_control || CANAL_CONTROL.VERDE,
        monto_valor_provisional_usd: monto.valor,   // texto: el backend lo lee como Decimal
      });
      onCerrar();
      avisar('✅ DAM registrada correctamente.', 'exito');
      onCreada();
    } catch (error) {
      avisar(`Error al registrar DAM: ${mensajeDeError(error, 'Error desconocido')}`, 'error');
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
        <div className="bg-teal-950/40 border-b border-teal-800/50 p-4 flex items-center justify-between">
          <h3 className="text-teal-300 font-bold text-sm flex items-center gap-2"><span>📑</span> Registrar DAM para {expediente.numero_factura}</h3>
          <button onClick={onCerrar} className="text-slate-400 hover:text-white">✕</button>
        </div>
        <form onSubmit={crear} className="p-5 space-y-3">
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">N° de DAM *</label>
            <input
              type="text"
              required
              value={dam.numero_de_dam}
              onChange={e => setDam({ ...dam, numero_de_dam: e.target.value })}
              placeholder="Ej: 118-2026-10-123456"
              className="w-full bg-slate-950 border border-slate-700 text-slate-100 font-mono text-xs rounded p-2 focus:border-teal-500 font-bold"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Serie</label>
              <input
                type="text"
                value={dam.serie}
                onChange={e => setDam({ ...dam, serie: e.target.value })}
                placeholder="001"
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 font-mono text-xs rounded p-2 focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Canal de Control</label>
              <select
                value={dam.canal_control}
                onChange={e => setDam({ ...dam, canal_control: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 text-xs rounded p-2 focus:border-teal-500 font-bold"
              >
                <option value={CANAL_CONTROL.VERDE}>VERDE</option>
                <option value={CANAL_CONTROL.NARANJA}>NARANJA</option>
                <option value={CANAL_CONTROL.ROJO}>ROJO</option>
              </select>
            </div>
          </div>
          {expediente.tipo_valor === TIPO_VALOR.GARANTIZADO && (
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Monto Garantizado (USD) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={dam.monto_valor_provisional_usd}
                onChange={e => setDam({ ...dam, monto_valor_provisional_usd: e.target.value })}
                placeholder="0.00"
                className="w-full bg-slate-950 border border-slate-700 text-emerald-400 font-mono text-xs rounded p-2 focus:border-teal-500 text-right font-bold"
              />
            </div>
          )}
          <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
            <button type="button" onClick={onCerrar} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white">Cancelar</button>
            <button type="submit" disabled={guardando} className="px-4 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded text-xs font-bold shadow-md disabled:opacity-50">
              {guardando ? 'Guardando...' : 'Crear DAM'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
