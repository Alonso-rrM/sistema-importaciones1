/** Alta de una cuenta: usuario, correo, rol y contraseña (dos veces). Escape cierra el modal. */
import { useEffect, useEffectEvent, useState } from 'react';
import api from '../../services/api';
import { ROL } from '../../constants';
import { mensajeDeError, useInteraccion } from '../../context/interaccion';
import { validarClave, validarCorreo, validarUsuario } from '../../utils/validaciones';

const CLASE_ENTRADA = 'w-full bg-slate-950 border border-slate-700 focus:border-teal-500 text-slate-100 text-xs rounded p-2';

export default function ModalNuevoUsuario({ roles, onCerrar, onCreado }) {
  const { avisar } = useInteraccion();
  const [datos, setDatos] = useState({ username: '', email: '', id_rol: ROL.OPERACIONES, clave: '', repetir: '' });
  const [guardando, setGuardando] = useState(false);
  const cambiar = (campo) => (e) => setDatos((d) => ({ ...d, [campo]: e.target.value }));

  const cerrarConEscape = useEffectEvent((e) => { if (e.key === 'Escape') onCerrar(); });
  useEffect(() => {
    window.addEventListener('keydown', cerrarConEscape);
    return () => window.removeEventListener('keydown', cerrarConEscape);
  }, []);

  const crear = async (e) => {
    e.preventDefault();
    const usuario = validarUsuario(datos.username);
    const correo = validarCorreo(datos.email);
    const clave = validarClave(datos.clave);
    const error = usuario.error || correo.error || clave.error
      || (datos.clave !== datos.repetir ? 'Las contraseñas no coinciden.' : null);
    if (error) {
      avisar(error, 'advertencia');
      return;
    }
    setGuardando(true);
    try {
      await api.post('/usuarios/', {
        username: usuario.valor, email: correo.valor, id_rol: Number(datos.id_rol), password: clave.valor,
      });
      onCerrar();
      avisar(`✅ Usuario ${usuario.valor} creado.`, 'exito');
      onCreado();
    } catch (err) {
      avisar(mensajeDeError(err, 'No se pudo crear el usuario.'), 'error');
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
      <form onSubmit={crear} className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-teal-950/40 border-b border-teal-800/50 p-4 flex items-center justify-between">
          <h3 className="text-teal-300 font-bold text-sm">Nuevo usuario</h3>
          <button type="button" onClick={onCerrar} className="text-slate-400 hover:text-white">✕</button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label htmlFor="nu-usuario" className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Usuario (para iniciar sesión) *</label>
            <input id="nu-usuario" autoFocus value={datos.username} onChange={cambiar('username')} placeholder="Ej. mperez" className={`${CLASE_ENTRADA} font-mono`} />
          </div>
          <div>
            <label htmlFor="nu-correo" className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Correo *</label>
            <input id="nu-correo" value={datos.email} onChange={cambiar('email')} placeholder="mperez@empresa.com" className={CLASE_ENTRADA} />
          </div>
          <div>
            <label htmlFor="nu-rol" className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Rol *</label>
            <select id="nu-rol" value={datos.id_rol} onChange={cambiar('id_rol')} className={CLASE_ENTRADA}>
              {roles.map((r) => <option key={r.id_rol} value={r.id_rol}>{r.nombre}{r.descripcion ? ` — ${r.descripcion}` : ''}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="nu-clave" className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Contraseña *</label>
              <input id="nu-clave" type="password" value={datos.clave} onChange={cambiar('clave')} autoComplete="new-password" className={CLASE_ENTRADA} />
            </div>
            <div>
              <label htmlFor="nu-repetir" className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Repetir *</label>
              <input id="nu-repetir" type="password" value={datos.repetir} onChange={cambiar('repetir')} autoComplete="new-password" className={CLASE_ENTRADA} />
            </div>
          </div>
          <p className="text-[11px] text-slate-500">Mínimo 10 caracteres, con mayúsculas, minúsculas y números.</p>
        </div>
        <div className="px-5 py-3 border-t border-slate-800 flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white">Cancelar</button>
          <button type="submit" disabled={guardando} className="px-4 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded text-xs font-bold disabled:opacity-50">
            {guardando ? 'Creando...' : 'Crear usuario'}
          </button>
        </div>
      </form>
    </div>
  );
}
