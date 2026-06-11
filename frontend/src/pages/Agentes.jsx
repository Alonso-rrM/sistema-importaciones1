import { useState, useEffect } from 'react';
import axios from 'axios';

const Agentes = () => {
  const [agentes, setAgentes] = useState([]);
  const [nombre, setNombre] = useState('');
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  useEffect(() => {
    cargarAgentes();
  }, []);

  const cargarAgentes = async () => {
    try {
      const token = localStorage.getItem('token');
      const respuesta = await axios.get('http://127.0.0.1:8000/agentes/', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAgentes(respuesta.data);
    } catch (error) {
      console.error('Error al cargar:', error);
      setMensaje({ texto: 'No se pudo conectar con la base de datos.', tipo: 'error' });
    }
  };

  const registrarAgente = async (e) => {
    e.preventDefault();
    setMensaje({ texto: 'Guardando...', tipo: 'info' });

    try {
      const token = localStorage.getItem('token');
      const payload = { nombre: nombre };

      await axios.post('http://127.0.0.1:8000/agentes/', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setNombre('');
      setMensaje({ texto: '✅ Agente de Aduanas registrado con éxito.', tipo: 'exito' });
      cargarAgentes();

    } catch (error) {
      console.error('Error al guardar:', error);
      setMensaje({ texto: '❌ Error al registrar el agente. Verifica los datos.', tipo: 'error' });
    }
  };

  return (
    <div style={{ padding: '30px', color: '#2c3e50', fontFamily: 'sans-serif' }}>
      <h2 style={{ borderBottom: '2px solid #3498db', paddingBottom: '10px' }}>Maestro de Agentes de Aduanas</h2>

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
        <h4 style={{ marginTop: 0, color: '#7f8c8d' }}>Registrar Nuevo Agente de Aduanas</h4>
        <form onSubmit={registrarAgente} style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flexGrow: 1, minWidth: '250px' }}>
            <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Nombre del Agente</label>
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

      <h4 style={{ color: '#7f8c8d' }}>Agentes Registrados</h4>
      <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <thead>
          <tr style={{ backgroundColor: '#34495e', color: 'white', textAlign: 'left' }}>
            <th style={{ padding: '12px' }}>ID</th>
            <th style={{ padding: '12px' }}>Nombre del Agente</th>
          </tr>
        </thead>
        <tbody>
          {agentes.length === 0 ? (
            <tr>
              <td colSpan="2" style={{ padding: '15px', textAlign: 'center', color: '#7f8c8d' }}>No hay agentes registrados aún.</td>
            </tr>
          ) : (
            agentes.map((ag) => (
              <tr key={ag.id_agente} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '12px' }}>{ag.id_agente}</td>
                <td style={{ padding: '12px', fontWeight: 'bold' }}>{ag.nombre}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default Agentes;
