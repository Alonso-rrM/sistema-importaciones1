import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/login'
import Layout from './components/Layout'
import Proveedores from './pages/Proveedores'
import Importadores from './pages/Importadores'
import Agentes from './pages/Agentes'
import Almacenes from './pages/Almacenes'
import Bancos from './pages/Bancos'
import Empresas from './pages/Empresas'


function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* Zona Corporativa */}
        <Route path="/app" element={<Layout />}>
          {/* Operaciones */}
          <Route path="logistica" element={<h2 style={{ color: '#2c3e50' }}>Pantalla en construcción: Registro de Contenedores y DAMs</h2>} />

          {/* Catálogos */}
          <Route path="importadores" element={<Importadores />} />
          <Route path="proveedores" element={<Proveedores />} />
          <Route path="agentes" element={<Agentes />} />
          <Route path="almacenes" element={<Almacenes />} />
          <Route path="empresas" element={<Empresas />} />
          <Route path="conceptos" element={<h2 style={{ color: '#2c3e50' }}>Pantalla en construcción: Tabla de Conceptos de Gasto</h2>} />
          <Route path="bancos" element={<Bancos />} />

          {/* Finanzas */}
          <Route path="tesoreria" element={<h2 style={{ color: '#2c3e50' }}>Pantalla en construcción: Movimientos y Pagos</h2>} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App


