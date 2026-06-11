import { useState, useEffect } from 'react';
import axios from 'axios';

const Conceptos = () => {
  // 1. Estados
  const [conceptos, setConceptos] = useState([]);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  // 2. Carga inicial
  useEffect(() => {
    cargarConceptos();
  }, []);

  // 3. GET — Listar conceptos activos
  const cargarConceptos = async () => {
    try {
      const token = localStorage.getItem('token');
      const respuesta = await axios.get('http://127.0.0.1:8000/conceptos/', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setConceptos(respuesta.data);
    } catch (error) {
      console.error('Error al cargar:', error);
      setMensaje({ texto: 'No se pudo conectar con la base de datos.', tipo: 'error' });
    }
  };

  // 4. POST — Registrar nuevo concepto
  const registrarConcepto = async (e) => {
    e.preventDefault();
    setMensaje({ texto: 'Guardando...', tipo: 'info' });

    try {
      const token = localStorage.getItem('token');
      const payload = {
        nombre: nombre,
        descripcion: descripcion || null
      };

      await axios.post('http://127.0.0.1:8000/conceptos/', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setNombre('');
      setDescripcion('');
      setMensaje({ texto: '✅ Concepto de gasto registrado con éxito.', tipo: 'exito' });
      cargarConceptos();

    } catch (error) {
      console.error('Error al guardar:', error);
      const detalle = error.response?.data?.detail || 'Verifica que no esté duplicado.';
      setMensaje({ texto: `❌ Error: ${detalle}`, tipo: 'error' });
    }
  };

  // 5. DELETE — Eliminación lógica (INACTIVO)
  const eliminarConcepto = async (id_concepto, nombreConcepto) => {
    const confirmar = window.confirm(`¿Estás seguro de eliminar el concepto "${nombreConcepto}"?\nEsta acción lo marcará como INACTIVO.`);
    if (!confirmar) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`http://127.0.0.1:8000/conceptos/${id_concepto}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setMensaje({ texto: `✅ Concepto "${nombreConcepto}" eliminado correctamente.`, tipo: 'exito' });
      cargarConceptos();

    } catch (error) {
      console.error('Error al eliminar:', error);
      const detalle = error.response?.data?.detail || 'No se pudo eliminar el concepto.';
      setMensaje({ texto: `❌ Error: ${detalle}`, tipo: 'error' });
    }
  };

  return (
    <div style={{ padding: '30px', color: '#2c3e50', fontFamily: 'sans-serif' }}>
      <h2 style={{ borderBottom: '2px solid #3498db', paddingBottom: '10px' }}>Catálogo de Conceptos de Gasto</h2>

      {/* Mensaje de retroalimentación */}
      {mensaje.texto && (
        <div style={{
          padding: '10px',
          marginBottom: '20px',
          backgroundColor: mensaje.tipo === 'error' ? '#ffcccc' : mensaje.tipo === 'exito' ? '#ccffcc' : '#e6f2ff',
          color: mensaje.tipo === 'error' ? '#cc0000' : mensaje.tipo === 'exito' ? '#006600' : '#004080',
          borderRadius: '5px'
        }}>
          {mensaje.texto}
        </div>
      )}

      {/* Formulario de registro */}
      <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px', marginBottom: '30px', border: '1px solid #ddd' }}>
        <h4 style={{ marginTop: 0, color: '#7f8c8d' }}>Registrar Nuevo Concepto</h4>
        <form onSubmit={registrarConcepto} style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', minWidth: '250px', flex: 1 }}>
            <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Nombre del Concepto</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Flete Marítimo, Arancel Ad Valorem..."
              required
              style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', minWidth: '250px', flex: 1 }}>
            <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Descripción (Opcional)</label>
            <input
              type="text"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Breve descripción del concepto..."
              style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', width: '100%' }}
            />
          </div>

          <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', height: '35px' }}>
            GUARDAR
          </button>
        </form>
      </div>

      {/* Tabla de conceptos activos */}
      <h4 style={{ color: '#7f8c8d' }}>Conceptos Registrados ({conceptos.length})</h4>
      <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <thead>
          <tr style={{ backgroundColor: '#34495e', color: 'white', textAlign: 'left' }}>
            <th style={{ padding: '12px', width: '60px' }}>ID</th>
            <th style={{ padding: '12px' }}>Nombre</th>
            <th style={{ padding: '12px' }}>Descripción</th>
            <th style={{ padding: '12px', width: '100px' }}>Estado</th>
            <th style={{ padding: '12px', width: '100px', textAlign: 'center' }}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {conceptos.length === 0 ? (
            <tr>
              <td colSpan="5" style={{ padding: '15px', textAlign: 'center', color: '#7f8c8d' }}>No hay conceptos de gasto registrados aún.</td>
            </tr>
          ) : (
            conceptos.map((concepto) => (
              <tr key={concepto.id_concepto} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '12px' }}>{concepto.id_concepto}</td>
                <td style={{ padding: '12px', fontWeight: 'bold' }}>{concepto.nombre}</td>
                <td style={{ padding: '12px', color: '#7f8c8d' }}>{concepto.descripcion || '—'}</td>
                <td style={{ padding: '12px' }}>
                  <span style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    backgroundColor: '#ccffcc',
                    color: '#006600'
                  }}>
                    {concepto.estado_registro}
                  </span>
                </td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <button
                    onClick={() => eliminarConcepto(concepto.id_concepto, concepto.nombre)}
                    style={{
                      padding: '5px 12px',
                      backgroundColor: '#e74c3c',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}
                  >
                    ELIMINAR
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default Conceptos;
