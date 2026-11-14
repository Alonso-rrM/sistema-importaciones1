/**
 * USUARIOS (solo Administrador)
 * Lista las cuentas y permite crear, cambiar rol o correo, activar/desactivar y restablecer la contraseña.
 * El servidor impide que el Administrador se quite el acceso a sí mismo o deje el sistema sin Administrador.
 */
import { useCallback, useMemo, useState } from 'react';
import { KeyRound, Search, UserCog, UserPlus } from 'lucide-react';
import api from '../services/api';
import useConsulta from '../hooks/useConsulta';
import { obtenerUsuario } from '../utils/session';
import { validarClave, validarCorreo } from '../utils/validaciones';
import { mensajeDeError, useInteraccion } from '../context/interaccion';
import ModalNuevoUsuario from './usuarios/ModalNuevoUsuario';

const consultarUsuarios = () => api.get('/usuarios/').then((r) => r.data || []);
const consultarRoles = () => api.get('/usuarios/roles').then((r) => r.data || []);

const fecha = (valor) => (valor ? new Date(valor).toLocaleDateString('es-PE') : '—');

export default function Usuarios() {
  const { avisar, confirmar, pedirDatos } = useInteraccion();
  const idPropio = obtenerUsuario()?.id_usuario;
  const [busqueda, setBusqueda] = useState('');
  const [verInactivos, setVerInactivos] = useState(false);
  const [creando, setCreando] = useState(false);

  const alFallar = useCallback((error) => avisar(mensajeDeError(error, 'No se pudo cargar la lista de usuarios.'), 'error'), [avisar]);
  const { datos: usuarios, cargando, recargar } = useConsulta(consultarUsuarios, { inicial: [], alFallar });
  const { datos: roles } = useConsulta(consultarRoles, { inicial: [], alFallar });
  const recargarUsuarios = () => recargar().catch(alFallar);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return usuarios.filter((u) => (verInactivos || u.is_active)
      && (!texto || u.username.toLowerCase().includes(texto) || u.email.toLowerCase().includes(texto)));
  }, [usuarios, busqueda, verInactivos]);

  const modificar = async (usuario, cambios, exito) => {
    try {
      await api.put(`/usuarios/${usuario.id_usuario}`, cambios);
      avisar(exito, 'exito');
    } catch (error) {
      avisar(mensajeDeError(error, 'No se pudo modificar el usuario.'), 'error');
    }
    await recargarUsuarios();
  };

  const cambiarRol = async (usuario, idRol) => {
    const rol = roles.find((r) => r.id_rol === idRol);
    if (!(await confirmar({
      titulo: 'Cambiar rol',
      mensaje: `¿Cambiar el rol de ${usuario.username} a ${rol?.nombre}? Rige desde su siguiente acción en el sistema.`,
      textoAceptar: 'Cambiar rol',
    }))) return;
    await modificar(usuario, { id_rol: idRol }, `✅ ${usuario.username} ahora tiene el rol ${rol?.nombre}.`);
  };

  const cambiarEstado = async (usuario) => {
    const activar = !usuario.is_active;
    if (!(await confirmar({
      titulo: activar ? 'Activar usuario' : 'Desactivar usuario',
      mensaje: activar
        ? `${usuario.username} podrá volver a ingresar al sistema.`
        : `${usuario.username} no podrá ingresar y su sesión abierta se cerrará en su siguiente acción. Su historial se conserva.`,
      textoAceptar: activar ? 'Activar' : 'Desactivar',
      peligro: !activar,
    }))) return;
    await modificar(usuario, { is_active: activar }, `✅ ${usuario.username} ${activar ? 'activado' : 'desactivado'}.`);
  };

  const cambiarCorreo = async (usuario) => {
    const datos = await pedirDatos({
      titulo: `Correo de ${usuario.username}`,
      campos: [{ nombre: 'email', etiqueta: 'Correo electrónico', valorInicial: usuario.email,
        validar: (v) => validarCorreo(v).error }],
      textoAceptar: 'Guardar',
    });
    if (datos) await modificar(usuario, { email: validarCorreo(datos.email).valor }, '✅ Correo actualizado.');
  };

  const restablecerClave = async (usuario) => {
    const datos = await pedirDatos({
      titulo: `Nueva contraseña para ${usuario.username}`,
      mensaje: 'Entréguesela por un medio seguro y pídale que la cambie al ingresar ("Cambiar mi contraseña"). Sus sesiones abiertas se cerrarán.',
      campos: [
        { nombre: 'clave', etiqueta: 'Nueva contraseña', tipo: 'password', validar: (v) => validarClave(v).error },
        { nombre: 'repetir', etiqueta: 'Repita la contraseña', tipo: 'password' },
      ],
      textoAceptar: 'Restablecer',
      peligro: true,
    });
    if (!datos) return;
    if (datos.clave !== datos.repetir) {
      avisar('Las contraseñas no coinciden.', 'advertencia');
      return;
    }
    try {
      const { data } = await api.put(`/usuarios/${usuario.id_usuario}/clave`, { password: datos.clave });
      avisar(`✅ ${data.mensaje}`, 'exito');
    } catch (error) {
      avisar(mensajeDeError(error, 'No se pudo restablecer la contraseña.'), 'error');
    }
    await recargarUsuarios();
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <header className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center">
            <UserCog size={20} className="text-teal-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">Usuarios del Sistema</h1>
            <p className="text-xs text-slate-400">Cuentas, roles y contraseñas. Los cambios rigen desde la siguiente acción de cada usuario.</p>
          </div>
        </div>
        <button type="button" onClick={() => setCreando(true)}
          className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-teal-600/20 flex items-center gap-1.5">
          <UserPlus size={14} /> <span>Nuevo Usuario</span>
        </button>
      </header>

      <div className="px-6 py-3 flex flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-900/40 shrink-0">
        <div className="relative w-72 max-w-full">
          <Search size={14} className="absolute left-2.5 top-2 text-slate-500" />
          <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar usuario o correo..."
            className="w-full bg-slate-900 border border-slate-700 focus:border-teal-500 text-xs text-slate-200 placeholder-slate-500 rounded-md pl-8 pr-2 py-1.5" />
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
          <input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
          Mostrar desactivados
        </label>
        <span className="text-[11px] text-slate-500 font-mono">{visibles.length} de {usuarios.length}</span>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <table className="w-full text-left text-xs">
          <thead className="text-[10px] uppercase text-slate-400 border-b border-slate-800">
            <tr>
              <th className="py-2 pr-3">Usuario</th>
              <th className="py-2 pr-3">Correo</th>
              <th className="py-2 pr-3">Rol</th>
              <th className="py-2 pr-3">Estado</th>
              <th className="py-2 pr-3">Creado</th>
              <th className="py-2 pr-3">Última contraseña</th>
              <th className="py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {visibles.map((u) => {
              const esPropio = u.id_usuario === idPropio;
              return (
                <tr key={u.id_usuario} data-usuario={u.username} className={u.is_active ? '' : 'opacity-60'}>
                  <td className="py-2.5 pr-3 font-mono font-bold text-slate-100">
                    {u.username}{esPropio && <span className="ml-2 text-[10px] text-teal-400 font-sans">(usted)</span>}
                  </td>
                  <td className="py-2.5 pr-3">
                    <button type="button" onClick={() => cambiarCorreo(u)} className="text-slate-300 hover:text-teal-300 hover:underline" title="Cambiar correo">
                      {u.email}
                    </button>
                  </td>
                  <td className="py-2.5 pr-3">
                    <select value={u.id_rol} onChange={(e) => cambiarRol(u, Number(e.target.value))} disabled={esPropio}
                      aria-label={`Rol de ${u.username}`} title={esPropio ? 'No puede cambiar su propio rol' : 'Cambiar rol'}
                      className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 disabled:opacity-60">
                      {roles.map((r) => <option key={r.id_rol} value={r.id_rol}>{r.nombre}</option>)}
                    </select>
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${u.is_active
                      ? 'bg-emerald-900/30 text-emerald-300 border-emerald-700' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                      {u.is_active ? 'Activo' : 'Desactivado'}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-slate-400">{fecha(u.created_at)}</td>
                  <td className="py-2.5 pr-3 text-slate-400">{fecha(u.clave_cambiada_en)}</td>
                  <td className="py-2.5 text-right whitespace-nowrap">
                    <button type="button" onClick={() => restablecerClave(u)}
                      className="px-2 py-1 mr-1.5 rounded border border-amber-600/40 text-amber-300 hover:bg-amber-600/20 inline-flex items-center gap-1">
                      <KeyRound size={12} /> Restablecer contraseña
                    </button>
                    {!esPropio && (
                      <button type="button" onClick={() => cambiarEstado(u)}
                        className={`px-2 py-1 rounded border ${u.is_active
                          ? 'border-rose-600/40 text-rose-300 hover:bg-rose-600/20' : 'border-emerald-600/40 text-emerald-300 hover:bg-emerald-600/20'}`}>
                        {u.is_active ? 'Desactivar' : 'Activar'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!cargando && visibles.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-slate-500">No hay usuarios con ese criterio.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {creando && (
        <ModalNuevoUsuario roles={roles} onCerrar={() => setCreando(false)} onCreado={recargarUsuarios} />
      )}
    </div>
  );
}
