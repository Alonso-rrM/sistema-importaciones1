/** Ficha del gasto seleccionado: datos, indicadores, observación y pagos aplicados (con reversión). */
import { useNavigate } from 'react-router-dom';
import { Banknote, CreditCard, FileText, Pencil, Trash2 } from 'lucide-react';
import { ESTADO_PAGO, MONEDA } from '../../constants';

export default function DetalleGasto({ gasto: selectedGasto, onNuevo, onEditar, onEliminar, onReversarPago }) {
  const navigate = useNavigate();
  return (
    <section className="lg:col-span-7 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl min-h-0">
      {!selectedGasto ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-500">
          <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-3xl mb-4 shadow-inner">
            <Banknote size={36} className="inline-block shrink-0 text-teal-400" />
          </div>
          <h3 className="text-base font-bold text-slate-300">Estación de Detalle Contable</h3>
          <p className="text-xs text-slate-500 max-w-sm mt-1.5">
            Seleccione un gasto de la bandeja izquierda para auditar sus importes, comprobantes y amortizaciones.
          </p>
          <button
            onClick={onNuevo}
            className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-teal-600/20"
          >
            + Registrar Nuevo Gasto
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-5 space-y-5">

          {/* CABECERA WORKSTATION */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Gasto #{selectedGasto.id_gasto} · {selectedGasto.concepto_nombre || 'Gasto General'}
                </h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  selectedGasto.estado_pago === ESTADO_PAGO.PENDIENTE
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    : selectedGasto.estado_pago === ESTADO_PAGO.PARCIAL
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                }`}>
                  {selectedGasto.estado_pago}
                </span>
              </div>

              {/* BARRA DE ACCIONES PARA EL REGISTRO SELECCIONADO */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onEditar(selectedGasto)}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                >
                  <Pencil size={13} className="inline-block shrink-0" />
                  <span>Modificar</span>
                </button>
                <button
                  onClick={() => onEliminar(selectedGasto)}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                >
                  <Trash2 size={13} className="inline-block shrink-0" />
                  <span>Eliminar</span>
                </button>
                <button
                  onClick={() => navigate(`/app/pagos?gasto_id=${selectedGasto.id_gasto}`)}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-purple-600/20 flex items-center gap-1.5"
                >
                  <CreditCard size={13} className="inline-block shrink-0" />
                  <span>Pagar</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1 border-t border-slate-800/80">
              <div>
                <span className="text-slate-500 text-[10px] uppercase font-bold block">DAM Asociada</span>
                <span className="font-mono text-slate-200">{selectedGasto.dam_numero || 'Sin DAM'}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] uppercase font-bold block">Factura Maestro</span>
                <span className="font-mono text-slate-200">{selectedGasto.maestro_factura || 'Sin Factura'}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] uppercase font-bold block">Importador</span>
                <span className="text-slate-200 truncate block">{selectedGasto.importador_nombre || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] uppercase font-bold block">Proveedor</span>
                <span className="text-slate-200 truncate block">{selectedGasto.proveedor_nombre || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* DECK DE KPIS FINANCIEROS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Monto Facturado</span>
              <div className="mt-1 font-mono font-bold text-sm text-slate-100 tabular-nums">
                {selectedGasto.moneda === MONEDA.PEN ? 'S/' : '$'} {parseFloat(selectedGasto.monto_original || 0).toFixed(2)}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Importe total</span>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
              <span className="text-[10px] uppercase font-bold text-emerald-400 block tracking-wider">Amortizado</span>
              <div className="mt-1 font-mono font-bold text-sm text-emerald-400 tabular-nums">
                {selectedGasto.moneda === MONEDA.PEN ? 'S/' : '$'} {(parseFloat(selectedGasto.monto_original || 0) - parseFloat(selectedGasto.saldo_pendiente ?? selectedGasto.monto_original ?? 0)).toFixed(2)}
              </div>
              <span className="text-[10px] text-emerald-500 mt-0.5 block">Liquidado a la fecha</span>
            </div>

            <div className="bg-rose-950/20 border border-rose-500/30 rounded-xl p-3">
              <span className="text-[10px] uppercase font-bold text-rose-400 block tracking-wider">Saldo Pendiente</span>
              <div className="mt-1 font-mono font-bold text-sm text-rose-400 tabular-nums">
                {selectedGasto.moneda === MONEDA.PEN ? 'S/' : '$'} {parseFloat(selectedGasto.saldo_pendiente ?? selectedGasto.monto_original ?? 0).toFixed(2)}
              </div>
              <span className="text-[10px] text-rose-300/70 mt-0.5 block">Por transferir</span>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Vencimiento</span>
              <div className="mt-1 font-mono text-sm text-slate-200">
                {selectedGasto.fecha_vencimiento || 'Inmediato'}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Plazo de crédito</span>
            </div>
          </div>

          {/* FICHA TÉCNICA Y AUDITORÍA DEL GASTO */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
              <FileText size={16} className="inline-block shrink-0 text-teal-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Información Documentaria y Fiscal
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-lg space-y-2">
                <span className="text-[11px] uppercase font-bold text-teal-400 block">Comprobante de Pago</span>
                <div className="flex justify-between border-b border-slate-800/80 pb-1.5">
                  <span className="text-slate-400">Tipo de Documento:</span>
                  <span className="font-semibold text-slate-200">{selectedGasto.tipo_doc_nombre || 'N/A'}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/80 pb-1.5">
                  <span className="text-slate-400">Número de Documento:</span>
                  <span className="font-mono font-bold text-slate-100">{selectedGasto.numero_documento || 'S/N'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Moneda Declarada:</span>
                  <span className="font-mono text-teal-300">{selectedGasto.moneda}</span>
                </div>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-lg space-y-2">
                <span className="text-[11px] uppercase font-bold text-purple-400 block">Trazabilidad Operativa</span>
                <div className="flex justify-between border-b border-slate-800/80 pb-1.5">
                  <span className="text-slate-400">DAM Aduanera:</span>
                  <span className="font-mono font-semibold text-slate-200">{selectedGasto.dam_numero || 'Sin DAM'}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/80 pb-1.5">
                  <span className="text-slate-400">Factura Maestro:</span>
                  <span className="font-mono font-semibold text-slate-200">{selectedGasto.maestro_factura || 'Sin Factura'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Importador:</span>
                  <span className="font-semibold text-purple-300 truncate max-w-[200px]">{selectedGasto.importador_nombre || 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* OBSERVACIÓN / DETALLE ESPECÍFICO DEL CONCEPTO DE GASTO */}
            <div className="bg-slate-900/90 border border-amber-500/30 p-3.5 rounded-lg space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase font-bold text-amber-400 flex items-center gap-1.5">
                  <span>💬 Observación / Detalle Específico del Gasto</span>
                </span>
                <button
                  type="button"
                  onClick={() => onEditar(selectedGasto)}
                  className="text-[11px] font-semibold text-teal-400 hover:text-teal-300 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Pencil size={11} className="inline-block shrink-0" />
                  <span>{selectedGasto.observaciones ? 'Editar observación' : '+ Agregar observación'}</span>
                </button>
              </div>
              {selectedGasto.observaciones ? (
                <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {selectedGasto.observaciones}
                </p>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  Sin observaciones registradas para este concepto de gasto. Haga clic en "+ Agregar observación" para detallar sobrecostos, demoras o notas de tesorería.
                </p>
              )}
            </div>
          </div>

          {/* HISTORIAL DE AMORTIZACIONES Y PAGOS APLICADOS */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <CreditCard size={16} className="inline-block shrink-0 text-purple-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Amortizaciones y Pagos Aplicados
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/30">
                {(selectedGasto.pagos_detalle?.length || 0)} {selectedGasto.pagos_detalle?.length === 1 ? 'pago' : 'pagos'}
              </span>
            </div>

            {(!selectedGasto.pagos_detalle || selectedGasto.pagos_detalle.length === 0) ? (
              <div className="text-center py-6 text-slate-500 text-xs">
                Sin pagos registrados. Este gasto no ha recibido amortizaciones.
              </div>
            ) : (
              <div className="space-y-2">
                {selectedGasto.pagos_detalle.map((pago) => (
                  <div
                    key={pago.id_pago}
                    className="bg-slate-900 border border-slate-800/80 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:border-slate-700 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-200">
                          Pago #{pago.id_pago}
                        </span>
                        <span className="text-slate-500 text-[11px]">•</span>
                        <span className="font-mono text-slate-400 text-[11px]">
                          {pago.fecha_pago || 'Fecha no indicada'}
                        </span>
                        {pago.es_ajuste_sistema && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30">
                            Ajuste ZD
                          </span>
                        )}
                      </div>
                      <div className="text-slate-400 text-[11px] flex items-center gap-2 flex-wrap">
                        <span>
                          <strong className="text-slate-300">Voucher / Op:</strong> {pago.banco_nombre ? `${pago.banco_nombre} - ` : ''}<span className="font-mono text-teal-400">{pago.numero_operacion || 'S/V'}</span>
                        </span>
                        {pago.tipo_cambio && parseFloat(pago.tipo_cambio) !== 1 && (
                          <span>
                            <strong className="text-slate-300">T/C:</strong> {parseFloat(pago.tipo_cambio).toFixed(3)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                      <div className="text-right">
                        <div className="font-mono font-bold text-emerald-400 text-sm">
                          {pago.moneda === MONEDA.PEN ? 'S/' : '$'} {parseFloat(pago.importe).toFixed(2)}
                        </div>
                        {pago.monto_moneda_origen && parseFloat(pago.monto_moneda_origen) !== parseFloat(pago.importe) && (
                          <div className="font-mono text-[10px] text-slate-400">
                            Origen: {parseFloat(pago.monto_moneda_origen).toFixed(2)}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => onReversarPago(pago)}
                        className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                        title="Anular y reversar este pago"
                      >
                        <span>🗑️</span>
                        <span>Reversar</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </section>
  );
}
