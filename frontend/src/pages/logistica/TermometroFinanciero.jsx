/** Total de gastos, pagado y saldo del contenedor en soles, con la barra de amortización. */

export default function TermometroFinanciero({ estadoCuenta, onVerLiquidacion }) {
  const amortizacion = estadoCuenta?.porcentaje_amortizado ? parseFloat(estadoCuenta.porcentaje_amortizado).toFixed(1) : '0.0';
  return (
    <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-teal-500/30 rounded-lg p-3 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-base">📊</span>
          <span className="text-xs font-bold uppercase tracking-wider text-teal-300">Termómetro Financiero del Contenedor</span>
          <span className="text-[10px] text-slate-400 font-mono">(Liquidación PEN)</span>
          <button
            type="button"
            onClick={onVerLiquidacion}
            className="text-[10px] text-teal-300 hover:text-white underline font-mono ml-1 cursor-pointer"
            title="Abrir liquidación formal de gastos de este contenedor"
          >
            [ Ver Liquidación ]
          </button>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono">
          <div><span className="text-slate-400 text-[10px] uppercase block">Total Gastos:</span><strong className="text-slate-200">S/ {parseFloat(estadoCuenta.total_general_gastos_pen || 0).toFixed(2)}</strong></div>
          <div><span className="text-slate-400 text-[10px] uppercase block">Pagado:</span><strong className="text-emerald-400">S/ {parseFloat(estadoCuenta.total_general_pagado_pen || 0).toFixed(2)}</strong></div>
          <div><span className="text-slate-400 text-[10px] uppercase block">Saldo Pendiente:</span><strong className={`${parseFloat(estadoCuenta.saldo_general_pendiente_pen || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>S/ {parseFloat(estadoCuenta.saldo_general_pendiente_pen || 0).toFixed(2)}</strong></div>
        </div>
      </div>
      {/* Barra de Progreso de Amortización */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] font-mono">
          <span className="text-slate-400">Progreso de Amortización</span>
          <span className={`font-bold ${parseFloat(amortizacion) >= 100 ? 'text-emerald-400' : 'text-amber-400'}`}>{amortizacion}%</span>
        </div>
        <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-700">
          <div className={`h-full transition-all duration-500 ${parseFloat(amortizacion) >= 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-amber-500 to-teal-500'}`} style={{ width: `${Math.min(100, Math.max(0, parseFloat(amortizacion)))}%` }}></div>
        </div>
      </div>
    </div>
  );
}
