/**
 * Panel derecho de Liquidación de Pagos: datos de la obligación seleccionada, indicadores y formulario
 * para pagarla con un voucher del mismo importador (incluye moneda cruzada y protección de doble cobro).
 * Se monta de nuevo cada vez que se elige una obligación (ver la `key` en Pagos.jsx).
 */
import { useCallback, useState } from 'react';
import Select from 'react-select';
import { Banknote, CreditCard, Scale, ShieldCheck, Zap } from 'lucide-react';
import api from '../../services/api';
import useConsulta from '../../hooks/useConsulta';
import { estiloSelectOscuro } from '../../components/estilosSelect';
import { ESTADO_PAGO, MONEDA } from '../../constants';
import { mensajeDeError, useInteraccion } from '../../context/interaccion';
import { nuevaClaveIdempotencia } from '../../utils/idempotencia';

const ESTILO_SELECT = estiloSelectOscuro('#a855f7');

const hoy = () => new Date().toISOString().split('T')[0];

function formularioInicial(gasto, tcSugerido) {
  const saldo = parseFloat(gasto?.saldo_pendiente ?? gasto?.monto_original ?? 0);
  const moneda = gasto?.moneda || MONEDA.USD;
  return {
    voucher_id: null,
    fecha_pago: hoy(),
    moneda,
    tipo_cambio: moneda === MONEDA.USD ? '1.00' : tcSugerido,
    importe: saldo > 0 ? saldo.toFixed(2) : '0.00',
    pago_moneda_cruzada: false,
    monto_moneda_origen: '',
  };
}

// Conversión estimada para la vista previa (el cálculo definitivo lo hace el servidor)
const convertirMoneda = (monto, de, a, tc) => (de === a ? monto : (de === MONEDA.USD && a === MONEDA.PEN ? monto * tc : monto / tc));

