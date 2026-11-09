import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { Eye, Search, RotateCcw } from 'lucide-react';

const TABLAS = [
  { value: '', label: 'Todas las tablas' },
  { value: 'maestro_importaciones', label: 'Contenedores' },
  { value: 'detalle_dams', label: 'DAMs' },
  { value: 'registro_gastos', label: 'Gastos' },
  { value: 'registro_pagos', label: 'Pagos' },
  { value: 'vouchers_bancarios', label: 'Vouchers' },
  { value: 'historial_tipo_cambio', label: 'Tipo de cambio' },
  { value: 'cat_importadores', label: 'Importadores' },
  { value: 'cat_proveedores', label: 'Proveedores' },
  { value: 'cat_agentes', label: 'Agentes' },
  { value: 'cat_almacenes', label: 'Almacenes' },
  { value: 'cat_bancos', label: 'Bancos' },
  { value: 'cat_conceptos_pagos', label: 'Conceptos' },
  { value: 'catalogo_documentos_pago', label: 'Tipos de documento' },
  { value: 'usuarios', label: 'Usuarios' },
];

const POR_PAGINA = 100;

const colorAccion = (accion = '') => {
  if (accion.startsWith('ALTA')) return 'bg-emerald-900/40 text-emerald-300 border-emerald-800';
  if (accion.startsWith('BAJA')) return 'bg-rose-900/40 text-rose-300 border-rose-800';
  if (accion.startsWith('MODIFICACION')) return 'bg-amber-900/40 text-amber-300 border-amber-800';
  return 'bg-slate-800 text-sky-300 border-slate-700';
};

const parsear = (texto) => {
  try { return JSON.parse(texto); } catch { return null; }
};

const fmtFecha = (val) => {
  if (!val) return '';
  const utc = val.endsWith('Z') ? val : `${val}Z`;
  return new Date(utc).toLocaleString('es-PE');
};

const fmtValor = (v) => (v === null || v === undefined || v === '' ? '∅' : String(v));

