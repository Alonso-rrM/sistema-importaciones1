import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Select from 'react-select';
import Paginador from '../components/Paginador';
import useDebounce from '../hooks/useDebounce';

const Gastos = () => {
  const navigate = useNavigate();

  // --- ESTADOS DE VISTA Y SELECCIÓN ---
  const [viewMode, setViewMode] = useState('LISTA'); // LISTA, NUEVO, MODIFICAR, CONSULTAR
  const [selectedId, setSelectedId] = useState(null);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  // --- DATOS ---
  const [gastos, setGastos] = useState([]);
  const [maestrosRaw, setMaestrosRaw] = useState([]);
  const [damsRaw, setDamsRaw] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 400);

  // --- PAGINACIÓN ---
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  
  const [opcionesMaestros, setOpcionesMaestros] = useState([]);
  const [opcionesConceptos, setOpcionesConceptos] = useState([]);
  const [opcionesProveedores, setOpcionesProveedores] = useState([]);
  const [opcionesTiposDoc, setOpcionesTiposDoc] = useState([]);

  const estadoInicialForm = {
    id_maestro_temp: null,
    id_dam: null,
    id_concepto: null,
    id_proveedor: null,
    id_tipo_doc: null,
    numero_documento: '',
    fecha_vencimiento: '',
    monto_original: '',
    moneda: 'USD'
  };

  const [form, setForm] = useState(estadoInicialForm);
  const [isGuardando, setIsGuardando] = useState(false);

  useEffect(() => {
    cargarCatalogos();
  }, []);

  useEffect(() => {
    cargarListaGastos();
  }, [debouncedSearch, page, limit]);

  const cargarListaGastos = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/gastos/', {
        params: {
          search: debouncedSearch.trim() || undefined,
          page,
          limit
        }
      });
      const dataList = response.data?.data ?? (Array.isArray(response.data) ? response.data : []);
      setGastos(dataList);
      setTotalPages(response.data?.total_paginas ?? 1);
      setTotalRegistros(response.data?.total_registros ?? dataList.length);
    } catch (error) {
      console.error("Error al obtener gastos:", error);
      setMensaje({ texto: "Error al obtener gastos del servidor.", tipo: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  const cargarCatalogos = async () => {
    try {
      const [resMaestros, resDams, resConceptos, resProveedores, resTiposDoc] = await Promise.all([
        api.get('/maestros/?limit=100'),
        api.get('/dams/?limit=100'),
        api.get('/conceptos/'),
        api.get('/proveedores/'),
        api.get('/tipos-documento/')
      ]);

      const maestrosList = resMaestros.data?.data ?? (Array.isArray(resMaestros.data) ? resMaestros.data : []);
      const damsList = resDams.data?.data ?? (Array.isArray(resDams.data) ? resDams.data : []);
      const conceptosList = resConceptos.data?.data ?? (Array.isArray(resConceptos.data) ? resConceptos.data : []);
      const proveedoresList = resProveedores.data?.data ?? (Array.isArray(resProveedores.data) ? resProveedores.data : []);
      const tiposDocList = resTiposDoc.data?.data ?? (Array.isArray(resTiposDoc.data) ? resTiposDoc.data : []);

      setMaestrosRaw(maestrosList);
      setDamsRaw(damsList);

      setOpcionesMaestros(maestrosList.map(m => ({ value: m.id_maestro, label: `Factura: ${m.numero_factura} (BL: ${m.documento_transporte || 'N/A'})` })));
      setOpcionesConceptos(conceptosList.map(c => ({ value: c.id_concepto, label: c.nombre })));
      setOpcionesProveedores(proveedoresList.map(p => ({ value: p.id_proveedor, label: `${p.ruc} - ${p.nombre}` })));
      
      setOpcionesTiposDoc(tiposDocList.map(t => ({ 
        value: t.id_tipo_doc,
        label: t.nombre_documento || t.nombre || t.descripcion 
      })));

    } catch (error) {
      console.error('Error al cargar catálogos:', error);
      setMensaje({ texto: 'Error de conexión al cargar catálogos.', tipo: 'error' });
    }
  };

  const opcionesDamsFiltradas = damsRaw
    .filter(dam => dam.id_maestro === form.id_maestro_temp)
    .map(dam => ({ value: dam.id_dam, label: `DAM: ${dam.numero_de_dam}` }));

  const handleChangeTexto = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleRowClick = (gasto) => {
    if (viewMode !== 'LISTA') return;
    if (selectedId === gasto.id_gasto) {
      setSelectedId(null);
      setForm(estadoInicialForm);
    } else {
      setSelectedId(gasto.id_gasto);
      const linkedDam = damsRaw.find(d => d.id_dam === gasto.id_dam);
      setForm({
        id_maestro_temp: linkedDam ? linkedDam.id_maestro : null,
        id_dam: gasto.id_dam,
        id_concepto: gasto.id_concepto,
        id_proveedor: gasto.id_proveedor,
        id_tipo_doc: gasto.id_tipo_doc,
        numero_documento: gasto.numero_documento || '',
        fecha_vencimiento: gasto.fecha_vencimiento || '',
        monto_original: gasto.monto_original || '',
        moneda: gasto.moneda || 'USD'
      });
    }
  };

  const handleEliminar = async () => {
    if (!selectedId) return;
    const motivo = window.prompt("Ingrese el motivo de eliminación (Mín. 10 caracteres):");
    if (!motivo || motivo.trim().length < 10) {
      alert("Acción bloqueada: Debe ingresar un motivo válido de al menos 10 caracteres.");
      return;
    }
    try {
      await api.delete(`/gastos/${selectedId}`, {
        data: { motivo: motivo.trim() }
      });

      alert("Registro eliminado lógicamente.");
      setSelectedId(null);
      setForm(estadoInicialForm);
      cargarListaGastos();
    } catch (error) {
      console.error("Error en la solicitud DELETE:", error);
      const detail = error.response?.data?.detail || "Error desconocido";
      alert(`Error al eliminar: ${detail}`);
    }
  };

  const handleRegistrarPago = () => {
    const selectedGasto = gastos.find(g => g.id_gasto === selectedId);
    if (selectedGasto) {
      navigate(`/app/pagos?gasto_id=${selectedId}`, { state: { fromGasto: selectedGasto } });
    }
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!form.id_dam || !form.id_concepto || !form.id_proveedor || !form.id_tipo_doc) {
      setMensaje({ texto: '❌ Faltan campos obligatorios vinculados.', tipo: 'error' });
      return;
    }
    setIsGuardando(true);
    setMensaje({ texto: 'Guardando...', tipo: 'info' });

    try {
      const payload = {
        id_dam: form.id_dam,
        id_concepto: form.id_concepto,
        id_proveedor: form.id_proveedor,
        id_tipo_doc: form.id_tipo_doc,
        monto_original: parseFloat(form.monto_original),
        moneda: form.moneda,
        numero_documento: form.numero_documento || null,
        fecha_vencimiento: form.fecha_vencimiento || null
      };

      if (viewMode === 'NUEVO') {
        await api.post('/gastos/', payload);
        setMensaje({ texto: '✅ Gasto registrado con éxito.', tipo: 'exito' });
      } else if (viewMode === 'MODIFICAR') {
        await api.put(`/gastos/${selectedId}`, payload);
        setMensaje({ texto: '✅ Gasto actualizado con éxito.', tipo: 'exito' });
      }

      cargarListaGastos();
      setViewMode('LISTA');
      setSelectedId(null);
      setForm(estadoInicialForm);
      setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);

    } catch (error) {
      console.error(error);
      if (error.response && error.response.data && error.response.data.detail) {
        setMensaje({ texto: `❌ Error: ${error.response.data.detail}`, tipo: 'error' });
      } else {
        setMensaje({ texto: '❌ Error al comunicarse con el servidor.', tipo: 'error' });
      }
    } finally {
      setIsGuardando(false);
    }
  };

  const isReadOnly = viewMode === 'CONSULTAR';
  const selectedGastoObj = gastos.find(g => g.id_gasto === selectedId);
  const isGastoPagado = selectedGastoObj?.estado_pago === 'PAGADO';

  // --- ESTILOS ---
  const containerStyle = { padding: '20px', fontFamily: 'Arial, sans-serif' };
  const commandBarStyle = { display: 'flex', gap: '10px', backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '20px', alignItems: 'center' };
  const getBtnStyle = (disabled, baseColor = '#27ae60') => ({
    padding: '10px 20px',
    backgroundColor: disabled ? '#bdc3c7' : baseColor,
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 'bold',
    transition: 'background-color 0.2s'
  });
  const inputStyle = { width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box', backgroundColor: isReadOnly ? '#f9f9f9' : '#fff', color: '#2c3e50' };
  const labelStyle = { display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px', color: '#34495e' };
  const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginBottom: '20px' };

  // Estilos react-select
  const selectStyles = {
    control: (base, state) => ({
      ...base,
      backgroundColor: isReadOnly ? '#f9f9f9' : '#fff',
      borderColor: state.isFocused ? '#3498db' : '#ccc',
      boxShadow: state.isFocused ? '0 0 0 1px #3498db' : null,
      '&:hover': {
        borderColor: '#3498db'
      }
    }),
    singleValue: (base) => ({
      ...base,
      color: '#2c3e50'
    }),
    input: (base) => ({
      ...base,
      color: '#2c3e50'
    }),
    placeholder: (base) => ({
      ...base,
      color: '#95a5a6'
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected 
        ? '#3498db' 
        : state.isFocused 
          ? '#e8f4fd' 
          : '#fff',
      color: state.isSelected ? '#fff' : '#2c3e50',
      '&:active': {
        backgroundColor: '#3498db'
      }
    }),
    menu: (base) => ({
      ...base,
      backgroundColor: '#fff',
      zIndex: 9999
    })
  };

  return (
    <div style={containerStyle}>
      <h2 style={{ color: '#2c3e50', borderBottom: '2px solid #27ae60', paddingBottom: '10px' }}>Gastos Logísticos de Importación</h2>

      {/* TOP COMMAND BAR */}
      <div style={commandBarStyle}>
        <button style={getBtnStyle(false, '#2ecc71')} onClick={() => { setViewMode('NUEVO'); setForm(estadoInicialForm); setSelectedId(null); }}>➕ NUEVO</button>
        <button style={getBtnStyle(!selectedId || isGastoPagado, '#f39c12')} disabled={!selectedId || isGastoPagado} title={isGastoPagado ? "No se permite modificar gastos PAGADOS" : ""} onClick={() => setViewMode('MODIFICAR')}>✏️ MODIFICAR</button>
        <button style={getBtnStyle(!selectedId, '#3498db')} disabled={!selectedId} onClick={() => setViewMode('CONSULTAR')}>👁️ CONSULTAR</button>
        <button style={getBtnStyle(!selectedId, '#e74c3c')} disabled={!selectedId} onClick={handleEliminar}>🗑️ ELIMINAR</button>
        <button style={getBtnStyle(!selectedId, '#8e44ad')} disabled={!selectedId} onClick={handleRegistrarPago}>🏦 REGISTRAR PAGO</button>
        
        <input 
          type="search" 
          placeholder="Buscar por Documento, DAM, Factura, Estado..." 
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setPage(1);
          }}
          style={{ padding: '10px', marginLeft: 'auto', width: '320px', borderRadius: '5px', border: '1px solid #ccc' }}
        />
        
        {viewMode !== 'LISTA' && (
          <button style={{ ...getBtnStyle(false, '#95a5a6'), marginLeft: '10px' }} onClick={() => { setViewMode('LISTA'); setSelectedId(null); setForm(estadoInicialForm); }}>⬅️ VOLVER A LISTA</button>
        )}
      </div>

      {mensaje.texto && (
        <div style={{ padding: '15px', marginBottom: '20px', borderRadius: '5px', backgroundColor: mensaje.tipo === 'error' ? '#f8d7da' : mensaje.tipo === 'exito' ? '#d4edda' : '#d1ecf1', color: mensaje.tipo === 'error' ? '#721c24' : mensaje.tipo === 'exito' ? '#155724' : '#0c5460', fontWeight: 'bold' }}>
          {mensaje.texto}
        </div>
      )}

      {viewMode === 'LISTA' ? (
        // ======================= VISTA: LISTA =======================
        <div style={{ overflowX: 'auto', backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#ecf0f1', textAlign: 'left' }}>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>ID Gasto</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Proveedor</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Concepto</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Documento</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Monto</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Moneda</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Estado Pago</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>ID DAM</th>
              </tr>
            </thead>
            <tbody>
              {gastos.map((g) => {
                const prov = opcionesProveedores.find(op => op.value === g.id_proveedor);
                const conc = opcionesConceptos.find(c => c.value === g.id_concepto);
                return (
                  <tr 
                    key={g.id_gasto} 
                    onClick={() => handleRowClick(g)}
                    style={{ backgroundColor: selectedId === g.id_gasto ? '#e8f8f5' : 'white', cursor: 'pointer', borderBottom: '1px solid #eee', transition: 'background-color 0.2s' }}
                  >
                    <td style={{ padding: '12px' }}>{g.id_gasto}</td>
                    <td style={{ padding: '12px', fontWeight: 'bold' }}>{prov ? prov.label : `ID: ${g.id_proveedor}`}</td>
                    <td style={{ padding: '12px' }}>{conc ? conc.label : `ID: ${g.id_concepto}`}</td>
                    <td style={{ padding: '12px' }}>{g.numero_documento || 'Sin documento'}</td>
                    <td style={{ padding: '12px', fontWeight: '500' }}>{parseFloat(g.monto_original).toFixed(2)}</td>
                    <td style={{ padding: '12px', fontWeight: 'bold' }}>{g.moneda || 'USD'}</td>
                    <td style={{ padding: '12px' }}>
                      <span style={{ 
                        padding: '4px 8px', 
                        borderRadius: '4px', 
                        backgroundColor: g.estado_pago === 'PAGADO' ? '#d4edda' : g.estado_pago === 'PENDIENTE' ? '#f8d7da' : '#fff3cd', 
                        color: g.estado_pago === 'PAGADO' ? '#155724' : g.estado_pago === 'PENDIENTE' ? '#721c24' : '#856404', 
                        fontWeight: 'bold', 
                        fontSize: '12px' 
                      }}>
                        {g.estado_pago}
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>{g.dam_numero || g.id_dam}</td>
                  </tr>
                );
              })}
              {gastos.length === 0 && !isLoading && (
                <tr><td colSpan="8" style={{ padding: '20px', textAlign: 'center', color: '#7f8c8d' }}>No hay registros disponibles.</td></tr>
              )}
            </tbody>
          </table>
          <Paginador 
            page={page} 
            totalPages={totalPages} 
            setPage={setPage} 
            limit={limit} 
            setLimit={setLimit} 
            totalRegistros={totalRegistros} 
          />
        </div>
      ) : (
        // ======================= VISTA: NUEVO / MODIFICAR / CONSULTAR =======================
        <form onSubmit={handleGuardar} style={{ backgroundColor: '#fff', padding: '30px', borderRadius: '8px', border: '1px solid #ddd', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0, color: '#34495e', borderBottom: '1px solid #ecf0f1', paddingBottom: '10px', marginBottom: '20px' }}>
            {viewMode === 'NUEVO' ? '✨ Registrar Nuevo Gasto Logístico' : viewMode === 'MODIFICAR' ? '✏️ Modificar Gasto Logístico' : '👁️ Consultar Detalles de Gasto'}
          </h3>

          {/* FASE A Y B: ENLACE ADUANERO */}
          <div style={{ backgroundColor: '#f0f3f4', padding: '20px', borderRadius: '6px', marginBottom: '25px', borderLeft: '5px solid #3498db' }}>
            <h4 style={{ marginTop: 0, color: '#2980b9', marginBottom: '15px' }}>1. Vincular a Operación Aduanera</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div style={{ zIndex: 11 }}>
                <label style={labelStyle}>Factura Maestra (Embarque) *</label>
                <Select 
                  options={opcionesMaestros} 
                  value={opcionesMaestros.find(op => op.value === form.id_maestro_temp) || null}
                  onChange={(op) => setForm({ ...form, id_maestro_temp: op ? op.value : null, id_dam: null })} 
                  placeholder="Busca la factura principal..." 
                  isClearable 
                  isDisabled={isReadOnly}
                  styles={selectStyles}
                />
              </div>
              <div style={{ zIndex: 10 }}>
                <label style={labelStyle}>Declaración (DAM) Afectada *</label>
                <Select 
                  options={opcionesDamsFiltradas} 
                  value={opcionesDamsFiltradas.find(op => op.value === form.id_dam) || null}
                  onChange={(op) => setForm({ ...form, id_dam: op ? op.value : null })} 
                  placeholder={form.id_maestro_temp ? "Selecciona la DAM..." : "Primero selecciona un Maestro"} 
                  isDisabled={!form.id_maestro_temp || isReadOnly}
                  isClearable 
                  styles={selectStyles}
                />
              </div>
            </div>
          </div>

          {/* FASE C: DETALLES DEL GASTO */}
          <h4 style={{ color: '#27ae60', marginBottom: '15px' }}>2. Detalle del Comprobante</h4>
          <div style={gridStyle}>
            <div style={{ zIndex: 5 }}>
              <label style={labelStyle}>Proveedor (Emisor) *</label>
              <Select 
                options={opcionesProveedores} 
                value={opcionesProveedores.find(op => op.value === form.id_proveedor) || null} 
                onChange={(op) => setForm({ ...form, id_proveedor: op ? op.value : null })} 
                placeholder="Buscar proveedor..." 
                isClearable 
                isDisabled={isReadOnly}
                styles={selectStyles} 
              />
            </div>
            <div style={{ zIndex: 4 }}>
              <label style={labelStyle}>Tipo de Comprobante *</label>
              <Select 
                options={opcionesTiposDoc} 
                value={opcionesTiposDoc.find(op => op.value === form.id_tipo_doc) || null} 
                onChange={(op) => setForm({ ...form, id_tipo_doc: op ? op.value : null })} 
                placeholder="Factura, Recibo..." 
                isClearable 
                isDisabled={isReadOnly}
                styles={selectStyles} 
              />
            </div>
            <div>
              <label style={labelStyle}>N° Documento</label>
              <input 
                type="text" 
                name="numero_documento" 
                value={form.numero_documento} 
                onChange={handleChangeTexto} 
                style={inputStyle} 
                placeholder="Ej: F001-123" 
                disabled={isReadOnly}
              />
            </div>
            <div style={{ zIndex: 3 }}>
              <label style={labelStyle}>Concepto del Gasto *</label>
              <Select 
                options={opcionesConceptos} 
                value={opcionesConceptos.find(op => op.value === form.id_concepto) || null} 
                onChange={(op) => setForm({ ...form, id_concepto: op ? op.value : null })} 
                placeholder="Flete, Almacenaje, Ajuste..." 
                isClearable 
                isDisabled={isReadOnly}
                styles={selectStyles} 
              />
            </div>
            <div>
              <label style={labelStyle}>Fecha Vencimiento</label>
              <input 
                type="date" 
                name="fecha_vencimiento" 
                value={form.fecha_vencimiento} 
                onChange={handleChangeTexto} 
                style={inputStyle} 
                disabled={isReadOnly}
              />
            </div>
            <div>
              <label style={labelStyle}>Moneda *</label>
              <select 
                name="moneda" 
                value={form.moneda} 
                onChange={handleChangeTexto} 
                required 
                style={inputStyle} 
                disabled={isReadOnly}
              >
                <option value="USD">Dólares (USD)</option>
                <option value="PEN">Soles (PEN)</option>
              </select>
            </div>
            <div style={{ position: 'relative' }}>
              <label style={labelStyle}>Monto Total *</label>
              <span style={{ position: 'absolute', left: '12px', top: '38px', color: '#7f8c8d', fontWeight: 'bold' }}>{form.moneda === 'PEN' ? 'S/' : '$'}</span>
              <input 
                type="number" 
                step="0.01" 
                name="monto_original" 
                value={form.monto_original} 
                onChange={handleChangeTexto} 
                required 
                style={{ ...inputStyle, paddingLeft: '25px' }} 
                placeholder="0.00" 
                disabled={isReadOnly}
              />
            </div>
          </div>

          {/* ACCIONES DEL FORMULARIO */}
          <div style={{ marginTop: '35px', textAlign: 'right', borderTop: '1px solid #eee', paddingTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '15px' }}>
            {isReadOnly && (
              <button 
                type="button" 
                onClick={handleRegistrarPago}
                style={{ 
                  padding: '12px 30px', 
                  backgroundColor: '#8e44ad', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '5px', 
                  fontSize: '16px', 
                  fontWeight: 'bold', 
                  cursor: 'pointer', 
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)' 
                }}
              >
                📑 REGISTRAR PAGO
              </button>
            )}
            
            {!isReadOnly && (
              <button 
                type="submit" 
                disabled={isGuardando} 
                style={{ 
                  padding: '12px 30px', 
                  backgroundColor: '#27ae60', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '5px', 
                  fontSize: '16px', 
                  fontWeight: 'bold', 
                  cursor: isGuardando ? 'not-allowed' : 'pointer', 
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)' 
                }}
              >
                {isGuardando ? '⏳ GUARDANDO...' : '💾 GUARDAR GASTO'}
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
};

export default Gastos;
