/**
 * Avance operativo de pagos por etapa (despacho, post levante, extraordinarios y global), con el detalle
 * concepto por concepto. La etapa elegida y el detalle abierto son estado propio del componente.
 */
import { useState } from 'react';
import { ESTADO_PAGO, TIPO_GASTO } from '../../constants';

const KPI_KEYS = [TIPO_GASTO.FIJO_DESPACHO, TIPO_GASTO.POST_LEVANTE, TIPO_GASTO.EXTRAORDINARIO, 'GLOBAL'];

export default function AvancePagos({ kpiGastos }) {
  const [kpiViewIndex, setKpiViewIndex] = useState(0);
  const [showKpiDetails, setShowKpiDetails] = useState(false);
  if (!kpiGastos?.kpis) return null;

  const currentKpiKey = KPI_KEYS[kpiViewIndex] || TIPO_GASTO.FIJO_DESPACHO;
  const kpiActual = kpiGastos.kpis[currentKpiKey];
  if (!kpiActual) return null;

  const colorStyles = {
    emerald: {
      bar: 'bg-emerald-500',
      text: 'text-emerald-400',
      border: 'border-emerald-500/40',
      badge: 'bg-emerald-950/70 text-emerald-300 border-emerald-700/60'
    },
    amber: {
      bar: 'bg-amber-500',
      text: 'text-amber-400',
      border: 'border-amber-500/40',
      badge: 'bg-amber-950/70 text-amber-300 border-amber-700/60'
    },
    rose: {
      bar: 'bg-rose-500',
      text: 'text-rose-400',
      border: 'border-rose-500/40',
      badge: 'bg-rose-950/70 text-rose-300 border-rose-700/60'
    },
    slate: {
      bar: 'bg-slate-600',
      text: 'text-slate-400',
      border: 'border-slate-700',
      badge: 'bg-slate-800 text-slate-400 border-slate-700'
    }
  };

  const currentStyle = colorStyles[kpiActual.color] || colorStyles.slate;

  return (
    <div className={`bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border ${currentStyle.border} rounded-lg p-3.5 shadow-lg transition-all`}>
      {/* ENCABEZADO Y SELECTOR DE ETAPA CON FLECHAS */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          {/* Botón Flecha Izquierda */}
          <button
            type="button"
            onClick={() => setKpiViewIndex(prev => (prev === 0 ? KPI_KEYS.length - 1 : prev - 1))}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-600 hover:border-teal-500 text-slate-200 hover:text-white rounded text-xs font-bold transition flex items-center justify-center cursor-pointer shadow-sm"
            title="Etapa anterior (◀)"
          >
            ◀
          </button>

          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm">🎯</span>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-100">
                {kpiActual.nombre_etapa}
              </span>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase font-bold ${currentStyle.badge}`}>
                {currentKpiKey.replace('_', ' ')}
              </span>
            </div>
            <span className="text-[10px] text-slate-400">
              {currentKpiKey === TIPO_GASTO.FIJO_DESPACHO && 'Medido contra el universo de conceptos obligatorios del catálogo'}
              {currentKpiKey === TIPO_GASTO.POST_LEVANTE && 'Gastos operativos posteriores al levante aduanero'}
              {currentKpiKey === TIPO_GASTO.EXTRAORDINARIO && 'Gastos extraordinarios o incidencias no previstas'}
              {currentKpiKey === 'GLOBAL' && 'Visión consolidada de todos los conceptos del expediente'}
            </span>
          </div>

          {/* Botón Flecha Derecha */}
          <button
            type="button"
            onClick={() => setKpiViewIndex(prev => (prev === KPI_KEYS.length - 1 ? 0 : prev + 1))}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-600 hover:border-teal-500 text-slate-200 hover:text-white rounded text-xs font-bold transition flex items-center justify-center cursor-pointer shadow-sm"
            title="Etapa siguiente (▶)"
          >
            ▶
          </button>
        </div>

        {/* Métricas y Selector Rápido */}
        <div className="flex items-center gap-2">
          {/* Selector de pills rápido */}
          <div className="hidden sm:flex items-center bg-slate-950/80 p-0.5 rounded-md border border-slate-800 text-[10px] font-mono">
            {KPI_KEYS.map((key, idx) => (
              <button
                key={key}
                type="button"
                onClick={() => setKpiViewIndex(idx)}
                className={`px-2 py-0.5 rounded transition cursor-pointer ${kpiViewIndex === idx
                  ? 'bg-teal-600 text-white font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                {key === TIPO_GASTO.FIJO_DESPACHO && 'Fijos'}
                {key === TIPO_GASTO.POST_LEVANTE && 'Post-Lev.'}
                {key === TIPO_GASTO.EXTRAORDINARIO && 'Extraord.'}
                {key === 'GLOBAL' && 'Global'}
              </button>
            ))}
          </div>

          {/* Botón Toggle Desglose */}
          <button
            type="button"
            onClick={() => setShowKpiDetails(prev => !prev)}
            className="text-[11px] px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white rounded font-mono flex items-center gap-1 transition cursor-pointer shadow-sm"
          >
            <span>{showKpiDetails ? '👁️ Ocultar' : '📋 Ver Checklist'}</span>
            <span className="text-[10px] text-teal-400 font-bold">({kpiActual.items?.length || 0})</span>
          </button>
        </div>
      </div>

      {/* BARRA DE PROGRESO Y CONTADORES */}
      <div className="mt-2.5 space-y-1.5">
        <div className="flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-slate-300 font-bold">
              Avance: <span className={currentStyle.text}>{kpiActual.conceptos_pagados} de {kpiActual.total_conceptos_universo} cancelados</span>
            </span>
            <div className="flex items-center gap-2 text-[10px]">
              {kpiActual.conceptos_pagados > 0 && (
                <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
                  {kpiActual.conceptos_pagados} Pagados
                </span>
              )}
              {kpiActual.conceptos_pendientes > 0 && (
                <span className="text-amber-400 flex items-center gap-1 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>
                  {kpiActual.conceptos_pendientes} Pendientes
                </span>
              )}
              {kpiActual.conceptos_no_registrados > 0 && (
                <span className="text-rose-400 flex items-center gap-1 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 inline-block"></span>
                  {kpiActual.conceptos_no_registrados} No Registrados
                </span>
              )}
            </div>
          </div>

          <span className={`text-sm font-bold ${currentStyle.text}`}>
            {kpiActual.porcentaje}%
          </span>
        </div>

        {/* Barra de progreso interactiva */}
        <div
          onClick={() => setShowKpiDetails(prev => !prev)}
          className="w-full bg-slate-950 rounded-full h-3 border border-slate-700/80 overflow-hidden cursor-pointer group relative p-0.5 shadow-inner"
          title="Haz clic para ver u ocultar el desglose de conceptos"
        >
          <div
            className={`h-full rounded-full ${currentStyle.bar} transition-all duration-500 shadow-sm`}
            style={{ width: `${Math.min(100, Math.max(0, kpiActual.porcentaje))}%` }}
          ></div>
        </div>
      </div>

      {/* DETALLE CHECKLIST DESPLEGABLE */}
      {showKpiDetails && (
        <div className="mt-3 pt-2.5 border-t border-slate-800">
          <div className="text-[11px] font-bold text-slate-300 mb-2 flex items-center justify-between">
            <span className="uppercase tracking-wider">Desglose de Conceptos ({kpiActual.items?.length || 0}):</span>
            <span className="text-[10px] text-slate-400 font-mono">
              {currentKpiKey === TIPO_GASTO.FIJO_DESPACHO ? 'Catálogo Obligatorio' : 'Gastos Registrados'}
            </span>
          </div>

          {(!kpiActual.items || kpiActual.items.length === 0) ? (
            <div className="text-xs text-slate-500 italic py-2 text-center bg-slate-950/40 rounded border border-slate-800">
              No hay conceptos registrados para esta etapa operativa.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
              {kpiActual.items.map((item, idx) => {
                const isPagado = item.estado === ESTADO_PAGO.PAGADO;
                const isPendiente = item.estado === ESTADO_PAGO.PENDIENTE;
                const isNoRegistrado = item.estado === 'NO_REGISTRADO';

                return (
                  <div
                    key={idx}
                    className={`p-2 rounded border text-xs flex items-center justify-between gap-2 font-mono ${isPagado
                      ? 'bg-emerald-950/20 border-emerald-800/40 text-slate-200'
                      : isPendiente
                        ? 'bg-amber-950/20 border-amber-800/40 text-slate-200'
                        : 'bg-rose-950/20 border-rose-800/40 text-slate-300'
                      }`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="text-sm">
                        {isPagado && '✅'}
                        {isPendiente && '⏳'}
                        {isNoRegistrado && '⚠️'}
                      </span>
                      <span className="font-semibold truncate text-[11px]" title={item.nombre_concepto}>
                        {item.nombre_concepto}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isPagado && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-300 border border-emerald-700/60 font-bold">
                          PAGADO
                        </span>
                      )}
                      {isPendiente && (
                        <div className="text-right">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300 border border-amber-700/60 font-bold block">
                            PENDIENTE
                          </span>
                          {item.saldo_pendiente > 0 && (
                            <span className="text-[9px] text-amber-400/90 block mt-0.5">
                              S/ {Number(item.saldo_pendiente).toFixed(2)}
                            </span>
                          )}
                        </div>
                      )}
                      {isNoRegistrado && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-900/60 text-rose-300 border border-rose-700/60 font-bold">
                          NO REGISTRADO
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
