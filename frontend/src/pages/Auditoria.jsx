import React, { useState, useEffect } from 'react';
import api from '../services/api';

const Auditoria = () => {
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [activeTab, setActiveTab] = useState("maestros");

  const tabs = [
    { id: "maestros", label: "Maestros (Contenedores)" },
    { id: "dams", label: "DAMs" },
    { id: "gastos", label: "Gastos" },
    { id: "pagos", label: "Pagos" }
  ];

  // Fetch real de datos
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await api.get(`/auditoria/${activeTab}/`);
        setRegistros(response.data);
      } catch (error) {
        console.error("Error al obtener los datos de auditoría:", error);
        setRegistros([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [activeTab]);

  const abrirModal = (row) => {
    setModalData(row);
  };

  const cerrarModal = () => {
    setModalData(null);
  };

  // Formateador inteligente de fechas
  const formatValue = (val) => {
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
      const utcDate = val.endsWith("Z") ? val : val + "Z";
      return new Date(utcDate).toLocaleString("es-PE");
    }
    return val;
  };

  const renderTable = () => {
    if (loading) return <div className="card text-center text-muted"><p>Cargando datos de auditoría...</p></div>;
    
    return (
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '120px' }}>ID Eliminación</th>
              <th style={{ width: '160px' }}>Fecha</th>
              <th style={{ width: '150px' }}>Usuario</th>
              <th>Motivo</th>
              <th style={{ width: '180px' }}>Referencia</th>
              <th style={{ width: '130px', textAlign: 'center' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {registros.map((row) => (
              <tr key={row.id_eliminacion}>
                <td>{row.id_eliminacion}</td>
                <td>{formatValue(row.fecha_eliminacion)}</td>
                <td className="font-bold">{row.nombre_usuario_ejecutor || row.usuario_id}</td>
                <td>
                  <span className="truncate-text" title={row.motivo_eliminacion}>{row.motivo_eliminacion}</span>
                </td>
                <td>
                  <span className="truncate-text" title={row.identificador_principal}>{row.identificador_principal}</span>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button className="btn btn-primary" onClick={() => abrirModal(row)} style={{ padding: '6px 12px', fontSize: '12px' }}>
                    🔍 Consultar
                  </button>
                </td>
              </tr>
            ))}
            {registros.length === 0 && (
              <tr>
                <td colSpan="6" className="text-center text-muted" style={{ padding: '30px' }}>
                  No hay registros de auditoría disponibles en esta categoría.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="page-container">
      <div className="mb-3">
        <h2 className="page-title">Cementerio de Auditoría (Tablas Sombra)</h2>
        <p className="text-muted" style={{ marginTop: '-10px' }}>
          Visualización "Master-Detail" de registros eliminados lógicamente con motivos y auditoría.
        </p>
      </div>

      {/* Pestañas Superiores */}
      <div className="tabs-container">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tabla Resumen (Master View) */}
      {renderTable()}

      {/* Modal de Detalle (Detail View) */}
      {modalData && (
        <div className="modal-overlay" onClick={cerrarModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Detalles del Registro #{modalData.id_eliminacion}</h3>
              <button className="btn btn-danger" onClick={cerrarModal} style={{ padding: '6px 14px' }}>
                Cerrar
              </button>
            </div>
            
            <div className="data-grid">
              {/* 1. Mostrar la fotografía de nombres legibles destacada */}
              {modalData.detalles_legibles && Object.entries(modalData.detalles_legibles).map(([key, value]) => (
                <div key={`legible-${key}`} className="data-group highlight">
                  <span className="data-label">{key}</span>
                  <span className="data-value">{value}</span>
                </div>
              ))}

              {/* 2. Mostrar el resto de datos */}
              {Object.entries(modalData).map(([key, value]) => {
                // Filtro para ocultar datos redundantes, IDs crudos y campos duplicados visualmente
                if (
                  key === "detalles_legibles" || 
                  key.startsWith("id_") || 
                  key === "usuario_id" || 
                  key === "identificador_principal"
                ) return null;

                return (
                  <div key={key} className="data-group">
                    <span className="data-label">{key.replace(/_/g, " ")}</span>
                    <span className="data-value">
                      {value !== null && value !== undefined ? (typeof value === "boolean" ? (value ? "Sí" : "No") : formatValue(value)) : "N/A"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Auditoria;
