import React, { useState, useEffect } from 'react';

const Auditoria = () => {
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [activeTab, setActiveTab] = useState("maestros"); // Manteniendo la estructura de pestañas

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
        const token = localStorage.getItem("access_token") || localStorage.getItem("token") || "";
        const response = await fetch(`http://127.0.0.1:8000/auditoria/${activeTab}/`, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          }
        });
        
        if (response.ok) {
          const result = await response.json();
          setRegistros(result);
        } else {
          console.error("Error al obtener los datos de auditoría");
          setRegistros([]);
        }
      } catch (error) {
        console.error("Error de red:", error);
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

  // --- ESTILOS INLINE ---
  const styles = {
    container: {
      maxWidth: "100%",
      padding: "20px",
      boxSizing: "border-box",
      fontFamily: "Arial, sans-serif"
    },
    header: { borderBottom: "2px solid #eee", paddingBottom: "10px", marginBottom: "20px" },
    tabsContainer: {
      display: "flex",
      gap: "10px",
      marginBottom: "20px",
      borderBottom: "2px solid #ddd",
      paddingBottom: "10px"
    },
    tabButton: (isActive) => ({
      padding: "10px 20px",
      cursor: "pointer",
      backgroundColor: isActive ? "#0d6efd" : "transparent",
      color: isActive ? "#fff" : "#555",
      border: isActive ? "none" : "none",
      borderRadius: "4px",
      fontSize: "16px",
      fontWeight: "bold",
      transition: "background-color 0.2s"
    }),
    tableContainer: { overflowX: "auto", backgroundColor: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", borderRadius: "4px" },
    table: {
      width: "100%",
      borderCollapse: "collapse",
      marginTop: "10px"
    },
    th: {
      backgroundColor: "#f8f9fa",
      padding: "12px",
      borderBottom: "2px solid #dee2e6",
      textAlign: "left",
      fontWeight: "bold"
    },
    td: {
      padding: "12px",
      borderBottom: "1px solid #dee2e6",
      verticalAlign: "middle"
    },
    btnConsultar: {
      backgroundColor: "#17a2b8",
      color: "white",
      border: "none",
      padding: "8px 12px",
      borderRadius: "4px",
      cursor: "pointer",
      fontWeight: "bold",
      display: "flex",
      alignItems: "center",
      gap: "5px",
      margin: "0 auto"
    },
    modalOverlay: {
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.5)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 1000
    },
    modalContent: {
      backgroundColor: "white",
      borderRadius: "8px",
      width: "90%",
      maxWidth: "700px",
      maxHeight: "85vh",
      display: "flex",
      flexDirection: "column",
      boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
    },
    modalHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "15px 20px",
      borderBottom: "1px solid #eee",
      backgroundColor: "#f8f9fa",
      borderTopLeftRadius: "8px",
      borderTopRightRadius: "8px"
    },
    modalTitle: {
      margin: 0,
      color: "#333",
      fontSize: "1.25rem"
    },
    btnCerrar: {
      backgroundColor: "#ff0033",
      color: "white",
      border: "none",
      padding: "8px 15px",
      borderRadius: "4px",
      cursor: "pointer",
      fontWeight: "bold"
    },
    modalBody: {
      padding: "20px",
      overflowY: "auto",
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
      gap: "20px"
    },
    dataGroup: {
      display: "flex",
      flexDirection: "column",
      backgroundColor: "#fdfdfd",
      padding: "10px",
      border: "1px solid #eee",
      borderRadius: "4px"
    },
    dataLabel: {
      fontWeight: "bold",
      color: "#666",
      fontSize: "0.85rem",
      textTransform: "capitalize",
      marginBottom: "5px"
    },
    dataValue: {
      color: "#222",
      fontSize: "1rem",
      wordBreak: "break-word"
    },
    emptyText: { textAlign: "center", padding: "20px", color: "#666", fontStyle: "italic" }
  };

  const renderTable = () => {
    if (loading) return <p style={{ padding: "20px" }}>Cargando datos...</p>;
    
    return (
      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>ID Eliminación</th>
              <th style={styles.th}>Fecha</th>
              <th style={styles.th}>Usuario</th>
              <th style={styles.th}>Motivo</th>
              <th style={styles.th}>Referencia</th>
              <th style={{ ...styles.th, textAlign: "center" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {registros.map((row) => (
              <tr key={row.id_eliminacion}>
                <td style={styles.td}>{row.id_eliminacion}</td>
                <td style={styles.td}>{formatValue(row.fecha_eliminacion)}</td>
                <td style={styles.td}>{row.nombre_usuario_ejecutor || row.usuario_id}</td>
                <td style={styles.td}>{row.motivo_eliminacion}</td>
                <td style={styles.td}>{row.identificador_principal}</td>
                <td style={styles.td}>
                  <button style={styles.btnConsultar} onClick={() => abrirModal(row)}>
                    🔍 Consultar
                  </button>
                </td>
              </tr>
            ))}
            {registros.length === 0 && (
              <tr>
                <td colSpan="6" style={{ ...styles.td, textAlign: "center", fontStyle: "italic", color: "#666" }}>
                  No hay registros de auditoría disponibles.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2>Cementerio de Auditoría (Tablas Sombra)</h2>
        <p style={{ margin: 0, color: "#666" }}>Visualización "Master-Detail" de registros eliminados.</p>
      </div>

      {/* Pestañas Superiores */}
      <div style={styles.tabsContainer}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            style={styles.tabButton(activeTab === tab.id)}
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
        <div style={styles.modalOverlay} onClick={cerrarModal}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Detalles del Registro #{modalData.id_eliminacion}</h3>
              <button style={styles.btnCerrar} onClick={cerrarModal}>
                Cerrar
              </button>
            </div>
            <div style={styles.modalBody}>
              {/* 1. Mostrar la fotografía de nombres legibles destacada */}
              {modalData.detalles_legibles && Object.entries(modalData.detalles_legibles).map(([key, value]) => (
                <div key={`legible-${key}`} style={{...styles.dataGroup, backgroundColor: "#e8f4fd", borderColor: "#b8daff"}}>
                  <span style={{...styles.dataLabel, color: "#0056b3"}}>{key}</span>
                  <span style={styles.dataValue}>{value}</span>
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
                  <div key={key} style={styles.dataGroup}>
                    <span style={styles.dataLabel}>{key.replace(/_/g, " ")}</span>
                    <span style={styles.dataValue}>
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
