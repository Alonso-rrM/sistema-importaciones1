import { useState, useEffect } from 'react';
import axios from 'axios';
import Select from 'react-select';

const Logistica = () => {
  const [opcionesImportadores, setOpcionesImportadores] = useState([]);
  const [opcionesAgentes, setOpcionesAgentes] = useState([]);
  const [opcionesProveedores, setOpcionesProveedores] = useState([]);
  const [opcionesAlmacenes, setOpcionesAlmacenes] = useState([]);

  // Estado Inicial para poder limpiar el formulario fácilmente
  const estadoInicialCabecera = {
    numero_factura: '',
    documento_transporte: '',
    id_importador: null,
    id_agente: null,
    id_proveedor: null,
    id_almacen: null,
    fob_usd: '',
    flete_usd: '',
    tipo_valor: 'DEFINITIVO',
    n_cont_fisico: '',
    fecha_embarque: '',
    fecha_arribo: '',
    status_llegada: 'EN TRÁNSITO',
    estado_levante: 'SIN LEVANTE',
    venta_sucesiva: ''
  };

  const [cabecera, setCabecera] = useState(estadoInicialCabecera);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  useEffect(() => {
    cargarCatalogos();
  }, []);

  const cargarCatalogos = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };

      const [resImportadores, resAgentes, resProveedores, resAlmacenes] = await Promise.all([
        axios.get('http://127.0.0.1:8000/importadores/', config),
        axios.get('http://127.0.0.1:8000/agentes/', config),
        axios.get('http://127.0.0.1:8000/proveedores/', config),
        axios.get('http://127.0.0.1:8000/almacenes/', config)
      ]);

      setOpcionesImportadores(resImportadores.data.map(imp => ({
        value: imp.id_importador,
        label: `${imp.ruc} - ${imp.nombre}`
      })));

      setOpcionesAgentes(resAgentes.data.map(ag => ({
        value: ag.id_agente,
        label: ag.nombre
      })));

      setOpcionesProveedores(resProveedores.data.map(prov => ({
        value: prov.id_proveedor,
        label: `${prov.ruc} - ${prov.nombre}` 
      })));

      setOpcionesAlmacenes(resAlmacenes.data.map(alm => ({
        value: alm.id_almacen,
        label: alm.nombre
      })));

    } catch (error) {
      console.error('Error al cargar catálogos:', error);
      setMensaje({ texto: 'Error de conexión con la base de datos.', tipo: 'error' });
    }
  };

  const handleChangeTexto = (e) => {
    setCabecera({ ...cabecera, [e.target.name]: e.target.value });
  };

  // CÁLCULO EN VIVO DEL CFR (Reactivo)
  const cfrCalculado = (parseFloat(cabecera.fob_usd || 0) + parseFloat(cabecera.flete_usd || 0)).toFixed(2);

  const registrarMaestro = async (e) => {
    e.preventDefault();
    setMensaje({ texto: 'Guardando cabecera...', tipo: 'info' });

    if (!cabecera.id_importador || !cabecera.id_agente || !cabecera.id_proveedor) {
      setMensaje({ texto: '❌ Debes seleccionar Importador, Agente y Proveedor.', tipo: 'error' });
      return;
    }

    try {
      const token = localStorage.getItem('token');
      
      const payload = { ...cabecera };
      // Limpieza estricta para FastAPI
      if (!payload.fecha_embarque) delete payload.fecha_embarque;
      if (!payload.fecha_arribo) delete payload.fecha_arribo;
      if (!payload.n_cont_fisico) delete payload.n_cont_fisico;
      if (!payload.id_almacen) delete payload.id_almacen;
      if (!payload.venta_sucesiva) delete payload.venta_sucesiva;

      await axios.post('http://127.0.0.1:8000/maestros/', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // ÉXITO: Mostramos mensaje y LIMPIAMOS el formulario
      setMensaje({ texto: '✅ Factura registrada con éxito. Lista para procesar.', tipo: 'exito' });
      setCabecera(estadoInicialCabecera);

    } catch (error) {
      console.error('Error al guardar maestro:', error);
      setMensaje({ texto: '❌ Error al registrar. Verifica la conexión o datos duplicados.', tipo: 'error' });
    }
  };

  // Estilo reutilizable para los inputs de moneda
  const estiloInputMoneda = { width: '100%', padding: '8px 8px 8px 25px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' };

  return (
    <div style={{ padding: '30px', color: '#2c3e50', fontFamily: 'sans-serif' }}>
      <h2 style={{ borderBottom: '2px solid #3498db', paddingBottom: '10px' }}>Registro de Logística (Maestro-Detalle)</h2>

      {mensaje.texto && (
        <div style={{ padding: '10px', marginBottom: '20px', borderRadius: '5px', backgroundColor: mensaje.tipo === 'error' ? '#ffcccc' : mensaje.tipo === 'exito' ? '#ccffcc' : '#e6f2ff', color: mensaje.tipo === 'error' ? '#cc0000' : mensaje.tipo === 'exito' ? '#006600' : '#004080' }}>
          {mensaje.texto}
        </div>
      )}

      <form onSubmit={registrarMaestro} style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h4 style={{ margin: 0, color: '#7f8c8d' }}>Datos Generales de la Factura de Importación</h4>
            <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                💾 GUARDAR CABECERA
            </button>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          
          {/* Columna Izquierda: Documentos y Montos */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 2 }}>
                    <label style={{ fontSize: '14px', fontWeight: 'bold' }}>N° Factura</label>
                    <input type="text" name="numero_factura" value={cabecera.numero_factura} onChange={handleChangeTexto} required style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} placeholder="Ej: F001-9999" />
                </div>
                <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Tipo Valor</label>
                    <select name="tipo_valor" value={cabecera.tipo_valor} onChange={handleChangeTexto} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}>
                        <option value="DEFINITIVO">Definitivo</option>
                        <option value="PROVISIONAL">Provisional</option>
                    </select>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Doc. Transporte (BL/AWB)</label>
                    <input type="text" name="documento_transporte" value={cabecera.documento_transporte} onChange={handleChangeTexto} required style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} />
                </div>
                <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Contenedor Físico</label>
                    <input type="text" name="n_cont_fisico" value={cabecera.n_cont_fisico} onChange={handleChangeTexto} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} placeholder="Ej: HLXU1234567" />
                </div>
            </div>

            {/* SECCIÓN MONETARIA CON CÁLCULO CFR */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <label style={{ fontSize: '14px', fontWeight: 'bold' }}>FOB (USD)</label>
                <span style={{ position: 'absolute', left: '10px', top: '34px', color: '#7f8c8d', fontWeight: 'bold' }}>$</span>
                <input type="number" step="0.01" name="fob_usd" value={cabecera.fob_usd} onChange={handleChangeTexto} required style={estiloInputMoneda} placeholder="0.00" />
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Flete (USD)</label>
                <span style={{ position: 'absolute', left: '10px', top: '34px', color: '#7f8c8d', fontWeight: 'bold' }}>$</span>
                <input type="number" step="0.01" name="flete_usd" value={cabecera.flete_usd} onChange={handleChangeTexto} required style={estiloInputMoneda} placeholder="0.00" />
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#2980b9' }}>CFR Total (USD)</label>
                <span style={{ position: 'absolute', left: '10px', top: '34px', color: '#2c3e50', fontWeight: 'bold' }}>$</span>
                <input type="text" value={cfrCalculado} readOnly disabled style={{ width: '100%', padding: '8px 8px 8px 25px', border: '1px solid #3498db', borderRadius: '4px', backgroundColor: '#e8f4f8', fontWeight: 'bold', color: '#2c3e50', boxSizing: 'border-box' }} />
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Fecha Embarque</label>
                <input type="date" name="fecha_embarque" value={cabecera.fecha_embarque} onChange={handleChangeTexto} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Fecha Arribo</label>
                <input type="date" name="fecha_arribo" value={cabecera.fecha_arribo} onChange={handleChangeTexto} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} />
              </div>
            </div>

            {/* FILA DE ESTADOS Y VENTA SUCESIVA */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Status Llegada</label>
                <select name="status_llegada" value={cabecera.status_llegada} onChange={handleChangeTexto} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}>
                    <option value="EN TRÁNSITO">En Tránsito</option>
                    <option value="EN PUERTO">En Puerto</option>
                    <option value="EN ALMACÉN">En Almacén</option>
                    <option value="ENTREGADO">Entregado</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Estado Levante</label>
                <select name="estado_levante" value={cabecera.estado_levante} onChange={handleChangeTexto} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}>
                    <option value="SIN LEVANTE">Sin Levante</option>
                    <option value="CON LEVANTE">Con Levante</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Venta Sucesiva</label>
                <input type="text" name="venta_sucesiva" value={cabecera.venta_sucesiva} onChange={handleChangeTexto} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} placeholder="Opcional" />
              </div>
            </div>
          </div>

          {/* Columna Derecha: Buscadores Inteligentes */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ zIndex: 3 }}>
              <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Importador</label>
              <Select 
                options={opcionesImportadores} 
                value={opcionesImportadores.find(op => op.value === cabecera.id_importador) || null}
                placeholder="Buscar por nombre o RUC..."
                isClearable
                onChange={(opcion) => setCabecera({ ...cabecera, id_importador: opcion ? opcion.value : null })}
              />
            </div>
            <div style={{ zIndex: 2 }}>
              <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Agente de Aduanas</label>
              <Select 
                options={opcionesAgentes} 
                value={opcionesAgentes.find(op => op.value === cabecera.id_agente) || null}
                placeholder="Buscar agente..."
                isClearable
                onChange={(opcion) => setCabecera({ ...cabecera, id_agente: opcion ? opcion.value : null })}
              />
            </div>
            <div style={{ zIndex: 1 }}>
              <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Proveedor (Shipper)</label>
              <Select 
                options={opcionesProveedores} 
                value={opcionesProveedores.find(op => op.value === cabecera.id_proveedor) || null}
                placeholder="Buscar proveedor..."
                isClearable
                onChange={(opcion) => setCabecera({ ...cabecera, id_proveedor: opcion ? opcion.value : null })}
              />
            </div>
            <div>
              <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Almacén</label>
              <Select 
                options={opcionesAlmacenes} 
                value={opcionesAlmacenes.find(op => op.value === cabecera.id_almacen) || null}
                placeholder="Buscar almacén..."
                isClearable
                onChange={(opcion) => setCabecera({ ...cabecera, id_almacen: opcion ? opcion.value : null })}
              />
            </div>
          </div>

        </div>
      </form>
      
      {/* Marcador de posición para la Fase 2: Las DAMs */}
      <div style={{ marginTop: '30px', padding: '20px', border: '2px dashed #bdc3c7', textAlign: 'center', color: '#7f8c8d', borderRadius: '8px' }}>
        <h3>[ Área de Detalle: Tabla de DAMs ]</h3>
        <p>Aparecerá aquí una vez que la Cabecera sea registrada con éxito para vincularlas a este Maestro.</p>
      </div>

    </div>
  );
};

export default Logistica;
