import { Outlet, NavLink, useNavigate } from 'react-router-dom'

function Layout() {
    const navigate = useNavigate()

    const cerrarSesion = () => {
        localStorage.removeItem('token')
        navigate('/login')
    }

    const getNavClass = ({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')

    return (
        <div className="app-layout">
            {/* BARRA LATERAL (Sidebar) */}
            <aside className="sidebar">
                <div className="sidebar-brand">
                    🏢 ERP Admin
                </div>

                {/* Menú de Navegación */}
                <nav className="sidebar-nav">
                    <div className="nav-section-title">
                        Operaciones
                    </div>
                    <NavLink to="/app/logistica" className={getNavClass}>
                        📦 Logística y Maestros
                    </NavLink>
                    <NavLink to="/app/dams" className={getNavClass}>
                        📑 Declaraciones (DAMs)
                    </NavLink>

                    <div className="nav-section-title">
                        Catálogos Maestros
                    </div>
                    <NavLink to="/app/importadores" className={getNavClass}>
                        🏢 Importadores
                    </NavLink>
                    <NavLink to="/app/proveedores" className={getNavClass}>
                        🤝 Proveedores
                    </NavLink>
                    <NavLink to="/app/agentes" className={getNavClass}>
                        🛃 Agentes de Aduanas
                    </NavLink>
                    <NavLink to="/app/almacenes" className={getNavClass}>
                        🏭 Almacenes
                    </NavLink>
                    <NavLink to="/app/conceptos" className={getNavClass}>
                        🏷️ Conceptos de Gasto
                    </NavLink>
                    <NavLink to="/app/comprobantes" className={getNavClass}>
                        📄 Tipos de Comprobante
                    </NavLink>
                    <NavLink to="/app/bancos" className={getNavClass}>
                        🏦 Bancos y Cuentas
                    </NavLink>

                    <div className="nav-section-title">
                        Finanzas
                    </div>
                    <NavLink to="/app/vouchers" className={getNavClass}>
                        🎟️ Vouchers Bancarios
                    </NavLink>
                    <NavLink to="/app/gastos" className={getNavClass}>
                        💸 Registro de Gastos
                    </NavLink>
                    <NavLink to="/app/pagos" className={getNavClass}>
                        🏦 Liquidación de Pagos
                    </NavLink>

                    <div className="nav-section-title">
                        Seguridad y Control
                    </div>
                    <NavLink to="/app/auditoria" className={getNavClass}>
                        🛡️ Auditoría (Eliminados)
                    </NavLink>
                </nav>

                {/* Botón de salida */}
                <div className="sidebar-footer">
                    <button onClick={cerrarSesion} className="btn btn-danger btn-block">
                        Cerrar Sesión
                    </button>
                </div>
            </aside>

            {/* ÁREA CENTRAL DE TRABAJO */}
            <div className="main-wrapper">
                {/* Cabecera Superior (Topbar) */}
                <header className="topbar">
                    <h3 className="topbar-title">Panel de Operaciones</h3>
                </header>

                {/* CONTENIDO DINÁMICO */}
                <main className="main-content">
                    <Outlet />
                </main>
            </div>
        </div>
    )
}

export default Layout
