import React, { useState, useEffect } from "react";

const Auditoria = () => {
  const [activeTab, setActiveTab] = useState("maestros");
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const tabs = [
    { id: "maestros", label: "Maestros (Contenedores)" },
    { id: "dams", label: "DAMs" },
    { id: "gastos", label: "Gastos" },
    { id: "pagos", label: "Pagos" }
  ];

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
          setData(result);
        } else {
          console.error("Error al obtener los datos de auditoría");
          setData([]);
        }
      } catch (error) {
        console.error("Error de red:", error);
        setData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [activeTab]);

  // --- Estilos Inline ---
  const styles = {
    container: { padding: "20px", fontFamily: "Arial, sans-serif", color: "#333" },
    header: { borderBottom: "2px solid #eee", paddingBottom: "10px", marginBottom: "20px" },
    tabsContainer: { display: "flex", gap: "10px", marginBottom: "20px" },
    tabButton: (isActive) => ({
      padding: "10px 20px",
      cursor: "pointer",
      backgroundColor: isActive ? "#0d6efd" : "#f8f9fa",
      color: isActive ? "#fff" : "#333",
      border: "1px solid #dee2e6",
      borderRadius: "4px",
      fontWeight: isActive ? "bold" : "normal",
      transition: "background-color 0.2s"
    }),
    tableContainer: { overflowX: "auto", backgroundColor: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", borderRadius: "4px" },
    table: { width: "100%", borderCollapse: "collapse" },
    th: { backgroundColor: "#f8f9fa", padding: "12px 15px", textAlign: "left", borderBottom: "2px solid #dee2e6", fontWeight: "bold", whiteSpace: "nowrap", textTransform: "capitalize" },
    td: { padding: "12px 15px", borderBottom: "1px solid #dee2e6", verticalAlign: "middle", whiteSpace: "nowrap" },
    emptyText: { textAlign: "center", padding: "20px", color: "#666", fontStyle: "italic" }
  };

  const renderTable = () => {
    if (loading) return <p>Cargando datos...</p>;
    if (data.length === 0) return <p style={styles.emptyText}>No hay registros eliminados en esta categoría.</p>;

    // Extracción dinámica de columnas basada en el primer objeto del array
    const columns = Object.keys(data[0]);

    return (
      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col} style={styles.th}>{col.replace(/_/g, " ")}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, index) => (
              <tr key={index}>
                {columns.map((col) => (
                  <td key={col} style={styles.td}>
                    {/* Renderizado seguro para booleanos, nulos u objetos */}
                    {row[col] === null ? "N/A" : 
                     typeof row[col] === "boolean" ? (row[col] ? "Sí" : "No") : 
                     typeof row[col] === "object" ? JSON.stringify(row[col]) : 
                     String(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2>Cementerio de Auditoría (Tablas Sombra)</h2>
        <p style={{ margin: 0, color: "#666" }}>Visualización dinámica de registros eliminados por módulo.</p>
      </div>

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

      {renderTable()}
    </div>
  );
};

export default Auditoria;
