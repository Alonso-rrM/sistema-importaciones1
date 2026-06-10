import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

function Login() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [mensaje, setMensaje] = useState('')
    const navigate = useNavigate() // El motor de teletransportación

    const iniciarSesion = async (e) => {
        e.preventDefault()
        setMensaje("Conectando con la bóveda...")
        try {
            const formData = new URLSearchParams()
            formData.append('username', username)
            formData.append('password', password)

            const respuesta = await axios.post('http://localhost:8000/login', formData)

            // Guardamos la llave
            localStorage.setItem('token', respuesta.data.access_token)

            // ¡Apertura exitosa! Teletransportamos al usuario al área corporativa
            navigate('/app/logistica')

        } catch (error) {
            setMensaje("Acceso Denegado: Credenciales incorrectas.")
        }
    }

    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#ecf0f1', fontFamily: 'sans-serif' }}>
            <div style={{ background: 'white', padding: '40px', borderRadius: '8px', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', width: '100%', maxWidth: '350px', textAlign: 'center' }}>
                <h2 style={{ color: '#2c3e50', margin: '0 0 10px 0' }}>ERP Importaciones</h2>
                <p style={{ color: '#7f8c8d', fontSize: '14px', marginBottom: '20px' }}>Acceso Restringido</p>

                <form onSubmit={iniciarSesion} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <input type="text" placeholder="Usuario" value={username} onChange={(e) => setUsername(e.target.value)} required style={{ padding: '12px', borderRadius: '5px', border: '1px solid #bdc3c7' }} />
                    <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ padding: '12px', borderRadius: '5px', border: '1px solid #bdc3c7' }} />
                    <button type="submit" style={{ padding: '12px', background: '#2980b9', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
                        INGRESAR
                    </button>
                </form>
                <p style={{ color: mensaje.includes('Denegado') ? '#e74c3c' : '#2980b9', marginTop: '15px', fontSize: '14px' }}>{mensaje}</p>
            </div>
        </div>
    )
}

export default Login
