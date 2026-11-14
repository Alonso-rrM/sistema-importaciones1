/**
 * Registro rápido de un gasto en una DAM del expediente abierto. Permite crear un proveedor nacional
 * sin salir del formulario. Escape cierra el modal.
 */
import { useEffect, useEffectEvent, useState } from 'react';
import { Banknote } from 'lucide-react';
import api from '../../services/api';
import ModalCrearProveedorRapido from '../../components/ModalCrearProveedorRapido';
import { CATEGORIA_PROVEEDOR, MONEDA } from '../../constants';
import { mensajeDeError, useInteraccion } from '../../context/interaccion';
import { validarDocumentoSegunProveedor, validarMonto } from '../../utils/validaciones';

export default function ModalNuevoGasto({
  expediente, damsVinculadas, opcionesConceptos, opcionesProveedores, opcionesTiposDoc, onProveedorCreado, onCerrar, onRegistrado,
}) {
  const { avisar } = useInteraccion();
  const [gasto, setGasto] = useState(() => ({
    id_dam: damsVinculadas[0]?.id_dam ? String(damsVinculadas[0].id_dam) : '',
    id_concepto: '', id_proveedor: '', id_tipo_doc: '', numero_documento: '', monto_original: '', moneda: MONEDA.USD, observaciones: '',
  }));
  const [guardando, setGuardando] = useState(false);
  const [creandoProveedor, setCreandoProveedor] = useState(false);

  const cerrarConEscape = useEffectEvent((e) => { if (e.key === 'Escape' && !creandoProveedor) onCerrar(); });
  useEffect(() => {
    window.addEventListener('keydown', cerrarConEscape);
    return () => window.removeEventListener('keydown', cerrarConEscape);
  }, []);

  const proveedorCreado = (nuevo) => {
    onProveedorCreado(nuevo);
    setGasto((prev) => ({ ...prev, id_proveedor: String(nuevo.id_proveedor) }));
  };

  const registrar = async (e) => {
    e.preventDefault();
    const faltante = [
      [gasto.id_dam, 'Debe seleccionar una DAM asociada.'],
      [gasto.id_concepto, 'Debe seleccionar un concepto.'],
      [gasto.id_proveedor, 'Debe seleccionar un proveedor.'],
      [gasto.id_tipo_doc, 'Debe seleccionar un tipo de documento.'],
    ].find(([valor]) => !valor);
    if (faltante) {
      avisar(faltante[1], 'advertencia');
      return;
    }
    const monto = validarMonto(gasto.monto_original);
    const proveedor = opcionesProveedores.find((p) => String(p.id_proveedor) === String(gasto.id_proveedor));
    const documento = validarDocumentoSegunProveedor(proveedor?.categoria, gasto.numero_documento);
    const error = monto.error || documento.error;
    if (error) {
      avisar(error, 'advertencia');
      return;
    }
    setGuardando(true);
    try {
      await api.post('/gastos/', {
        id_dam: parseInt(gasto.id_dam, 10),
        id_concepto: parseInt(gasto.id_concepto, 10),
        id_proveedor: parseInt(gasto.id_proveedor, 10),
        id_tipo_doc: parseInt(gasto.id_tipo_doc, 10),
        numero_documento: documento.valor,
        monto_original: monto.valor,
        moneda: gasto.moneda || MONEDA.USD,
        observaciones: gasto.observaciones?.trim() || null,
      });
      onCerrar();
      avisar('✅ Gasto registrado y vinculado al contenedor.', 'exito');
      onRegistrado();
    } catch (error) {
      avisar(`Error al registrar Gasto: ${mensajeDeError(error, 'Error desconocido')}`, 'error');
      setGuardando(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
          <div className="bg-teal-950/40 border-b border-teal-800/50 p-4 flex items-center justify-between">
            <h3 className="text-teal-300 font-bold text-sm flex items-center gap-2"><Banknote size={16} className="inline-block shrink-0" /> Registrar Gasto Operativo para {expediente.numero_factura}</h3>
            <button onClick={onCerrar} className="text-slate-400 hover:text-white">✕</button>
          </div>
          <form onSubmit={registrar} className="p-5 space-y-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">DAM Vinculada *</label>
              <select
                required
                value={gasto.id_dam}
                onChange={e => setGasto({ ...gasto, id_dam: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded p-2 focus:border-teal-500 font-mono font-bold"
              >
                <option value="">-- Seleccionar DAM --</option>
                {damsVinculadas.map(d => (
                  <option key={d.id_dam} value={d.id_dam}>DAM {d.numero_de_dam} (Canal {d.canal_control})</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Concepto *</label>
                <select
                  required
                  value={gasto.id_concepto}
                  onChange={e => setGasto({ ...gasto, id_concepto: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded p-2 focus:border-teal-500 font-bold"
                >
                  <option value="">-- Seleccionar --</option>
                  {opcionesConceptos.map(c => (
                    <option key={c.id_concepto} value={c.id_concepto}>{c.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] font-bold uppercase text-slate-400">Proveedor *</label>
                  <button
                    type="button"
                    onClick={() => setCreandoProveedor(true)}
                    title="Registrar nuevo proveedor (+)"
                    className="flex items-center justify-center w-5 h-5 rounded bg-teal-600/30 hover:bg-teal-600 text-teal-300 hover:text-white border border-teal-500/40 text-xs font-bold leading-none transition shadow-sm cursor-pointer"
                  >
                    +
                  </button>
                </div>
                <select
                  required
                  value={gasto.id_proveedor}
                  onChange={e => setGasto({ ...gasto, id_proveedor: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded p-2 focus:border-teal-500"
                >
                  <option value="">-- Seleccionar --</option>
                  {opcionesProveedores.map(p => (
                    <option key={p.id_proveedor} value={p.id_proveedor}>{p.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-amber-400 mb-1">💬 Observación / Detalle del Gasto (Opcional)</label>
              <input
                type="text"
                value={gasto.observaciones || ''}
                onChange={e => setGasto({ ...gasto, observaciones: e.target.value })}
                placeholder='Ej: "Sobrecosto 4 días extra por demora en aforo físico"'
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 text-xs rounded p-2 focus:border-teal-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Tipo Documento *</label>
                <select
                  required
                  value={gasto.id_tipo_doc}
                  onChange={e => setGasto({ ...gasto, id_tipo_doc: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded p-2 focus:border-teal-500"
                >
                  <option value="">-- Seleccionar --</option>
                  {opcionesTiposDoc.map(t => (
                    <option key={t.id_tipo_doc} value={t.id_tipo_doc}>{t.nombre_documento}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">N° Documento</label>
                <input
                  type="text"
                  value={gasto.numero_documento}
                  onChange={e => setGasto({ ...gasto, numero_documento: e.target.value })}
                  placeholder="Ej: F001-9988"
                  className="w-full bg-slate-950 border border-slate-700 text-slate-100 font-mono text-xs rounded p-2 focus:border-teal-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Monto *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={gasto.monto_original}
                  onChange={e => setGasto({ ...gasto, monto_original: e.target.value })}
                  placeholder="0.00"
                  className="w-full bg-slate-950 border border-slate-700 text-emerald-400 font-mono text-xs rounded p-2 focus:border-teal-500 text-right font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Moneda *</label>
                <select
                  value={gasto.moneda}
                  onChange={e => setGasto({ ...gasto, moneda: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-100 text-xs rounded p-2 focus:border-teal-500 font-bold"
                >
                  <option value={MONEDA.USD}>USD ($)</option>
                  <option value={MONEDA.PEN}>PEN (S/)</option>
                </select>
              </div>
            </div>
            <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
              <button type="button" onClick={onCerrar} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white">Cancelar</button>
              <button type="submit" disabled={guardando} className="px-4 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded text-xs font-bold shadow-md disabled:opacity-50">
                {guardando ? 'Guardando...' : 'Registrar Gasto'}
              </button>
            </div>
          </form>
        </div>
      </div>
      <ModalCrearProveedorRapido
        isOpen={creandoProveedor}
        onClose={() => setCreandoProveedor(false)}
        onProveedorCreado={proveedorCreado}
        categoriaDefecto={CATEGORIA_PROVEEDOR.NACIONAL}
      />
    </>
  );
}
