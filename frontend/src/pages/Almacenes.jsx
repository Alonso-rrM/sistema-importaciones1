import { useState, useEffect } from 'react';
import axios from 'axios';

const Almacenes = () => {
  const [almacenes, setAlmacenes] = useState([]);
  const [nombre, setNombre] = useState('');
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  useEffect(() => {
    cargarAlmacenes();
  }, []);

  const cargarAlmacenes = async () => {
    try {
      const token = localStorage.getItem('token');
      const respuesta = await axios.get('http://127.0.0.1:8000/almacenes/', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAlmacenes(respuesta.data);
    } catch (error) {
      console.error('Error al cargar:', error);
      setMensaje({ texto: 'No se pudo conectar con la base de datos.', tipo: 'error' });
    }
  };

  const registrarAlmacen = async (e) => {
    e.preventDefault();
    setMensaje({ texto: 'Guardando...', tipo: 'info' });

    try {
      const token = localStorage.getItem('token');
      const payload = { nombre: nombre };

      await axios.post('http://127.0.0.1:8000/almacenes/', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setNombre('');
      setMensaje({ texto: '✅ Almacén registrado con éxito.', tipo: 'exito' });
      cargarAlmacenes();

    } catch (error) {
      console.error('Error al guardar:', error);
      setMensaje({ texto: '❌ Error al registrar el almacén. Verifica los datos.', tipo: 'error' });
    }
  };

  return (
    <div style={{ padding: '30px', color: '#2c3e50', fontFamily: 'sans-serif' }}>
      <h2 style={{ borderBottom: '2px solid #3498db', paddingBottom: '10px' }}>Maestro de Almacenes</h2>

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

      <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px', marginBottom: '30px', border: '1px solid #ddd' }}>
        <h4 style={{ marginTop: 0, color: '#7f8c8d' }}>Registrar Nuevo Almacén</h4>
        <form onSubmit={registrarAlmacen} style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flexGrow: 1, minWidth: '250px' }}>
            <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Nombre del Almacén</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', width: '100%' }}
            />
          </div>

          <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', height: '35px' }}>
            GUARDAR
          </button>
        </form>
      </div>

      <h4 style={{ color: '#7f8c8d' }}>Almacenes Registrados</h4>
      <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <thead>
          <tr style={{ backgroundColor: '#34495e', color: 'white', textAlign: 'left' }}>
            <th style={{ padding: '12px' }}>ID</th>
            <th style={{ padding: '12px' }}>Nombre del Almacén</th>
          </tr>
        </thead>
        <tbody>
          {almacenes.length === 0 ? (
            <tr>
              <td colSpan="2" style={{ padding: '15px', textAlign: 'center', color: '#7f8c8d' }}>No hay almacenes registrados aún.</td>
            </tr>
          ) : (
            almacenes.map((alm) => (
              <tr key={alm.id_almacen} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '12px' }}>{alm.id_almacen}</td>
                <td style={{ padding: '12px', fontWeight: 'bold' }}>{alm.nombre}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default Almacenes;
