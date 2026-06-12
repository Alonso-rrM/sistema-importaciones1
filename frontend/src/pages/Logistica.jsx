import { useState, useEffect } from 'react';
import axios from 'axios';
import Select from 'react-select';

const Logistica = () => {
  // --- CATÁLOGOS ---
  const [opcionesImportadores, setOpcionesImportadores] = useState([]);
  const [opcionesAgentes, setOpcionesAgentes] = useState([]);
  const [opcionesProveedores, setOpcionesProveedores] = useState([]);
  const [opcionesAlmacenes, setOpcionesAlmacenes] = useState([]);
  const [listaMaestros, setListaMaestros] = useState([]);

  // --- ESTADOS DE LA PÁGINA ---
  const [idMaestroGuardado, setIdMaestroGuardado] = useState(null);
  const [damsRegistradas, setDamsRegistradas] = useState([]);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });
  const [cargandoCatalogos, setCargandoCatalogos] = useState(true);

  // --- ESTADO INICIAL CABECERA (MAESTRO) ---
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

  // --- ESTADO INICIAL DETALLE (DAM) ---
  const [nuevaDam, setNuevaDam] = useState({
    numero_de_dam: '',
    serie: '',
    canal_control: '',
    monto_valor_provisional_usd: '',
    aforo_realizado: false
  });

  // --- CARGA INICIAL ---
  useEffect(() => {
    const inicializar = async () => {
      setCargandoCatalogos(true);
      await Promise.all([cargarCatalogos(), cargarMaestros()]);
      setCargandoCatalogos(false);
    };
    inicializar();
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
      setMensaje({ texto: '❌ Error de conexión al cargar catálogos.', tipo: 'error' });
    }
  };

  const cargarMaestros = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const respuesta = await axios.get('http://127.0.0.1:8000/maestros/', config);
      setListaMaestros(respuesta.data.map(m => ({
        value: m.id_maestro,
        label: `N° Factura: ${m.numero_factura} | BL: ${m.documento_transporte || 'Sin Doc'} | FOB: $${m.fob_usd || '0'}`
      })));
    } catch (error) {
      console.error('Error al cargar maestros:', error);
    }
  };

  // --- MANEJO DE CAMBIOS ---
  const handleChangeTexto = (e) => {
    setCabecera({ ...cabecera, [e.target.name]: e.target.value });
  };

  // --- CÁLCULO CFR EN VIVO ---
  const cfrCalculado = (parseFloat(cabecera.fob_usd || 0) + parseFloat(cabecera.flete_usd || 0)).toFixed(2);

  // --- LIMPIEZA / RESET ---
  const limpiarTodo = () => {
    setCabecera(estadoInicialCabecera);
    setIdMaestroGuardado(null);
    setDamsRegistradas([]);
    setNuevaDam({
      numero_de_dam: '',
      serie: '',
      canal_control: '',
      monto_valor_provisional_usd: '',
      aforo_realizado: false
    });
    setMensaje({ texto: '', tipo: '' });
  };

  // --- DETALLE: MAPEADO DE DATOS BACKEND -> FRONTEND ---
  const mapBackendToCabecera = (backendData) => {
    return {
      numero_factura: backendData.numero_factura || '',
      documento_transporte: backendData.documento_transporte || '',
      id_importador: backendData.id_importador || null,
      id_agente: backendData.id_agente || null,
      id_proveedor: backendData.id_proveedor || null,
      id_almacen: backendData.id_almacen || null,
      fob_usd: backendData.fob_usd !== null && backendData.fob_usd !== undefined ? String(backendData.fob_usd) : '',
      flete_usd: backendData.flete_usd !== null && backendData.flete_usd !== undefined ? String(backendData.flete_usd) : '',
      tipo_valor: backendData.tipo_valor || 'DEFINITIVO',
      n_cont_fisico: backendData.n_cont_fisico || '',
      fecha_embarque: backendData.fecha_embarque || '',
      fecha_arribo: backendData.fecha_arribo || '',
      status_llegada: backendData.status_llegada || 'EN TRÁNSITO',
      estado_levante: backendData.estado_levante || 'SIN LEVANTE',
      venta_sucesiva: backendData.venta_sucesiva || ''
    };
  };

  const cleanCabeceraPayload = (rawCabecera) => {
    const payload = { ...rawCabecera };
    
    // Normalizar a nulo campos vacíos
    if (!payload.fecha_embarque) payload.fecha_embarque = null;
    if (!payload.fecha_arribo) payload.fecha_arribo = null;
    if (!payload.n_cont_fisico) payload.n_cont_fisico = null;
    if (!payload.id_almacen) payload.id_almacen = null;
    if (!payload.venta_sucesiva) payload.venta_sucesiva = null;
    if (!payload.documento_transporte) payload.documento_transporte = null;
    
    // Formatear numéricos
    payload.fob_usd = payload.fob_usd ? parseFloat(payload.fob_usd) : 0.00;
    payload.flete_usd = payload.flete_usd ? parseFloat(payload.flete_usd) : 0.00;
    
    // Quitar campos que el backend no necesita en el payload (o calcula él mismo)
    delete payload.id_maestro;
    delete payload.estado_levante;
    delete payload.cfr_usd;

    return payload;
  };

  // --- SELECCIONAR / CARGAR MAESTRO EXISTENTE ---
  const seleccionarMaestro = async (opcionSeleccionada) => {
    if (!opcionSeleccionada) {
      limpiarTodo();
      return;
    }

    setMensaje({ texto: '⏳ Cargando datos de la factura...', tipo: 'info' });
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      
      const respuesta = await axios.get(`http://127.0.0.1:8000/reporte-maestro/${opcionSeleccionada.value}`, config);
      const maestroData = respuesta.data;

      setCabecera(mapBackendToCabecera(maestroData));
      setIdMaestroGuardado(maestroData.id_maestro);
      setDamsRegistradas(maestroData.dams || []);
      setMensaje({ texto: '✅ Factura cargada correctamente.', tipo: 'exito' });
    } catch (error) {
      console.error('Error al cargar reporte maestro:', error);
      setMensaje({ texto: '❌ Error al cargar los detalles de la factura.', tipo: 'error' });
    }
  };

  // --- RECARGAR DAMS ---
  const recargarDams = async () => {
    if (!idMaestroGuardado) return;
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const respuesta = await axios.get(`http://127.0.0.1:8000/reporte-maestro/${idMaestroGuardado}`, config);
      
      setDamsRegistradas(respuesta.data.dams || []);
      setCabecera(prev => ({
        ...prev,
        estado_levante: respuesta.data.estado_levante
      }));
    } catch (error) {
      console.error('Error al recargar DAMs:', error);
    }
  };

  // --- ACCIONES MAESTRO ---
  const registrarMaestro = async (e) => {
    e.preventDefault();
    setMensaje({ texto: idMaestroGuardado ? '⏳ Actualizando cabecera...' : '⏳ Registrando cabecera...', tipo: 'info' });

    if (!cabecera.id_importador || !cabecera.id_agente || !cabecera.id_proveedor) {
      setMensaje({ texto: '❌ Debes seleccionar Importador, Agente y Proveedor.', tipo: 'error' });
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      
      const payload = cleanCabeceraPayload(cabecera);

      if (idMaestroGuardado) {
        const res = await axios.put(`http://127.0.0.1:8000/maestros/${idMaestroGuardado}`, payload, config);
        setCabecera(mapBackendToCabecera(res.data));
        setMensaje({ texto: '✅ Cabecera de importación actualizada con éxito.', tipo: 'exito' });
      } else {
        const res = await axios.post('http://127.0.0.1:8000/maestros/', payload, config);
        setIdMaestroGuardado(res.data.id_maestro);
        setCabecera(mapBackendToCabecera(res.data));
        setMensaje({ texto: '✅ Cabecera registrada con éxito. Ahora puedes registrar DAMs.', tipo: 'exito' });
      }

      cargarMaestros();
    } catch (error) {
      console.error('Error al guardar cabecera:', error);
      const errorDetail = error.response?.data?.detail || 'Error al guardar la cabecera.';
      setMensaje({ texto: `❌ ${JSON.stringify(errorDetail)}`, tipo: 'error' });
    }
  };

  // --- ACCIONES DETALLE (DAM) ---
  const registrarDam = async (e) => {
    e.preventDefault();
    if (!idMaestroGuardado) {
      setMensaje({ texto: '❌ Primero debes registrar o seleccionar una Cabecera.', tipo: 'error' });
      return;
    }

    if (!nuevaDam.numero_de_dam) {
      setMensaje({ texto: '❌ El número de DAM es obligatorio.', tipo: 'error' });
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };

      const payload = {
        id_maestro: idMaestroGuardado,
        numero_de_dam: nuevaDam.numero_de_dam,
        serie: nuevaDam.serie || null,
        canal_control: nuevaDam.canal_control || null,
        aforo_realizado: nuevaDam.aforo_realizado,
        monto_valor_provisional_usd: cabecera.tipo_valor === 'PROVISIONAL' && nuevaDam.monto_valor_provisional_usd
          ? parseFloat(nuevaDam.monto_valor_provisional_usd)
          : null
      };

      await axios.post('http://127.0.0.1:8000/dams/', payload, config);
      
      setMensaje({ texto: '✅ DAM registrada con éxito.', tipo: 'exito' });
      
      setNuevaDam({
        numero_de_dam: '',
        serie: '',
        canal_control: '',
        monto_valor_provisional_usd: '',
        aforo_realizado: false
      });

      recargarDams();
    } catch (error) {
      console.error('Error al registrar DAM:', error);
      const errorDetail = error.response?.data?.detail || 'Error al registrar la DAM.';
      setMensaje({ texto: `❌ ${errorDetail}`, tipo: 'error' });
    }
  };

  const toggleAforoDam = async (dam) => {
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const nuevoAforo = !dam.aforo_realizado;

      await axios.put(`http://127.0.0.1:8000/dams/${dam.id_dam}`, {
        aforo_realizado: nuevoAforo
      }, config);

      setMensaje({ texto: `✅ Aforo de la DAM ${dam.numero_de_dam} actualizado a ${nuevoAforo ? 'REALIZADO' : 'PENDIENTE'}.`, tipo: 'exito' });
      recargarDams();
    } catch (error) {
      console.error('Error al actualizar aforo de DAM:', error);
      const errorDetail = error.response?.data?.detail || 'Error al cambiar el estado del aforo.';
      setMensaje({ texto: `❌ ${errorDetail}`, tipo: 'error' });
    }
  };

  const cambiarCanalDam = async (dam, nuevoCanal) => {
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };

      await axios.put(`http://127.0.0.1:8000/dams/${dam.id_dam}`, {
        canal_control: nuevoCanal || null
      }, config);

      setMensaje({ texto: `✅ Canal de la DAM ${dam.numero_de_dam} actualizado a ${nuevoCanal || 'SIN CANAL'}.`, tipo: 'exito' });
      recargarDams();
    } catch (error) {
      console.error('Error al actualizar canal de DAM:', error);
      const errorDetail = error.response?.data?.detail || 'Error al actualizar el canal de control.';
      setMensaje({ texto: `❌ ${errorDetail}`, tipo: 'error' });
    }
  };

  // --- AUTORIZACIÓN LEVANTE MÁQUINA DE ESTADOS ---
  const solicitarLevante = async () => {
    if (!idMaestroGuardado) return;
    setMensaje({ texto: '⏳ Evaluando requisitos y procesando levante...', tipo: 'info' });
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };

      const res = await axios.put(`http://127.0.0.1:8000/maestros/${idMaestroGuardado}/autorizar-levante`, {}, config);
      setCabecera(prev => ({
        ...prev,
        estado_levante: res.data.estado_levante
      }));
      setMensaje({ texto: '🛃 ✅ LEVANTE AUTORIZADO SATISFACTORIAMENTE PARA ESTA FACTURA.', tipo: 'exito' });
    } catch (error) {
      console.error('Error al autorizar levante:', error);
      const errorDetail = error.response?.data?.detail || 'Error al autorizar levante.';
      setMensaje({ texto: `❌ ${errorDetail}`, tipo: 'error' });
    }
  };

  // --- ESTILOS COMUNES (Con fondos y textos explícitos para evitar fallos de contraste en Dark Mode) ---
  const estiloInput = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    fontSize: '14px',
    color: '#1e293b',
    backgroundColor: '#ffffff', // Fondo explícitamente blanco
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
    outline: 'none',
  };

  const estiloInputMoneda = {
    ...estiloInput,
    paddingLeft: '25px'
  };

  const selectCustomStyles = {
    control: (base) => ({
      ...base,
      backgroundColor: '#ffffff', // Fondo explícitamente blanco
      color: '#1e293b',
      border: '1px solid #cbd5e1',
      borderRadius: '6px',
      boxShadow: 'none',
      '&:hover': {
        borderColor: '#3b82f6',
      },
      minHeight: '38px',
      fontSize: '14px'
    }),
    singleValue: (base) => ({
      ...base,
      color: '#1e293b', // Letras oscuras legibles
    }),
    input: (base) => ({
      ...base,
      color: '#1e293b',
    }),
    placeholder: (base) => ({
      ...base,
      color: '#64748b',
    }),
    menu: (base) => ({
      ...base,
      backgroundColor: '#ffffff', // Menú desplegable con fondo blanco
      zIndex: 5
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected 
        ? '#2563eb' 
        : state.isFocused 
          ? '#f1f5f9' 
          : '#ffffff',
      color: state.isSelected 
        ? '#ffffff' 
        : '#1e293b',
      cursor: 'pointer',
      fontSize: '14px',
      '&:active': {
        backgroundColor: '#cbd5e1',
      }
    })
  };

  if (cargandoCatalogos) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh', fontFamily: 'sans-serif' }}>
        <div style={{ textAlign: 'center', color: '#64748b' }}>
          <div style={{ border: '4px solid #f3f3f3', borderTop: '4px solid #3b82f6', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', margin: '0 auto 15px auto' }} />
          <h3>Cargando catálogos del sistema...</h3>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '10px 20px 30px 20px', color: '#1e293b', fontFamily: 'sans-serif' }}>
      
      {/* SECTOR DE FILTRO SUPERIOR */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        backgroundColor: '#ffffff', 
        padding: '15px 25px', 
        borderRadius: '10px', 
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        marginBottom: '20px',
        border: '1px solid #e2e8f0',
        gap: '20px',
        flexWrap: 'wrap'
      }}>
        <div style={{ flex: 1, minWidth: '300px', display: 'flex', alignItems: 'center', gap: '15px' }}>
          <span style={{ fontWeight: '700', color: '#475569', fontSize: '14px', whiteSpace: 'nowrap' }}>📂 Cargar Factura:</span>
          <div style={{ flex: 1 }}>
            <Select 
              options={listaMaestros}
              placeholder="Buscar factura por N° o Documento..."
              isClearable
              onChange={seleccionarMaestro}
              styles={selectCustomStyles}
              value={listaMaestros.find(m => m.value === idMaestroGuardado) || null}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            type="button" 
            onClick={limpiarTodo} 
            style={{ 
              padding: '10px 18px', 
              backgroundColor: '#f1f5f9', 
              color: '#475569', 
              border: '1px solid #cbd5e1', 
              borderRadius: '6px', 
              cursor: 'pointer', 
              fontWeight: '600',
              fontSize: '14px',
              transition: 'background-color 0.2s'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#e2e8f0'}
            onMouseOut={(e) => e.target.style.backgroundColor = '#f1f5f9'}
          >
            ➕ Nueva Factura
          </button>
          
          {idMaestroGuardado && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              backgroundColor: '#eff6ff', 
              color: '#1d4ed8', 
              padding: '0 15px', 
              borderRadius: '6px', 
              border: '1px solid #bfdbfe',
              fontSize: '13px',
              fontWeight: '700'
            }}>
              ID Activo: {idMaestroGuardado}
            </div>
          )}
        </div>
      </div>

      {/* NOTIFICACIONES */}
      {mensaje.texto && (
        <div style={{ 
          padding: '12px 20px', 
          marginBottom: '20px', 
          borderRadius: '8px', 
          fontSize: '14px',
          fontWeight: '500',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          backgroundColor: mensaje.tipo === 'error' ? '#fef2f2' : mensaje.tipo === 'exito' ? '#ecfdf5' : '#eff6ff', 
          color: mensaje.tipo === 'error' ? '#991b1b' : mensaje.tipo === 'exito' ? '#065f46' : '#1e40af',
          border: `1px solid ${mensaje.tipo === 'error' ? '#fca5a5' : mensaje.tipo === 'exito' ? '#a7f3d0' : '#bfdbfe'}`
        }}>
          {mensaje.texto}
        </div>
      )}

      {/* DISEÑO PRINCIPAL EN DOS COLUMNAS */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '25px', alignItems: 'start' }}>
        
        {/* COLUMNA IZQUIERDA: CABECERA (MAESTRO) */}
        <form onSubmit={registrarMaestro} style={{ 
          backgroundColor: '#ffffff', 
          padding: '25px', 
          borderRadius: '12px', 
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
          border: '1px solid #e2e8f0'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #f1f5f9', paddingBottom: '15px' }}>
            <h3 style={{ margin: 0, color: '#0f172a', fontWeight: '700', fontSize: '18px' }}>
              {idMaestroGuardado ? '✍️ Editar Importación' : '📦 Registro de Importación (Cabecera)'}
            </h3>
            <button 
              type="submit" 
              style={{ 
                padding: '10px 20px', 
                backgroundColor: '#2563eb', 
                color: 'white', 
                border: 'none', 
                borderRadius: '6px', 
                cursor: 'pointer', 
                fontWeight: '600',
                fontSize: '14px',
                transition: 'background-color 0.2s',
                boxShadow: '0 2px 4px rgba(37,99,235,0.2)'
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#1d4ed8'}
              onMouseOut={(e) => e.target.style.backgroundColor = '#2563eb'}
            >
              💾 GUARDAR CABECERA
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            
            {/* Factura y Tipo Valor */}
            <div style={{ display: 'flex', gap: '15px' }}>
              <div style={{ flex: 1.5 }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '5px' }}>N° Factura</label>
                <input 
                  type="text" 
                  name="numero_factura" 
                  value={cabecera.numero_factura} 
                  onChange={handleChangeTexto} 
                  required 
                  style={estiloInput} 
                  placeholder="Ej: F001-000293" 
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '5px' }}>Tipo Valor</label>
                <select 
                  name="tipo_valor" 
                  value={cabecera.tipo_valor} 
                  onChange={handleChangeTexto} 
                  style={{ ...estiloInput, height: '41px', backgroundColor: '#ffffff' }}
                >
                  <option value="DEFINITIVO" style={{ color: '#1e293b', backgroundColor: '#ffffff' }}>Definitivo</option>
                  <option value="PROVISIONAL" style={{ color: '#1e293b', backgroundColor: '#ffffff' }}>Provisional</option>
                </select>
              </div>
            </div>

            {/* Doc Transporte y Contenedor */}
            <div style={{ display: 'flex', gap: '15px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '5px' }}>Documento Transporte (BL / AWB)</label>
                <input 
                  type="text" 
                  name="documento_transporte" 
                  value={cabecera.documento_transporte} 
                  onChange={handleChangeTexto} 
                  required 
                  style={estiloInput} 
                  placeholder="Ej: BL-SHP-99221" 
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '5px' }}>Contenedor Físico</label>
                <input 
                  type="text" 
                  name="n_cont_fisico" 
                  value={cabecera.n_cont_fisico} 
                  onChange={handleChangeTexto} 
                  style={estiloInput} 
                  placeholder="Ej: HLXU887361" 
                />
              </div>
            </div>

            {/* Fechas de Embarque y Arribo (Campos en la Cabecera) */}
            <div style={{ display: 'flex', gap: '15px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '5px' }}>📅 Fecha de Embarque</label>
                <input 
                  type="date" 
                  name="fecha_embarque" 
                  value={cabecera.fecha_embarque} 
                  onChange={handleChangeTexto} 
                  style={estiloInput} 
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '5px' }}>📅 Fecha de Arribo</label>
                <input 
                  type="date" 
                  name="fecha_arribo" 
                  value={cabecera.fecha_arribo} 
                  onChange={handleChangeTexto} 
                  style={estiloInput} 
                />
              </div>
            </div>

            {/* FOB, Flete y CFR */}
            <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '5px' }}>FOB (USD)</label>
                <span style={{ position: 'absolute', left: '10px', bottom: '11px', color: '#94a3b8', fontWeight: '600', fontSize: '14px' }}>$</span>
                <input 
                  type="number" 
                  step="0.01" 
                  name="fob_usd" 
                  value={cabecera.fob_usd} 
                  onChange={handleChangeTexto} 
                  required 
                  style={estiloInputMoneda} 
                  placeholder="0.00" 
                />
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '5px' }}>Flete (USD)</label>
                <span style={{ position: 'absolute', left: '10px', bottom: '11px', color: '#94a3b8', fontWeight: '600', fontSize: '14px' }}>$</span>
                <input 
                  type="number" 
                  step="0.01" 
                  name="flete_usd" 
                  value={cabecera.flete_usd} 
                  onChange={handleChangeTexto} 
                  required 
                  style={estiloInputMoneda} 
                  placeholder="0.00" 
                />
              </div>
              <div style={{ flex: 1.2, position: 'relative' }}>
                <label style={{ fontSize: '13px', fontWeight: '700', color: '#1e3a8a', display: 'block', marginBottom: '5px' }}>CFR Total (Auto Calculado)</label>
                <span style={{ position: 'absolute', left: '10px', bottom: '11px', color: '#1e3a8a', fontWeight: '700', fontSize: '14px' }}>$</span>
                <input 
                  type="text" 
                  value={cfrCalculado} 
                  readOnly 
                  disabled 
                  style={{ 
                    ...estiloInputMoneda, 
                    backgroundColor: '#eff6ff', 
                    border: '1px solid #bfdbfe', 
                    color: '#1e3a8a', 
                    fontWeight: '700' 
                  }} 
                />
              </div>
            </div>

            {/* Status Llegada, Levante (badge) y Venta Sucesiva */}
            <div style={{ display: 'flex', gap: '15px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '5px' }}>Status Llegada</label>
                <select 
                  name="status_llegada" 
                  value={cabecera.status_llegada} 
                  onChange={handleChangeTexto} 
                  style={{ ...estiloInput, height: '41px', backgroundColor: '#ffffff' }}
                >
                  <option value="EN TRÁNSITO" style={{ color: '#1e293b', backgroundColor: '#ffffff' }}>En Tránsito</option>
                  <option value="EN PUERTO" style={{ color: '#1e293b', backgroundColor: '#ffffff' }}>En Puerto</option>
                  <option value="EN ALMACÉN" style={{ color: '#1e293b', backgroundColor: '#ffffff' }}>En Almacén</option>
                  <option value="ENTREGADO" style={{ color: '#1e293b', backgroundColor: '#ffffff' }}>Entregado</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '5px' }}>Levante Aduanero</label>
                <div style={{ 
                  height: '41px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  borderRadius: '6px', 
                  fontSize: '14px',
                  fontWeight: '700',
                  border: '1px solid',
                  borderColor: cabecera.estado_levante === 'CON LEVANTE' ? '#86efac' : '#fca5a5',
                  backgroundColor: cabecera.estado_levante === 'CON LEVANTE' ? '#f0fdf4' : '#fef2f2',
                  color: cabecera.estado_levante === 'CON LEVANTE' ? '#166534' : '#991b1b'
                }}>
                  {cabecera.estado_levante}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '5px' }}>Venta Sucesiva</label>
                <input 
                  type="text" 
                  name="venta_sucesiva" 
                  value={cabecera.venta_sucesiva} 
                  onChange={handleChangeTexto} 
                  style={estiloInput} 
                  placeholder="Opcional" 
                />
              </div>
            </div>

            {/* Catálogos (Buscadores Inteligentes) */}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '15px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
              
              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '5px' }}>🏢 Importador (Facturado a)</label>
                <Select 
                  options={opcionesImportadores}
                  value={opcionesImportadores.find(op => op.value === cabecera.id_importador) || null}
                  onChange={(op) => setCabecera({ ...cabecera, id_importador: op ? op.value : null })}
                  placeholder="Selecciona importador..."
                  isClearable
                  styles={selectCustomStyles}
                />
              </div>

              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '5px' }}>🛃 Agente de Aduanas</label>
                <Select 
                  options={opcionesAgentes}
                  value={opcionesAgentes.find(op => op.value === cabecera.id_agente) || null}
                  onChange={(op) => setCabecera({ ...cabecera, id_agente: op ? op.value : null })}
                  placeholder="Selecciona agente..."
                  isClearable
                  styles={selectCustomStyles}
                />
              </div>

              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '5px' }}>🤝 Proveedor (Shipper)</label>
                <Select 
                  options={opcionesProveedores}
                  value={opcionesProveedores.find(op => op.value === cabecera.id_proveedor) || null}
                  onChange={(op) => setCabecera({ ...cabecera, id_proveedor: op ? op.value : null })}
                  placeholder="Selecciona proveedor..."
                  isClearable
                  styles={selectCustomStyles}
                />
              </div>

              <div>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '5px' }}>🏭 Almacén</label>
                <Select 
                  options={opcionesAlmacenes}
                  value={opcionesAlmacenes.find(op => op.value === cabecera.id_almacen) || null}
                  onChange={(op) => setCabecera({ ...cabecera, id_almacen: op ? op.value : null })}
                  placeholder="Selecciona almacén (Opcional)..."
                  isClearable
                  styles={selectCustomStyles}
                />
              </div>

            </div>

          </div>
        </form>

        {/* COLUMNA DERECHA: DETALLE (DAM) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
          
          {!idMaestroGuardado ? (
            /* PANEL BLOQUEADO */
            <div style={{ 
              backgroundColor: '#f8fafc', 
              border: '2px dashed #cbd5e1', 
              borderRadius: '12px', 
              padding: '60px 30px', 
              textAlign: 'center', 
              color: '#64748b' 
            }}>
              <span style={{ fontSize: '48px', display: 'block', marginBottom: '20px' }}>🔒</span>
              <h3 style={{ margin: '0 0 10px 0', color: '#334155', fontWeight: '700' }}>Registro de Detalle de DAMs Bloqueado</h3>
              <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.5' }}>
                Para agregar Declaraciones Aduaneras de Mercancías (DAM), primero debes <b>guardar la Cabecera</b> de la Factura o <b>seleccionar una factura existente</b> en el buscador superior.
              </p>
            </div>
          ) : (
            /* PANEL DE DAMS ACTIVO */
            <>
              {/* FORMULARIO AGREGAR DAM */}
              <div style={{ 
                backgroundColor: '#ffffff', 
                padding: '25px', 
                borderRadius: '12px', 
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
                border: '1px solid #e2e8f0'
              }}>
                <h3 style={{ margin: '0 0 20px 0', color: '#0f172a', fontWeight: '700', fontSize: '18px', borderBottom: '1px solid #f1f5f9', paddingBottom: '15px' }}>
                  ➕ Registrar DAM (Detalle)
                </h3>

                <form onSubmit={registrarDam} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ display: 'flex', gap: '15px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '5px' }}>N° de DAM</label>
                      <input 
                        type="text" 
                        value={nuevaDam.numero_de_dam} 
                        onChange={(e) => setNuevaDam({ ...nuevaDam, numero_de_dam: e.target.value })} 
                        required 
                        placeholder="Ej: 118-2026-10-0021" 
                        style={estiloInput} 
                      />
                    </div>
                    <div style={{ flex: 0.8 }}>
                      <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '5px' }}>Serie</label>
                      <input 
                        type="text" 
                        value={nuevaDam.serie} 
                        onChange={(e) => setNuevaDam({ ...nuevaDam, serie: e.target.value })} 
                        placeholder="Ej: 1" 
                        style={estiloInput} 
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '15px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '5px' }}>Canal de Control</label>
                      <select 
                        value={nuevaDam.canal_control} 
                        onChange={(e) => setNuevaDam({ ...nuevaDam, canal_control: e.target.value })}
                        style={{ ...estiloInput, height: '41px', backgroundColor: '#ffffff' }}
                      >
                        <option value="" style={{ color: '#1e293b', backgroundColor: '#ffffff' }}>Seleccione canal (Opcional)</option>
                        <option value="VERDE" style={{ color: '#065f46', backgroundColor: '#ffffff' }}>🟢 Verde</option>
                        <option value="NARANJA" style={{ color: '#92400e', backgroundColor: '#ffffff' }}>🟡 Naranja</option>
                        <option value="ROJO" style={{ color: '#991b1b', backgroundColor: '#ffffff' }}>🔴 Rojo</option>
                      </select>
                    </div>

                    <div style={{ flex: 1.2 }}>
                      <label style={{ fontSize: '13px', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '5px' }}>Monto Provisional (USD)</label>
                      <input 
                        type="number" 
                        step="0.01" 
                        value={cabecera.tipo_valor === 'DEFINITIVO' ? '' : nuevaDam.monto_valor_provisional_usd} 
                        disabled={cabecera.tipo_valor === 'DEFINITIVO'}
                        onChange={(e) => setNuevaDam({ ...nuevaDam, monto_valor_provisional_usd: e.target.value })} 
                        placeholder={cabecera.tipo_valor === 'DEFINITIVO' ? 'No aplica para Definitivo' : '0.00'}
                        style={{ 
                          ...estiloInput, 
                          backgroundColor: cabecera.tipo_valor === 'DEFINITIVO' ? '#f8fafc' : '#ffffff',
                          color: cabecera.tipo_valor === 'DEFINITIVO' ? '#94a3b8' : '#1e293b'
                        }} 
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9', paddingTop: '15px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
                      <input 
                        type="checkbox" 
                        checked={nuevaDam.aforo_realizado} 
                        onChange={(e) => setNuevaDam({ ...nuevaDam, aforo_realizado: e.target.checked })}
                        style={{ width: '17px', height: '17px', cursor: 'pointer' }}
                      />
                      ¿Aforo físico realizado?
                    </label>

                    <button 
                      type="submit" 
                      style={{ 
                        padding: '10px 22px', 
                        backgroundColor: '#10b981', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: '6px', 
                        cursor: 'pointer', 
                        fontWeight: '700',
                        fontSize: '14px',
                        transition: 'background-color 0.2s',
                        boxShadow: '0 2px 4px rgba(16,185,129,0.2)'
                      }}
                      onMouseOver={(e) => e.target.style.backgroundColor = '#059669'}
                      onMouseOut={(e) => e.target.style.backgroundColor = '#10b981'}
                    >
                      ➕ AGREGAR DAM
                    </button>
                  </div>
                </form>
              </div>

              {/* LISTADO DE DAMS REGISTRADAS */}
              <div style={{ 
                backgroundColor: '#ffffff', 
                padding: '25px', 
                borderRadius: '12px', 
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
                border: '1px solid #e2e8f0'
              }}>
                <h3 style={{ margin: '0 0 15px 0', color: '#0f172a', fontWeight: '700', fontSize: '18px' }}>
                  📜 DAMs en esta Factura ({damsRegistradas.length})
                </h3>

                {damsRegistradas.length === 0 ? (
                  <p style={{ margin: 0, padding: '20px', textAlign: 'center', color: '#64748b', backgroundColor: '#f8fafc', borderRadius: '6px', fontSize: '14px' }}>
                    No hay DAMs vinculadas a este maestro todavía.
                  </p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                          <th style={{ padding: '10px 8px', fontWeight: '600' }}>N° DAM</th>
                          <th style={{ padding: '10px 8px', fontWeight: '600' }}>Serie</th>
                          <th style={{ padding: '10px 8px', fontWeight: '600' }}>Canal</th>
                          <th style={{ padding: '10px 8px', fontWeight: '600' }}>Aforo Físico</th>
                          <th style={{ padding: '10px 8px', fontWeight: '600', textAlign: 'right' }}>Prov. (USD)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {damsRegistradas.map(dam => {
                          let colorCanalBg = '#f3f4f6';
                          let colorCanalTexto = '#374151';
                          if (dam.canal_control === 'VERDE') {
                            colorCanalBg = '#d1fae5';
                            colorCanalTexto = '#065f46';
                          } else if (dam.canal_control === 'NARANJA') {
                            colorCanalBg = '#fef3c7';
                            colorCanalTexto = '#92400e';
                          } else if (dam.canal_control === 'ROJO') {
                            colorCanalBg = '#fee2e2';
                            colorCanalTexto = '#991b1b';
                          }

                          return (
                            <tr key={dam.id_dam} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '12px 8px', fontWeight: '700', color: '#1e293b' }}>
                                {dam.numero_de_dam}
                              </td>
                              <td style={{ padding: '12px 8px', color: '#64748b' }}>
                                {dam.serie || '-'}
                              </td>
                              <td style={{ padding: '12px 8px' }}>
                                <select 
                                  value={dam.canal_control || ''} 
                                  onChange={(e) => cambiarCanalDam(dam, e.target.value)}
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: '12px',
                                    fontSize: '11px',
                                    fontWeight: '700',
                                    border: 'none',
                                    cursor: 'pointer',
                                    backgroundColor: colorCanalBg,
                                    color: colorCanalTexto,
                                    outline: 'none'
                                  }}
                                >
                                  <option value="" style={{ backgroundColor: '#ffffff', color: '#1e293b' }}>S/C</option>
                                  <option value="VERDE" style={{ backgroundColor: '#ffffff', color: '#065f46' }}>VERDE</option>
                                  <option value="NARANJA" style={{ backgroundColor: '#ffffff', color: '#92400e' }}>NARANJA</option>
                                  <option value="ROJO" style={{ backgroundColor: '#ffffff', color: '#991b1b' }}>ROJO</option>
                                </select>
                              </td>
                              <td style={{ padding: '12px 8px' }}>
                                <button
                                  type="button"
                                  onClick={() => toggleAforoDam(dam)}
                                  style={{
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    fontSize: '11px',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    border: '1px solid',
                                    borderColor: dam.aforo_realizado ? '#86efac' : '#d1d5db',
                                    backgroundColor: dam.aforo_realizado ? '#f0fdf4' : '#ffffff',
                                    color: dam.aforo_realizado ? '#166534' : '#475569',
                                    transition: 'all 0.2s'
                                  }}
                                >
                                  {dam.aforo_realizado ? '✅ Sí' : '❌ No'}
                                </button>
                              </td>
                              <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: '600' }}>
                                {dam.monto_valor_provisional_usd !== null && dam.monto_valor_provisional_usd !== undefined
                                  ? `$${parseFloat(dam.monto_valor_provisional_usd).toFixed(2)}`
                                  : '-'
                                }
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* PANEL MÁQUINA DE ESTADOS: LEVANTE ADUANERO */}
              <div style={{ 
                backgroundColor: '#ffffff', 
                padding: '25px', 
                borderRadius: '12px', 
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
                border: '1px solid #e2e8f0',
                background: 'linear-gradient(to right, #f8fafc, #ffffff)'
              }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#1e3a8a', fontWeight: '700', fontSize: '15px' }}>
                  🛃 Control de Levante Aduanero
                </h4>
                <p style={{ margin: '0 0 15px 0', fontSize: '13px', color: '#64748b', lineHeight: '1.4' }}>
                  El backend evalúa las reglas operativas (Ej: El Canal Rojo Definitivo exige Aforo Físico de todas sus DAMs) antes de conceder la autorización.
                </p>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '15px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Estado actual:</span>
                    <span style={{ 
                      padding: '5px 12px', 
                      borderRadius: '12px', 
                      fontSize: '12px', 
                      fontWeight: '700',
                      letterSpacing: '0.5px',
                      backgroundColor: cabecera.estado_levante === 'CON LEVANTE' ? '#d1fae5' : '#fee2e2',
                      color: cabecera.estado_levante === 'CON LEVANTE' ? '#065f46' : '#991b1b',
                      border: `1px solid ${cabecera.estado_levante === 'CON LEVANTE' ? '#a7f3d0' : '#fca5a5'}`
                    }}>
                      {cabecera.estado_levante}
                    </span>
                  </div>

                  {cabecera.estado_levante !== 'CON LEVANTE' && (
                    <button
                      type="button"
                      onClick={solicitarLevante}
                      disabled={damsRegistradas.length === 0}
                      style={{ 
                        padding: '10px 18px', 
                        backgroundColor: '#1e3a8a', 
                        color: 'white', 
                        border: 'none', 
                        borderRadius: '6px', 
                        cursor: damsRegistradas.length === 0 ? 'not-allowed' : 'pointer', 
                        fontWeight: '700',
                        fontSize: '13px',
                        transition: 'background-color 0.2s',
                        opacity: damsRegistradas.length === 0 ? 0.5 : 1,
                        boxShadow: '0 2px 4px rgba(30,58,138,0.2)'
                      }}
                      onMouseOver={(e) => { if(damsRegistradas.length > 0) e.target.style.backgroundColor = '#172554'; }}
                      onMouseOut={(e) => { if(damsRegistradas.length > 0) e.target.style.backgroundColor = '#1e3a8a'; }}
                    >
                      AUTORIZAR LEVANTE
                    </button>
                  )}
                </div>
                {damsRegistradas.length === 0 && (
                  <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#ef4444', fontWeight: '500' }}>
                    ⚠️ Debes registrar al menos una DAM para poder evaluar y solicitar el Levante.
                  </p>
                )}
              </div>
            </>
          )}

        </div>

      </div>

    </div>
  );
};

export default Logistica;
