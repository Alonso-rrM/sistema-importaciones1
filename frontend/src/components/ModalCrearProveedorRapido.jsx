import { useState, useEffect } from 'react';
import api from '../services/api';
import { acortarRazonSocial } from '../utils/textUtils';

const ModalCrearProveedorRapido = ({
  isOpen,
  onClose,
  onProveedorCreado,
  categoriaDefecto = 'NACIONAL'
}) => {
  const [categoria, setCategoria] = useState(categoriaDefecto);
  const [ruc, setRuc] = useState('');
  const [nombre, setNombre] = useState('');
  const [buscandoRuc, setBuscandoRuc] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  useEffect(() => {
    if (isOpen) {
      setCategoria(categoriaDefecto);
      setRuc('');
      setNombre('');
      setMensaje({ texto: '', tipo: '' });
      setBuscandoRuc(false);
      setGuardando(false);
    }
  }, [isOpen, categoriaDefecto]);

  if (!isOpen) return null;

  const mostrarAlerta = (texto, tipo = 'info') => {
    setMensaje({ texto, tipo });
  };

  const handleBuscarSunat = async () => {
    const rucLimpio = ruc.trim();
    if (rucLimpio.length !== 11 || isNaN(rucLimpio)) {
      mostrarAlerta('El RUC debe tener exactamente 11 dígitos numéricos.', 'error');
      return;
    }

    setBuscandoRuc(true);
    setMensaje({ texto: '', tipo: '' });
    try {
      const res = await api.get(`/sunat/ruc/${rucLimpio}`);
      if (res.data?.razon_social) {
        const razonSocialOriginal = res.data.razon_social;
        const nombreSugerido = res.data.nombre_sugerido || acortarRazonSocial(razonSocialOriginal);
        setNombre(nombreSugerido);
        mostrarAlerta(`✅ SUNAT: Razón social obtenida. Puedes ajustarla si lo deseas.`, 'exito');
      } else {
        mostrarAlerta('RUC no encontrado en el padrón de SUNAT.', 'error');
      }
    } catch (err) {
      console.error('Error buscando RUC en SUNAT:', err);
      mostrarAlerta('No se pudo consultar el RUC en SUNAT. Puedes ingresar el nombre manualmente.', 'error');
    } finally {
      setBuscandoRuc(false);
    }
  };

  const handleRucKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (categoria === 'NACIONAL') {
        handleBuscarSunat();
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMensaje({ texto: '', tipo: '' });

    const nombreLimpio = nombre.trim();
    const rucLimpio = ruc.trim();

    if (!nombreLimpio) {
      mostrarAlerta('El nombre o razón social es obligatorio.', 'error');
      return;
    }

    if (categoria === 'NACIONAL' && rucLimpio && (rucLimpio.length !== 11 || isNaN(rucLimpio))) {
      mostrarAlerta('Si ingresas un RUC nacional, debe tener 11 dígitos.', 'error');
      return;
    }

    setGuardando(true);
    try {
      const payload = {
        nombre: nombreLimpio,
        ruc: rucLimpio || null,
        categoria: categoria
      };

      const res = await api.post('/proveedores/', payload);
      const nuevoProveedor = res.data;

      if (onProveedorCreado) {
        onProveedorCreado(nuevoProveedor);
      }
      onClose();
    } catch (err) {
      console.error('Error al registrar proveedor:', err);
      const detalle = err.response?.data?.detail || err.message || 'Error al guardar proveedor';
      mostrarAlerta(`Error: ${detalle}`, 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex justify-center items-center p-4">
      <div 
        className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Cabecera */}
        <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20 text-sm font-bold">
              +
            </span>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">
                Registrar Nuevo Proveedor
              </h3>
              <p className="text-[11px] text-slate-400">
                Se agregará al catálogo y se seleccionará automáticamente
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg p-1 rounded-md hover:bg-slate-800 transition leading-none"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Mensajes de Alerta */}
          {mensaje.texto && (
            <div
              className={`p-3 rounded-lg text-xs font-medium border ${
                mensaje.tipo === 'exito'
                  ? 'bg-emerald-950/40 border-emerald-700/50 text-emerald-300'
                  : mensaje.tipo === 'error'
                  ? 'bg-rose-950/40 border-rose-700/50 text-rose-300'
                  : 'bg-blue-950/40 border-blue-700/50 text-blue-300'
              }`}
            >
              {mensaje.texto}
            </div>
          )}

          {/* Selector de Categoría (Pestañas Rápidas) */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Tipo de Proveedor
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setCategoria('NACIONAL')}
                className={`py-1.5 px-3 rounded text-xs font-semibold transition ${
                  categoria === 'NACIONAL'
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                🇵🇪 Nacional (SUNAT / RUC)
              </button>
              <button
                type="button"
                onClick={() => setCategoria('INTERNACIONAL')}
                className={`py-1.5 px-3 rounded text-xs font-semibold transition ${
                  categoria === 'INTERNACIONAL'
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                🌏 Internacional (China / Ext.)
              </button>
            </div>
          </div>

          {/* Campo RUC / Identificación Fiscal */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              {categoria === 'NACIONAL' ? 'RUC (11 dígitos) *' : 'Tax ID / Identificación Fiscal (Opcional)'}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={ruc}
                onChange={(e) => setRuc(e.target.value.replace(/\D/g, '').slice(0, categoria === 'NACIONAL' ? 11 : 20))}
                onKeyDown={handleRucKeyDown}
                placeholder={categoria === 'NACIONAL' ? 'Ej. 20123456789' : 'Ej. CN1234567 (opcional)'}
                maxLength={categoria === 'NACIONAL' ? 11 : 20}
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 font-mono focus:border-teal-500 focus:outline-none"
                autoFocus
              />
              {categoria === 'NACIONAL' && (
                <button
                  type="button"
                  onClick={handleBuscarSunat}
                  disabled={buscandoRuc || ruc.trim().length !== 11}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition flex items-center gap-1.5 whitespace-nowrap shadow-sm"
                  title="Consultar datos directamente a SUNAT"
                >
                  {buscandoRuc ? (
                    <>
                      <span className="animate-spin inline-block">⏳</span>
                      <span>Consultando...</span>
                    </>
                  ) : (
                    <>
                      <span>🔍</span>
                      <span>SUNAT</span>
                    </>
                  )}
                </button>
              )}
            </div>
            {categoria === 'NACIONAL' && (
              <p className="text-[10px] text-slate-500 mt-1">
                Presiona Enter o el botón SUNAT para autocompletar la razón social oficial.
              </p>
            )}
          </div>

          {/* Campo Nombre / Razón Social */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              {categoria === 'NACIONAL' ? 'Razón Social / Nombre Comercial *' : 'Nombre de la Fábrica o Empresa *'}
            </label>
            <input
              type="text"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder={categoria === 'NACIONAL' ? 'Ej. DISTRIBUIDORA LOGÍSTICA S.A.C.' : 'Ej. Yiwu Import & Export Ltd.'}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none"
            />
          </div>

          {/* Acciones */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={guardando}
              className="px-3.5 py-2 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando || buscandoRuc}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow transition flex items-center gap-2"
            >
              {guardando ? (
                <>
                  <span className="animate-spin inline-block">⏳</span>
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <span>✓</span>
                  <span>Guardar Proveedor</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ModalCrearProveedorRapido;

