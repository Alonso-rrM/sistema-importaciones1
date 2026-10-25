import React, { useState, useEffect } from 'react';
import api from '../services/api';

const Auditoria = () => {
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [activeTab, setActiveTab] = useState("maestros");

  const tabs = [
    { id: "maestros", label: "Maestros (Contenedores)", icon: "📦" },
    { id: "dams", label: "Declaraciones (DAMs)", icon: "📄" },
    { id: "gastos", label: "Gastos Logísticos", icon: "💸" },
    { id: "pagos", label: "Liquidación de Pagos", icon: "⚖️" }
  ];

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await api.get(`/auditoria/${activeTab}/`);
        setRegistros(response.data || []);
      } catch (error) {
        console.error("Error al obtener los datos de auditoría:", error);
        setRegistros([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [activeTab]);

  const formatValue = (val) => {
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
      const utcDate = val.endsWith("Z") ? val : val + "Z";
      return new Date(utcDate).toLocaleString("es-PE");
    }
    return val;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      
      {/* HEADER DE MÓDULO */}
      <header className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-xl shadow-inner">
            🛡️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-tight">Cementerio de Auditoría</h1>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                Seguridad y Cumplimiento
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Pistas de auditoría forense y tablas sombra de registros anulados con justificación obligatoria
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Registros Registrados: {registros.length}</span>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <div className="flex-1 flex flex-col p-5 space-y-4 min-h-0 overflow-hidden">
        
        {/* PESTAÑAS MODERNAS */}
        <div className="flex items-center gap-2 p-1.5 bg-slate-900/80 border border-slate-800 rounded-xl shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-teal-600 text-white shadow-md shadow-teal-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* TABLA DE AUDITORÍA */}
        <section className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl flex flex-col min-h-0">
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-950/80 sticky top-0 z-10 border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3.5 w-24">ID Anulación</th>
                  <th className="px-4 py-3.5 w-44">Fecha y Hora</th>
                  <th className="px-4 py-3.5 w-36">Usuario Ejecutor</th>
                  <th className="px-4 py-3.5 w-56">Motivo de Eliminación</th>
                  <th className="px-4 py-3.5">Identificador de Referencia</th>
                  <th className="px-4 py-3.5 w-28 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-300">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-slate-400 text-xs">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
                        <span>Cargando pistas de auditoría...</span>
                      </div>
                    </td>
                  </tr>
                ) : registros.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-slate-500 text-xs">
                      No hay registros de auditoría registrados en esta categoría.
                    </td>
                  </tr>
                ) : (
                  registros.map((row) => (
                    <tr key={row.id_eliminacion} className="hover:bg-slate-800/60 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-teal-400">
                        #{row.id_eliminacion}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-400">
                        {formatValue(row.fecha_eliminacion)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded font-mono text-[10px] font-semibold bg-slate-800 text-purple-300 border border-slate-700">
                          {row.nombre_usuario_ejecutor || row.usuario_id || 'Sistema'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="truncate block max-w-md text-rose-300 font-medium" title={row.motivo_eliminacion}>
                          {row.motivo_eliminacion}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-slate-300 truncate block max-w-sm" title={row.identificador_principal}>
                          {row.identificador_principal || 'N/A'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setModalData(row)}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-teal-300 border border-teal-500/30 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                        >
                          🔍 Ficha
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

      </div>

      {/* MODAL DE DETALLE FORENSE */}
      {modalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn" onClick={() => setModalData(null)}>
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col text-slate-100" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2.5">
                <span className="text-teal-400 text-lg">🛡️</span>
                <h3 className="font-bold text-sm text-white">
                  Pista Forense #{modalData.id_eliminacion} · {activeTab.toUpperCase()}
                </h3>
              </div>
              <button onClick={() => setModalData(null)} className="text-slate-400 hover:text-white text-xs">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="p-3.5 bg-rose-950/20 border border-rose-500/30 rounded-xl space-y-1">
                <span className="text-[10px] uppercase font-bold text-rose-400 tracking-wider">Justificación de Anulación</span>
                <p className="text-xs text-rose-200">{modalData.motivo_eliminacion}</p>
              </div>

              {modalData.detalles_legibles && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-teal-400 uppercase tracking-wider block">Snapshot Legible</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {Object.entries(modalData.detalles_legibles).map(([key, value]) => (
                      <div key={key} className="bg-slate-950/80 border border-slate-800 p-2.5 rounded-lg">
                        <span className="text-[10px] uppercase text-slate-500 font-bold block">{key}</span>
                        <span className="font-semibold text-slate-200">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Metadatos del Objeto Eliminado</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {Object.entries(modalData).map(([key, value]) => {
                    if (key === "detalles_legibles" || key.startsWith("id_") || key === "usuario_id" || key === "motivo_eliminacion") return null;
                    return (
                      <div key={key} className="bg-slate-950/60 border border-slate-800/80 p-2.5 rounded-lg">
                        <span className="text-[10px] uppercase text-slate-500 font-bold block">{key.replace(/_/g, " ")}</span>
                        <span className="font-mono text-slate-300 text-xs">
                          {value !== null && value !== undefined ? (typeof value === "boolean" ? (value ? "Sí" : "No") : formatValue(value)) : "N/A"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setModalData(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cerrar Pista
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Auditoria;
