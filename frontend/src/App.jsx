import { useState, useEffect } from 'react'
import axios from 'axios'

function App() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [token, setToken] = useState(localStorage.getItem('token') || '')

  // NUEVO: Memoria para guardar la lista de contenedores
  const [contenedores, setContenedores] = useState([])

  // NUEVO: El Radar. Si hay un token, automáticamente busca los datos.
  useEffect(() => {
    if (token) {
      cargarContenedores()
    }
  }, [token])

  // NUEVO: El Mensajero (Axios) usando el Token para abrir la bóveda
  const cargarContenedores = async () => {
    try {
      const respuesta = await axios.get('http://localhost:8000/maestros/', {
        headers: {
          Authorization: `Bearer ${token}` // Aquí presentamos la placa/gafete
        }
      })
      // Guardamos la respuesta del servidor en la memoria de React
      setContenedores(respuesta.data)
    } catch (error) {
      setMensaje("Error al traer los datos. El token podría estar vencido.")
      if (error.response && error.response.status === 401) {
        cerrarSesion()
      }
    }
  }

  const iniciarSesion = async (e) => {
    e.preventDefault()
    setMensaje("Conectando con la bóveda...")
    try {
      const formData = new URLSearchParams()
      formData.append('username', username)
      formData.append('password', password)

      // La ruta fue ajustada a /login para coincidir con tu backend FastAPI
      const respuesta = await axios.post('http://localhost:8000/login', formData)
      const tokenRecibido = respuesta.data.access_token

      localStorage.setItem('token', tokenRecibido)
      setToken(tokenRecibido)
      setMensaje("¡Acceso Autorizado!")
    } catch (error) {
      setMensaje("Acceso Denegado: Usuario o contraseña incorrectos.")
    }
  }

  const cerrarSesion = () => {
    localStorage.removeItem('token')
    setToken('')
    setUsername('')
    setPassword('')
    setMensaje('')
    setContenedores([]) // Limpiamos la mesa al salir
  }

  // ESCENARIO A: PANTALLA PRINCIPAL (LOGUEADO)
  if (token) {
    return (
      <div style={{ padding: '30px', fontFamily: 'sans-serif', backgroundColor: '#f4f6f7', minHeight: '100vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#2c3e50', padding: '15px 30px', color: 'white', borderRadius: '8px' }}>
          <h2>🏢 ERP Importaciones - Panel Logístico</h2>
          <button onClick={cerrarSesion} style={{ padding: '8px 15px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
            Cerrar Sesión
          </button>
        </div>

        <div style={{ marginTop: '30px', background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
          <h3 style={{ color: '#2980b9' }}>📋 Registros Maestros Recientes</h3>

          {/* TABLA DE DATOS */}
          {contenedores.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '15px' }}>
              <thead>
                <tr style={{ background: '#ecf0f1', textAlign: 'left' }}>
                  <th style={{ padding: '12px', borderBottom: '2px solid #bdc3c7' }}>Nro. Contenedor</th>
                  <th style={{ padding: '12px', borderBottom: '2px solid #bdc3c7' }}>Factura</th>
                  <th style={{ padding: '12px', borderBottom: '2px solid #bdc3c7' }}>Estado Levante</th>
                  <th style={{ padding: '12px', borderBottom: '2px solid #bdc3c7' }}>Tipo Valor</th>
                </tr>
              </thead>
              <tbody>
                {contenedores.map((item) => (
                  <tr key={item.id_maestro} style={{ borderBottom: '1px solid #ecf0f1' }}>

                    {/* Reemplazamos el ID por el número de contenedor real */}
                    <td style={{ padding: '12px', fontWeight: 'bold', color: '#2c3e50' }}>
                      {item.n_cont_fisico || 'Sin registrar'}
                    </td>

                    <td style={{ padding: '12px' }}>
                      {item.numero_factura || 'Sin registrar'}
                    </td>

                    <td style={{ padding: '12px', fontWeight: 'bold', color: item.estado_levante === 'CON LEVANTE' ? '#27ae60' : '#e67e22' }}>
                      {item.estado_levante}
                    </td>

                    <td style={{ padding: '12px' }}>{item.tipo_valor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: '#7f8c8d' }}>Cargando contenedores o no hay datos registrados...</p>
          )}
        </div>
      </div>
    )
  }

  // ESCENARIO B: PANTALLA DE LOGIN (Sin cambios visuales mayores)
  return (
    <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif', maxWidth: '350px', margin: '0 auto' }}>
      <h2 style={{ color: '#2c3e50' }}>Control de Acceso</h2>
      <p style={{ color: '#7f8c8d', fontSize: '14px' }}>Área de Logística y Finanzas</p>

      <form onSubmit={iniciarSesion} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
        <input type="text" placeholder="Nombre de Usuario" value={username} onChange={(e) => setUsername(e.target.value)} required style={{ padding: '10px', borderRadius: '5px', border: '1px solid #bdc3c7' }} />
        <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ padding: '10px', borderRadius: '5px', border: '1px solid #bdc3c7' }} />
        <button type="submit" style={{ padding: '12px', background: '#2980b9', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
          INGRESAR
        </button>
      </form>
      <p style={{ color: mensaje.includes('Denegado') ? 'red' : '#2980b9', marginTop: '15px' }}>{mensaje}</p>
    </div>
  )
}

export default App
