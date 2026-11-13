/**
 * Panel de la ficha de un concepto: gastos registrados con ese concepto y sus observaciones específicas
 * (sobrecostos, días extra, aforo...). Permite buscar y editar la observación de cada gasto.
 */
import { useCallback, useState } from 'react';
import { Pencil, Search } from 'lucide-react';
import api from '../../services/api';
import useConsulta from '../../hooks/useConsulta';
import useDebounce from '../../hooks/useDebounce';
import { ESTADO_PAGO, MONEDA } from '../../constants';
import { mensajeDeError, useInteraccion } from '../../context/interaccion';

const COLOR_ESTADO_PAGO = {
  [ESTADO_PAGO.PENDIENTE]: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  [ESTADO_PAGO.PARCIAL]: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  [ESTADO_PAGO.PAGADO]: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
};

function TarjetaGasto({ gasto: g, onGuardado }) {
  const { avisar } = useInteraccion();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const simbolo = g.moneda === MONEDA.PEN ? 'S/' : '$';

  const guardar = async () => {
    setGuardando(true);
    try {
      await api.put(`/gastos/${g.id_gasto}`, { observaciones: texto.trim() || null });
      avisar('✅ Observación específica del gasto actualizada correctamente.', 'exito');
      setEditando(false);
      onGuardado();
    } catch (error) {
      avisar(`❌ ${mensajeDeError(error, 'No se pudo guardar la observación del gasto.')}`, 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 text-xs space-y-2 hover:border-slate-700 transition-colors">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono font-bold text-teal-400">Gasto #{g.id_gasto}</span>
          <span className="bg-slate-800 px-1.5 py-0.5 rounded font-mono text-[10px] text-slate-300">DAM: {g.dam_numero || 'N/A'}</span>
          {g.maestro_factura && (
            <span className="bg-slate-800 px-1.5 py-0.5 rounded font-mono text-[10px] text-slate-300">Fact: {g.maestro_factura}</span>
          )}
          <span className="text-slate-400 truncate max-w-[180px]">{g.proveedor_nombre || 'Sin Proveedor'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-slate-200">{simbolo} {parseFloat(g.monto_original || 0).toFixed(2)}</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${COLOR_ESTADO_PAGO[g.estado_pago] || COLOR_ESTADO_PAGO[ESTADO_PAGO.PAGADO]}`}>
            {g.estado_pago}
          </span>
        </div>
      </div>

      {editando ? (
        <div className="pt-1 space-y-2">
          <textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)}
            placeholder='Ej: "Sobrecosto 4 días extra por demora en aforo físico"...'
            className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-amber-500/50 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500 resize-y" />
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setEditando(false)} className="px-2.5 py-1 text-[11px] font-semibold text-slate-400 hover:text-slate-200">
              Cancelar
            </button>
            <button type="button" disabled={guardando} onClick={guardar}
              className="px-3 py-1 bg-teal-600 hover:bg-teal-500 text-white rounded text-[11px] font-bold transition-colors disabled:opacity-50 cursor-pointer">
              {guardando ? 'Guardando...' : 'Guardar Observación'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3 pt-1 border-t border-slate-800/70">
          <div className="flex-1">
            {g.observaciones ? (
              <p className="text-[11px] text-amber-300/95 italic">
                💬 <strong className="not-italic text-amber-400">Observación:</strong> "{g.observaciones}"
              </p>
            ) : (
              <p className="text-[11px] text-slate-500 italic">Sin observación específica registrada en este gasto.</p>
            )}
          </div>
          <button type="button" onClick={() => { setTexto(g.observaciones || ''); setEditando(true); }}
            className="text-[11px] font-semibold text-teal-400 hover:text-teal-300 shrink-0 flex items-center gap-1 cursor-pointer">
            <Pencil size={11} className="inline-block shrink-0" />
            <span>{g.observaciones ? 'Editar' : '+ Agregar observación'}</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function GastosDelConcepto({ registro: concepto }) {
  const [busqueda, setBusqueda] = useState('');
  const busquedaDiferida = useDebounce(busqueda, 300);
  const idConcepto = concepto.id_concepto;

  const consultar = useCallback(() => {
    const params = { id_concepto: idConcepto, limit: 50 };
    if (busquedaDiferida.trim()) params.search = busquedaDiferida.trim();
    return api.get('/gastos/', { params }).then((res) => res.data?.data || []);
  }, [idConcepto, busquedaDiferida]);
  const { datos: gastos, cargando, recargar } = useConsulta(consultar, {
    inicial: [],
    alFallar: (err) => console.error('Error al cargar gastos del concepto:', err),
  });

  return (
    <div className="pt-4 border-t border-slate-800 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
            <span>💬 Observaciones en Gastos Específicos de "{concepto.nombre}"</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">{gastos.length}</span>
          </h4>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Registre o busque comentarios específicos de Tesorería para cada gasto de este concepto (ej. sobrecostos, días extra, aforo).
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar en observaciones, DAM, Factura..."
            className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500" />
          <span className="absolute inset-y-0 left-2.5 flex items-center text-slate-400 text-xs"><Search size={12} className="inline-block shrink-0" /></span>
          {busqueda && (
            <button type="button" onClick={() => setBusqueda('')}
              className="absolute inset-y-0 right-2.5 flex items-center text-slate-400 hover:text-white text-xs">✕</button>
          )}
        </div>
      </div>

      {cargando && gastos.length === 0 ? (
        <div className="p-6 text-center text-slate-400 text-xs">Cargando gastos registrados con este concepto...</div>
      ) : gastos.length === 0 ? (
        <div className="p-6 text-center text-slate-500 text-xs bg-slate-900/50 border border-slate-800/80 rounded-lg">
          No se encontraron gastos registrados para este concepto{busqueda ? ` con el filtro "${busqueda}"` : ''}.
        </div>
      ) : (
        <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
          {gastos.map((g) => <TarjetaGasto key={g.id_gasto} gasto={g} onGuardado={recargar} />)}
        </div>
      )}
    </div>
  );
}