export default function PanelLiquidacion({ gasto: selectedGasto, bancos, tcSugerido, esUsuarioOperaciones, onPagoRegistrado }) {
  const { avisar, confirmar } = useInteraccion();
  const [form, setForm] = useState(() => formularioInicial(selectedGasto, tcSugerido));
  const [idempotencyKey, setIdempotencyKey] = useState(nuevaClaveIdempotencia);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mensajeExito, setMensajeExito] = useState(null);
  const [mensajeError, setMensajeError] = useState(null);

  // Vouchers del importador con saldo disponible
  const idImportador = selectedGasto?.id_importador;
  const consultarVouchers = useCallback(async () => {
    const res = await api.get(`/vouchers/?saldo_mayor_cero=true&id_importador=${idImportador}&limit=100`);
    const nombresBancos = Object.fromEntries(bancos.map((b) => [b.id_banco, b.nombre]));
    return (res.data?.data || []).map((v) => ({
      value: v.id_voucher,
      label: `${nombresBancos[v.banco_id] || 'Banco'} · Op: ${v.numero_operacion} (Saldo: ${v.moneda} ${parseFloat(v.saldo_disponible).toFixed(2)})`,
      voucher: v,
    }));
  }, [idImportador, bancos]);
  const { datos: opcionesVouchers, cargando: isLoadingVouchers, recargar: recargarVouchers } = useConsulta(
    idImportador ? consultarVouchers : null,
    { inicial: [], alFallar: (error) => console.error('Error al cargar vouchers:', error) },
  );

  const handleLiquidarTotal = () => {
    if (!selectedGasto) return;
    const saldo = parseFloat(selectedGasto.saldo_pendiente ?? selectedGasto.monto_original);
    setForm((prev) => ({ ...prev, importe: saldo.toFixed(2) }));
  };

  // Cálculos dinámicos para KPIs
  const montoFacturado = parseFloat(selectedGasto?.monto_original || 0);
  const saldoPendiente = parseFloat(selectedGasto?.saldo_pendiente ?? selectedGasto?.monto_original ?? 0);
  const amortizadoAcumulado = Math.max(0, montoFacturado - saldoPendiente);
  const porcentajeAmortizado = montoFacturado > 0 ? Math.min(100, Math.round((amortizadoAcumulado / montoFacturado) * 100)) : 0;

  // Cálculo en vivo de moneda cruzada: débito teórico en la MONEDA DEL VOUCHER (misma regla que el servidor)
  const tcNum = parseFloat(form.tipo_cambio) || 1.0;
  const importeNum = parseFloat(form.importe) || 0;
  const montoOrigenNum = parseFloat(form.monto_moneda_origen) || 0;
  const voucherSeleccionado = opcionesVouchers.find((op) => op.value === form.voucher_id)?.voucher || null;
  const monedaVoucher = voucherSeleccionado?.moneda || form.moneda;
  const montoConvertido = convertirMoneda(importeNum, form.moneda, monedaVoucher, tcNum);
  const diferenciaCambioCalculada = form.pago_moneda_cruzada ? Math.max(0, montoOrigenNum - montoConvertido) : 0;
  const simboloVoucher = monedaVoucher === MONEDA.PEN ? 'S/' : '$';
  // El TC solo interviene si alguna de las tres monedas (pago, gasto, voucher) difiere
  const requiereTipoCambio = new Set([form.moneda, selectedGasto?.moneda || form.moneda, monedaVoucher]).size > 1;

  const registrarPago = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (esUsuarioOperaciones) {
      avisar('Operación denegada: Solo Tesorería o el Administrador pueden liquidar pagos.', 'advertencia');
      return;
    }
    if (!form.voucher_id) {
      setMensajeError('Debe seleccionar un Voucher bancario con saldo disponible.');
      return;
    }
    if (!form.importe || parseFloat(form.importe) <= 0) {
      setMensajeError('Debe ingresar un importe mayor a 0.');
      return;
    }
    if (form.pago_moneda_cruzada && !(parseFloat(form.monto_moneda_origen) > 0)) {
      setMensajeError('Ingrese el débito real del banco en la moneda del voucher.');
      return;
    }

    // Confirmación explícita del contenedor y la DAM: evita pagar al contenedor equivocado cuando
    // dos números se parecen (ej. GF-26522 vs GF-26222). El pago puede dar levante automáticamente.
    const confirmado = await confirmar({
      titulo: 'Confirme el destino del pago',
      mensaje:
        `Contenedor / Factura:  ${selectedGasto.maestro_factura || '-'}\n` +
        `DAM:  ${selectedGasto.dam_numero || '-'}\n` +
        `Importador:  ${selectedGasto.importador_nombre || '-'}\n` +
        `Concepto:  ${selectedGasto.concepto_nombre || '-'}\n` +
        `Importe:  ${form.moneda} ${parseFloat(form.importe).toFixed(2)}\n\n` +
        'Verifique el número del contenedor contra el documento de pago.\n' +
        'Si este pago completa la proforma u OMC, la DAM puede obtener el levante automáticamente.',
      textoAceptar: 'Registrar el pago',
    });
    if (!confirmado) return;

    setIsSubmitting(true);
    setMensajeError(null);
    setMensajeExito(null);
    try {
      // El servidor calcula el débito del voucher, el importador y la diferencia cambiaria. Los montos
      // se envían como texto para que el servidor los reciba como decimales exactos.
      await api.post('/pagos/', {
        id_gasto: selectedGasto.id_gasto,
        voucher_id: form.voucher_id,
        fecha_pago: form.fecha_pago || null,
        moneda: form.moneda,
        importe: String(form.importe),
        tipo_cambio: requiereTipoCambio ? String(form.tipo_cambio) : '1',
        pago_moneda_cruzada: form.pago_moneda_cruzada,
        monto_moneda_origen: form.pago_moneda_cruzada ? String(form.monto_moneda_origen) : null,
      }, { headers: { 'Idempotency-Key': idempotencyKey } });

      setMensajeExito(`¡Pago liquidado exitosamente para el Gasto #${selectedGasto.id_gasto}!`);
      setIdempotencyKey(nuevaClaveIdempotencia());   // el próximo pago es otra operación
      await Promise.all([onPagoRegistrado(), recargarVouchers().catch(() => {})]);
    } catch (error) {
      setMensajeError(`Error en pago: ${mensajeDeError(error, 'Error inesperado al procesar la liquidación.')}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="lg:col-span-7 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl min-h-0">
      {!selectedGasto ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-500">
          <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-3xl mb-4 shadow-inner">
            <Scale size={36} className="inline-block shrink-0 text-purple-400" />
          </div>
          <h3 className="text-base font-bold text-slate-300">Estación de Liquidación de Tesorería</h3>
          <p className="text-xs text-slate-500 max-w-sm mt-1.5">
            Seleccione una obligación de la bandeja izquierda para auditar saldos, asignar un voucher y amortizar el pago.
          </p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-5 space-y-5">

          {/* ALERTA DE ÉXITO O ERROR */}
          {mensajeExito && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center justify-between animate-fadeIn">
              <div className="flex items-center gap-2">
                <span className="text-base">✅</span>
                <span>{mensajeExito}</span>
              </div>
              <button onClick={() => setMensajeExito(null)} className="text-emerald-400 hover:text-white">✕</button>
            </div>
          )}
          {mensajeError && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center justify-between animate-fadeIn">
              <div className="flex items-center gap-2">
                <span className="text-base">⚠️</span>
                <span>{mensajeError}</span>
              </div>
              <button onClick={() => setMensajeError(null)} className="text-rose-400 hover:text-white">✕</button>
            </div>
          )}

          {/* CABECERA DE LA OBLIGACIÓN SELECCIONADA */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Gasto #{selectedGasto.id_gasto} · {selectedGasto.concepto_nombre || 'Gasto General'}
                </h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${selectedGasto.estado_pago === ESTADO_PAGO.PENDIENTE
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    : selectedGasto.estado_pago === ESTADO_PAGO.PARCIAL
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  }`}>
                  {selectedGasto.estado_pago}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Importador:</span>
                <span className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-purple-300 text-xs font-semibold">
                  {selectedGasto.importador_nombre || 'N/A'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1 border-t border-slate-800/80">
              <div>
                <span className="text-slate-500 text-[10px] uppercase font-bold block">DAM Vinculada</span>
                <span className="font-mono text-slate-200">{selectedGasto.dam_numero || 'Sin DAM'}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] uppercase font-bold block">Factura Maestro</span>
                <span className="font-mono text-slate-200">{selectedGasto.maestro_factura || 'Sin Factura'}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] uppercase font-bold block">Comprobante</span>
                <span className="text-slate-200 font-mono truncate block">
                  {selectedGasto.tipo_doc_nombre ? `${selectedGasto.tipo_doc_nombre} - ` : ''}{selectedGasto.numero_documento || 'S/N'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] uppercase font-bold block">Proveedor</span>
                <span className="text-slate-200 truncate block">{selectedGasto.proveedor_nombre || 'N/A'}</span>
              </div>
            </div>
            {selectedGasto.observaciones && (
              <div className="pt-2 border-t border-slate-800/80 text-xs flex items-start gap-2">
                <span className="text-amber-400 font-bold uppercase text-[10px] shrink-0 mt-0.5">💬 Observación del Gasto:</span>
                <span className="text-slate-200 italic">{selectedGasto.observaciones}</span>
              </div>
            )}
          </div>

          {/* DECK DE KPIS FINANCIEROS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Monto Facturado</span>
              <div className="mt-1 font-mono font-bold text-sm text-slate-100 tabular-nums">
                {selectedGasto.moneda === MONEDA.PEN ? 'S/' : '$'} {montoFacturado.toFixed(2)}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Deuda total inicial</span>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
              <span className="text-[10px] uppercase font-bold text-emerald-400 block tracking-wider">Amortizado</span>
              <div className="mt-1 font-mono font-bold text-sm text-emerald-400 tabular-nums">
                {selectedGasto.moneda === MONEDA.PEN ? 'S/' : '$'} {amortizadoAcumulado.toFixed(2)}
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1 mt-1.5 overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${porcentajeAmortizado}%` }}></div>
              </div>
            </div>

            <div className="bg-rose-950/20 border border-rose-500/30 rounded-xl p-3">
              <span className="text-[10px] uppercase font-bold text-rose-400 block tracking-wider">Saldo Pendiente</span>
              <div className="mt-1 font-mono font-bold text-sm text-rose-400 tabular-nums">
                {selectedGasto.moneda === MONEDA.PEN ? 'S/' : '$'} {saldoPendiente.toFixed(2)}
              </div>
              <span className="text-[10px] text-rose-300/70 mt-0.5 block">Exigible a pagar</span>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Vencimiento</span>
              <div className="mt-1 font-mono text-sm text-slate-200">
                {selectedGasto.fecha_vencimiento || 'Inmediato'}
              </div>
              <span className="text-[10px] text-slate-500 mt-0.5 block">Término de crédito</span>
            </div>
          </div>

          {/* FORMULARIO DE LIQUIDACIÓN DE TESORERÍA */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <CreditCard size={16} className="inline-block shrink-0 text-purple-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Aplicar Liquidación Bancaria
                </h3>
              </div>
              <button
                type="button"
                onClick={handleLiquidarTotal}
                disabled={saldoPendiente <= 0}
                className="px-2.5 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 flex items-center gap-1.5"
              >
                <Zap size={13} className="inline-block shrink-0" />
                <span>Liquidar Saldo Completo</span>
              </button>
            </div>

            <form onSubmit={registrarPago} className="space-y-4">

              {/* SELECTOR DE VOUCHER BANCARIO */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5 flex items-center justify-between">
                  <span>Voucher Bancario de Origen (Importador) *</span>
                  {isLoadingVouchers && <span className="text-purple-400 text-[10px] animate-pulse">Cargando vouchers...</span>}
                </label>
                <Select
                  options={opcionesVouchers}
                  value={opcionesVouchers.find(op => op.value === form.voucher_id) || null}
                  onChange={op => setForm({ ...form, voucher_id: op ? op.value : null })}
                  placeholder="Seleccionar voucher con saldo a favor..."
                  isClearable
                  styles={ESTILO_SELECT}
                  noOptionsMessage={() => "No hay vouchers con saldo disponible para este importador"}
                />
                {opcionesVouchers.length === 0 && !isLoadingVouchers && (
                  <p className="mt-1.5 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 flex items-center gap-1.5">
                    <span>⚠️</span>
                    <span>Este importador no posee vouchers con saldo disponible. Registre un nuevo voucher en Tesorería antes de liquidar.</span>
                  </p>
                )}
              </div>

              {/* PARÁMETROS MONETARIOS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                    Moneda del Pago
                  </label>
                  <select
                    value={form.moneda}
                    onChange={e => setForm({
                      ...form,
                      moneda: e.target.value,
                      tipo_cambio: form.tipo_cambio === '1.00' ? tcSugerido : form.tipo_cambio
                    })}
                    className="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg p-2 font-bold text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value={MONEDA.USD}>USD ($)</option>
                    <option value={MONEDA.PEN}>PEN (S/)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                    Tipo de Cambio
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={form.tipo_cambio}
                    onChange={e => setForm({ ...form, tipo_cambio: e.target.value })}
                    disabled={!requiereTipoCambio}
                    className="w-full text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg p-2 text-white disabled:bg-slate-950 disabled:text-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                    Importe a Liquidar *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.importe}
                    onChange={e => setForm({ ...form, importe: e.target.value })}
                    className="w-full text-xs font-mono font-bold bg-slate-900 border border-slate-700 rounded-lg p-2 text-right text-emerald-400 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                    Fecha Transferencia
                  </label>
                  <input
                    type="date"
                    value={form.fecha_pago}
                    onChange={e => setForm({ ...form, fecha_pago: e.target.value })}
                    className="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* BLOQUE DE MONEDA CRUZADA */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-3">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.pago_moneda_cruzada}
                    onChange={e => setForm({ ...form, pago_moneda_cruzada: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-purple-600 focus:ring-purple-500 focus:ring-offset-slate-900"
                  />
                  <span className="text-xs font-bold text-slate-200">
                    ¿Moneda Cruzada (Diferencia Cambiaria Bancaria)?
                  </span>
                </label>

                {form.pago_moneda_cruzada && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800 animate-fadeIn">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                        Débito Real en Voucher (Moneda Origen) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={form.monto_moneda_origen}
                        onChange={e => setForm({ ...form, monto_moneda_origen: e.target.value })}
                        placeholder="0.00"
                        className="w-full text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg p-2 text-right text-white focus:outline-none focus:border-purple-500"
                      />
                    </div>

                    <div className="flex flex-col justify-center p-2 rounded-lg bg-purple-950/20 border border-purple-500/20 text-xs">
                      <span className="text-[10px] text-purple-300 uppercase font-semibold">Gasto Financiero TC Estimado</span>
                      <span className="font-mono font-bold text-purple-400 mt-0.5">
                        {diferenciaCambioCalculada > 0 ? `${simboloVoucher} ${diferenciaCambioCalculada.toFixed(2)}` : `${simboloVoucher} 0.00 (Sin sobrecosto)`}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* BARRA DE EJECUCIÓN Y PROTECCIÓN TRANSACCIONAL */}
              <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                  <ShieldCheck size={14} className="inline-block shrink-0 text-emerald-400" />
                  <span>Idempotency-Key:</span>
                  <span className="text-slate-300 truncate max-w-[140px] sm:max-w-[200px]" title={idempotencyKey}>
                    {idempotencyKey.substring(0, 16)}...
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || esUsuarioOperaciones || !form.voucher_id || saldoPendiente <= 0}
                  className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-lg text-xs font-bold tracking-wide transition-all shadow-lg shadow-purple-600/20 flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Procesando Liquidación...</span>
                    </>
                  ) : (
                    <>
                      <Banknote size={15} className="inline-block shrink-0" />
                      <span>Confirmar Liquidación de Pago</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

        </div>
      )}
    </section>

  );
}
