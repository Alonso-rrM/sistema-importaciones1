/** Formulario del expediente: identificación, fechas, valores y régimen, actores y destino. */
import { STATUS_LLEGADA, TIPO_VALOR } from '../../constants';

export default function FormularioExpediente({
  formData, handleFormChange, isReadOnly, hasUnsavedChanges, isGuardando, viewMode, onGuardar, onCrearProveedor,
  opcionesImportadores, opcionesProveedores, opcionesAgentes, opcionesAlmacenes,
}) {
  return (
    <form onSubmit={onGuardar} className="space-y-4">

      {/* BLOQUE 1 */}
      <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-teal-400 border-b border-slate-700/80 pb-1.5">1. Identificación & Logística</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div><label className="block text-[10px] font-bold text-slate-400 mb-1">N° Factura *</label><input type="text" value={formData.numero_factura} onChange={e => handleFormChange('numero_factura', e.target.value)} required disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 focus:border-teal-500 text-slate-100 font-mono text-xs rounded px-2.5 py-2 disabled:opacity-60" /></div>
          <div><label className="block text-[10px] font-bold text-slate-400 mb-1">BL / Transporte</label><input type="text" value={formData.documento_transporte} onChange={e => handleFormChange('documento_transporte', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 focus:border-teal-500 text-slate-100 font-mono text-xs rounded px-2.5 py-2 disabled:opacity-60" /></div>
          <div><label className="block text-[10px] font-bold text-slate-400 mb-1">Contenedor Físico</label><input type="text" value={formData.n_cont_fisico} onChange={e => handleFormChange('n_cont_fisico', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 focus:border-teal-500 text-slate-100 font-mono text-xs rounded px-2.5 py-2 disabled:opacity-60" /></div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1">Estado Llegada (Físico)</label>
            <select
              value={formData.status_llegada}
              onChange={e => handleFormChange('status_llegada', e.target.value)}
              disabled={isReadOnly}
              className="w-full bg-slate-900 border border-slate-600 text-amber-300 font-bold text-xs rounded px-2.5 py-2 disabled:opacity-60"
            >
              <option value={STATUS_LLEGADA.EN_TRANSITO}>EN TRÁNSITO</option>
              <option value={STATUS_LLEGADA.EN_PUERTO}>EN PUERTO</option>
              <option value={STATUS_LLEGADA.EN_ALMACEN_TEMPORAL}>EN ALMACÉN TEMPORAL</option>
              <option value={STATUS_LLEGADA.RETIRO_PROGRAMADO}>RETIRO PROGRAMADO</option>
              <option value={STATUS_LLEGADA.EN_ALMACEN}>EN ALMACÉN</option>
            </select>
          </div>
        </div>
      </div>

      {/* BLOQUE 2 & 3: Fechas y Actores */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-teal-400 border-b border-slate-700/80 pb-1.5">2. Fechas Operativas</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className="block text-[10px] font-bold text-slate-400 mb-1">F. Embarque</label><input type="date" value={formData.fecha_embarque} onChange={e => handleFormChange('fecha_embarque', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-slate-100 text-xs rounded px-2.5 py-2 disabled:opacity-60" /></div>
            <div><label className="block text-[10px] font-bold text-slate-400 mb-1">F. Arribo</label><input type="date" value={formData.fecha_arribo} onChange={e => handleFormChange('fecha_arribo', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-slate-100 text-xs rounded px-2.5 py-2 disabled:opacity-60" /></div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-1">F. Rec. Almacén</label>
              <input
                type="date"
                value={formData.fecha_recepcion_almacen}
                onChange={e => handleFormChange('fecha_recepcion_almacen', e.target.value)}
                disabled={isReadOnly || formData.status_llegada !== STATUS_LLEGADA.EN_ALMACEN}
                className="w-full bg-slate-900 border border-slate-600 focus:border-teal-500 text-slate-100 text-xs rounded px-2.5 py-2 disabled:opacity-60"
              />
            </div>
          </div>
        </div>
        <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-teal-400 border-b border-slate-700/80 pb-1.5">3. Valores y Régimen</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-[10px] font-bold text-slate-400 mb-1">FOB (USD)</label><input type="number" step="0.01" value={formData.fob_usd} onChange={e => handleFormChange('fob_usd', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-slate-100 font-mono text-xs rounded px-2.5 py-2 text-right disabled:opacity-60" /></div>
            <div><label className="block text-[10px] font-bold text-slate-400 mb-1">Flete (USD)</label><input type="number" step="0.01" value={formData.flete_usd} onChange={e => handleFormChange('flete_usd', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-slate-100 font-mono text-xs rounded px-2.5 py-2 text-right disabled:opacity-60" /></div>
            <div><label className="block text-[10px] font-bold text-slate-400 mb-1">Tipo Valor</label><select value={formData.tipo_valor} onChange={e => handleFormChange('tipo_valor', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-slate-100 text-xs rounded px-2.5 py-2 disabled:opacity-60"><option value={TIPO_VALOR.DEFINITIVO}>DEFINITIVO</option><option value={TIPO_VALOR.GARANTIZADO}>GARANTIZADO</option></select></div>
            <div><label className="block text-[10px] font-bold text-slate-400 mb-1">Venta Sucesiva</label><select value={formData.venta_sucesiva} onChange={e => handleFormChange('venta_sucesiva', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-slate-100 text-xs rounded px-2.5 py-2 disabled:opacity-60"><option>NO</option><option>SI</option></select></div>
          </div>
        </div>
      </div>

      {/* BLOQUE 4: Actores */}
      <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-teal-400 border-b border-slate-700/80 pb-1.5">4. Actores & Destino</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><label className="block text-[10px] font-bold text-slate-400 mb-1">Importador</label><select value={formData.id_importador} onChange={e => handleFormChange('id_importador', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-xs rounded px-2.5 py-2 disabled:opacity-60"><option value="">-- Seleccionar --</option>{opcionesImportadores.map(o => <option key={o.id_importador} value={o.id_importador}>{o.nombre}</option>)}</select></div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[10px] font-bold text-slate-400">Proveedor (Shipper)</label>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={onCrearProveedor}
                  title="Registrar nuevo proveedor (+)"
                  className="flex items-center justify-center w-5 h-5 rounded bg-teal-600/30 hover:bg-teal-600 text-teal-300 hover:text-white border border-teal-500/40 text-xs font-bold leading-none transition shadow-sm cursor-pointer"
                >
                  +
                </button>
              )}
            </div>
            <select value={formData.id_proveedor} onChange={e => handleFormChange('id_proveedor', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-xs rounded px-2.5 py-2 disabled:opacity-60">
              <option value="">-- Seleccionar --</option>
              {opcionesProveedores.map(o => <option key={o.id_proveedor} value={o.id_proveedor}>{o.nombre}</option>)}
            </select>
          </div>
          <div><label className="block text-[10px] font-bold text-slate-400 mb-1">Agente de Aduanas</label><select value={formData.id_agente} onChange={e => handleFormChange('id_agente', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-xs rounded px-2.5 py-2 disabled:opacity-60"><option value="">-- Seleccionar --</option>{opcionesAgentes.map(o => <option key={o.id_agente} value={o.id_agente}>{o.nombre}</option>)}</select></div>
          <div><label className="block text-[10px] font-bold text-slate-400 mb-1">Almacén Destino</label><select value={formData.id_almacen} onChange={e => handleFormChange('id_almacen', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-xs rounded px-2.5 py-2 disabled:opacity-60"><option value="">-- Seleccionar --</option>{opcionesAlmacenes.map(o => <option key={o.id_almacen} value={o.id_almacen}>{o.nombre}</option>)}</select></div>
        </div>
      </div>

      {/* Botonera Master */}
      <div className="flex justify-end pt-2 border-t border-slate-700">
        <button type="submit" disabled={!hasUnsavedChanges || isGuardando || isReadOnly} className="px-5 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded text-xs transition-all disabled:opacity-50 disabled:bg-slate-700">
          {isGuardando ? 'Procesando...' : (viewMode === 'NUEVO' ? 'Crear Expediente' : 'Guardar Cambios')}
        </button>
      </div>
    </form>
  );
}
