import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [cargando, setCargando] = useState(false);
  const navigate = useNavigate();

  const iniciarSesion = async (e) => {
    e.preventDefault();
    setCargando(true);
    setMensaje("Conectando con el servidor...");
    try {
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      const respuesta = await api.post('/login', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      localStorage.setItem('token', respuesta.data.access_token);
      navigate('/app/logistica');
    } catch (error) {
      setMensaje("Acceso Denegado: Credenciales incorrectas.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 text-slate-100 p-4 font-sans relative overflow-hidden">
      {/* GLOW DECORATIVO */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-8 space-y-6 relative z-10 backdrop-blur-sm">
        
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-2xl mx-auto shadow-inner">
            📦
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">ERP Importaciones</h2>
          <p className="text-xs text-slate-400">Sistema Integral de Operaciones y Tesorería</p>
        </div>

        <form onSubmit={iniciarSesion} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
              Usuario
            </label>
            <input 
              type="text" 
              placeholder="Ingresa tu usuario..." 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              required 
              className="w-full text-xs bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
              Contraseña
            </label>
            <input 
              type="password" 
              placeholder="••••••••" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required 
              className="w-full text-xs bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-all"
            />
          </div>

          <button 
            type="submit" 
            disabled={cargando}
            className="w-full py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold tracking-wide transition-all shadow-lg shadow-teal-600/20 flex items-center justify-center gap-2 cursor-pointer mt-2"
          >
            {cargando ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Autenticando...</span>
              </>
            ) : (
              <span>Iniciar Sesión</span>
            )}
          </button>
        </form>

        {mensaje && (
          <div className={`p-3 rounded-lg text-xs text-center border animate-fadeIn ${
            mensaje.includes('Denegado') 
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' 
              : 'bg-teal-500/10 border-teal-500/30 text-teal-300'
          }`}>
            {mensaje}
          </div>
        )}

        <div className="text-center pt-2 border-t border-slate-800/80">
          <span className="text-[10px] text-slate-500 font-mono">Control de Acceso RBAC & Auditoría Activa</span>
        </div>
      </div>
    </div>
  );
}

export default Login;
