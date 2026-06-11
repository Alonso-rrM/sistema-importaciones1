import { useState, useEffect } from 'react';
import axios from 'axios';

const Importadores = () => {
  // 1. Estados de la aplicación (Memoria de la pantalla)
  const [importadores, setImportadores] = useState([]);
  const [ruc, setRuc] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  // 2. Efecto de carga inicial
  useEffect(() => {
    cargarImportadores();
  }, []);

  // 3. Función GET: Traer datos desde PostgreSQL
  const cargarImportadores = async () => {
    try {
      const token = localStorage.getItem('token');
      // CORRECCIÓN: El endpoint de FastAPI es en minúsculas 'importadores'
      const respuesta = await axios.get('http://127.0.0.1:8000/importadores/', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setImportadores(respuesta.data);
    } catch (error) {
      console.error('Error al cargar:', error);
      setMensaje({ texto: 'No se pudo conectar con la base de datos.', tipo: 'error' });
    }
  };

  // 4. Función POST: Enviar datos a PostgreSQL
  const registrarImportador = async (e) => {
    e.preventDefault();
    setMensaje({ texto: 'Guardando...', tipo: 'info' });

    try {
      const token = localStorage.getItem('token');
      
      // CORRECCIÓN: El backend espera 'nombre' y 'ruc' para CatImportadorCreate. No existe 'categoria'.
      const payload = {
        ruc: ruc,
        nombre: razonSocial
      };

      // CORRECCIÓN: El endpoint es en minúsculas 'importadores'
      await axios.post('http://127.0.0.1:8000/importadores/', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Limpieza y recarga en caso de éxito
      setRuc('');
      setRazonSocial('');
      setMensaje({ texto: '✅ Importador registrado con éxito.', tipo: 'exito' });
      cargarImportadores(); 

    } catch (error) {
      console.error('Error al guardar:', error);
      setMensaje({ texto: '❌ Error al registrar el importador. Verifica los datos.', tipo: 'error' });
    }
  };

  return (
    <div style={{ padding: '30px', color: '#2c3e50', fontFamily: 'sans-serif' }}>
      <h2 style={{ borderBottom: '2px solid #3498db', paddingBottom: '10px' }}>Maestro de Importadores</h2>

      {/* Alertas del sistema */}
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

      {/* Formulario de Registro */}
      <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px', marginBottom: '30px', border: '1px solid #ddd' }}>
        <h4 style={{ marginTop: 0, color: '#7f8c8d' }}>Registrar Nuevo Importador</h4>
        <form onSubmit={registrarImportador} style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontSize: '14px', fontWeight: 'bold' }}>RUC / Tax ID</label>
            <input 
              type="text" 
              value={ruc} 
              onChange={(e) => setRuc(e.target.value)} 
              required 
              maxLength="15"
              style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', width: '150px' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flexGrow: 1, minWidth: '250px' }}>
            <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Razón Social</label>
            <input 
              type="text" 
              value={razonSocial} 
              onChange={(e) => setRazonSocial(e.target.value)} 
              required 
              style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', width: '100%' }}
            />
          </div>

          <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', height: '35px' }}>
            GUARDAR
          </button>
        </form>
      </div>

      {/* Tabla de Datos */}
      <h4 style={{ color: '#7f8c8d' }}>Importadores Registrados</h4>
      <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <thead>
          <tr style={{ backgroundColor: '#34495e', color: 'white', textAlign: 'left' }}>
            <th style={{ padding: '12px' }}>ID</th>
            <th style={{ padding: '12px' }}>RUC / Tax ID</th>
            <th style={{ padding: '12px' }}>Razón Social</th>
          </tr>
        </thead>
        <tbody>
          {importadores.length === 0 ? (
            <tr>
              <td colSpan="3" style={{ padding: '15px', textAlign: 'center', color: '#7f8c8d' }}>No hay Importadores registrados aún.</td>
            </tr>
          ) : (
            importadores.map((imp) => (
              <tr key={imp.id_importador} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '12px' }}>{imp.id_importador}</td>
                <td style={{ padding: '12px', fontWeight: 'bold' }}>{imp.ruc}</td>
                <td style={{ padding: '12px' }}>{imp.nombre}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default Importadores;
