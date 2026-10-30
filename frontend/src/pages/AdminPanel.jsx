import React, { useState, useMemo, useRef } from 'react';
import api from '../services/api';

const CATALOGOS = [
  { key: 'roles',        label: 'Roles',        icono: '🎭', cols: 'nombre_rol, descripcion' },
  { key: 'bancos',       label: 'Bancos',        icono: '🏦', cols: 'nombre_banco' },
  { key: 'conceptos',    label: 'Conceptos',     icono: '🏷️', cols: 'nombre_concepto, descripcion, tipo_gasto' },
  { key: 'proveedores',  label: 'Proveedores',   icono: '🤝', cols: 'nombre, ruc' },
  { key: 'agentes',      label: 'Agentes',       icono: '🛂', cols: 'nombre, ruc' },
  { key: 'importadores', label: 'Importadores',  icono: '🏢', cols: 'nombre, ruc' },
  { key: 'almacenes',    label: 'Almacenes',     icono: '🏭', cols: 'nombre' },
];

export default function AdminPanel() {
  const fileInputRef = useRef(null);

  // Detección de rol
  const userRole = useMemo(() => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return null;
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(base64)).id_rol;
    } catch { return null; }
  }, []);

  const [catalogoSeleccionado, setCatalogoSeleccionado] = useState('conceptos');
  const [archivo, setArchivo] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState(null);

  if (userRole !== 1) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        Acceso denegado. Este módulo es exclusivo del SuperAdministrador.
      </div>
    );
  }

  const catActual = CATALOGOS.find(c => c.key === catalogoSeleccionado);

  const handleSeleccionarArchivo = (e) => {
    const f = e.target.files[0];
    setArchivo(f || null);
    setResultado(null);
  };

  const handleCargar = async () => {
    if (!archivo) return;
    setCargando(true);
    setResultado(null);

    try {
      const formData = new FormData();
      formData.append('archivo', archivo);

      const res = await api.post(`/admin/carga-masiva?catalogo=${catalogoSeleccionado}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResultado({ ok: true, data: res.data });
    } catch (err) {
      const msg = err.response?.data?.detail || 'Error al procesar el archivo.';
      setResultado({ ok: false, mensaje: msg });
    } finally {
      setCargando(false);
      setArchivo(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 overflow-hidden">
      {/* HEADER */}
      <header className="bg-slate-900/80 border-b border-slate-800 px-6 py-3 flex items-center gap-3 shrink-0">
        <span className="text-lg">⚙️</span>
        <div>
          <h1 className="text-sm font-bold text-slate-100">Panel de Administración del Sistema</h1>
          <p className="text-[10px] text-slate-400">Carga masiva de catálogos · Solo SuperAdmin</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-3xl mx-auto w-full">

        {/* SECCIÓN: CARGA MASIVA */}
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          <div className="bg-slate-800/60 border-b border-slate-700 px-5 py-3 flex items-center gap-2">
            <span className="text-base">📤</span>
            <h2 className="text-sm font-bold text-slate-100">Carga Masiva desde Excel</h2>
            <span className="ml-auto text-[10px] text-slate-500 font-mono">Formato: .xlsx</span>
          </div>

          <div className="p-5 space-y-5">
            {/* Selector de catálogo */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                1. Selecciona el catálogo a cargar
              </label>
              <div className="grid grid-cols-4 gap-2">
                {CATALOGOS.map(cat => (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => { setCatalogoSeleccionado(cat.key); setResultado(null); setArchivo(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className={`p-2.5 rounded-lg border text-xs font-medium transition-all cursor-pointer flex flex-col items-center gap-1 ${
                      catalogoSeleccionado === cat.key
                        ? 'bg-teal-600/20 border-teal-500 text-teal-300'
                        : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-base">{cat.icono}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Columnas requeridas */}
            <div className="bg-slate-800/40 border border-slate-700/60 rounded-lg px-4 py-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Columnas requeridas en el Excel para <span className="text-teal-400">{catActual?.label}</span>:
              </p>
              <p className="text-xs font-mono text-amber-300">{catActual?.cols}</p>
              {catalogoSeleccionado === 'conceptos' && (
                <p className="text-[10px] text-slate-400 mt-1.5">
                  Valores válidos para <span className="text-amber-300 font-mono">tipo_gasto</span>:{' '}
                  <span className="font-mono text-slate-300">FIJO_DESPACHO | POST_LEVANTE | EXTRAORDINARIO</span>
                </p>
              )}
            </div>

            {/* Selector de archivo */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                2. Selecciona el archivo Excel
              </label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                  archivo
                    ? 'border-teal-600 bg-teal-950/20'
                    : 'border-slate-700 hover:border-slate-500 bg-slate-800/30'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleSeleccionarArchivo}
                  className="hidden"
                />
                {archivo ? (
                  <div className="space-y-1">
                    <span className="text-2xl">📗</span>
                    <p className="text-sm font-bold text-teal-300">{archivo.name}</p>
                    <p className="text-[10px] text-slate-400">{(archivo.size / 1024).toFixed(1)} KB · Listo para cargar</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <span className="text-3xl">📁</span>
                    <p className="text-xs text-slate-400">Haz clic para seleccionar un archivo <span className="text-slate-200 font-bold">.xlsx</span></p>
                    <p className="text-[10px] text-slate-500">O arrastra el archivo aquí</p>
                  </div>
                )}
              </div>
            </div>

            {/* Botón de carga */}
            <button
              type="button"
              onClick={handleCargar}
              disabled={!archivo || cargando}
              className="w-full bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl text-sm transition-all shadow-lg cursor-pointer"
            >
              {cargando ? '⏳ Procesando archivo...' : `📤 Cargar ${catActual?.label} desde Excel`}
            </button>

            {/* Resultado */}
            {resultado && (
              <div className={`rounded-xl border p-4 text-xs space-y-2 ${
                resultado.ok
                  ? 'bg-emerald-950/30 border-emerald-700/50'
                  : 'bg-rose-950/30 border-rose-700/50'
              }`}>
                {resultado.ok ? (
                  <>
                    <div className="flex items-center gap-2 font-bold text-emerald-300">
                      <span>✅</span> Carga completada
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-slate-800/60 rounded-lg p-2.5 text-center">
                        <div className="text-lg font-bold text-slate-100">{resultado.data.total_filas}</div>
                        <div className="text-[10px] text-slate-400 uppercase">Total filas</div>
                      </div>
                      <div className="bg-emerald-900/30 rounded-lg p-2.5 text-center">
                        <div className="text-lg font-bold text-emerald-400">{resultado.data.insertados}</div>
                        <div className="text-[10px] text-slate-400 uppercase">Insertados</div>
                      </div>
                      <div className="bg-rose-900/30 rounded-lg p-2.5 text-center">
                        <div className="text-lg font-bold text-rose-400">{resultado.data.errores_count}</div>
                        <div className="text-[10px] text-slate-400 uppercase">Errores</div>
                      </div>
                    </div>
                    {resultado.data.errores_detalle?.length > 0 && (
                      <div className="space-y-1 mt-2">
                        <p className="font-bold text-amber-400 text-[10px] uppercase">Detalle de errores (máx. 20):</p>
                        {resultado.data.errores_detalle.map((e, i) => (
                          <p key={i} className="text-rose-300 font-mono text-[10px] leading-relaxed">• {e}</p>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-start gap-2 text-rose-300">
                    <span className="shrink-0">❌</span>
                    <span>{resultado.mensaje}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* AVISO DE SEGURIDAD */}
        <div className="bg-amber-950/20 border border-amber-700/30 rounded-xl px-5 py-3 text-xs text-amber-300/80 flex items-start gap-2">
          <span className="shrink-0 mt-0.5">⚠️</span>
          <span>
            Este módulo es exclusivo del SuperAdministrador. Las inserciones son permanentes.
            Los registros duplicados serán rechazados automáticamente por el sistema.
          </span>
        </div>
      </div>
    </div>
  );
}

