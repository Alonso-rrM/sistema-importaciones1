import { useState, useEffect } from 'react';
import axios from 'axios';

const Empresas = () => {
  const [empresas, setEmpresas] = useState([]);
  const [ruc, setRuc] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  useEffect(() => {
    cargarEmpresas();
  }, []);

  const cargarEmpresas = async () => {
    try {
      const token = localStorage.getItem('token');
      const respuesta = await axios.get('http://127.0.0.1:8000/empresas/', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEmpresas(respuesta.data);
    } catch (error) {
      console.error('Error al cargar:', error);
      setMensaje({ texto: 'No se pudo conectar con la base de datos.', tipo: 'error' });
    }
  };

  const registrarEmpresa = async (e) => {
    e.preventDefault();
    setMensaje({ texto: 'Guardando...', tipo: 'info' });

    try {
      const token = localStorage.getItem('token');
      const payload = {
        ruc: ruc,
        nombre: razonSocial
      };

      await axios.post('http://127.0.0.1:8000/empresas/', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setRuc('');
      setRazonSocial('');
      setMensaje({ texto: '✅ Empresa registrada con éxito.', tipo: 'exito' });
      cargarEmpresas();

    } catch (error) {
      console.error('Error al guardar:', error);
      setMensaje({ texto: '❌ Error al registrar la empresa. Verifica los datos.', tipo: 'error' });
    }
  };

  return (
    <div style={{ padding: '30px', color: '#2c3e50', fontFamily: 'sans-serif' }}>
      <h2 style={{ borderBottom: '2px solid #3498db', paddingBottom: '10px' }}>Maestro de Empresas</h2>

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
        <h4 style={{ marginTop: 0, color: '#7f8c8d' }}>Registrar Nueva Empresa</h4>
        <form onSubmit={registrarEmpresa} style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontSize: '14px', fontWeight: 'bold' }}>RUC</label>
            <input
              type="text"
              value={ruc}
              onChange={(e) => setRuc(e.target.value)}
              required
              maxLength="11"
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

      <h4 style={{ color: '#7f8c8d' }}>Empresas Registradas</h4>
      <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <thead>
          <tr style={{ backgroundColor: '#34495e', color: 'white', textAlign: 'left' }}>
            <th style={{ padding: '12px' }}>ID</th>
            <th style={{ padding: '12px' }}>RUC</th>
            <th style={{ padding: '12px' }}>Razón Social</th>
          </tr>
        </thead>
        <tbody>
          {empresas.length === 0 ? (
            <tr>
              <td colSpan="3" style={{ padding: '15px', textAlign: 'center', color: '#7f8c8d' }}>No hay empresas registradas aún.</td>
            </tr>
          ) : (
            empresas.map((emp) => (
              <tr key={emp.id_empresa} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '12px' }}>{emp.id_empresa}</td>
                <td style={{ padding: '12px', fontWeight: 'bold' }}>{emp.ruc}</td>
                <td style={{ padding: '12px' }}>{emp.nombre}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default Empresas;
