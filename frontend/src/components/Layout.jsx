import { useMemo } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';

function Layout() {
  const navigate = useNavigate();
  const cerrarSesion = () => { localStorage.removeItem('token'); navigate('/login'); };

  const userRole = useMemo(() => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return null;
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(base64)).id_rol;
    } catch { return null; }
  }, []);

  const navClass = ({ isActive }) => 
    isActive 
      ? "relative group flex items-center justify-center h-10 w-10 mx-auto rounded-md bg-teal-500/15 text-teal-300 font-medium border border-teal-500/30 transition-all"
      : "group flex items-center justify-center h-10 w-10 mx-auto rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-700/60 transition-colors";

  return (
    <div className="h-screen w-full flex overflow-hidden font-sans text-slate-200 bg-slate-900 antialiased selection:bg-teal-500 selection:text-white">
      {/* ICON-RAIL SIDEBAR */}
      <aside className="w-14 bg-slate-800 border-r border-slate-700 flex flex-col items-center py-3 justify-between z-30 shrink-0">
        <div className="flex flex-col items-center gap-4 w-full">
          <div className="h-9 w-9 bg-teal-500/10 border border-teal-500/30 rounded-lg flex items-center justify-center text-teal-400 font-bold text-xs" title="ERP Admin">ER</div>
          <div className="w-6 h-px bg-slate-700 my-0.5"></div>
          <nav className="flex flex-col gap-2 w-full px-2">
            <NavLink to="/app/reportes" className={navClass} title="Centro de Reportes & Analítica">📊</NavLink>
            <div className="w-6 h-px bg-slate-700 my-0.5 mx-auto"></div>
            <NavLink to="/app/logistica" className={navClass} title="Logística y Maestros">📦<span className="active-indicator absolute left-[-8px] top-2 bottom-2 w-0.5 bg-teal-400 rounded-r hidden"></span></NavLink>
            <NavLink to="/app/dams" className={navClass} title="Declaraciones (DAMs)">📄</NavLink>
            <div className="w-6 h-px bg-slate-700 my-1 mx-auto"></div>
            <NavLink to="/app/importadores" className={navClass} title="Importadores">🏢</NavLink>
            <NavLink to="/app/proveedores" className={navClass} title="Proveedores">🤝</NavLink>
            <NavLink to="/app/agentes" className={navClass} title="Agentes Aduanas">🛂</NavLink>
            <NavLink to="/app/almacenes" className={navClass} title="Almacenes">🏭</NavLink>
            <NavLink to="/app/conceptos" className={navClass} title="Conceptos">🏷️</NavLink>
            <NavLink to="/app/comprobantes" className={navClass} title="Tipos Comprobante">📑</NavLink>
            <NavLink to="/app/bancos" className={navClass} title="Bancos">🏦</NavLink>
            <div className="w-6 h-px bg-slate-700 my-1 mx-auto"></div>
            <NavLink to="/app/vouchers" className={navClass} title="Vouchers">🎟️</NavLink>
            <NavLink to="/app/gastos" className={navClass} title="Registro Gastos">💸</NavLink>
            <NavLink to="/app/pagos" className={navClass} title="Liquidación Pagos">⚖️</NavLink>
            <div className="w-6 h-px bg-slate-700 my-1 mx-auto"></div>
            <NavLink to="/app/auditoria" className={navClass} title="Auditoría">🛡️</NavLink>
            {userRole === 1 && (
              <>
                <div className="w-6 h-px bg-slate-700 my-1 mx-auto"></div>
                <NavLink to="/app/admin" className={navClass} title="Administración & Carga Masiva">⚙️</NavLink>
              </>
            )}
          </nav>
        </div>
        <div className="flex flex-col items-center gap-3">
          <button onClick={cerrarSesion} className="relative h-8 w-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center font-semibold text-slate-300 hover:ring-2 hover:ring-rose-500 transition-all" title="Cerrar Sesión">
            <span className="text-[10px] font-mono">X</span>
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
