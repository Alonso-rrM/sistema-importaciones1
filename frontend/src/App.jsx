import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Setup from './pages/Setup'
import AdminPanel from './pages/AdminPanel'
import Layout from './components/Layout'
import Proveedores from './pages/Proveedores'
import Importadores from './pages/Importadores'
import Agentes from './pages/Agentes'
import Almacenes from './pages/Almacenes'
import Bancos from './pages/Bancos'

import Conceptos from './pages/Conceptos'
import Comprobantes from './pages/Comprobantes'
import Logistica from './pages/Logistica'
import Dams from './pages/Dams'
import Gastos from './pages/Gastos'
import Pagos from './pages/Pagos'
import Vouchers from './pages/Vouchers'
import Auditoria from './pages/Auditoria'
import Reportes from './pages/Reportes'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/setup" element={<Setup />} />

        {/* Zona Corporativa */}
        <Route path="/app" element={<Layout />}>
          {/* Inteligencia y Reportes */}
          <Route path="reportes" element={<Reportes />} />

          {/* Operaciones */}
          <Route path="logistica" element={<Logistica />} />
          <Route path="dams" element={<Dams />} />

          {/* Catálogos */}
          <Route path="importadores" element={<Importadores />} />
          <Route path="proveedores" element={<Proveedores />} />
          <Route path="agentes" element={<Agentes />} />
          <Route path="almacenes" element={<Almacenes />} />

          <Route path="conceptos" element={<Conceptos />} />
          <Route path="comprobantes" element={<Comprobantes />} />
          <Route path="bancos" element={<Bancos />} />

          {/* Finanzas */}
          <Route path="vouchers" element={<Vouchers />} />
          <Route path="gastos" element={<Gastos />} />
          <Route path="pagos" element={<Pagos />} />
          <Route path="auditoria" element={<Auditoria />} />

          {/* Administración / Carga Masiva (SuperAdmin) */}
          <Route path="admin" element={<AdminPanel />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App