const BitacoraCambios = ({ onCount }) => {
  const [filas, setFilas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hayMas, setHayMas] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [filtros, setFiltros] = useState({ tabla: '', accion: '', id_registro: '', fecha_desde: '', fecha_hasta: '' });

  const cargar = useCallback(async (offset = 0) => {
    setLoading(true);
    try {
      const params = { limit: POR_PAGINA, offset };
      Object.entries(filtros).forEach(([k, v]) => { if (v !== '' && v !== null) params[k] = v; });
      if (!params.tabla) delete params.id_registro;
      const res = await api.get('/auditoria/', { params });
      const datos = res.data || [];
      setFilas(prev => (offset === 0 ? datos : [...prev, ...datos]));
      setHayMas(datos.length === POR_PAGINA);
    } catch (error) {
      console.error('Error al cargar la bitácora:', error);
      if (offset === 0) setFilas([]);
    } finally {
      setLoading(false);
    }
  }, [filtros]);

  useEffect(() => { cargar(0); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onCount?.(filas.length); }, [filas, onCount]);

  const limpiar = () => setFiltros({ tabla: '', accion: '', id_registro: '', fecha_desde: '', fecha_hasta: '' });

  const inputCls = 'text-xs bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-teal-500';
  const det = detalle ? parsear(detalle.detalles) : null;

  return (
    <>
      {/* FILTROS */}
      <form
        onSubmit={e => { e.preventDefault(); cargar(0); }}
        className="flex flex-wrap items-end gap-2 p-3 bg-slate-900/80 border border-slate-800 rounded-xl shrink-0"
      >
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase font-bold text-slate-500">Tabla</span>
          <select value={filtros.tabla} onChange={e => setFiltros({ ...filtros, tabla: e.target.value })} className={inputCls}>
            {TABLAS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase font-bold text-slate-500">ID registro</span>
          <input type="number" min="1" disabled={!filtros.tabla} value={filtros.id_registro}
            onChange={e => setFiltros({ ...filtros, id_registro: e.target.value })} className={`${inputCls} w-24 disabled:opacity-40`} placeholder="#" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase font-bold text-slate-500">Acción contiene</span>
          <input value={filtros.accion} onChange={e => setFiltros({ ...filtros, accion: e.target.value })} className={`${inputCls} w-44`} placeholder="ej. MODIFICACION, LEVANTE" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase font-bold text-slate-500">Desde</span>
          <input type="date" value={filtros.fecha_desde} onChange={e => setFiltros({ ...filtros, fecha_desde: e.target.value })} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase font-bold text-slate-500">Hasta</span>
          <input type="date" value={filtros.fecha_hasta} onChange={e => setFiltros({ ...filtros, fecha_hasta: e.target.value })} className={inputCls} />
        </label>
        <button type="submit" className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5">
          <Search size={13} /> Buscar
        </button>
        <button type="button" onClick={limpiar} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5">
          <RotateCcw size={13} /> Limpiar
        </button>
      </form>

      {/* TABLA */}
      <section className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl flex flex-col min-h-0">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-950/80 sticky top-0 z-10 border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-3.5 w-44">Fecha y Hora</th>
                <th className="px-4 py-3.5 w-32">Usuario</th>
                <th className="px-4 py-3.5 w-52">Acción</th>
                <th className="px-4 py-3.5">Registro / Cambios</th>
                <th className="px-4 py-3.5 w-32">IP</th>
                <th className="px-4 py-3.5 w-24 text-center">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-300">
              {filas.length === 0 && !loading && (
                <tr><td colSpan="6" className="p-8 text-center text-slate-500">No hay eventos para los filtros seleccionados.</td></tr>
              )}
              {filas.map(f => {
                const d = parsear(f.detalles);
                const resumen = d?.tabla
                  ? `${d.tabla} #${d.id ?? '?'}${d.cambios ? ' · ' + Object.keys(d.cambios).join(', ') : ''}`
                  : (f.detalles || '').slice(0, 120);
                return (
                  <tr key={f.id_log} className="hover:bg-slate-800/60 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-slate-400">{fmtFecha(f.created_at)}</td>
                    <td className="px-4 py-2.5">
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] font-semibold bg-slate-800 text-purple-300 border border-slate-700">
                        {f.nombre_usuario || (f.id_usuario ? `#${f.id_usuario}` : 'Sistema')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${colorAccion(f.accion)}`}>{f.accion}</span>
                    </td>
                    <td className="px-4 py-2.5"><span className="font-mono truncate block max-w-xl" title={resumen}>{resumen}</span></td>
                    <td className="px-4 py-2.5 font-mono text-slate-500">{f.ip_address || '-'}</td>
                    <td className="px-4 py-2.5 text-center">
                      <button onClick={() => setDetalle(f)} className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-teal-300 border border-teal-500/30 rounded-lg text-xs font-semibold inline-flex items-center gap-1">
                        <Eye size={13} /> Ver
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(loading || hayMas) && (
            <div className="p-3 text-center">
              {loading
                ? <span className="text-xs text-slate-400">Cargando bitácora...</span>
                : <button onClick={() => cargar(filas.length)} className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold">Cargar más</button>}
            </div>
          )}
        </div>
      </section>

      {/* MODAL DE DETALLE */}
      {detalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" onClick={() => setDetalle(null)}>
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col text-slate-100" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <h3 className="font-bold text-sm text-white">Evento #{detalle.id_log} · {detalle.accion}</h3>
              <button onClick={() => setDetalle(null)} className="text-slate-400 hover:text-white text-xs">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[['Fecha', fmtFecha(detalle.created_at)], ['Usuario', detalle.nombre_usuario || 'Sistema'], ['IP', detalle.ip_address || '-'], ['Ruta', detalle.endpoint]].map(([k, v]) => (
                  <div key={k} className="bg-slate-950/80 border border-slate-800 p-2.5 rounded-lg">
                    <span className="text-[10px] uppercase text-slate-500 font-bold block">{k}</span>
                    <span className="font-mono text-slate-200 break-all">{v}</span>
                  </div>
                ))}
              </div>

              {det?.cambios && (
                <table className="w-full border border-slate-800 rounded-lg overflow-hidden">
                  <thead className="bg-slate-950 text-[10px] uppercase text-slate-400">
                    <tr><th className="px-3 py-2 text-left">Campo</th><th className="px-3 py-2 text-left">Antes</th><th className="px-3 py-2 text-left">Después</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {Object.entries(det.cambios).map(([campo, [antes, despues]]) => (
                      <tr key={campo}>
                        <td className="px-3 py-2 font-bold text-slate-300">{campo}</td>
                        <td className="px-3 py-2 font-mono text-rose-300">{fmtValor(antes)}</td>
                        <td className="px-3 py-2 font-mono text-emerald-300">{fmtValor(despues)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {(det?.valores || det?.valores_previos) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {Object.entries(det.valores || det.valores_previos).map(([k, v]) => (
                    <div key={k} className="bg-slate-950/60 border border-slate-800/80 p-2.5 rounded-lg">
                      <span className="text-[10px] uppercase text-slate-500 font-bold block">{k.replace(/_/g, ' ')}</span>
                      <span className="font-mono text-slate-300">{fmtValor(v)}</span>
                    </div>
                  ))}
                </div>
              )}

              {!det?.tabla && (
                <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 whitespace-pre-wrap break-all font-mono text-slate-300">
                  {det ? JSON.stringify(det, null, 2) : detalle.detalles}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default BitacoraCambios;
