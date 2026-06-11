import { Outlet, Link, useNavigate } from 'react-router-dom'

function Layout() {
    const navigate = useNavigate()

    const cerrarSesion = () => {
        localStorage.removeItem('token')
        navigate('/login') // Lo botamos de vuelta al Login
    }

    return (
        <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'sans-serif', backgroundColor: '#f4f6f7' }}>

            {/* BARRA LATERAL (Sidebar) */}
            <div style={{ width: '250px', backgroundColor: '#2c3e50', color: 'white', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '20px', fontSize: '20px', fontWeight: 'bold', borderBottom: '1px solid #34495e', textAlign: 'center' }}>
                    🏢 ERP Admin
                </div>

                {/* Menú de Navegación Operativa */}
                <nav style={{ display: 'flex', flexDirection: 'column', padding: '20px 0' }}>

                    <div style={{ color: '#7f8c8d', fontSize: '12px', padding: '10px 20px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        Operaciones
                    </div>
                    <Link to="/app/logistica" style={{ color: 'white', textDecoration: 'none', padding: '12px 20px', borderBottom: '1px solid #34495e', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        📦 Logística y DAMs
                    </Link>

                    <div style={{ color: '#7f8c8d', fontSize: '12px', padding: '20px 20px 10px 20px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        Catálogos Maestros
                    </div>
                    <Link to="/app/importadores" style={{ color: 'white', textDecoration: 'none', padding: '12px 20px', borderBottom: '1px solid #34495e', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        🏢 Importadores
                    </Link>
                    <Link to="/app/proveedores" style={{ color: 'white', textDecoration: 'none', padding: '12px 20px', borderBottom: '1px solid #34495e', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        🤝 Proveedores
                    </Link>
                    <Link to="/app/agentes" style={{ color: 'white', textDecoration: 'none', padding: '12px 20px', borderBottom: '1px solid #34495e', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        🛃 Agentes de Aduanas
                    </Link>
                    <Link to="/app/almacenes" style={{ color: 'white', textDecoration: 'none', padding: '12px 20px', borderBottom: '1px solid #34495e', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        🏭 Almacenes
                    </Link>
                    <Link to="/app/empresas" style={{ color: 'white', textDecoration: 'none', padding: '12px 20px', borderBottom: '1px solid #34495e', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        🏢 Empresas
                    </Link>
                    <Link to="/app/conceptos" style={{ color: 'white', textDecoration: 'none', padding: '12px 20px', borderBottom: '1px solid #34495e', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        🏷️ Conceptos de Gasto
                    </Link>
                    <Link to="/app/bancos" style={{ color: 'white', textDecoration: 'none', padding: '12px 20px', borderBottom: '1px solid #34495e', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        🏦 Bancos y Cuentas
                    </Link>

                    <div style={{ color: '#7f8c8d', fontSize: '12px', padding: '20px 20px 10px 20px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        Finanzas
                    </div>
                    <Link to="/app/tesoreria" style={{ color: 'white', textDecoration: 'none', padding: '12px 20px', borderBottom: '1px solid #34495e', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        💰 Tesorería y Pagos
                    </Link>

                </nav>

                {/* Botón de salida empujado al fondo */}
                <div style={{ marginTop: 'auto', padding: '20px' }}>
                    <button onClick={cerrarSesion} style={{ width: '100%', padding: '10px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
                        Cerrar Sesión
                    </button>
                </div>
            </div>

            {/* ÁREA CENTRAL DE TRABAJO */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

                {/* Cabecera Superior (Topbar) */}
                <header style={{ backgroundColor: 'white', height: '60px', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', padding: '0 20px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                    <h3 style={{ margin: 0, color: '#34495e' }}>Panel de Operaciones</h3>
                </header>

                {/* CONTENIDO DINÁMICO (Aquí ocurre la magia) */}
                <main style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
                    {/* Este <Outlet /> es el "agujero" donde React insertará las pantallas de Logística, Proveedores o Bancos según donde haga clic el usuario */}
                    <Outlet />
                </main>

            </div>
        </div>
    )
}

export default Layout
