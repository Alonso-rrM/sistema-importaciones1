import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

function Login() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [mensaje, setMensaje] = useState('')
    const navigate = useNavigate()

    const iniciarSesion = async (e) => {
        e.preventDefault()
        setMensaje("Conectando con la bóveda...")
        try {
            const formData = new URLSearchParams()
            formData.append('username', username)
            formData.append('password', password)

            const respuesta = await api.post('/login', formData, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            })

            localStorage.setItem('token', respuesta.data.access_token)
            navigate('/app/logistica')

        } catch (error) {
            setMensaje("Acceso Denegado: Credenciales incorrectas.")
        }
    }

    return (
        <div className="login-container">
            <div className="login-card">
                <h2>ERP Importaciones</h2>
                <p className="text-muted mb-3">Acceso Restringido</p>

                <form onSubmit={iniciarSesion} className="form-stack">
                    <input 
                        type="text" 
                        placeholder="Usuario" 
                        value={username} 
                        onChange={(e) => setUsername(e.target.value)} 
                        required 
                        className="form-input" 
                    />
                    <input 
                        type="password" 
                        placeholder="Contraseña" 
                        value={password} 
                        onChange={(e) => setPassword(e.target.value)} 
                        required 
                        className="form-input" 
                    />
                    <button type="submit" className="btn btn-primary btn-block">
                        INGRESAR
                    </button>
                </form>
                {mensaje && (
                    <div className={`alert ${mensaje.includes('Denegado') ? 'alert-error' : 'alert-info'} mt-3`}>
                        {mensaje}
                    </div>
                )}
            </div>
        </div>
    )
}

export default Login
