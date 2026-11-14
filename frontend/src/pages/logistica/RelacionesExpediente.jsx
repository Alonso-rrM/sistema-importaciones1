/** Pestañas con las DAMs y los gastos del expediente, con accesos a registrar, ver detalle y pagar. */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard } from 'lucide-react';
import { CANAL_CONTROL, ESTADO_DAM, ESTADO_PAGO } from '../../constants';

const PESTANA = Object.freeze({ DAMS: 'DAMS', GASTOS: 'GASTOS' });

export default function RelacionesExpediente({ damsVinculadas, gastosVinculados, isLoadingSub, onNuevaDam, onNuevoGasto }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(PESTANA.DAMS);
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden flex flex-col mt-4">
      <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800/80 px-2 pt-1">
        <div className="flex items-center">
          <button type="button" onClick={() => setActiveTab(PESTANA.DAMS)} className={`px-3 py-1.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors ${activeTab === PESTANA.DAMS ? 'border-teal-400 text-teal-300' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
            <span>DAMs Registradas</span>
            <span className="px-1.5 py-0.5 rounded-full bg-slate-950 text-[10px] font-mono">{damsVinculadas.length}</span>
          </button>
          <button type="button" onClick={() => setActiveTab(PESTANA.GASTOS)} className={`px-3 py-1.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors ${activeTab === PESTANA.GASTOS ? 'border-teal-400 text-teal-300' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
            <span>Gastos Logísticos</span>
            <span className="px-1.5 py-0.5 rounded-full bg-slate-950 text-[10px] font-mono">{gastosVinculados.length}</span>
          </button>
        </div>
        <div className="pb-1 pr-1 flex items-center gap-1.5">
          {activeTab === PESTANA.DAMS && (
            <button onClick={onNuevaDam} className="px-2.5 py-1 bg-teal-600 hover:bg-teal-500 text-white rounded text-[10px] font-bold shadow-sm transition-all flex items-center gap-1">
              <span>+</span> Nueva DAM Rápida
            </button>
          )}
          {activeTab === PESTANA.GASTOS && (
            <button onClick={onNuevoGasto} className="px-2.5 py-1 bg-teal-600 hover:bg-teal-500 text-white rounded text-[10px] font-bold shadow-sm transition-all flex items-center gap-1">
              <span>+</span> Registrar Gasto Rápido
            </button>
          )}
        </div>
      </div>

      <div className="p-0 overflow-x-auto min-h-[140px]">
        {isLoadingSub ? (
          <div className="p-6 text-center text-teal-500 text-xs font-bold animate-pulse">Cargando relaciones operativas...</div>
        ) : (
          <>
            {/* TABLA RICA DE DAMS */}
            {activeTab === PESTANA.DAMS && (
              <table className="w-full text-left text-[11px] whitespace-nowrap">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[9px] font-bold border-b border-slate-800">
                  <tr>
                    <th className="px-3 py-2 w-12">ID</th>
                    <th className="px-3 py-2">Nº DAM</th>
                    <th className="px-3 py-2 w-16">Serie</th>
                    <th className="px-3 py-2 text-center w-24">Canal</th>
                    <th className="px-3 py-2 text-center w-36">Estado Legal DAM</th>
                    <th className="px-3 py-2 text-right w-28">Valor Prov (USD)</th>
                    <th className="px-3 py-2 text-center w-20">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-slate-300">
                  {damsVinculadas.map(d => {
                    const requiereAforo = d.estado_dam === ESTADO_DAM.PENDIENTE_AFORO;
                    return (
                      <tr key={d.id_dam} className="hover:bg-slate-800/50 transition-colors group">
                        <td className="px-3 py-2 font-mono text-slate-500 group-hover:text-teal-400">#{d.id_dam}</td>
                        <td className="px-3 py-2 font-mono font-bold text-slate-200">
                          <div className="flex items-center gap-1.5">
                            <span>{d.numero_de_dam}</span>
                            {requiereAforo && (
                              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" title="Aforo obligatorio pendiente"></span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-400">{d.serie || 'N/A'}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${d.canal_control === CANAL_CONTROL.VERDE ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800' : d.canal_control === CANAL_CONTROL.ROJO ? 'bg-rose-900/30 text-rose-400 border-rose-800' : 'bg-orange-900/30 text-orange-400 border-orange-800'}`}>
                            {d.canal_control}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${d.estado_dam?.includes('LEVANTE') || d.estado_dam?.includes('LIQUIDADA') ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700' :
                            d.estado_dam?.includes('OBSERVADA') ? 'bg-rose-900/40 text-rose-300 border-rose-700' :
                              'bg-amber-900/40 text-amber-300 border-amber-700'
                            }`}>
                            {d.estado_dam || ESTADO_DAM.NUMERADA}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-slate-200">${d.monto_valor_provisional_usd ? parseFloat(d.monto_valor_provisional_usd).toFixed(2) : '0.00'}</td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => navigate('/app/dams', { state: { fromDam: d } })} className="text-[10px] text-teal-400 hover:underline font-bold">Ver detalle ➔</button>
                        </td>
                      </tr>
                    );
                  })}
                  {damsVinculadas.length === 0 && <tr><td colSpan="7" className="px-3 py-6 text-center text-slate-500 italic">No hay DAMs vinculadas a este expediente.</td></tr>}
                </tbody>
              </table>
            )}

            {/* TABLA RICA DE GASTOS LOGÍSTICOS CON MICRO-ACCIÓN 💸 PAGAR */}
            {activeTab === PESTANA.GASTOS && (
              <table className="w-full text-left text-[11px] whitespace-nowrap">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[9px] font-bold border-b border-slate-800">
                  <tr>
                    <th className="px-3 py-2 w-12">ID</th>
                    <th className="px-3 py-2 max-w-[140px]">Proveedor</th>
                    <th className="px-3 py-2 max-w-[140px]">Concepto</th>
                    <th className="px-3 py-2">Documento</th>
                    <th className="px-3 py-2 text-right">Monto</th>
                    <th className="px-3 py-2 text-center w-16">Moneda</th>
                    <th className="px-3 py-2 text-center w-24">Estado Pago</th>
                    <th className="px-3 py-2">DAM</th>
                    <th className="px-3 py-2 text-center w-20">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-slate-300">
                  {gastosVinculados.map(g => (
                    <tr key={g.id_gasto} className="hover:bg-slate-800/50 transition-colors group">
                      <td className="px-3 py-2 font-mono text-slate-500 group-hover:text-teal-400">#{g.id_gasto}</td>
                      <td className="px-3 py-2 font-bold text-slate-200 truncate max-w-[140px]" title={g.proveedor_nombre}>{g.proveedor_nombre || 'N/A'}</td>
                      <td className="px-3 py-2 font-bold text-teal-300 max-w-[180px]" title={g.observaciones ? `${g.concepto_nombre} — Obs: ${g.observaciones}` : g.concepto_nombre}>
                        <div className="truncate">{g.concepto_nombre || 'N/A'}</div>
                        {g.observaciones && (
                          <div className="text-[10px] text-amber-400/90 font-normal italic truncate">💬 {g.observaciones}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-300">{g.numero_documento || 'S/N'}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-slate-200">{parseFloat(g.monto_original || 0).toFixed(2)}</td>
                      <td className="px-3 py-2 text-center font-bold text-slate-400">{g.moneda}</td>
                      <td className="px-3 py-2 text-center"><span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${g.estado_pago === ESTADO_PAGO.PAGADO ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800' : g.estado_pago === ESTADO_PAGO.PENDIENTE ? 'bg-rose-900/30 text-rose-400 border-rose-800' : 'bg-amber-900/30 text-amber-400 border-amber-800'}`}>{g.estado_pago}</span></td>
                      <td className="px-3 py-2 font-mono text-slate-400 truncate max-w-[120px]">{g.dam_numero || '-'}</td>
                      <td className="px-3 py-2 text-center">
                        {g.estado_pago !== ESTADO_PAGO.PAGADO ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/app/pagos?gasto_id=${g.id_gasto}`); }}
                            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded border transition-all duration-150 shadow-sm bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-700 hover:text-white hover:border-purple-700 dark:bg-purple-600/30 dark:text-purple-300 dark:border-purple-500/40 dark:hover:bg-purple-600 dark:hover:text-white cursor-pointer"
                            title="Registrar pago de este gasto"
                          >
                            <CreditCard className="shrink-0" size={14} /> Pagar
                          </button>
                        ) : (
                          <span className="text-[10px] text-emerald-400 font-bold">Liquidado</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {gastosVinculados.length === 0 && <tr><td colSpan="9" className="px-3 py-6 text-center text-slate-500 italic">No hay Gastos vinculados a esta operación.</td></tr>}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
