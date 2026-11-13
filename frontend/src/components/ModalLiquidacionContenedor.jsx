import { useState, useEffect } from 'react';
import api from '../services/api';
import { descargarExcel } from '../utils/exportUtils';
import { ESTADO_LEVANTE, ESTADO_PAGO, MONEDA, TIPO_GASTO } from '../constants';
import { useInteraccion } from '../context/interaccion';

const ModalLiquidacionContenedor = ({ isOpen, idMaestro, onClose }) => {
  const { avisar } = useInteraccion();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tc, setTc] = useState('3.80');
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

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
      avisar(`Error al cargar liquidación: ${err.response?.data?.detail || err.message || 'Error desconocido'}`, 'error');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleTcChange = (e) => {
    setTc(e.target.value);
  };

  const handleTcBlur = () => {
    const num = parseFloat(tc);
    if (!isNaN(num) && num > 0) {
      cargarLiquidacion(num);
    }
  };

  const handleExportarExcel = async () => {
    setIsExportingExcel(true);
    try {
      await descargarExcel(
        `/maestros/${idMaestro}/liquidacion-gastos/exportar`,
        { tipo_cambio_referencial: parseFloat(tc) || 3.80 },
        `Liquidacion_Gastos_${data?.n_cont_fisico || data?.numero_factura || 'EXP'}.xlsx`
      );
    } catch (err) {
      avisar(`Error al exportar Excel: ${err.response?.data?.detail || err.message || 'Error desconocido'}`, 'error');
    } finally {
      setIsExportingExcel(false);
    }
  };

  // Impresión y Exportación a PDF mediante diálogo nativo garantizado
  const handleExportarPdf = () => {
    const area = document.getElementById('area-impresion-liquidacion');
    if (!area) {
      avisar('Error: No se encontró el área de liquidación para exportar.', 'error');
      return;
    }

    setIsExportingPdf(true);
    setTimeout(() => {
      try {
        window.print();
      } catch (err) {
        console.error('Error al imprimir:', err);
      } finally {
        setIsExportingPdf(false);
      }
    }, 150);
  };

  if (!isOpen) return null;

  // Filtrar gastos por etapa para la tabla unificada
  const gastosFijos = data?.gastos?.filter(g => g.tipo_gasto === TIPO_GASTO.FIJO_DESPACHO) || [];
  const gastosPost = data?.gastos?.filter(g => g.tipo_gasto === TIPO_GASTO.POST_LEVANTE) || [];
  const gastosExtra = data?.gastos?.filter(g => g.tipo_gasto === TIPO_GASTO.EXTRAORDINARIO) || [];

  return (
    <>
      {/* Estilos para impresión nativa / Descargar PDF en A4 profesional */}
      <style>{`
        @media print {
          /* Ocultar elementos fuera del modal */
          header, nav, aside, footer, #main-sidebar, .sidebar {
            display: none !important;
          }
          body {
            background: white !important;
            color: #0f172a !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .modal-barra-acciones {
            display: none !important;
          }
          .modal-backdrop-filtro {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            width: 100% !important;
            background: white !important;
            backdrop-filter: none !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
            z-index: 99999 !important;
            display: block !important;
          }
          .modal-backdrop-filtro > div {
            background: white !important;
            border: none !important;
            box-shadow: none !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .modal-backdrop-filtro .p-3,
          .modal-backdrop-filtro .sm\\:p-6,
          .modal-backdrop-filtro .md\\:p-8 {
            background: white !important;
            padding: 0 !important;
          }
          #area-impresion-liquidacion {
            border: none !important;
            box-shadow: none !important;
            padding: 2mm !important;
            margin: 0 auto !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          @page {
            size: A4 portrait;
            margin: 6mm 8mm;
          }
        }
      `}</style>

      {/* Contenedor Modal */}
      <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex justify-center items-start overflow-y-auto p-2 sm:p-4 md:p-6 modal-backdrop-filtro">
        <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-6xl 2xl:max-w-7xl overflow-hidden my-2 md:my-4">

          {/* BARRA SUPERIOR DE ACCIONES */}
          <div className="px-5 py-3 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-20 modal-barra-acciones">
            <div className="flex items-center gap-2.5">
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20 text-lg">
                🧾
              </span>
              <div>
                <h2 className="text-sm font-bold text-white tracking-wide">
                  Liquidación de Despacho y Arqueo de Caja
                </h2>
                <p className="text-[11px] text-slate-400 font-mono">
                  Factura: <span className="text-teal-400 font-bold">{data?.numero_factura || '...'}</span> | Contenedor: <span className="text-amber-400 font-bold">{data?.n_cont_fisico || 'S/N'}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Selector de TC en vivo */}
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 px-2.5 py-1.5 rounded-lg text-xs">
                <span className="text-slate-400 font-medium text-[11px]">T.C. Ref:</span>
                <span className="text-slate-400 text-xs font-mono">S/</span>
                <input
                  type="number"
                  step="0.01"
                  value={tc}
                  onChange={handleTcChange}
                  onBlur={handleTcBlur}
                  className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-xs text-white font-mono focus:border-teal-500 focus:outline-none"
                  title="Cambia el Tipo de Cambio y presiona Enter o fuera del campo"
                />
              </div>

              {/* Botón Exportar Excel (Tabla Dinámica) */}
              <button
                type="button"
                onClick={handleExportarExcel}
                disabled={isExportingExcel || loading}
                className="px-3.5 py-1.5 bg-emerald-700/90 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg border border-emerald-500/40 transition flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                title="Descargar Excel continuo de datos planos para Tablas Dinámicas"
              >
                <span>{isExportingExcel ? '⏳' : '📊'}</span>
                <span>{isExportingExcel ? 'Exportando...' : 'Exportar Excel'}</span>
              </button>

              {/* Botón Exportar PDF / Imprimir A4 */}
              <button
                type="button"
                onClick={handleExportarPdf}
                disabled={isExportingPdf || loading}
                className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Guardar como archivo PDF o imprimir documento oficial A4"
              >
                <span>{isExportingPdf ? '⏳' : '📄'}</span>
                <span>{isExportingPdf ? 'Preparando...' : 'Descargar PDF / Imprimir'}</span>
              </button>

              {/* Cerrar */}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg text-sm transition cursor-pointer"
                title="Cerrar ventana"
              >
                ✕
              </button>
            </div>
          </div>

          {/* CUERPO DEL REPORTE (HOJA A4 PROFESIONAL) */}
          <div className="p-3 sm:p-6 md:p-8 bg-slate-950/60 flex justify-center">
            {loading ? (
              <div className="py-28 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
                <span className="animate-spin text-3xl">⏳</span>
                <span className="font-semibold text-slate-300">Generando arqueo de caja y liquidación...</span>
              </div>
            ) : data ? (
              <div
                id="area-impresion-liquidacion"
                className="w-full max-w-[230mm] bg-white text-slate-900 p-6 md:p-8 rounded-lg shadow-2xl border border-slate-300 text-[10px] leading-tight font-sans"
              >
                {/* 1. CABECERA / MEMBRETE OFICIAL */}
                <div className="border-b-2 border-slate-900 pb-3 mb-3 flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-bold uppercase tracking-wider bg-slate-900 text-white px-2 py-0.5 rounded">
                        LIQUIDACIÓN DE GASTOS Y CAJA
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 font-mono">
                        EXPEDIENTE: #{data.numero_factura}
                      </span>
                    </div>
                    <h1 className="text-sm font-extrabold uppercase text-slate-900 mt-1">
                      {data.importador}
                    </h1>
                    <p className="text-[10px] text-slate-600 font-medium">
                      {data.importador_ruc && data.importador_ruc !== '-' && (
                        <span>RUC: <strong className="font-mono text-slate-800">{data.importador_ruc}</strong> | </span>
                      )}
                      <span>Control de Costos de Importación & Conciliación Financiera</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="bg-slate-100 border border-slate-300 rounded px-3 py-1 inline-block text-right">
                      <span className="block text-[8px] uppercase tracking-wider font-bold text-slate-500">Fecha de Emisión</span>
                      <span className="text-xs font-mono font-bold text-slate-900">
                        {new Date().toLocaleDateString('es-PE')}
                      </span>
                    </div>
                    <span className="block text-[9px] text-slate-500 mt-1 font-mono">
                      Estado: <strong className={data.estado_levante === ESTADO_LEVANTE.CON_LEVANTE ? 'text-emerald-700' : 'text-amber-700'}>{data.estado_levante}</strong>
                    </span>
                  </div>
                </div>

                {/* 2. FICHA TÉCNICA DEL CONTENEDOR (GRILLA PERFECTAMENTE UNIFORME) */}
                <div className="grid grid-cols-4 gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded mb-3 text-[10px]">
                  <div className="border-r border-slate-200 pr-2">
                    <span className="block text-slate-500 font-bold uppercase text-[8.5px]">Contenedor Físico</span>
                    <span className="font-mono font-extrabold text-slate-900 text-[11px] block truncate">
                      {data.n_cont_fisico}
                    </span>
                  </div>
                  <div className="border-r border-slate-200 pr-2">
                    <span className="block text-slate-500 font-bold uppercase text-[8.5px]">Doc. Transporte (B/L)</span>
                    <span className="font-mono font-bold text-slate-800 block truncate">
                      {data.documento_transporte || '-'}
                    </span>
                  </div>
                  <div className="border-r border-slate-200 pr-2">
                    <span className="block text-slate-500 font-bold uppercase text-[8.5px]">Agente de Aduana</span>
                    <span className="text-slate-800 font-medium block truncate">
                      {data.agente_aduana}
                    </span>
                  </div>
                  <div>
                    <span className="block text-slate-500 font-bold uppercase text-[8.5px]">Almacén / Depósito</span>
                    <span className="text-slate-800 font-medium block truncate">
                      {data.almacen}
                    </span>
                  </div>

                  <div className="border-r border-slate-200 pr-2 pt-1 border-t border-slate-200">
                    <span className="block text-slate-500 font-bold uppercase text-[8.5px]">Arribo Callao</span>
                    <span className="font-mono text-slate-800">{data.fecha_arribo || '-'}</span>
                  </div>
                  <div className="border-r border-slate-200 pr-2 pt-1 border-t border-slate-200">
                    <span className="block text-slate-500 font-bold uppercase text-[8.5px]">Valor CFR Embarque</span>
                    <span className="font-mono font-bold text-slate-900">
                      ${data.cfr_usd?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="border-r border-slate-200 pr-2 pt-1 border-t border-slate-200">
                    <span className="block text-slate-500 font-bold uppercase text-[8.5px]">T.C. Liquidación</span>
                    <span className="font-mono font-bold text-slate-900">
                      S/ {parseFloat(tc).toFixed(3)}
                    </span>
                  </div>
                  <div className="pt-1 border-t border-slate-200">
                    <span className="block text-slate-500 font-bold uppercase text-[8.5px]">Total DAMS</span>
                    <span className="font-mono text-slate-800">
                      {data.dams?.length || 1} DAM(s) asociadas
                    </span>
                  </div>
                </div>

                {/* 3. TABLA MAESTRA UNIFICADA (COLUMNAS 100% ALINEADAS ENTRE TODAS LAS ETAPAS) */}
                <div className="mb-4 border border-slate-300 rounded overflow-hidden">
                  <table className="w-full border-collapse table-fixed text-[9.5px]">
                    {/* Definición estricta de anchos de columna para garantizar uniformidad absoluta */}
                    <colgroup>
                      <col className="w-[8%]" />  {/* Fecha */}
                      <col className="w-[10%]" /> {/* Documento */}
                      <col className="w-[20%]" /> {/* Proveedor */}
                      <col className="w-[17%]" /> {/* Concepto */}
                      <col className="w-[5%]" />  {/* Moneda */}
                      <col className="w-[9%]" />  {/* Monto Orig */}
                      <col className="w-[9%]" />  {/* Pagado */}
                      <col className="w-[9%]" />  {/* Saldo */}
                      <col className="w-[6%]" />  {/* Estado */}
                      <col className="w-[7%]" />  {/* Voucher */}
                    </colgroup>

                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300 text-[9px] uppercase tracking-wider">
                        <th className="p-1.5 text-center border-r border-slate-200">Fecha</th>
                        <th className="p-1.5 text-center border-r border-slate-200">Comprobante</th>
                        <th className="p-1.5 text-left border-r border-slate-200 pl-2">Proveedor</th>
                        <th className="p-1.5 text-left border-r border-slate-200 pl-2">Concepto</th>
                        <th className="p-1.5 text-center border-r border-slate-200">Mon</th>
                        <th className="p-1.5 text-right border-r border-slate-200 pr-2">Monto Orig.</th>
                        <th className="p-1.5 text-right border-r border-slate-200 pr-2">Pagado</th>
                        <th className="p-1.5 text-right border-r border-slate-200 pr-2">Saldo</th>
                        <th className="p-1.5 text-center border-r border-slate-200">Estado</th>
                        <th className="p-1.5 text-left pl-2">Medio / Op</th>
                      </tr>
                    </thead>

                    <tbody>
                      {/* === ETAPA 1: GASTOS FIJOS DE DESPACHO === */}
                      <tr className="bg-slate-800 text-white font-bold text-[9.5px]">
                        <td colSpan={5} className="p-1.5 uppercase tracking-wide">
                          1. Gastos Fijos de Despacho (Obligatorios para Levante)
                        </td>
                        <td colSpan={5} className="p-1.5 text-right font-mono text-slate-200 text-[9px] pr-2">
                          Subtotal: USD ${data.totales?.subtotales_etapa?.FIJO_DESPACHO?.usd?.toLocaleString('en-US', { minimumFractionDigits: 2 })} | PEN S/ {data.totales?.subtotales_etapa?.FIJO_DESPACHO?.pen?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                      {renderFilasGastos(gastosFijos)}

                      {/* === ETAPA 2: GASTOS POST-LEVANTE === */}
                      <tr className="bg-slate-700 text-white font-bold text-[9.5px] border-t-2 border-slate-400">
                        <td colSpan={5} className="p-1.5 uppercase tracking-wide">
                          2. Gastos Post-Levante (Transporte local, Cuadrilla, Devolución de Vacío)
                        </td>
                        <td colSpan={5} className="p-1.5 text-right font-mono text-slate-200 text-[9px] pr-2">
                          Subtotal: USD ${data.totales?.subtotales_etapa?.POST_LEVANTE?.usd?.toLocaleString('en-US', { minimumFractionDigits: 2 })} | PEN S/ {data.totales?.subtotales_etapa?.POST_LEVANTE?.pen?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                      {renderFilasGastos(gastosPost)}

                      {/* === ETAPA 3: GASTOS EXTRAORDINARIOS === */}
                      <tr className="bg-amber-900 text-white font-bold text-[9.5px] border-t-2 border-slate-400">
                        <td colSpan={5} className="p-1.5 uppercase tracking-wide">
                          3. Gastos Extraordinarios (Sobreestadías Naviera, Almacenaje Extra, Contingencias)
                        </td>
                        <td colSpan={5} className="p-1.5 text-right font-mono text-amber-200 text-[9px] pr-2">
                          Subtotal: USD ${data.totales?.subtotales_etapa?.EXTRAORDINARIO?.usd?.toLocaleString('en-US', { minimumFractionDigits: 2 })} | PEN S/ {data.totales?.subtotales_etapa?.EXTRAORDINARIO?.pen?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                      {renderFilasGastos(gastosExtra)}
                    </tbody>

                    {/* PIE DE TABLA: RESUMEN GENERAL DE GASTOS */}
                    <tfoot>
                      <tr className="bg-slate-900 text-white font-extrabold text-[10px] border-t-2 border-slate-900">
                        <td colSpan={5} className="p-2 uppercase tracking-wider">
                          TOTAL GENERAL DE GASTOS OPERATIVOS
                        </td>
                        <td colSpan={5} className="p-2 text-right font-mono text-[10px] text-teal-300 pr-2">
                          USD ${data.totales?.usd?.original?.toLocaleString('en-US', { minimumFractionDigits: 2 })} &nbsp;|&nbsp; PEN S/ {data.totales?.pen?.original?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* 4. CIERRE Y ARQUEO DE CAJA BIMONETARIO (DISEÑO CORPORATIVO EQUILIBRADO) */}
                <div className="grid grid-cols-2 gap-3 mb-4 items-stretch">
                  {/* NIVEL 1: ARQUEO DE CAJA Y TESORERÍA (MONEDAS REALES) */}
                  <div className="p-3 bg-slate-50 border border-slate-300 rounded flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between border-b border-slate-300 pb-1 mb-2">
                        <h3 className="text-[10px] font-extrabold uppercase text-slate-800 tracking-wider">
                          Nivel 1: Arqueo de Caja y Bancos (Flujo Real)
                        </h3>
                        <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                          Tesorería
                        </span>
                      </div>

                      <div className="space-y-1.5 text-[9.5px]">
                        {/* Bloque USD */}
                        <div className="bg-white p-2 rounded border border-slate-200 space-y-1">
                          <div className="flex justify-between items-center font-bold text-slate-800">
                            <span>Gastos Totales en Dólares (USD):</span>
                            <span className="font-mono text-slate-900">
                              ${data.totales?.usd?.original?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-emerald-800 font-semibold pl-2">
                            <span>(-) Amortizado / Pagado en USD:</span>
                            <span className="font-mono">
                              ${data.totales?.usd?.pagado?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-rose-700 font-bold border-t border-slate-200 pt-1 pl-2">
                            <span>Saldo Pendiente por Pagar (USD):</span>
                            <span className="font-mono">
                              ${data.totales?.usd?.saldo?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>

                        {/* Bloque PEN */}
                        <div className="bg-white p-2 rounded border border-slate-200 space-y-1">
                          <div className="flex justify-between items-center font-bold text-slate-800">
                            <span>Gastos Totales en Soles (PEN):</span>
                            <span className="font-mono text-slate-900">
                              S/ {data.totales?.pen?.original?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-emerald-800 font-semibold pl-2">
                            <span>(-) Amortizado / Pagado en Soles:</span>
                            <span className="font-mono">
                              S/ {data.totales?.pen?.pagado?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-rose-700 font-bold border-t border-slate-200 pt-1 pl-2">
                            <span>Saldo Pendiente por Pagar (PEN):</span>
                            <span className="font-mono">
                              S/ {data.totales?.pen?.saldo?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* NIVEL 2: COSTO CONSOLIDADO DEL EMBARQUE (LANDED COST EN USD) */}
                  <div className="p-3 bg-teal-50 border border-teal-300 rounded flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between border-b border-teal-200 pb-1 mb-2">
                        <h3 className="text-[10px] font-extrabold uppercase text-teal-900 tracking-wider">
                          Nivel 2: Costo Puesto en Almacén (Landed Cost)
                        </h3>
                        <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-teal-200 text-teal-800">
                          Costeo Final
                        </span>
                      </div>

                      <div className="space-y-1.5 text-[9.5px]">
                        <div className="flex justify-between items-center py-0.5 border-b border-teal-200 text-teal-900 font-semibold">
                          <span>(+) Valor Mercancía CFR (Factura Comercial):</span>
                          <span className="font-mono font-bold text-slate-900">
                            ${data.cfr_usd?.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-0.5 border-b border-teal-200 text-teal-800 pl-2">
                          <span>Gastos Logísticos Directos en USD:</span>
                          <span className="font-mono text-slate-800">
                            ${data.totales?.usd?.original?.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-0.5 border-b border-teal-200 text-teal-800 pl-2">
                          <span>Gastos en Soles conv. a USD (TC {parseFloat(tc).toFixed(3)}):</span>
                          <span className="font-mono text-slate-800">
                            ${((data.totales?.pen?.original || 0) / (parseFloat(tc) || 3.80)).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-1 font-bold text-teal-950 border-b-2 border-teal-300 bg-teal-100/60 px-1.5 rounded">
                          <span>Total Gastos Logísticos Puesto en Almacén:</span>
                          <span className="font-mono text-[10.5px]">
                            ${data.totales?.consolidado_usd?.total_gastos?.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-teal-900 text-white p-2.5 rounded mt-3 text-center shadow-sm">
                      <span className="block text-[8.5px] uppercase tracking-wider text-teal-200 font-semibold mb-0.5">
                        Costo Total Liquidado del Embarque (CFR + Todos los Gastos)
                      </span>
                      <span className="text-sm font-mono font-extrabold text-white">
                        ${data.totales?.consolidado_usd?.costo_total_embarque_cfr_gastos?.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                      </span>
                    </div>
                  </div>
                </div>

                {/* 5. FIRMAS DE CONFORMIDAD Y AUDITORÍA */}
                <div className="grid grid-cols-3 gap-6 pt-6 border-t border-slate-300 text-center text-[8.5px] text-slate-600">
                  <div>
                    <div className="border-t border-slate-400 pt-1 mx-3 font-bold text-slate-800 uppercase tracking-wide">
                      Operaciones / Despacho
                    </div>
                    <span>Elaborado y Validado</span>
                  </div>
                  <div>
                    <div className="border-t border-slate-400 pt-1 mx-3 font-bold text-slate-800 uppercase tracking-wide">
                      Tesorería / Caja
                    </div>
                    <span>Arqueo y Conciliación Bancaria</span>
                  </div>
                  <div>
                    <div className="border-t border-slate-400 pt-1 mx-3 font-bold text-slate-800 uppercase tracking-wide">
                      Gerencia General
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

// Renderizador uniforme de filas de gastos
const renderFilasGastos = (gastos) => {
  if (!gastos || gastos.length === 0) {
    return (
      <tr className="bg-white border-b border-slate-200">
        <td colSpan={10} className="p-2 text-center text-slate-400 italic text-[9px]">
          Sin gastos registrados en esta etapa.
        </td>
      </tr>
    );
  }

  return gastos.map((g, idx) => {
    const orig = typeof g.monto_original === 'number' ? g.monto_original : parseFloat(g.monto_original) || 0;
    const pagado = typeof g.total_pagado === 'number' ? g.total_pagado : parseFloat(g.total_pagado) || 0;
    const saldo = typeof g.saldo_pendiente === 'number' ? g.saldo_pendiente : parseFloat(g.saldo_pendiente) || 0;

    return (
      <tr key={g.id_gasto || idx} className={`border-b border-slate-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}`}>
        <td className="p-1 text-center font-mono border-r border-slate-200 text-slate-700 truncate">{g.fecha_vencimiento || '-'}</td>
        <td className="p-1 text-center font-mono border-r border-slate-200 text-slate-800 font-medium truncate">{g.numero_documento || '-'}</td>
        <td className="p-1 text-left border-r border-slate-200 pl-2 font-medium text-slate-900 truncate" title={g.proveedor_nombre}>{g.proveedor_nombre}</td>
        <td className="p-1 text-left border-r border-slate-200 pl-2 text-slate-700 truncate" title={g.concepto_nombre}>{g.concepto_nombre}</td>
        <td className="p-1 text-center font-bold border-r border-slate-200 text-[8.5px]">
          <span className={`px-1 py-0.5 rounded font-mono ${g.moneda === MONEDA.USD ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
            {g.moneda}
          </span>
        </td>
        <td className="p-1 text-right font-mono border-r border-slate-200 pr-2 font-semibold">
          {g.moneda === MONEDA.USD ? '$' : 'S/'} {orig.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </td>
        <td className="p-1 text-right font-mono border-r border-slate-200 pr-2 text-emerald-700 font-semibold">
          {g.moneda === MONEDA.USD ? '$' : 'S/'} {pagado.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </td>
        <td className={`p-1 text-right font-mono border-r border-slate-200 pr-2 ${saldo > 0 ? 'text-rose-700 font-bold' : 'text-slate-400'}`}>
          {g.moneda === MONEDA.USD ? '$' : 'S/'} {saldo.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </td>
        <td className="p-1 text-center border-r border-slate-200 text-[8px] font-bold">
          <span className={`px-1 py-0.5 rounded ${g.estado_pago === ESTADO_PAGO.PAGADO ? 'bg-emerald-100 text-emerald-800' :
            g.estado_pago === ESTADO_PAGO.PARCIAL ? 'bg-amber-100 text-amber-800' :
              'bg-rose-100 text-rose-800'
            }`}>
            {g.estado_pago}
          </span>
        </td>
        <td className="p-1 text-left text-[8.5px] font-mono text-slate-600 pl-2 truncate" title={g.pagos_detalle?.map(p => `${p.banco}: ${p.numero_operacion}`).join(', ')}>
          {g.pagos_detalle && g.pagos_detalle.length > 0 ? (
            g.pagos_detalle.map((p, pIdx) => (
              <span key={pIdx} className="block truncate">
                {p.banco}: {p.numero_operacion}
              </span>
            ))
          ) : (
            <span className="text-slate-400 italic">Pendiente</span>
          )}
        </td>
      </tr>
    );
  });
};

export default ModalLiquidacionContenedor;
