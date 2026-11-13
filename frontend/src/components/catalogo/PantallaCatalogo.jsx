/**
 * PANTALLA DE CATÁLOGO (una sola para todos)
 * =========================================
 * Bandeja con búsqueda y filtros a la izquierda; ficha y formulario a la derecha.
 * Todo lo que cambia entre catálogos (textos, campos, ícono, qué se muestra) viene en `definicion`
 * (ver pages/catalogos/definiciones.jsx). La lógica está en useCatalogo.js.
 */
import { Search } from 'lucide-react';
import { ESTADO_REGISTRO } from '../../constants';
import useCatalogo, { FILTRO_TODOS, MODO } from './useCatalogo';
import CampoRuc, { useConsultaRuc } from './CampoRuc';

const BOTON_FILTRO = 'px-3 py-1 rounded-md font-semibold transition-colors';
const FILTRO_ACTIVO = 'bg-teal-600 text-white shadow';
const FILTRO_INACTIVO = 'bg-slate-800 text-slate-400 hover:text-slate-200';
const ETIQUETA = 'text-slate-500 text-[10px] uppercase font-bold block';
const CLASE_ENTRADA = 'w-full text-xs bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-teal-500';

function InsigniaEstado({ estado }) {
  const inactivo = estado === ESTADO_REGISTRO.INACTIVO;
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${inactivo
      ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'}`}>
      {estado || ESTADO_REGISTRO.ACTIVO}
    </span>
  );
}

function Encabezado({ definicion, onNuevo }) {
  const { Icono, textos } = definicion;
  return (
    <header className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-xl shadow-inner">
          <Icono size={20} className="inline-block shrink-0 text-teal-400" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-white tracking-tight">{textos.titulo}</h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30">
              Módulo Catálogos
            </span>
          </div>
          <p className="text-xs text-slate-400">{textos.subtitulo}</p>
        </div>
      </div>
      <button onClick={onNuevo}
        className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-lg transition-colors shadow-lg shadow-teal-600/20 flex items-center gap-1.5 cursor-pointer">
        <span>+</span>
        <span>Nuevo {textos.singular}</span>
      </button>
    </header>
  );
}

