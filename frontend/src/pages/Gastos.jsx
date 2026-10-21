import React, { useState, useEffect } from 'react';
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

  return (
    <div className="page-container">
      <h2 className="page-title">Gastos Logísticos de Importación</h2>

      {/* TOP COMMAND BAR */}
      <div className="toolbar">
        <button 
          className="btn btn-success" 
          onClick={() => { setViewMode('NUEVO'); setForm(estadoInicialForm); setSelectedId(null); }}
        >
          ➕ NUEVO
        </button>
        <button 
          className="btn btn-warning" 
          disabled={!selectedId || isGastoPagado} 
          title={isGastoPagado ? "No se permite modificar gastos PAGADOS" : ""} 
          onClick={() => setViewMode('MODIFICAR')}
        >
          ✏️ MODIFICAR
        </button>
        <button 
          className="btn btn-primary" 
          disabled={!selectedId} 
          onClick={() => setViewMode('CONSULTAR')}
        >
          👁️ CONSULTAR
        </button>
        <button 
          className="btn btn-danger" 
          disabled={!selectedId} 
          onClick={handleEliminar}
        >
          🗑️ ELIMINAR
        </button>
        <button 
          className="btn btn-purple" 
          disabled={!selectedId} 
          onClick={handleRegistrarPago}
        >
          🏦 REGISTRAR PAGO
        </button>
        
        <input 
          type="search" 
          placeholder="Buscar por Documento, DAM, Factura, Estado..." 
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setPage(1);
          }}
          className="toolbar-search"
        />
        
        {viewMode !== 'LISTA' && (
          <button 
            className="btn btn-secondary ml-auto" 
            onClick={() => { setViewMode('LISTA'); setSelectedId(null); setForm(estadoInicialForm); }}
          >
            ⬅️ VOLVER A LISTA
          </button>
        )}
      </div>

      {mensaje.texto && (
        <div className={`alert ${mensaje.tipo === 'error' ? 'alert-error' : mensaje.tipo === 'exito' ? 'alert-success' : 'alert-info'}`}>
          {mensaje.texto}
        </div>
      )}

      {viewMode === 'LISTA' ? (
        // ======================= VISTA: LISTA =======================
        <div className="card">
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '80px' }}>ID Gasto</th>
                  <th>Proveedor</th>
                  <th>Concepto</th>
                  <th style={{ width: '150px' }}>Documento</th>
                  <th style={{ width: '120px' }}>Monto</th>
                  <th style={{ width: '80px' }}>Moneda</th>
                  <th style={{ width: '130px' }}>Estado Pago</th>
                  <th style={{ width: '150px' }}>ID DAM</th>
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
                      className={selectedId === g.id_gasto ? 'selected' : ''}
                    >
                      <td>{g.id_gasto}</td>
                      <td className="font-bold">
                        <span className="truncate-text" title={prov ? prov.label : `ID: ${g.id_proveedor}`}>
                          {prov ? prov.label : `ID: ${g.id_proveedor}`}
                        </span>
                      </td>
                      <td>
                        <span className="truncate-text" title={conc ? conc.label : `ID: ${g.id_concepto}`}>
                          {conc ? conc.label : `ID: ${g.id_concepto}`}
                        </span>
                      </td>
                      <td>
                        <span className="truncate-text" title={g.numero_documento || 'Sin documento'}>
                          {g.numero_documento || 'Sin documento'}
                        </span>
                      </td>
                      <td className="font-bold">{parseFloat(g.monto_original).toFixed(2)}</td>
                      <td className="font-bold">{g.moneda || 'USD'}</td>
                      <td>
                        <span className={`badge ${
                          g.estado_pago === 'PAGADO' ? 'badge-success' : 
                          g.estado_pago === 'PENDIENTE' ? 'badge-danger' : 'badge-warning'
                        }`}>
                          {g.estado_pago}
                        </span>
                      </td>
                      <td>{g.dam_numero || g.id_dam}</td>
                    </tr>
                  );
                })}
                {gastos.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan="8" className="text-center text-muted">No hay registros disponibles.</td>
                  </tr>
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
        </div>
      ) : (
        // ======================= VISTA: NUEVO / MODIFICAR / CONSULTAR =======================
        <form onSubmit={handleGuardar} className="card">
          <h3 className="section-title">
            {viewMode === 'NUEVO' ? '✨ Registrar Nuevo Gasto Logístico' : viewMode === 'MODIFICAR' ? '✏️ Modificar Gasto Logístico' : '👁️ Consultar Detalles de Gasto'}
          </h3>

          {/* FASE A Y B: ENLACE ADUANERO */}
          <div className="card mb-3" style={{ backgroundColor: 'var(--bg-hover)', borderLeft: '4px solid var(--primary)' }}>
            <h4 style={{ color: 'var(--primary-dark)', marginBottom: '15px' }}>1. Vincular a Operación Aduanera</h4>
            <div className="form-grid">
              <div>
                <label className="label-text">Factura Maestra (Embarque) *</label>
                <Select 
                  options={opcionesMaestros} 
                  value={opcionesMaestros.find(op => op.value === form.id_maestro_temp) || null}
                  onChange={(op) => setForm({ ...form, id_maestro_temp: op ? op.value : null, id_dam: null })} 
                  placeholder="Busca la factura principal..." 
                  isClearable 
                  isDisabled={isReadOnly}
                />
              </div>
              <div>
                <label className="label-text">Declaración (DAM) Afectada *</label>
                <Select 
                  options={opcionesDamsFiltradas} 
                  value={opcionesDamsFiltradas.find(op => op.value === form.id_dam) || null}
                  onChange={(op) => setForm({ ...form, id_dam: op ? op.value : null })} 
                  placeholder={form.id_maestro_temp ? "Selecciona la DAM..." : "Primero selecciona un Maestro"} 
                  isDisabled={!form.id_maestro_temp || isReadOnly}
                  isClearable 
                />
              </div>
            </div>
          </div>

          {/* FASE C: DETALLES DEL GASTO */}
          <h4 style={{ color: 'var(--success-dark)', marginBottom: '15px' }}>2. Detalle del Comprobante</h4>
          <div className="form-grid">
            <div>
              <label className="label-text">Proveedor (Emisor) *</label>
              <Select 
                options={opcionesProveedores} 
                value={opcionesProveedores.find(op => op.value === form.id_proveedor) || null} 
                onChange={(op) => setForm({ ...form, id_proveedor: op ? op.value : null })} 
                placeholder="Buscar proveedor..." 
                isClearable 
                isDisabled={isReadOnly}
              />
            </div>
            <div>
              <label className="label-text">Tipo de Comprobante *</label>
              <Select 
                options={opcionesTiposDoc} 
                value={opcionesTiposDoc.find(op => op.value === form.id_tipo_doc) || null} 
                onChange={(op) => setForm({ ...form, id_tipo_doc: op ? op.value : null })} 
                placeholder="Factura, Recibo..." 
                isClearable 
                isDisabled={isReadOnly}
              />
            </div>
            <div>
              <label className="label-text">N° Documento</label>
              <input 
                type="text" 
                name="numero_documento" 
                value={form.numero_documento} 
                onChange={handleChangeTexto} 
                className="form-input" 
                placeholder="Ej: F001-123" 
                disabled={isReadOnly}
              />
            </div>
            <div>
              <label className="label-text">Concepto del Gasto *</label>
              <Select 
                options={opcionesConceptos} 
                value={opcionesConceptos.find(op => op.value === form.id_concepto) || null} 
                onChange={(op) => setForm({ ...form, id_concepto: op ? op.value : null })} 
                placeholder="Flete, Almacenaje, Ajuste..." 
                isClearable 
                isDisabled={isReadOnly}
              />
            </div>
            <div>
              <label className="label-text">Fecha Vencimiento</label>
              <input 
                type="date" 
                name="fecha_vencimiento" 
                value={form.fecha_vencimiento} 
                onChange={handleChangeTexto} 
                className="form-input" 
                disabled={isReadOnly}
              />
            </div>
            <div>
              <label className="label-text">Moneda *</label>
              <select 
                name="moneda" 
                value={form.moneda} 
                onChange={handleChangeTexto} 
                required 
                className="form-input" 
                disabled={isReadOnly}
              >
                <option value="USD">Dólares (USD)</option>
                <option value="PEN">Soles (PEN)</option>
              </select>
            </div>
            <div>
              <label className="label-text">Monto Total *</label>
              <div className="input-group">
                <span className="input-prefix">{form.moneda === 'PEN' ? 'S/' : '$'}</span>
                <input 
                  type="number" 
                  step="0.01" 
                  name="monto_original" 
                  value={form.monto_original} 
                  onChange={handleChangeTexto} 
                  required 
                  className="form-input" 
                  placeholder="0.00" 
                  disabled={isReadOnly}
                />
              </div>
            </div>
          </div>

          {/* ACCIONES DEL FORMULARIO */}
          <div className="form-actions">
            {isReadOnly && (
              <button 
                type="button" 
                onClick={handleRegistrarPago}
                className="btn btn-purple"
              >
                📑 REGISTRAR PAGO
              </button>
            )}
            
            {!isReadOnly && (
              <>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => { setViewMode('LISTA'); setSelectedId(null); setForm(estadoInicialForm); }}
                >
                  CANCELAR
                </button>
                <button 
                  type="submit" 
                  disabled={isGuardando} 
                  className="btn btn-success"
                >
                  {isGuardando ? '⏳ GUARDANDO...' : '💾 GUARDAR GASTO'}
                </button>
              </>
            )}
          </div>
        </form>
      )}
    </div>
  );
};

export default Gastos;
