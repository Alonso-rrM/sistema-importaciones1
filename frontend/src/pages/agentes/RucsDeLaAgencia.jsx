/**
 * Panel de la ficha de una agencia de aduanas: los RUC (empresas) que forman el grupo.
 * Los RUC son proveedores: se registran una sola vez (en Proveedores) y aquí solo se agrupan.
 * Un RUC pertenece a una sola agencia. Quitarlo del grupo no borra el proveedor ni sus gastos.
 */
import { useCallback, useMemo, useState } from 'react';
import Select from 'react-select';
import { Plus, Trash2 } from 'lucide-react';
import api from '../../services/api';
import useConsulta from '../../hooks/useConsulta';
import ModalCrearProveedorRapido from '../../components/ModalCrearProveedorRapido';
import { ESTILO_SELECT_TEAL } from '../../components/estilosSelect';
import { CATEGORIA_PROVEEDOR, ROL } from '../../constants';
import { obtenerRol } from '../../utils/session';
import { mensajeDeError, useInteraccion } from '../../context/interaccion';

export default function RucsDeLaAgencia({ registro: agencia }) {
  const { avisar, confirmar } = useInteraccion();
  const soloLectura = obtenerRol() === ROL.AUDITOR;
  const [elegido, setElegido] = useState(null);
  const [creando, setCreando] = useState(false);

  const alFallar = useCallback((error) => avisar(mensajeDeError(error, 'No se pudieron cargar los RUC.'), 'error'), [avisar]);
  const consultarRucs = useCallback(() => api.get(`/agentes/${agencia.id_agente}/rucs`).then((r) => r.data || []),
    [agencia.id_agente]);
  const consultarProveedores = useCallback(() => api.get('/proveedores/').then((r) => r.data || []), []);
  const { datos: rucs, recargar: recargarRucs } = useConsulta(consultarRucs, { inicial: [], alFallar });
  const { datos: proveedores, recargar: recargarProveedores } = useConsulta(consultarProveedores, { inicial: [], alFallar });

  // Se pueden agregar los proveedores con RUC que todavía no pertenecen a ninguna agencia
  const disponibles = useMemo(() => proveedores
    .filter((p) => p.ruc && !p.id_agente)
    .map((p) => ({ value: p.id_proveedor, label: `${p.ruc} - ${p.nombre}` })), [proveedores]);

  const recargar = () => Promise.all([recargarRucs(), recargarProveedores()]).catch(alFallar);

  const agregar = async (idProveedor) => {
    try {
      const { data } = await api.put(`/agentes/${agencia.id_agente}/rucs/${idProveedor}`);
      avisar(`✅ RUC ${data.ruc} agregado a ${agencia.nombre}.`, 'exito');
      setElegido(null);
    } catch (error) {
      avisar(mensajeDeError(error, 'No se pudo agregar el RUC.'), 'error');
    }
    await recargar();
  };

  const quitar = async (proveedor) => {
    if (!(await confirmar({
      titulo: 'Quitar RUC de la agencia',
      mensaje: `¿Quitar ${proveedor.ruc} (${proveedor.nombre}) de ${agencia.nombre}? `
        + 'El proveedor y sus gastos se conservan en Proveedores.',
      textoAceptar: 'Quitar',
      peligro: true,
    }))) return;
    try {
      await api.delete(`/agentes/${agencia.id_agente}/rucs/${proveedor.id_proveedor}`);
      avisar(`✅ RUC ${proveedor.ruc} quitado de ${agencia.nombre}.`, 'exito');
    } catch (error) {
      avisar(mensajeDeError(error, 'No se pudo quitar el RUC.'), 'error');
    }
    await recargar();
  };

  return (
    <div className="pt-4 border-t border-slate-800 space-y-3" data-rucs-agencia>
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-teal-300 uppercase tracking-wider">RUC de la agencia ({rucs.length})</h4>
        <span className="text-[10px] text-slate-500">Cada RUC es un proveedor y pertenece a una sola agencia.</span>
      </div>

      <ul className="divide-y divide-slate-800 border border-slate-800 rounded-lg">
        {rucs.map((p) => (
          <li key={p.id_proveedor} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
            <div className="min-w-0">
              <span className="font-mono font-bold text-slate-100">{p.ruc}</span>
              <span className="ml-2 text-slate-300 truncate">{p.nombre}</span>
            </div>
            {!soloLectura && (
              <button type="button" onClick={() => quitar(p)} title={`Quitar ${p.ruc} de la agencia`}
                className="p-1.5 rounded text-rose-400 hover:bg-rose-500/10 shrink-0">
                <Trash2 size={14} />
              </button>
            )}
          </li>
        ))}
        {rucs.length === 0 && (
          <li className="px-3 py-4 text-center text-xs text-slate-500">Esta agencia todavía no tiene RUC registrados.</li>
        )}
      </ul>

      {!soloLectura && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[16rem]">
            <Select
              inputId="agregar-ruc-agencia"
              options={disponibles}
              value={elegido}
              onChange={setElegido}
              placeholder="Agregar un proveedor ya registrado (RUC o nombre)..."
              noOptionsMessage={() => 'No hay proveedores con RUC disponibles'}
              styles={ESTILO_SELECT_TEAL}
              isClearable
            />
          </div>
          <button type="button" disabled={!elegido} onClick={() => agregar(elegido.value)}
            className="px-3 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white rounded-lg text-xs font-bold">
            Agregar RUC
          </button>
          <button type="button" onClick={() => setCreando(true)}
            className="px-3 py-2 border border-teal-500/40 text-teal-300 hover:bg-teal-600/20 rounded-lg text-xs font-bold flex items-center gap-1">
            <Plus size={13} /> Nuevo proveedor
          </button>
        </div>
      )}

      <ModalCrearProveedorRapido
        isOpen={creando}
        onClose={() => setCreando(false)}
        onProveedorCreado={(nuevo) => agregar(nuevo.id_proveedor)}
        categoriaDefecto={CATEGORIA_PROVEEDOR.NACIONAL}
      />
    </div>
  );
}
