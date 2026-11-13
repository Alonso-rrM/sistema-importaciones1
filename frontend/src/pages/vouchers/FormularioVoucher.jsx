/** Formulario de alta / modificación de un voucher (depósito bancario). */
import Select from 'react-select';
import { Lock, Pencil } from 'lucide-react';
import { ESTILO_SELECT_TEAL } from '../../components/estilosSelect';
import { MONEDA } from '../../constants';

export default function FormularioVoucher({
  formData, setFormData, viewMode, isGuardando, handleGuardar, handleCancelarEdicion, opcionesBancos, opcionesImportadores, tienePagos,
}) {
  return (
    <form onSubmit={handleGuardar} className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Pencil size={15} className="text-teal-400 shrink-0" />
          <span>{viewMode === 'NUEVO' ? 'Registro de Depósito Bancario' : 'Modificación de Voucher'}</span>
        </h3>
      </div>

      {viewMode === 'MODIFICAR' && tienePagos && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-center gap-2">
          <Lock size={14} className="shrink-0 text-amber-400" />
          <span><strong>Protección Contable Activa:</strong> Este voucher ya tiene pagos amortizados. El Monto, la Moneda y el Importador están bloqueados por integridad de libros.</span>
        </div>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
              Entidad Bancaria *
            </label>
            <Select
              options={opcionesBancos}
              value={opcionesBancos.find(b => b.value === formData.banco_id) || null}
              onChange={op => setFormData({ ...formData, banco_id: op ? op.value : null })}
              placeholder="Seleccionar banco..."
              isClearable
              styles={ESTILO_SELECT_TEAL}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
              Empresa Importadora Titular *
            </label>
            <Select
              options={opcionesImportadores}
              value={opcionesImportadores.find(i => i.value === formData.id_importador) || null}
              onChange={op => setFormData({ ...formData, id_importador: op ? op.value : null })}
              placeholder="Seleccionar importador..."
              isDisabled={viewMode === 'MODIFICAR' && tienePagos}
              isClearable
              styles={ESTILO_SELECT_TEAL}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
              N° de Operación Bancaria *
            </label>
            <input
              type="text"
              required
              value={formData.numero_operacion}
              onChange={e => setFormData({ ...formData, numero_operacion: e.target.value })}
              placeholder="Ej. OP-987654"
              className="w-full text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
              Moneda del Depósito *
            </label>
            <select
              value={formData.moneda}
              onChange={e => setFormData({ ...formData, moneda: e.target.value })}
              disabled={viewMode === 'MODIFICAR' && tienePagos}
              className="w-full text-xs font-bold bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white disabled:bg-slate-950 disabled:text-slate-500 focus:outline-none focus:border-teal-500"
            >
              <option value={MONEDA.USD}>USD - Dólares ($)</option>
              <option value={MONEDA.PEN}>PEN - Soles (S/)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
              Monto Total Depositado *
            </label>
            <input
              type="number"
              step="0.01"
              required
              value={formData.monto_total}
              onChange={e => setFormData({ ...formData, monto_total: e.target.value })}
              disabled={viewMode === 'MODIFICAR' && tienePagos}
              placeholder="0.00"
              className="w-full text-xs font-mono font-bold bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-right text-emerald-400 disabled:bg-slate-950 disabled:text-slate-500 focus:outline-none focus:border-teal-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
            Fecha de Transferencia / Depósito
          </label>
          <input
            type="date"
            value={formData.fecha_transferencia}
            onChange={e => setFormData({ ...formData, fecha_transferencia: e.target.value })}
            className="w-full sm:w-1/3 text-xs bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-teal-500"
          />
        </div>
      </div>

      <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={handleCancelarEdicion}
          className="px-4 py-2 border border-slate-700 text-slate-300 hover:bg-slate-800 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isGuardando}
          className="px-6 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-teal-600/20 flex items-center gap-2 cursor-pointer"
        >
          {isGuardando ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>Guardando...</span>
            </>
          ) : (
            <span>Guardar Voucher</span>
          )}
        </button>
      </div>
    </form>
  );
}
