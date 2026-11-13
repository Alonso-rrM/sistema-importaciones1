import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { InteraccionContext } from '../context/interaccion';

const DURACION_AVISO_MS = { exito: 4000, info: 4000, advertencia: 6000, error: 7000 };

const ESTILO_AVISO = {
  exito: { clase: 'bg-emerald-950/95 border-emerald-500/40 text-emerald-200', Icono: CheckCircle2 },
  error: { clase: 'bg-rose-950/95 border-rose-500/40 text-rose-200', Icono: XCircle },
  advertencia: { clase: 'bg-amber-950/95 border-amber-500/40 text-amber-200', Icono: AlertTriangle },
  info: { clase: 'bg-slate-900/95 border-teal-500/40 text-teal-200', Icono: Info },
};

let siguienteId = 1;

function PilaDeAvisos({ avisos, cerrar }) {
  return (
    <div className="fixed top-4 right-4 z-[70] flex flex-col gap-2 w-[min(92vw,380px)]" aria-live="polite">
      {avisos.map(({ id, texto, tipo }) => {
        const { clase, Icono } = ESTILO_AVISO[tipo] || ESTILO_AVISO.info;
        return (
          <div key={id} role={tipo === 'error' ? 'alert' : 'status'} data-aviso={tipo}
            className={`flex items-start gap-2.5 p-3 rounded-lg border shadow-2xl backdrop-blur-sm text-xs animate-fadeIn ${clase}`}>
            <Icono size={16} className="shrink-0 mt-0.5" />
            <span className="flex-1 whitespace-pre-line leading-relaxed">{texto}</span>
            <button type="button" onClick={() => cerrar(id)} className="shrink-0 opacity-70 hover:opacity-100" aria-label="Cerrar aviso">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Dialogo({ dialogo, responder }) {
  const { titulo, mensaje, textoAceptar, textoCancelar, peligro, campos, soloAceptar } = dialogo;
  const [valores, setValores] = useState(() =>
    Object.fromEntries((campos || []).map((c) => [c.nombre, c.valorInicial ?? ''])));
  const [errores, setErrores] = useState({});
  const primerCampo = useRef(null);
  const botonAceptar = useRef(null);

  useEffect(() => {
    (primerCampo.current || botonAceptar.current)?.focus();
    const alPresionar = (e) => { if (e.key === 'Escape') responder(null); };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [responder]);

  const aceptar = (e) => {
    e?.preventDefault();
    if (!campos) return responder(true);
    const nuevosErrores = {};
    for (const c of campos) {
      const valor = String(valores[c.nombre] ?? '').trim();
      if (c.requerido !== false && !valor) nuevosErrores[c.nombre] = 'Este dato es obligatorio.';
      else if (c.validar) {
        const problema = c.validar(valor);
        if (problema) nuevosErrores[c.nombre] = problema;
      }
    }
    setErrores(nuevosErrores);
    if (Object.keys(nuevosErrores).length === 0) {
      responder(Object.fromEntries(campos.map((c) => [c.nombre, String(valores[c.nombre] ?? '').trim()])));
    }
  };

  const colorAceptar = peligro ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20' : 'bg-teal-600 hover:bg-teal-500 shadow-teal-600/20';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn"
      onMouseDown={(e) => { if (e.target === e.currentTarget) responder(null); }}>
      <form role="dialog" aria-modal="true" aria-labelledby="dialogo-titulo" data-dialogo onSubmit={aceptar}
        className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden text-slate-100">
        <div className={`px-5 py-4 border-b border-slate-800 bg-slate-950 flex items-center gap-2 font-bold text-sm ${peligro ? 'text-rose-300' : 'text-teal-300'}`}>
          {peligro ? <AlertTriangle size={16} /> : <Info size={16} />}
          <h3 id="dialogo-titulo">{titulo}</h3>
        </div>
        <div className="p-5 space-y-4">
          {mensaje && <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed">{mensaje}</p>}
          {(campos || []).map((c, i) => (
            <div key={c.nombre}>
              <label htmlFor={`dialogo-${c.nombre}`} className="block text-[11px] font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                {c.etiqueta}{c.requerido !== false && ' *'}
              </label>
              {c.multilinea ? (
                <textarea id={`dialogo-${c.nombre}`} ref={i === 0 ? primerCampo : undefined} rows={3}
                  value={valores[c.nombre]} placeholder={c.placeholder}
                  onChange={(e) => setValores({ ...valores, [c.nombre]: e.target.value })}
                  className="w-full text-xs bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-teal-500" />
              ) : (
                <input id={`dialogo-${c.nombre}`} ref={i === 0 ? primerCampo : undefined} type={c.tipo || 'text'}
                  step={c.paso} inputMode={c.modoEntrada} value={valores[c.nombre]} placeholder={c.placeholder}
                  onChange={(e) => setValores({ ...valores, [c.nombre]: e.target.value })}
                  className="w-full text-xs bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-teal-500" />
              )}
              {errores[c.nombre] && <p className="mt-1 text-[11px] text-rose-400">{errores[c.nombre]}</p>}
            </div>
          ))}
        </div>
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/60 flex justify-end gap-2.5">
          {!soloAceptar && (
            <button type="button" onClick={() => responder(null)} data-dialogo-cancelar
              className="px-4 py-2 border border-slate-700 text-slate-300 hover:bg-slate-800 rounded-lg text-xs font-semibold">
              {textoCancelar || 'Cancelar'}
            </button>
          )}
          <button type="submit" ref={botonAceptar} data-dialogo-aceptar
            className={`px-5 py-2 text-white rounded-lg text-xs font-bold shadow-lg ${colorAceptar}`}>
            {textoAceptar || 'Aceptar'}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Dibuja los avisos flotantes y los diálogos, y ofrece useInteraccion() al resto de la aplicación. */
export default function ProveedorInteraccion({ children }) {
  const [avisos, setAvisos] = useState([]);
  const [dialogo, setDialogo] = useState(null);

  const cerrarAviso = useCallback((id) => setAvisos((lista) => lista.filter((a) => a.id !== id)), []);

  const avisar = useCallback((texto, tipo = 'info') => {
    const id = siguienteId++;
    setAvisos((lista) => [...lista.slice(-3), { id, texto, tipo }]);   // como máximo 4 a la vez
    setTimeout(() => cerrarAviso(id), DURACION_AVISO_MS[tipo] ?? DURACION_AVISO_MS.info);
  }, [cerrarAviso]);

  const abrir = useCallback((opciones) => new Promise((resolver) => {
    setDialogo({ ...opciones, id: siguienteId++, resolver });
  }), []);

  const confirmar = useCallback((opciones) => abrir({ ...opciones, campos: null }).then((r) => r === true), [abrir]);
  const pedirDatos = useCallback((opciones) => abrir(opciones).then((r) => (r && r !== true ? r : null)), [abrir]);

  const responder = useCallback((respuesta) => {
    setDialogo((actual) => {
      actual?.resolver(respuesta);
      return null;
    });
  }, []);

  const valor = useMemo(() => ({ avisar, confirmar, pedirDatos }), [avisar, confirmar, pedirDatos]);

  return (
    <InteraccionContext.Provider value={valor}>
      {children}
      <PilaDeAvisos avisos={avisos} cerrar={cerrarAviso} />
      {dialogo && <Dialogo key={dialogo.id} dialogo={dialogo} responder={responder} />}
    </InteraccionContext.Provider>
  );
}
