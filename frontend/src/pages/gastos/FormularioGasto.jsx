/**
 * Panel lateral para registrar o modificar un gasto. El estado del formulario vive en Gastos.jsx
 * (el panel queda montado para animar su apertura y cierre). Escape lo cierra.
 */
import { useEffect, useEffectEvent } from 'react';
import Select from 'react-select';

import { ESTILO_SELECT_TEAL } from '../../components/estilosSelect';
import { ESTADO_PAGO, MONEDA } from '../../constants';

export default function FormularioGasto({
  abierto, viewMode, selectedGasto, form, setForm, isGuardando, onGuardar, onCerrar, onCrearProveedor,
  damsRaw, opcionesMaestros, opcionesDamsFiltradas, opcionesConceptos, opcionesProveedores, opcionesTiposDoc,
}) {
  const cerrarConEscape = useEffectEvent((e) => { if (e.key === 'Escape') onCerrar(); });
  useEffect(() => {
    if (!abierto) return undefined;
    window.addEventListener('keydown', cerrarConEscape);
    return () => window.removeEventListener('keydown', cerrarConEscape);
  }, [abierto]);

  return (
    // Cerrado, el panel sigue montado (para animar) pero queda fuera del foco y de los lectores de pantalla
    <div inert={!abierto} aria-hidden={!abierto} className={`fixed inset-0 z-50 overflow-hidden ${abierto ? '' : 'pointer-events-none'}`}>
      <div 
        className={`fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity duration-300 ${abierto ? 'opacity-100' : 'opacity-0'}`} 
        onClick={onCerrar}
      ></div>

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className={`w-screen max-w-xl bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col h-full transform transition-transform duration-300 ${abierto ? 'translate-x-0' : 'translate-x-full'}`}>

          <div className="px-6 py-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                {viewMode === 'NUEVO' ? '✨ Registrar Nuevo Gasto' : `✏️ Modificar Gasto #${selectedGasto?.id_gasto ?? ''}`}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Asignación contable a despachos y proveedores</p>
            </div>
            <button 
              onClick={onCerrar} 
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors text-base font-bold"
            >
              ✕
            </button>
          </div>

          <form onSubmit={onGuardar} className="flex-1 overflow-y-auto p-6 space-y-5">

            {viewMode === 'MODIFICAR' && selectedGasto?.estado_pago === ESTADO_PAGO.PAGADO && (
              <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-500/40 text-xs text-amber-200 space-y-1">
                <div className="font-bold text-amber-400">🔒 Gasto con Estado PAGADO (Auditoría Financiera)</div>
                <p className="text-[11px] leading-relaxed">
                  Los importes y comprobantes están protegidos porque ya cuentan con pagos aplicados. Sin embargo, puede agregar o modificar libremente la <strong>Observación / Detalle Específico del Gasto</strong>.
                </p>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                Maestro (Opcional - Filtro de DAMs)
              </label>
              <Select 
                options={opcionesMaestros} 
                value={opcionesMaestros.find(op => op.value === form.id_maestro_temp) || null} 
                onChange={(op) => {
                  const maestroId = op ? op.value : null;
                  setForm(prev => {
                    const damPertenece = prev.id_dam && damsRaw.some(d => d.id_dam === prev.id_dam && d.id_maestro === maestroId);
                    return {
                      ...prev,
                      id_maestro_temp: maestroId,
                      id_dam: damPertenece ? prev.id_dam : null
                    };
                  });
                }} 
                placeholder="Filtrar DAMs por factura maestro..." 
                isClearable 
                styles={ESTILO_SELECT_TEAL}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                DAM Asociada *
              </label>
              <Select 
                options={opcionesDamsFiltradas} 
                value={
                  opcionesDamsFiltradas.find(op => op.value === form.id_dam) || 
                  (form.id_dam ? { value: form.id_dam, label: form.dam_numero ? `DAM: ${form.dam_numero}` : `DAM #${form.id_dam}` } : null)
                } 
                onChange={(op) => {
                  const selectedDamId = op ? op.value : null;
                  setForm(prev => {
                    let updatedMaestro = prev.id_maestro_temp;
                    if (selectedDamId) {
                      const damObj = damsRaw.find(d => d.id_dam === selectedDamId);
                      if (damObj && damObj.id_maestro) {
                        updatedMaestro = damObj.id_maestro;
                      }
                    }
                    return {
                      ...prev,
                      id_dam: selectedDamId,
                      id_maestro_temp: updatedMaestro
                    };
                  });
                }} 
                placeholder="Seleccione la DAM vinculada..." 
                isClearable 
                styles={ESTILO_SELECT_TEAL}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                Concepto de Gasto *
              </label>
              <Select 
                options={opcionesConceptos} 
                value={opcionesConceptos.find(op => op.value === form.id_concepto) || null} 
                onChange={(op) => setForm({ ...form, id_concepto: op ? op.value : null })} 
                placeholder="Seleccione concepto contable..." 
                isClearable 
                styles={ESTILO_SELECT_TEAL}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-amber-400 uppercase tracking-wide mb-1.5">
                💬 Observación / Detalle Específico del Gasto (Opcional)
              </label>
              <textarea
                rows={2}
                value={form.observaciones}
                onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
                placeholder='Ej: "Sobrecosto 4 días extra por demora en aforo físico"...'
                className="w-full px-3.5 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 resize-y"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                Este comentario diferencia el concepto de gasto específico y es indexado en el buscador general.
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide">
                  Proveedor de Servicio *
                </label>
                <button
                  type="button"
                  onClick={onCrearProveedor}
                  title="Registrar nuevo proveedor (+)"
                  className="flex items-center justify-center w-5 h-5 rounded bg-teal-600/30 hover:bg-teal-600 text-teal-300 hover:text-white border border-teal-500/40 text-xs font-bold leading-none transition shadow-sm cursor-pointer"
                >
                  +
                </button>
              </div>
              <Select 
                options={opcionesProveedores} 
                value={opcionesProveedores.find(op => op.value === form.id_proveedor) || null} 
                onChange={(op) => setForm({ ...form, id_proveedor: op ? op.value : null })} 
                placeholder="Seleccione proveedor con RUC..." 
                isClearable 
                styles={ESTILO_SELECT_TEAL}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                  Tipo de Documento *
                </label>
                <Select 
                  options={opcionesTiposDoc} 
                  value={opcionesTiposDoc.find(op => op.value === form.id_tipo_doc) || null} 
                  onChange={(op) => setForm({ ...form, id_tipo_doc: op ? op.value : null })} 
                  placeholder="Tipo de comprobante..." 
                  isClearable 
                  styles={ESTILO_SELECT_TEAL}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                  Número de Documento
                </label>
                <input 
                  type="text" 
                  value={form.numero_documento} 
                  onChange={(e) => setForm({ ...form, numero_documento: e.target.value })} 
                  placeholder="Ej. F001-123456" 
                  className="w-full text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                  Fecha Vencimiento
                </label>
                <input 
                  type="date" 
                  value={form.fecha_vencimiento} 
                  onChange={(e) => setForm({ ...form, fecha_vencimiento: e.target.value })} 
                  className="w-full text-xs bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                  Moneda *
                </label>
                <select 
                  value={form.moneda} 
                  onChange={(e) => setForm({ ...form, moneda: e.target.value })} 
                  className="w-full text-xs font-bold bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-teal-500"
                >
                  <option value={MONEDA.USD}>USD - Dólares ($)</option>
                  <option value={MONEDA.PEN}>PEN - Soles (S/)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                  Monto Original *
                </label>
                <input 
                  type="number" 
                  step="0.01" 
                  required 
                  value={form.monto_original} 
                  onChange={(e) => setForm({ ...form, monto_original: e.target.value })} 
                  placeholder="0.00" 
                  className="w-full text-xs font-mono font-bold bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-right text-teal-400 focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <div className="pt-6 border-t border-slate-800 flex items-center justify-end gap-3">
              <button 
                type="button" 
                onClick={onCerrar} 
                className="px-4 py-2 border border-slate-700 text-slate-300 hover:bg-slate-800 rounded-lg text-xs font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button 
                type="submit" 
                disabled={isGuardando} 
                className="px-6 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-teal-600/20 flex items-center gap-2"
              >
                {isGuardando ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Guardando...</span>
                  </>
                ) : (
                  <span>Guardar Gasto</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
