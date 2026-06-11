import { useState, useEffect } from 'react';
import axios from 'axios';

const Proveedores = () => {
  // 1. Estados de la aplicación (Memoria de la pantalla)
  const [proveedores, setProveedores] = useState([]);
  const [ruc, setRuc] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [categoria, setCategoria] = useState('NACIONAL'); // 'NACIONAL' por defecto para coincidir con la base de datos
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  // 2. Efecto de carga inicial
  useEffect(() => {
    cargarProveedores();
  }, []);

  // 3. Función GET: Traer datos desde PostgreSQL
  const cargarProveedores = async () => {
    try {
      const token = localStorage.getItem('token');
      const respuesta = await axios.get('http://127.0.0.1:8000/proveedores/', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProveedores(respuesta.data);
    } catch (error) {
      console.error('Error al cargar:', error);
      setMensaje({ texto: 'No se pudo conectar con la base de datos.', tipo: 'error' });
    }
  };

  // 4. Función POST: Enviar datos a PostgreSQL con la nueva categoría
  const registrarProveedor = async (e) => {
    e.preventDefault();
    setMensaje({ texto: 'Guardando...', tipo: 'info' });

    try {
      const token = localStorage.getItem('token');
      
      // Armamos el objeto con el campo de categoría incluido
      // CORRECCIÓN: El backend espera 'nombre', no 'razon_social'
      const payload = {
        ruc: ruc,
        nombre: razonSocial,
        categoria: categoria
      };

      await axios.post('http://127.0.0.1:8000/proveedores/', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Limpieza y recarga en caso de éxito
      setRuc('');
      setRazonSocial('');
      setCategoria('NACIONAL');
      setMensaje({ texto: '✅ Proveedor registrado con éxito.', tipo: 'exito' });
      cargarProveedores(); 

    } catch (error) {
      console.error('Error al guardar:', error);
      setMensaje({ texto: '❌ Error al registrar el proveedor. Verifica los datos.', tipo: 'error' });
    }
  };

  return (
    <div style={{ padding: '30px', color: '#2c3e50', fontFamily: 'sans-serif' }}>
      <h2 style={{ borderBottom: '2px solid #3498db', paddingBottom: '10px' }}>Maestro de Proveedores</h2>

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

      {/* Formulario de Registro Ampliado */}
      <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px', marginBottom: '30px', border: '1px solid #ddd' }}>
        <h4 style={{ marginTop: 0, color: '#7f8c8d' }}>Registrar Nuevo Proveedor</h4>
        <form onSubmit={registrarProveedor} style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontSize: '14px', fontWeight: 'bold' }}>RUC / Tax ID</label>
            <input 
              type="text" 
              value={ruc} 
              onChange={(e) => setRuc(e.target.value)} 
              required 
              maxLength="15" // Extendemos por si los extranjeros usan códigos más largos
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

          {/* Nuevo campo de selección para la Categoría */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', width: '150px' }}>
            <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Categoría</label>
            <select 
              value={categoria} 
              onChange={(e) => setCategoria(e.target.value)}
              style={{ 
                padding: '8px', 
                border: '1px solid #ccc', 
                borderRadius: '4px', 
                backgroundColor: 'white', 
                color: 'black', 
                height: '35px',
                cursor: 'pointer'
              }}
            >
              <option value="NACIONAL" style={{ color: 'black' }}>🇵🇪 Nacional</option>
              <option value="EXTRANJERO" style={{ color: 'black' }}>✈️ Extranjero</option>
            </select>
          </div>

          <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', height: '33px' }}>
            GUARDAR
          </button>
        </form>
      </div>

      {/* Tabla de Datos Ampliada */}
      <h4 style={{ color: '#7f8c8d' }}>Proveedores Registrados</h4>
      <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <thead>
          <tr style={{ backgroundColor: '#34495e', color: 'white', textAlign: 'left' }}>
            <th style={{ padding: '12px' }}>ID</th>
            <th style={{ padding: '12px' }}>RUC / Tax ID</th>
            <th style={{ padding: '12px' }}>Razón Social</th>
            <th style={{ padding: '12px' }}>Categoría</th>
          </tr>
        </thead>
        <tbody>
          {proveedores.length === 0 ? (
            <tr>
              <td colSpan="4" style={{ padding: '15px', textAlign: 'center', color: '#7f8c8d' }}>No hay proveedores registrados aún.</td>
            </tr>
          ) : (
            proveedores.map((prov) => (
              <tr key={prov.id_proveedor} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '12px' }}>{prov.id_proveedor}</td>
                <td style={{ padding: '12px', fontWeight: 'bold' }}>{prov.ruc}</td>
                {/* CORRECCIÓN: El backend devuelve 'nombre' */}
                <td style={{ padding: '12px' }}>{prov.nombre}</td>
                <td style={{ padding: '12px' }}>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    backgroundColor: prov.categoria === 'NACIONAL' ? '#e1f5fe' : '#fff3e0',
                    color: prov.categoria === 'NACIONAL' ? '#0288d1' : '#f57c00'
                  }}>
                    {prov.categoria === 'NACIONAL' ? 'Nacional' : 'Extranjero'}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default Proveedores;
