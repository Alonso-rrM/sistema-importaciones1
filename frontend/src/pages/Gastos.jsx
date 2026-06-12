import { useState, useEffect } from 'react';
import axios from 'axios';
import Select from 'react-select';

const Gastos = () => {
  // --- ESTADOS: CATÁLOGOS RAW (Para filtrar después) ---
  const [maestrosRaw, setMaestrosRaw] = useState([]);
  const [damsRaw, setDamsRaw] = useState([]);
  
  // --- ESTADOS: OPCIONES PARA SELECTS ---
  const [opcionesMaestros, setOpcionesMaestros] = useState([]);
  const [opcionesConceptos, setOpcionesConceptos] = useState([]);
  const [opcionesProveedores, setOpcionesProveedores] = useState([]);
  const [opcionesTiposDoc, setOpcionesTiposDoc] = useState([]);

  // --- ESTADOS: FORMULARIO ---
  const estadoInicialForm = {
    id_maestro_temp: null, // Solo sirve para filtrar las DAMs, no se envía al POST
    id_dam: null,
    id_concepto: null,
    id_proveedor: null,
    id_tipo_doc: null,
    numero_documento: '',
    fecha_vencimiento: '',
    monto_usd: ''
  };

  const [form, setForm] = useState(estadoInicialForm);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });
  const [isGuardando, setIsGuardando] = useState(false);

  // --- CARGA INICIAL DE CATÁLOGOS ---
  useEffect(() => {
    cargarCatalogos();
  }, []);

  const cargarCatalogos = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };

      // Traemos todos los datos necesarios de golpe
      const [resMaestros, resDams, resConceptos, resProveedores, resTiposDoc] = await Promise.all([
        axios.get('http://127.0.0.1:8000/maestros/', config),
        axios.get('http://127.0.0.1:8000/dams/', config),
        axios.get('http://127.0.0.1:8000/conceptos/', config),
        axios.get('http://127.0.0.1:8000/proveedores/', config),
        axios.get('http://127.0.0.1:8000/tipos-documento/', config)
      ]);

      // Guardamos la data cruda para las relaciones Maestro -> DAM
      setMaestrosRaw(resMaestros.data);
      setDamsRaw(resDams.data);

      setOpcionesMaestros(resMaestros.data.map(m => ({ value: m.id_maestro, label: `Factura: ${m.numero_factura} (BL: ${m.documento_transporte})` })));
      setOpcionesConceptos(resConceptos.data.map(c => ({ value: c.id_concepto, label: c.nombre })));
      setOpcionesProveedores(resProveedores.data.map(p => ({ value: p.id_proveedor, label: `${p.ruc} - ${p.nombre}` })));
      
      // Asumiendo que el esquema trae 'id_tipo_doc' y 'nombre' o 'descripcion'
      setOpcionesTiposDoc(resTiposDoc.data.map(t => ({ 
        value: t.id_tipo_doc, // Adaptado según tu schema
        label: t.nombre_documento || t.nombre || t.descripcion 
      })));

    } catch (error) {
      console.error('Error al cargar catálogos:', error);
      setMensaje({ texto: 'Error de conexión. Verifica que los GET de /dams/ y /maestros/ existan en el backend.', tipo: 'error' });
    }
  };

  // --- FILTRO DINÁMICO DE DAMs ---
  const opcionesDamsFiltradas = damsRaw
    .filter(dam => dam.id_maestro === form.id_maestro_temp)
    .map(dam => ({ value: dam.id_dam, label: `DAM: ${dam.numero_de_dam}` }));

  // --- MANEJADORES DE ESTADO ---
  const handleChangeTexto = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  // --- MOTOR DE GUARDADO (POST /gastos/) ---
  const registrarGasto = async (e) => {
    e.preventDefault();
    
    // Validación estricta
    if (!form.id_dam || !form.id_concepto || !form.id_proveedor || !form.id_tipo_doc) {
      setMensaje({ texto: '❌ Faltan catálogos obligatorios (DAM, Concepto, Proveedor o Tipo de Doc).', tipo: 'error' });
      return;
    }

    setIsGuardando(true);
    setMensaje({ texto: 'Registrando gasto...', tipo: 'info' });

    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      
      // Armamos el payload exacto para RegistroGastoCreate
      const payload = {
        id_dam: form.id_dam,
        id_concepto: form.id_concepto,
        id_proveedor: form.id_proveedor,
        id_tipo_doc: form.id_tipo_doc,
        monto_usd: parseFloat(form.monto_usd),
        numero_documento: form.numero_documento || null,
        fecha_vencimiento: form.fecha_vencimiento || null
      };

      await axios.post('http://127.0.0.1:8000/gastos/', payload, config);

      setMensaje({ texto: '✅ Gasto registrado con éxito en la cuenta de la DAM.', tipo: 'exito' });
      
      // Limpiamos solo los datos del gasto, pero mantenemos el Maestro/DAM 
      // por si el usuario quiere registrar otro gasto (ej. Flete + Almacenaje) a la misma DAM
      setForm({
        ...form,
        id_concepto: null,
        id_tipo_doc: null,
        numero_documento: '',
        monto_usd: ''
      });

    } catch (error) {
      console.error('Error al registrar gasto:', error);
      if (error.response && error.response.status === 400) {
        setMensaje({ texto: `❌ Error 400: ${error.response.data.detail || 'Posible documento duplicado o regla de negocio rechazada.'}`, tipo: 'error' });
      } else {
        setMensaje({ texto: '❌ Error de conexión o validación de datos.', tipo: 'error' });
      }
    } finally {
      setIsGuardando(false);
    }
  };

  const estiloInput = { width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' };

  return (
    <div style={{ padding: '30px', color: '#2c3e50', fontFamily: 'sans-serif' }}>
      <h2 style={{ borderBottom: '2px solid #27ae60', paddingBottom: '10px' }}>Tesorería: Registro de Gastos Logísticos</h2>

      {mensaje.texto && (
        <div style={{ padding: '10px', marginBottom: '20px', borderRadius: '5px', backgroundColor: mensaje.tipo === 'error' ? '#ffcccc' : mensaje.tipo === 'exito' ? '#ccffcc' : '#e6f2ff', color: mensaje.tipo === 'error' ? '#cc0000' : mensaje.tipo === 'exito' ? '#006600' : '#004080' }}>
          {mensaje.texto}
        </div>
      )}

      <form onSubmit={registrarGasto} style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #ddd', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
        
        {/* FASE A Y B: ENLACE ADUANERO */}
        <div style={{ backgroundColor: '#f0f3f4', padding: '15px', borderRadius: '5px', marginBottom: '20px', borderLeft: '4px solid #3498db' }}>
          <h4 style={{ marginTop: 0, color: '#2980b9' }}>1. Vincular a Operación Aduanera</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div style={{ zIndex: 6 }}>
              <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Factura Maestra (Embarque)</label>
              <Select 
                options={opcionesMaestros} 
                value={opcionesMaestros.find(op => op.value === form.id_maestro_temp) || null}
                onChange={(op) => setForm({ ...form, id_maestro_temp: op ? op.value : null, id_dam: null })} 
                placeholder="Busca la factura principal..." 
                isClearable 
              />
            </div>
            <div style={{ zIndex: 5 }}>
              <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Declaración (DAM) Afectada *</label>
              <Select 
                options={opcionesDamsFiltradas} 
                value={opcionesDamsFiltradas.find(op => op.value === form.id_dam) || null}
                onChange={(op) => setForm({ ...form, id_dam: op ? op.value : null })} 
                placeholder={form.id_maestro_temp ? "Selecciona la DAM..." : "Primero selecciona un Maestro"} 
                isDisabled={!form.id_maestro_temp}
                isClearable 
              />
            </div>
          </div>
        </div>

        {/* FASE C: DETALLES DEL GASTO */}
        <h4 style={{ marginTop: 0, color: '#7f8c8d' }}>2. Detalle del Comprobante</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ zIndex: 4 }}>
              <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Proveedor (Emisor) *</label>
              <Select options={opcionesProveedores} value={opcionesProveedores.find(op => op.value === form.id_proveedor) || null} onChange={(op) => setForm({ ...form, id_proveedor: op ? op.value : null })} placeholder="Buscar proveedor..." isClearable />
            </div>
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1, zIndex: 3 }}>
                <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Tipo de Comprobante *</label>
                <Select options={opcionesTiposDoc} value={opcionesTiposDoc.find(op => op.value === form.id_tipo_doc) || null} onChange={(op) => setForm({ ...form, id_tipo_doc: op ? op.value : null })} placeholder="Factura, Recibo..." isClearable />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '14px', fontWeight: 'bold' }}>N° Documento</label>
                <input type="text" name="numero_documento" value={form.numero_documento} onChange={handleChangeTexto} style={estiloInput} placeholder="Ej: F001-123" />
                <small style={{ color: '#95a5a6', fontSize: '11px' }}>Se rellenará con ceros automáticamente.</small>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ zIndex: 2 }}>
              <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Concepto del Gasto (Ej. Flete, ZD) *</label>
              <Select options={opcionesConceptos} value={opcionesConceptos.find(op => op.value === form.id_concepto) || null} onChange={(op) => setForm({ ...form, id_concepto: op ? op.value : null })} placeholder="Flete, Almacenaje, Ajuste..." isClearable />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '14px', fontWeight: 'bold' }}>Fecha Vencimiento</label>
                <input type="date" name="fecha_vencimiento" value={form.fecha_vencimiento} onChange={handleChangeTexto} style={estiloInput} />
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#c0392b' }}>Monto Total (USD) *</label>
                <span style={{ position: 'absolute', left: '10px', top: '34px', color: '#7f8c8d', fontWeight: 'bold' }}>$</span>
                <input type="number" step="0.01" name="monto_usd" value={form.monto_usd} onChange={handleChangeTexto} required style={{ ...estiloInput, paddingLeft: '25px', borderColor: '#e74c3c' }} placeholder="0.00" />
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '25px', textAlign: 'right', borderTop: '1px solid #eee', paddingTop: '15px' }}>
          <button type="submit" disabled={isGuardando} style={{ padding: '12px 25px', backgroundColor: isGuardando ? '#95a5a6' : '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: isGuardando ? 'not-allowed' : 'pointer', fontSize: '15px', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', opacity: isGuardando ? 0.7 : 1 }}>
            {isGuardando ? '⏳ PROCESANDO...' : '💰 REGISTRAR GASTO'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Gastos;
