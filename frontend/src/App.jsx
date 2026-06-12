import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/login'
import Layout from './components/Layout'
import Proveedores from './pages/Proveedores'
import Importadores from './pages/Importadores'
import Agentes from './pages/Agentes'
import Almacenes from './pages/Almacenes'
import Bancos from './pages/Bancos'
import Empresas from './pages/Empresas'
import Conceptos from './pages/Conceptos'
import Logistica from './pages/Logistica'
import Gastos from './pages/Gastos'
import Pagos from './pages/Pagos'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* Zona Corporativa */}
        <Route path="/app" element={<Layout />}>
          {/* Operaciones */}
          <Route path="logistica" element={<Logistica />} />

          {/* Catálogos */}
          <Route path="importadores" element={<Importadores />} />
          <Route path="proveedores" element={<Proveedores />} />
          <Route path="agentes" element={<Agentes />} />
          <Route path="almacenes" element={<Almacenes />} />
          <Route path="empresas" element={<Empresas />} />
          <Route path="conceptos" element={<Conceptos />} />
          <Route path="bancos" element={<Bancos />} />

          {/* Finanzas */}
          <Route path="tesoreria" element={<h2 style={{ color: '#2c3e50' }}>Pantalla en construcción: Movimientos y Pagos</h2>} />
          <Route path="gastos" element={<Gastos />} />
          <Route path="pagos" element={<Pagos />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App