function Bandeja({ definicion, c }) {
  const { campoId, textos, tarjeta, filtroExtra } = definicion;
  const filtro = (valor, texto) => (
    <button type="button" onClick={() => c.setFiltroEstado(valor)}
      className={`${BOTON_FILTRO} ${c.filtroEstado === valor ? FILTRO_ACTIVO : FILTRO_INACTIVO}`}>
      {texto}
    </button>
  );
  return (
    <section className="lg:col-span-5 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl min-h-0">
      <div className="p-3.5 border-b border-slate-800 bg-slate-900/60 space-y-2.5 shrink-0">
        <div className="relative">
          <input type="text" value={c.busqueda} onChange={(e) => c.setBusqueda(e.target.value)}
            placeholder={textos.placeholderBusqueda}
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all" />
          <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 text-xs"><Search size={14} className="inline-block shrink-0" /></span>
          {c.busqueda && (
            <button onClick={() => c.setBusqueda('')} className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-white text-xs">✕</button>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-1.5">
            {filtro(ESTADO_REGISTRO.ACTIVO, `Activos (${c.conteo.activos})`)}
            {filtro(ESTADO_REGISTRO.INACTIVO, `Inactivos (${c.conteo.inactivos})`)}
            {filtro(FILTRO_TODOS, `Todos (${c.conteo.todos})`)}
          </div>
          {filtroExtra && (
            <select value={c.filtroExtra} onChange={(e) => c.setFiltroExtra(e.target.value)}
              className="text-[11px] bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-slate-300 focus:outline-none focus:border-teal-500">
              <option value="">{filtroExtra.textoTodos}</option>
              {filtroExtra.opciones.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80 p-2 space-y-1 min-h-0">
        {c.filtrados.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">{textos.sinResultados}</div>
        ) : c.filtrados.map((r) => (
          <div key={r[campoId]} onClick={() => c.seleccionar(r)}
            className={`p-3 rounded-lg cursor-pointer transition-all border ${c.seleccionado?.[campoId] === r[campoId]
              ? 'row-selected'
              : 'bg-white dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-800/70 border-slate-200 dark:border-slate-800/80'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-xs text-teal-400">#{r[campoId]}</span>
                <InsigniaEstado estado={r.estado_registro} />
                {tarjeta?.insignia && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                    {tarjeta.insignia(r)}
                  </span>
                )}
              </div>
              {tarjeta?.detalleDerecha && <span className="font-mono text-[10px] text-slate-400">{tarjeta.detalleDerecha(r)}</span>}
            </div>
            <div className="mt-1.5 text-xs font-semibold text-slate-200 truncate">{r.nombre}</div>
            {tarjeta?.subtitulo && <div className="mt-0.5 text-[11px] text-slate-500 truncate">{tarjeta.subtitulo(r)}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

function BotonesFicha({ c, inactivo }) {
  const boton = 'px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer border';
  return inactivo ? (
    <div className="flex items-center gap-2">
      <button onClick={c.restaurar} className={`${boton} bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border-purple-500/30`}>
        <span>♻️</span><span>Restaurar</span>
      </button>
      <button onClick={c.eliminarDefinitivo} className={`${boton} bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border-rose-500/30`}>
        <span>🚫</span><span>Eliminar Definitivo</span>
      </button>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <button onClick={c.modificar} className={`${boton} bg-slate-800 hover:bg-slate-700 text-amber-300 border-amber-500/30`}>
        <span>✏️</span><span>Modificar</span>
      </button>
      <button onClick={c.desactivar} className={`${boton} bg-slate-800 hover:bg-slate-700 text-rose-300 border-rose-500/30`}>
        <span>🗑️</span><span>Desactivar</span>
      </button>
    </div>
  );
}

function CampoFormulario({ campo, c, consultaRuc }) {
  const valor = c.formulario[campo.nombre] ?? '';
  const cambiar = (v) => c.cambiarCampo(campo.nombre, v);
  const razon = consultaRuc.razonSocial;

  let control;
  if (campo.tipo === 'ruc') {
    control = <CampoRuc campo={campo} valor={valor} onCambio={cambiar} consulta={consultaRuc} />;
  } else if (campo.tipo === 'seleccion') {
    control = (
      <select value={valor} onChange={(e) => cambiar(e.target.value)} className={CLASE_ENTRADA}>
        {campo.opciones.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
      </select>
    );
  } else {
    control = (
      <input type="text" required={campo.requerido} value={valor} onChange={(e) => cambiar(e.target.value)}
        placeholder={campo.placeholder} className={CLASE_ENTRADA} />
    );
  }

  return (
    <div className={campo.ancho === 'medio' ? '' : 'sm:col-span-2'}>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide">
          {campo.etiqueta}{campo.requerido && ' *'}
        </label>
        {campo.nombre === 'nombre' && razon?.original && (
          <button type="button" onClick={() => cambiar(valor === razon.sugerido ? razon.original : razon.sugerido)}
            className="text-[10px] font-semibold text-teal-400 hover:text-teal-300">
            {valor === razon.sugerido ? '📄 Ver Razón Social Completa' : '✂️ Usar Nombre Acortado'}
          </button>
        )}
      </div>
      {control}
      {campo.ayuda && <p className="text-[10px] text-slate-500 mt-1">{campo.ayuda}</p>}
    </div>
  );
}

function Formulario({ definicion, c }) {
  const consultaRuc = useConsultaRuc(c.cambiarCampo);
  const { textos } = definicion;
  return (
    <form onSubmit={c.guardar} className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <span className="text-teal-400">✏️</span>
          <span>{c.modo === MODO.NUEVO ? `Registro de ${textos.singular}` : `Edición de ${textos.singular}`}</span>
        </h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {definicion.campos.map((campo) => <CampoFormulario key={campo.nombre} campo={campo} c={c} consultaRuc={consultaRuc} />)}
      </div>
      <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
        <button type="button" onClick={() => { consultaRuc.olvidar(); c.cancelar(); }}
          className="px-4 py-2 border border-slate-700 text-slate-300 hover:bg-slate-800 rounded-lg text-xs font-semibold transition-colors cursor-pointer">
          Cancelar
        </button>
        <button type="submit" disabled={c.guardando}
          className="px-6 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-teal-600/20 flex items-center gap-2 cursor-pointer">
          {c.guardando ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Guardando...</span>
            </>
          ) : <span>Guardar {textos.singular}</span>}
        </button>
      </div>
    </form>
  );
}

function Ficha({ definicion, c }) {
  const { campoId, textos, ficha, Icono } = definicion;
  const r = c.seleccionado;

  if (!r && c.modo !== MODO.NUEVO) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-500">
        <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-3xl mb-4 shadow-inner">
          <Icono size={36} className="inline-block shrink-0 text-teal-400" />
        </div>
        <h3 className="text-base font-bold text-slate-300">Ficha de {textos.singular}</h3>
        <p className="text-xs text-slate-500 max-w-sm mt-1.5">{textos.ayudaSinSeleccion}</p>
        <button onClick={c.nuevo}
          className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-teal-600/20">
          + Registrar Nuevo {textos.singular}
        </button>
      </div>
    );
  }

  const inactivo = r?.estado_registro === ESTADO_REGISTRO.INACTIVO;
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-5 space-y-5">
      <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-bold text-white tracking-tight">
              {c.modo === MODO.NUEVO ? `✨ Nuevo ${textos.singular}` : r?.nombre}
            </h2>
            {c.modo !== MODO.NUEVO && <InsigniaEstado estado={r?.estado_registro} />}
          </div>
          {c.modo === MODO.DETALLE && <BotonesFicha c={c} inactivo={inactivo} />}
        </div>
        {c.modo !== MODO.NUEVO && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-1 border-t border-slate-800/80">
            <div><span className={ETIQUETA}>ID</span><span className="font-mono text-slate-200">#{r?.[campoId]}</span></div>
            <div><span className={ETIQUETA}>{ficha.destacado.etiqueta}</span>
              <span className="text-teal-400 font-semibold truncate block">{ficha.destacado.valor(r)}</span></div>
            <div><span className={ETIQUETA}>Estado</span><span className="text-slate-200 font-semibold">{r?.estado_registro}</span></div>
          </div>
        )}
      </div>

      {c.modo === MODO.DETALLE ? (
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
            <span className="text-teal-400 text-sm">📋</span>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">{ficha.titulo}</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ficha.datos.map((dato) => (
              <div key={dato.etiqueta} className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-lg space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">{dato.etiqueta}</span>
                <span className="font-bold text-slate-100 text-sm">{dato.valor(r)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <Formulario key={c.modo + (r?.[campoId] ?? '')} definicion={definicion} c={c} />
      )}
    </div>
  );
}

export default function PantallaCatalogo({ definicion }) {
  const c = useCatalogo(definicion);
  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <Encabezado definicion={definicion} onNuevo={c.nuevo} />
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 p-5 min-h-0 overflow-hidden">
        <Bandeja definicion={definicion} c={c} />
        <section className="lg:col-span-7 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl min-h-0">
          <Ficha definicion={definicion} c={c} />
        </section>
      </div>
    </div>
  );
}
