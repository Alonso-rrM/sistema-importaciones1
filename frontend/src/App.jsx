import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/login'
import Layout from './components/Layout'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* Zona Corporativa */}
        <Route path="/app" element={<Layout />}>
          {/* Operaciones */}
          <Route path="logistica" element={<h2 style={{color: '#2c3e50'}}>Pantalla en construcción: Registro de Contenedores y DAMs</h2>} />
          
          {/* Catálogos */}
          <Route path="importadores" element={<h2 style={{color: '#2c3e50'}}>Pantalla en construcción: Padrón de Importadores</h2>} />
          <Route path="proveedores" element={<h2 style={{color: '#2c3e50'}}>Pantalla en construcción: Maestro de Proveedores</h2>} />
          <Route path="conceptos" element={<h2 style={{color: '#2c3e50'}}>Pantalla en construcción: Tabla de Conceptos de Gasto</h2>} />
          <Route path="bancos" element={<h2 style={{color: '#2c3e50'}}>Pantalla en construcción: Gestión de Entidades Bancarias</h2>} />
          
          {/* Finanzas */}
          <Route path="tesoreria" element={<h2 style={{color: '#2c3e50'}}>Pantalla en construcción: Movimientos y Pagos</h2>} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

