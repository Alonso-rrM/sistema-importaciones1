import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function Setup() {
  const navigate = useNavigate();
  const [paso, setPaso] = useState(1); // 1 = bienvenida, 2 = formulario, 3 = éxito
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    nombre_empresa: '',
    username: '',
    email: '',
    password: '',
    confirmar_password: ''
  });

  const handleChange = (campo, valor) => setForm(prev => ({ ...prev, [campo]: valor }));

  const handleInicializar = async (e) => {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmar_password) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (form.password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    setCargando(true);
    try {
      await api.post('/setup/init', {
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
        nombre_empresa: form.nombre_empresa.trim() || 'Mi Empresa'
      });
      setPaso(3);
    } catch (err) {
      const msg = err.response?.data?.detail || 'Error al inicializar el sistema.';
      setError(msg);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 text-slate-100 p-4 font-sans relative overflow-hidden">
      {/* Glows decorativos */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md relative z-10">

        {/* ─── PASO 1: BIENVENIDA ─── */}
        {paso === 1 && (
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-8 space-y-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-4xl mx-auto shadow-inner">
              📦
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Bienvenido al ERP</h1>
              <p className="text-sm text-slate-400 mt-1">Sistema Integral de Importaciones y Tesorería</p>
            </div>

            <div className="bg-teal-950/40 border border-teal-700/40 rounded-xl p-4 text-left space-y-2">
              <p className="text-xs font-bold text-teal-300 uppercase tracking-wider">Primera instalación detectada</p>
              <p className="text-xs text-slate-300 leading-relaxed">
                Esta es la primera vez que se ejecuta el sistema. En los siguientes pasos crearás tu cuenta de administrador y el sistema quedará listo para operar.
              </p>
            </div>

            <div className="text-left space-y-2">
              {['Crear los roles del sistema automáticamente', 'Configurar tu cuenta de SuperAdministrador', 'Acceder al panel de operaciones'].map((item, i) => (
                <div key={i} className="flex items-center gap-2.5 text-xs text-slate-300">
                  <span className="w-5 h-5 rounded-full bg-teal-500/20 border border-teal-500/40 text-teal-300 flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
                  {item}
                </div>
              ))}
            </div>

            <button
              onClick={() => setPaso(2)}
              className="w-full bg-teal-600 hover:bg-teal-500 text-white font-bold py-3 rounded-xl text-sm transition-all shadow-lg shadow-teal-900/50 cursor-pointer"
            >
              Comenzar la configuración →
            </button>
          </div>
        )}

        {/* ─── PASO 2: FORMULARIO ─── */}
        {paso === 2 && (
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-slate-800/80 border-b border-slate-700 px-6 py-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-lg">⚙️</div>
              <div>
                <h2 className="text-sm font-bold text-white">Configuración Inicial del Sistema</h2>
                <p className="text-[10px] text-slate-400">Estos datos no se pueden cambiar desde aquí después</p>
              </div>
            </div>

            <form onSubmit={handleInicializar} className="p-6 space-y-4">
              {/* Nombre de la empresa */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Nombre de la Empresa
                </label>
                <input
                  type="text"
                  placeholder="Ej: Importaciones Perú S.A.C."
                  value={form.nombre_empresa}
                  onChange={e => handleChange('nombre_empresa', e.target.value)}
                  className="w-full text-xs bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-all"
                />
              </div>

              <div className="w-full h-px bg-slate-800"></div>
              <p className="text-[10px] font-bold text-teal-400 uppercase tracking-wider">Cuenta SuperAdministrador</p>

              {/* Username */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Nombre de usuario *
                </label>
                <input
                  type="text"
                  required
                  placeholder="admin"
                  value={form.username}
                  onChange={e => handleChange('username', e.target.value)}
                  className="w-full text-xs bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-all font-mono"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Correo Electrónico *
                </label>
                <input
                  type="email"
                  required
                  placeholder="admin@tuempresa.com"
                  value={form.email}
                  onChange={e => handleChange('email', e.target.value)}
                  className="w-full text-xs bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-all"
                />
              </div>

              {/* Passwords */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Contraseña *
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={form.password}
                    onChange={e => handleChange('password', e.target.value)}
                    className="w-full text-xs bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Confirmar *
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={form.confirmar_password}
                    onChange={e => handleChange('confirmar_password', e.target.value)}
                    className="w-full text-xs bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-all"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-rose-950/40 border border-rose-700/50 rounded-lg px-3 py-2 text-xs text-rose-300">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPaso(1)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 font-bold py-2.5 rounded-xl text-xs transition-all cursor-pointer"
                >
                  ← Atrás
                </button>
                <button
                  type="submit"
                  disabled={cargando}
                  className="flex-[2] bg-teal-600 hover:bg-teal-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-xl text-xs transition-all shadow-lg cursor-pointer"
                >
                  {cargando ? 'Inicializando...' : 'Crear sistema y continuar'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ─── PASO 3: ÉXITO ─── */}
        {paso === 3 && (
          <div className="bg-slate-900 border border-emerald-700/40 rounded-2xl shadow-2xl p-8 space-y-6 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/40 flex items-center justify-center text-4xl mx-auto">
              ✅
            </div>
            <div>
              <h2 className="text-xl font-bold text-emerald-400">¡Sistema inicializado!</h2>
              <p className="text-xs text-slate-400 mt-1">Todo listo para comenzar a operar.</p>
            </div>

            <div className="bg-slate-800/60 rounded-xl p-4 text-left space-y-1.5 text-xs text-slate-300">
              <p className="font-bold text-slate-100 mb-2">Resumen:</p>
              <p>✅ 4 roles del sistema creados (SuperAdmin, Operaciones, Finanzas, Auditor)</p>
              <p>✅ Usuario administrador <span className="font-mono text-teal-300 font-bold">{form.username}</span> creado</p>
              <p>✅ Base de datos configurada y lista</p>
            </div>

            <p className="text-xs text-slate-400">
              A continuación serás redirigido al Login para iniciar sesión con las credenciales que acabas de crear.
            </p>

            <button
              onClick={() => navigate('/login')}
              className="w-full bg-teal-600 hover:bg-teal-500 text-white font-bold py-3 rounded-xl text-sm transition-all shadow-lg cursor-pointer"
            >
              Ir al Login →
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

