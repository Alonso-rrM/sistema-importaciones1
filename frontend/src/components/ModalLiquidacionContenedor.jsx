import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { descargarExcel } from '../utils/exportUtils';

const ModalLiquidacionContenedor = ({ isOpen, idMaestro, onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tc, setTc] = useState('3.80');
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (isOpen && idMaestro) {
      cargarLiquidacion(tc);
    }
  }, [isOpen, idMaestro]);

  const cargarLiquidacion = async (tcValor) => {
    setLoading(true);
    try {
      const res = await api.get(`/maestros/${idMaestro}/liquidacion-gastos`, {
        params: { tipo_cambio_referencial: parseFloat(tcValor) || 3.80 }
      });
      setData(res.data);
    } catch (err) {
      alert(`Error al cargar liquidación: ${err.response?.data?.detail || err.message || 'Error desconocido'}`);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleTcChange = (e) => {
    const val = e.target.value;
    setTc(val);
  };

  const handleTcBlur = () => {
    const num = parseFloat(tc);
    if (!isNaN(num) && num > 0) {
      cargarLiquidacion(num);
    }
  };

  const handleExportarExcel = async () => {
    setIsExporting(true);
    try {
      await descargarExcel(
        `/maestros/${idMaestro}/liquidacion-gastos/exportar`,
        { tipo_cambio_referencial: parseFloat(tc) || 3.80 },
        `Liquidacion_Gastos_${data?.n_cont_fisico || data?.numero_factura || 'EXP'}.xlsx`
      );
    } catch (err) {
      alert(`Error al exportar Excel: ${err.response?.data?.detail || err.message || 'Error desconocido'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImprimir = () => {
    window.print();
  };

  if (!isOpen) return null;

  // Filtrar gastos por etapa para la vista agrupada A4
  const gastosFijos = data?.gastos?.filter(g => g.tipo_gasto === 'FIJO_DESPACHO') || [];
  const gastosPost = data?.gastos?.filter(g => g.tipo_gasto === 'POST_LEVANTE') || [];
  const gastosExtra = data?.gastos?.filter(g => g.tipo_gasto === 'EXTRAORDINARIO') || [];

  return (
    <>
      {/* Estilos para impresión A4 forzada */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #area-impresion-liquidacion, #area-impresion-liquidacion * {
            visibility: visible !important;
          }
          #area-impresion-liquidacion {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 10mm !important;
            background: white !important;
            color: #0f172a !important;
            box-shadow: none !important;
          }
          .no-print {
            display: none !important;
          }
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
        }
      `}</style>

      <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex justify-center items-start overflow-y-auto p-4 md:p-6 no-print">
        <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden my-4">
          
          {/* BARRA SUPERIOR DE ACCIONES (NO SE IMPRIME) */}
          <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-10">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🧾</span>
              <div>
                <h2 className="text-sm font-bold text-white tracking-wide">
                  Liquidación de Despacho y Caja por Contenedor
                </h2>
                <p className="text-[11px] text-slate-400 font-mono">
                  Factura: <span className="text-teal-400 font-bold">{data?.numero_factura || '...'}</span> | Contenedor: <span className="text-amber-400 font-bold">{data?.n_cont_fisico || 'S/N'}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Selector de TC en vivo */}
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 px-2.5 py-1 rounded-lg text-xs">
                <span className="text-slate-400 font-medium text-[11px]">T.C. Ref:</span>
                <span className="text-slate-400 text-xs">S/</span>
                <input
                  type="number"
                  step="0.01"
                  value={tc}
                  onChange={handleTcChange}
                  onBlur={handleTcBlur}
                  className="w-14 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white font-mono focus:border-teal-500 focus:outline-none"
                  title="Cambia el Tipo de Cambio y presiona Enter o fuera del campo"
                />
              </div>

              {/* Botón Exportar Excel (Tabla Dinámica Plana) */}
              <button
                type="button"
                onClick={handleExportarExcel}
                disabled={isExporting || loading}
                className="px-3 py-1.5 bg-emerald-700/90 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg border border-emerald-500/40 transition flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                title="Descargar Excel plano continuo listo para Tablas Dinámicas"
              >
                <span>{isExporting ? '⏳' : '📊'}</span>
                <span>{isExporting ? 'Generando...' : 'Excel Tablas Dinámicas'}</span>
              </button>

              {/* Botón Imprimir A4 / PDF */}
              <button
                type="button"
                onClick={handleImprimir}
                disabled={loading}
                className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                title="Imprimir hoja A4 o guardar como PDF"
              >
                <span>🖨️</span>
                <span>Imprimir / PDF</span>
              </button>

              {/* Cerrar */}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg text-sm transition"
              >
                ✕
              </button>
            </div>
          </div>

          {/* CUERPO DEL REPORTE (HOJA A4 IMPRIMIBLE) */}
          <div className="p-4 md:p-8 bg-slate-950/40 flex justify-center">
            {loading ? (
              <div className="py-24 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
                <span className="animate-spin text-2xl">⏳</span>
                <span>Generando arqueo de caja y liquidación...</span>
              </div>
            ) : data ? (
              <div
                id="area-impresion-liquidacion"
                className="w-full max-w-[210mm] bg-white text-slate-900 p-8 rounded-lg shadow-xl border border-slate-200 text-[11px] leading-tight font-sans"
              >
                {/* 1. MEMBRETE / CABECERA OFICIAL */}
                <div className="border-b-2 border-slate-900 pb-3 mb-4 flex justify-between items-start">
                  <div>
                    <h1 className="text-base font-extrabold uppercase tracking-tight text-slate-900">
                      Liquidación de Despacho y Arqueo de Caja
                    </h1>
                    <p className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider">
                      Control Financiero Operativo de Comercio Exterior
                    </p>
                    <p className="text-[11px] text-slate-800 mt-1">
                      <span className="font-bold">Importador:</span> {data.importador}
                      {data.importador_ruc && data.importador_ruc !== '-' && (
                        <span className="ml-2 font-mono text-[10px] text-slate-600">(RUC: {data.importador_ruc})</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="inline-block bg-slate-100 border border-slate-300 rounded px-2.5 py-1 text-right">
                      <span className="block text-[9px] uppercase tracking-wider font-bold text-slate-500">Expediente N°</span>
                      <span className="text-xs font-mono font-bold text-slate-900">{data.numero_factura}</span>
                    </div>
                    <span className="block text-[9px] text-slate-400 mt-1 font-mono">
                      Emisión: {new Date().toLocaleDateString('es-PE')}
                    </span>
                  </div>
                </div>

                {/* 2. FICHA TÉCNICA DEL CONTENEDOR */}
                <div className="grid grid-cols-4 gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded mb-4 text-[10px]">
                  <div>
                    <span className="block text-slate-500 font-bold uppercase text-[9px]">Contenedor Físico</span>
                    <span className="font-mono font-bold text-slate-900 text-[11px]">{data.n_cont_fisico}</span>
                  </div>
                  <div>
                    <span className="block text-slate-500 font-bold uppercase text-[9px]">Doc. Transporte (B/L)</span>
                    <span className="font-mono text-slate-900">{data.documento_transporte}</span>
                  </div>
                  <div>
                    <span className="block text-slate-500 font-bold uppercase text-[9px]">Agente de Aduana</span>
                    <span className="text-slate-900 truncate block">{data.agente_aduana}</span>
                  </div>
                  <div>
                    <span className="block text-slate-500 font-bold uppercase text-[9px]">Depósito / Almacén</span>
                    <span className="text-slate-900 truncate block">{data.almacen}</span>
                  </div>
                  <div>
                    <span className="block text-slate-500 font-bold uppercase text-[9px]">Fecha Arribo Callao</span>
                    <span className="font-mono text-slate-900">{data.fecha_arribo}</span>
                  </div>
                  <div>
                    <span className="block text-slate-500 font-bold uppercase text-[9px]">Estado de Levante</span>
                    <span className={`font-bold ${data.estado_levante === 'CON LEVANTE' ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {data.estado_levante}
                    </span>
                  </div>
                  <div>
                    <span className="block text-slate-500 font-bold uppercase text-[9px]">Valor CFR (USD)</span>
                    <span className="font-mono font-bold text-slate-900">${data.cfr_usd?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div>
                    <span className="block text-slate-500 font-bold uppercase text-[9px]">T.C. Liquidación</span>
                    <span className="font-mono font-bold text-slate-900">S/ {parseFloat(tc).toFixed(3)}</span>
                  </div>
                </div>

                {/* 3. TABLA VERTICAL DE GASTOS */}
                <div className="space-y-4 mb-5">
                  {/* SECCIÓN 1: GASTOS FIJOS DE DESPACHO */}
                  <div>
                    <div className="flex items-center justify-between bg-slate-800 text-white px-2.5 py-1 rounded-t text-[10px] font-bold uppercase tracking-wider">
                      <span>1. Gastos Fijos de Despacho (Obligatorios para Levante)</span>
                      <span className="font-mono text-[9px] font-normal text-slate-300">
                        USD: ${data.totales?.subtotales_etapa?.FIJO_DESPACHO?.usd?.toLocaleString('en-US', { minimumFractionDigits: 2 })} | PEN: S/ {data.totales?.subtotales_etapa?.FIJO_DESPACHO?.pen?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    {renderTablaGastos(gastosFijos, tc)}
                  </div>

                  {/* SECCIÓN 2: GASTOS POST-LEVANTE */}
                  <div>
                    <div className="flex items-center justify-between bg-slate-700 text-white px-2.5 py-1 rounded-t text-[10px] font-bold uppercase tracking-wider">
                      <span>2. Gastos Post-Levante (Transporte, Cuadrilla, Devolución de Vacío)</span>
                      <span className="font-mono text-[9px] font-normal text-slate-300">
                        USD: ${data.totales?.subtotales_etapa?.POST_LEVANTE?.usd?.toLocaleString('en-US', { minimumFractionDigits: 2 })} | PEN: S/ {data.totales?.subtotales_etapa?.POST_LEVANTE?.pen?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    {renderTablaGastos(gastosPost, tc)}
                  </div>

                  {/* SECCIÓN 3: GASTOS EXTRAORDINARIOS */}
                  <div>
                    <div className="flex items-center justify-between bg-amber-900 text-white px-2.5 py-1 rounded-t text-[10px] font-bold uppercase tracking-wider">
                      <span>3. Gastos Extraordinarios (Sobreestadías Naviera, Almacenaje Extra, Contingencias)</span>
                      <span className="font-mono text-[9px] font-normal text-amber-200">
                        USD: ${data.totales?.subtotales_etapa?.EXTRAORDINARIO?.usd?.toLocaleString('en-US', { minimumFractionDigits: 2 })} | PEN: S/ {data.totales?.subtotales_etapa?.EXTRAORDINARIO?.pen?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    {renderTablaGastos(gastosExtra, tc)}
                  </div>
                </div>

                {/* 4. CIERRE Y ARQUEO DE CAJA BIMONETARIO */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {/* NIVEL 1: ARQUEO DE CAJA Y TESORERÍA (MONEDAS REALES) */}
                  <div className="p-3 bg-slate-50 border border-slate-300 rounded">
                    <h3 className="text-[10px] font-extrabold uppercase text-slate-800 border-b border-slate-300 pb-1 mb-2 tracking-wider">
                      Nivel 1: Arqueo de Caja y Bancos (Monedas Reales)
                    </h3>
                    <div className="space-y-1.5 text-[10px]">
                      <div className="flex justify-between items-center py-0.5 border-b border-slate-200">
                        <span className="text-slate-600 font-semibold">Total Gastos USD:</span>
                        <span className="font-mono font-bold text-slate-900">
                          ${data.totales?.usd?.original?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-0.5 border-b border-slate-200 text-emerald-800 font-semibold">
                        <span>(-) Pagado en USD:</span>
                        <span className="font-mono">
                          ${data.totales?.usd?.pagado?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-0.5 border-b border-slate-200 text-rose-800 font-bold">
                        <span>Saldo Pendiente USD:</span>
                        <span className="font-mono">
                          ${data.totales?.usd?.saldo?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="pt-1.5 border-t-2 border-slate-300">
                        <div className="flex justify-between items-center py-0.5 border-b border-slate-200">
                          <span className="text-slate-600 font-semibold">Total Gastos Soles (PEN):</span>
                          <span className="font-mono font-bold text-slate-900">
                            S/ {data.totales?.pen?.original?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-0.5 border-b border-slate-200 text-emerald-800 font-semibold">
                          <span>(-) Pagado en Soles (PEN):</span>
                          <span className="font-mono">
                            S/ {data.totales?.pen?.pagado?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-0.5 text-rose-800 font-bold">
                          <span>Saldo Pendiente Soles (PEN):</span>
                          <span className="font-mono">
                            S/ {data.totales?.pen?.saldo?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* NIVEL 2: COSTO CONSOLIDADO DEL EMBARQUE (LANDED COST EN USD) */}
                  <div className="p-3 bg-teal-50 border border-teal-300 rounded flex flex-col justify-between">
                    <div>
                      <h3 className="text-[10px] font-extrabold uppercase text-teal-900 border-b border-teal-200 pb-1 mb-2 tracking-wider">
                        Nivel 2: Costo Consolidado de la Mercancía (Landed Cost)
                      </h3>
                      <div className="space-y-1.5 text-[10px]">
                        <div className="flex justify-between items-center py-0.5 border-b border-teal-200">
                          <span className="text-teal-800">Valor CFR del Embarque (USD):</span>
                          <span className="font-mono font-bold text-slate-900">
                            ${data.cfr_usd?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-0.5 border-b border-teal-200">
                          <span className="text-teal-800">Gastos Directos en USD:</span>
                          <span className="font-mono font-bold text-slate-900">
                            ${data.totales?.usd?.original?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-0.5 border-b border-teal-200">
                          <span className="text-teal-800">Gastos en Soles conv. a USD (TC {parseFloat(tc).toFixed(3)}):</span>
                          <span className="font-mono font-bold text-slate-900">
                            ${((data.totales?.pen?.original || 0) / (parseFloat(tc) || 3.80)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-0.5 font-bold text-teal-950 border-b-2 border-teal-300 pt-1">
                          <span>Total Gastos Logísticos (Equiv. USD):</span>
                          <span className="font-mono text-[11px]">
                            ${data.totales?.consolidado_usd?.total_gastos?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-teal-900 text-white p-2 rounded mt-3 text-center">
                      <span className="block text-[9px] uppercase tracking-wider text-teal-200 font-semibold">
                        Costo Total Puesto en Almacén (CFR + Gastos)
                      </span>
                      <span className="text-sm font-mono font-extrabold text-white">
                        ${data.totales?.consolidado_usd?.costo_total_embarque_cfr_gastos?.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                      </span>
                    </div>
                  </div>
                </div>

                {/* 5. FIRMAS DE CONFORMIDAD Y AUDITORÍA */}
                <div className="grid grid-cols-3 gap-8 pt-8 border-t border-slate-300 text-center text-[9px] text-slate-600">
                  <div>
                    <div className="border-t border-slate-400 pt-1 mx-4 font-bold text-slate-800">
                      Operaciones / Despacho
                    </div>
                    <span>Elaborado y Verificado</span>
                  </div>
                  <div>
                    <div className="border-t border-slate-400 pt-1 mx-4 font-bold text-slate-800">
                      Tesorería / Caja
                    </div>
                    <span>Conciliación Bancaria</span>
                  </div>
                  <div>
                    <div className="border-t border-slate-400 pt-1 mx-4 font-bold text-slate-800">
                      Gerencia / Importador
                    </div>
                    <span>Conforme y Liquidado</span>
                  </div>
                </div>

              </div>
            ) : null}
          </div>

        </div>
      </div>
    </>
  );
};

// Renderizador de tabla de gastos por sección
const renderTablaGastos = (gastos, tc) => {
  if (!gastos || gastos.length === 0) {
    return (
      <div className="p-2 border border-slate-200 border-t-0 text-center text-slate-400 text-[10px] italic">
        Sin gastos registrados en esta etapa.
      </div>
    );
  }

  return (
    <table className="w-full border-collapse border border-slate-300 text-[10px]">
      <thead>
        <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
          <th className="p-1 text-center border-r border-slate-200 w-16">Fecha</th>
          <th className="p-1 text-center border-r border-slate-200 w-20">Documento</th>
          <th className="p-1 text-left border-r border-slate-200">Proveedor</th>
          <th className="p-1 text-left border-r border-slate-200">Concepto</th>
          <th className="p-1 text-center border-r border-slate-200 w-12">Moneda</th>
          <th className="p-1 text-right border-r border-slate-200 w-16">Monto Orig.</th>
          <th className="p-1 text-right border-r border-slate-200 w-16">Pagado</th>
          <th className="p-1 text-right border-r border-slate-200 w-16">Saldo</th>
          <th className="p-1 text-center border-r border-slate-200 w-16">Estado</th>
          <th className="p-1 text-left border-slate-200">Voucher / Medio de Pago</th>
        </tr>
      </thead>
      <tbody>
        {gastos.map((g, idx) => (
          <tr key={g.id_gasto || idx} className={`border-b border-slate-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
            <td className="p-1 text-center font-mono border-r border-slate-200">{g.fecha_vencimiento || '-'}</td>
            <td className="p-1 text-center font-mono border-r border-slate-200">{g.numero_documento || '-'}</td>
            <td className="p-1 text-left border-r border-slate-200 truncate max-w-[130px] font-medium">{g.proveedor_nombre}</td>
            <td className="p-1 text-left border-r border-slate-200 truncate max-w-[110px]">{g.concepto_nombre}</td>
            <td className="p-1 text-center font-bold border-r border-slate-200">{g.moneda}</td>
            <td className="p-1 text-right font-mono border-r border-slate-200">
              {g.moneda === 'USD' ? '$' : 'S/'} {g.monto_original?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </td>
            <td className="p-1 text-right font-mono border-r border-slate-200 text-emerald-700">
              {g.moneda === 'USD' ? '$' : 'S/'} {g.total_pagado?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </td>
            <td className={`p-1 text-right font-mono border-r border-slate-200 ${g.saldo_pendiente > 0 ? 'text-rose-700 font-bold' : 'text-slate-500'}`}>
              {g.moneda === 'USD' ? '$' : 'S/'} {g.saldo_pendiente?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </td>
            <td className="p-1 text-center border-r border-slate-200 font-bold text-[9px]">
              <span className={`px-1 py-0.5 rounded ${
                g.estado_pago === 'PAGADO' ? 'bg-emerald-100 text-emerald-800' :
                g.estado_pago === 'PARCIAL' ? 'bg-amber-100 text-amber-800' :
                'bg-rose-100 text-rose-800'
              }`}>
                {g.estado_pago}
              </span>
            </td>
            <td className="p-1 text-left text-[9px] font-mono text-slate-600 truncate max-w-[180px]">
              {g.pagos_detalle && g.pagos_detalle.length > 0 ? (
                g.pagos_detalle.map((p, pIdx) => (
                  <span key={pIdx} className="block truncate">
                    {p.banco}: {p.numero_operacion} ({p.moneda} {p.importe?.toFixed(2)})
                  </span>
                ))
              ) : (
                <span className="text-slate-400 italic">Pendiente de pago</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default ModalLiquidacionContenedor;

