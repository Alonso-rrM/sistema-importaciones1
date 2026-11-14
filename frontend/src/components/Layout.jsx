import { useEffect } from 'react';
import { Outlet, NavLink, useNavigate, Navigate } from 'react-router-dom';
import { useTheme } from '../context/tema';
import api from '../services/api';
import { obtenerUsuario, guardarUsuario, limpiarSesionLocal } from '../utils/session';
import { BarChart3, Package, FileText, Building2, Users, Briefcase, Factory, Tags, FileDigit, Landmark, Ticket, Banknote, Scale, ShieldCheck, Settings, Sun, Moon, LogOut, UserCog, KeyRound } from 'lucide-react';
import { ROL } from '../constants';
import { mensajeDeError, useInteraccion } from '../context/interaccion';
import { validarClave } from '../utils/validaciones';

function Layout() {
  const navigate = useNavigate();
  const { avisar, pedirDatos } = useInteraccion();
  const { isDark, toggleTheme } = useTheme();
  const usuario = obtenerUsuario();
  const userRole = usuario?.id_rol ?? null;

  // Valida contra el servidor que la cookie de sesión siga vigente (y refresca nombre/rol).
  // Si expiró, el interceptor de api.js recibe 401 y redirige al login.
  useEffect(() => {
    if (!usuario) return;
    api.get('/me')
      .then(res => guardarUsuario(res.data))
      .catch(err => {
        if (err.response?.status === 401) {
          limpiarSesionLocal();
          navigate('/login', { replace: true });
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!usuario) {
    return <Navigate to="/login" replace />;
  }

  const cerrarSesion = async () => {
    try { await api.post('/logout'); } catch { /* aunque falle la red, se limpia la sesión local */ }
    limpiarSesionLocal();
    navigate('/login');
  };

  // Cambio de la contraseña propia: al confirmarse, el servidor cierra las sesiones y se vuelve a ingresar
  const cambiarMiClave = async () => {
    const datos = await pedirDatos({
      titulo: 'Cambiar mi contraseña',
      mensaje: 'Al cambiarla deberá ingresar nuevamente con la nueva contraseña.',
      campos: [
        { nombre: 'actual', etiqueta: 'Contraseña actual', tipo: 'password' },
        { nombre: 'nueva', etiqueta: 'Nueva contraseña', tipo: 'password', validar: (v) => validarClave(v).error },
        { nombre: 'repetir', etiqueta: 'Repita la nueva contraseña', tipo: 'password' },
      ],
      textoAceptar: 'Cambiar contraseña',
    });
    if (!datos) return;
    if (datos.nueva !== datos.repetir) {
      avisar('Las contraseñas nuevas no coinciden.', 'advertencia');
      return;
    }
    try {
      await api.put('/usuarios/me/clave', { clave_actual: datos.actual, clave_nueva: datos.nueva });
      avisar('✅ Contraseña cambiada. Ingrese con la nueva contraseña.', 'exito');
      await cerrarSesion();
    } catch (error) {
      avisar(mensajeDeError(error, 'No se pudo cambiar la contraseña.'), 'error');
    }
  };

  const navClass = ({ isActive }) => 
    isActive 
      ? "relative group flex items-center justify-center h-10 w-10 mx-auto rounded-md bg-teal-500/15 text-teal-600 dark:text-teal-300 font-medium border border-teal-500/30 transition-all"
      : "group flex items-center justify-center h-10 w-10 mx-auto rounded-md text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors";

  return (
    <div className="h-screen w-full flex overflow-hidden font-sans text-slate-200 bg-slate-900 antialiased selection:bg-teal-500 selection:text-white">
      {/* ICON-RAIL SIDEBAR */}
      <aside className="w-14 bg-slate-800 border-r border-slate-700 flex flex-col items-center py-3 justify-between z-30 shrink-0">
        <div className="flex flex-col items-center gap-4 w-full">
          <div className="h-9 w-9 bg-teal-500/10 border border-teal-500/30 rounded-lg flex items-center justify-center text-teal-400 font-bold text-xs" title="ERP Admin">ER</div>
          <div className="w-6 h-px bg-slate-700 my-0.5"></div>
          <nav className="flex flex-col gap-2 w-full px-2">
            <NavLink to="/app/reportes" className={navClass} title="Centro de Reportes & Analítica"><BarChart3 size={18} className="shrink-0" /></NavLink>
            <div className="w-6 h-px bg-slate-700 my-0.5 mx-auto"></div>
            <NavLink to="/app/logistica" className={navClass} title="Logística y Maestros"><Package size={18} className="shrink-0" /><span className="active-indicator absolute left-[-8px] top-2 bottom-2 w-0.5 bg-teal-400 rounded-r hidden"></span></NavLink>
            <NavLink to="/app/dams" className={navClass} title="Declaraciones (DAMs)"><FileText size={18} className="shrink-0" /></NavLink>
            <div className="w-6 h-px bg-slate-700 my-1 mx-auto"></div>
            <NavLink to="/app/importadores" className={navClass} title="Importadores"><Building2 size={18} className="shrink-0" /></NavLink>
            <NavLink to="/app/proveedores" className={navClass} title="Proveedores"><Users size={18} className="shrink-0" /></NavLink>
            <NavLink to="/app/agentes" className={navClass} title="Agentes Aduanas"><Briefcase size={18} className="shrink-0" /></NavLink>
            <NavLink to="/app/almacenes" className={navClass} title="Almacenes"><Factory size={18} className="shrink-0" /></NavLink>
            <NavLink to="/app/conceptos" className={navClass} title="Conceptos"><Tags size={18} className="shrink-0" /></NavLink>
            <NavLink to="/app/comprobantes" className={navClass} title="Tipos Comprobante"><FileDigit size={18} className="shrink-0" /></NavLink>
            <NavLink to="/app/bancos" className={navClass} title="Bancos"><Landmark size={18} className="shrink-0" /></NavLink>
            <div className="w-6 h-px bg-slate-700 my-1 mx-auto"></div>
            <NavLink to="/app/vouchers" className={navClass} title="Vouchers"><Ticket size={18} className="shrink-0" /></NavLink>
            <NavLink to="/app/gastos" className={navClass} title="Registro Gastos"><Banknote size={18} className="shrink-0" /></NavLink>
            <NavLink to="/app/pagos" className={navClass} title="Liquidación Pagos"><Scale size={18} className="shrink-0" /></NavLink>
            <div className="w-6 h-px bg-slate-700 my-1 mx-auto"></div>
            <NavLink to="/app/auditoria" className={navClass} title="Auditoría"><ShieldCheck size={18} className="shrink-0" /></NavLink>
            {userRole === ROL.SUPERADMIN && (
              <>
                <div className="w-6 h-px bg-slate-700 my-1 mx-auto"></div>
                <NavLink to="/app/usuarios" className={navClass} title="Usuarios"><UserCog size={18} className="shrink-0" /></NavLink>
                <NavLink to="/app/admin" className={navClass} title="Administración & Carga Masiva"><Settings size={18} className="shrink-0" /></NavLink>
              </>
            )}
          </nav>
        </div>
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={toggleTheme}
            className="theme-toggle-btn relative h-8 w-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-sm hover:scale-105 transition-all cursor-pointer shadow-sm text-slate-200"
            title={isDark ? "Cambiar a Modo Claro" : "Cambiar a Modo Oscuro"}
          >
            {isDark ? <Sun size={15} className="shrink-0" /> : <Moon size={15} className="shrink-0" />}
          </button>
          <button type="button" onClick={cambiarMiClave} className="relative h-8 w-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-300 hover:ring-2 hover:ring-amber-500 transition-all cursor-pointer" title="Cambiar mi contraseña">
            <KeyRound size={15} className="shrink-0" />
          </button>
          <button onClick={cerrarSesion} className="relative h-8 w-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center font-semibold text-slate-300 hover:ring-2 hover:ring-rose-500 transition-all cursor-pointer" title="Cerrar Sesión">
            <LogOut size={15} className="shrink-0" />
          </button>
        </div>
      </aside>

      {/* MAIN WRAPPER */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-950">
        <header className="h-10 bg-slate-900/90 backdrop-blur border-b border-slate-800 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium text-slate-400">ERP Admin</span><span className="text-slate-600">/</span>
            <span className="font-semibold text-slate-100">Panel Central</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              className="theme-toggle-btn flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer shadow-sm bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700"
              title={isDark ? "Cambiar a Modo Claro" : "Cambiar a Modo Oscuro"}
            >
              <span>{isDark ? <Sun size={15} className="shrink-0 inline" /> : <Moon size={15} className="shrink-0 inline" />}</span>
              <span className="hidden sm:inline font-medium">{isDark ? 'Modo Claro' : 'Modo Oscuro'}</span>
            </button>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span><span>BD Conectada</span></div>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto bg-slate-950">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
export default Layout;
