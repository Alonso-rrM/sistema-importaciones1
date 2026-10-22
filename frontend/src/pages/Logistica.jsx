import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Select from 'react-select';
import Paginador from '../components/Paginador';
import useDebounce from '../hooks/useDebounce';

const Logistica = () => {
  const navigate = useNavigate();
  // --- ESTADOS DE VISTA Y SELECCIÓN ---
  const [viewMode, setViewMode] = useState('LISTA'); // LISTA, NUEVO, MODIFICAR, CONSULTAR
  const [selectedId, setSelectedId] = useState(null);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  // --- DATOS ---
  const [maestros, setMaestros] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 400);

  // --- PAGINACIÓN ---
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const [opcionesImportadores, setOpcionesImportadores] = useState([]);
  const [opcionesAgentes, setOpcionesAgentes] = useState([]);
  const [opcionesProveedores, setOpcionesProveedores] = useState([]);
  const [opcionesAlmacenes, setOpcionesAlmacenes] = useState([]);

  const estadoInicial = {
    numero_factura: '',
    n_cont_fisico: '',
    id_agente: null,
    id_importador: null,
    id_proveedor: null,
    documento_transporte: '',
    fecha_embarque: '',
    fecha_arribo: '',
    status_llegada: 'EN TRÁNSITO',
    estado_levante: 'SIN LEVANTE',
    id_almacen: null,
    fob_usd: '',
    flete_usd: '',
    venta_sucesiva: '',
    tipo_valor: 'DEFINITIVO'
  };

  const [formData, setFormData] = useState(estadoInicial);

  useEffect(() => {
    cargarCatalogos();
  }, []);

  useEffect(() => {
    cargarMaestros();
  }, [debouncedSearch, page, limit]);

  const cargarMaestros = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/maestros/', {
        params: {
          search: debouncedSearch.trim() || undefined,
          page,
          limit
        }
      });
      const dataList = response.data?.data ?? (Array.isArray(response.data) ? response.data : []);
      setMaestros(dataList);
      setTotalPages(response.data?.total_paginas ?? 1);
      setTotalRegistros(response.data?.total_registros ?? dataList.length);
    } catch (error) {
      console.error("Error al cargar maestros:", error);
      setMensaje({ texto: "Error al cargar maestros de importación.", tipo: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  const cargarCatalogos = async () => {
    try {
      const [resImp, resAg, resProv, resAlm] = await Promise.all([
        api.get('/importadores/'),
        api.get('/agentes/'),
        api.get('/proveedores/'),
        api.get('/almacenes/')
      ]);
      setOpcionesImportadores(resImp.data.map(i => ({ value: i.id_importador, label: `${i.ruc} - ${i.nombre}` })));
      setOpcionesAgentes(resAg.data.map(a => ({ value: a.id_agente, label: `${a.ruc} - ${a.nombre}` })));
      setOpcionesProveedores(resProv.data.map(p => ({ value: p.id_proveedor, label: `${p.ruc} - ${p.nombre}` })));
      setOpcionesAlmacenes(resAlm.data.map(al => ({ value: al.id_almacen, label: al.nombre })));
    } catch (error) {
      console.error(error);
      setMensaje({ texto: '❌ Error de red al cargar catálogos maestros.', tipo: 'error' });
    }
  };

  const handleChangeTexto = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRowClick = (m) => {
    if (viewMode !== 'LISTA') return;
    if (selectedId === m.id_maestro) {
      setSelectedId(null);
      setFormData(estadoInicial);
    } else {
      setSelectedId(m.id_maestro);
      setFormData({
        numero_factura: m.numero_factura || '',
        n_cont_fisico: m.n_cont_fisico || '',
        id_agente: m.id_agente,
        id_importador: m.id_importador,
        id_proveedor: m.id_proveedor,
        documento_transporte: m.documento_transporte || '',
        fecha_embarque: m.fecha_embarque || '',
        fecha_arribo: m.fecha_arribo || '',
        status_llegada: m.status_llegada || 'EN TRÁNSITO',
        estado_levante: m.estado_levante || 'SIN LEVANTE',
        id_almacen: m.id_almacen,
        fob_usd: m.fob_usd || '',
        flete_usd: m.flete_usd || '',
        venta_sucesiva: m.venta_sucesiva || '',
        tipo_valor: m.tipo_valor || 'DEFINITIVO'
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
      await api.delete(`/maestros/${selectedId}`, {
        data: { motivo: motivo.trim() }
      });
      alert("Registro eliminado lógicamente.");
      setSelectedId(null);
      setFormData(estadoInicial);
      cargarMaestros();
    } catch (error) {
      console.error("Error en la solicitud DELETE:", error);
      const detail = error.response?.data?.detail || "Error desconocido";
      alert(`Error al eliminar: ${detail}`);
    }
  };

  const handleRegistrarDam = () => {
    const selectedMaestro = maestros.find(m => m.id_maestro === selectedId);
    if (selectedMaestro) {
      navigate('/app/dams', { state: { prefillMaestro: selectedMaestro } });
    }
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    setMensaje({ texto: 'Guardando...', tipo: 'info' });

    try {
      const payload = {
        ...formData,
        fob_usd: formData.fob_usd ? parseFloat(formData.fob_usd) : 0,
        flete_usd: formData.flete_usd ? parseFloat(formData.flete_usd) : 0,
        id_almacen: formData.id_almacen || null,
        fecha_embarque: formData.fecha_embarque || null,
        fecha_arribo: formData.fecha_arribo || null,
        documento_transporte: formData.documento_transporte || null,
        n_cont_fisico: formData.n_cont_fisico || null,
        venta_sucesiva: formData.venta_sucesiva || null
      };

      if (viewMode === 'NUEVO') {
        await api.post('/maestros/', payload);
        setMensaje({ texto: '✅ Embarque registrado exitosamente.', tipo: 'exito' });
      } else if (viewMode === 'MODIFICAR') {
        await api.put(`/maestros/${selectedId}`, payload);
        setMensaje({ texto: '✅ Embarque actualizado exitosamente.', tipo: 'exito' });
      }

      cargarMaestros();
      setViewMode('LISTA');
      setSelectedId(null);
      setFormData(estadoInicial);
      setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);
    } catch (error) {
      console.error(error);
      setMensaje({ texto: `❌ Error al guardar: ${error.response?.data?.detail || 'Revisa los datos'}`, tipo: 'error' });
    }
  };

  const cfrCalculado = (parseFloat(formData.fob_usd || 0) + parseFloat(formData.flete_usd || 0)).toFixed(2);
  const isReadOnly = viewMode === 'CONSULTAR';

  return (
    <div className="page-container">
      <h2 className="page-title">Logística y Maestros de Importación</h2>

      {/* TOP COMMAND BAR */}
      <div className="toolbar">
        <button 
          className="btn btn-success" 
          onClick={() => { setViewMode('NUEVO'); setFormData(estadoInicial); setSelectedId(null); }}
        >
          ➕ NUEVO
        </button>
        <button 
          className="btn btn-warning" 
          disabled={!selectedId} 
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
          onClick={handleRegistrarDam}
        >
          📑 REGISTRAR DAM
        </button>
        
        <input 
          type="search" 
          placeholder="Buscar por Factura, BL..." 
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
            onClick={() => { setViewMode('LISTA'); setSelectedId(null); setFormData(estadoInicial); }}
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
                  <th style={{ width: '80px' }}>ID</th>
                  <th style={{ width: '170px' }}>Factura</th>
                  <th>Doc. Transporte</th>
                  <th style={{ width: '120px' }}>FOB (USD)</th>
                  <th style={{ width: '120px' }}>Flete (USD)</th>
                  <th style={{ width: '130px' }}>Tipo Valor</th>
                  <th style={{ width: '140px' }}>Llegada</th>
                  <th style={{ width: '140px' }}>Levante</th>
                </tr>
              </thead>
              <tbody>
                {maestros.map(m => (
                  <tr 
                    key={m.id_maestro} 
                    onClick={() => handleRowClick(m)}
                    className={selectedId === m.id_maestro ? 'selected' : ''}
                  >
                    <td>{m.id_maestro}</td>
                    <td className="font-bold">
                      <span className="truncate-text" title={m.numero_factura}>{m.numero_factura}</span>
                    </td>
                    <td>
                      <span className="truncate-text" title={m.documento_transporte || '-'}>{m.documento_transporte || '-'}</span>
                    </td>
                    <td>${m.fob_usd || '0.00'}</td>
                    <td>${m.flete_usd || '0.00'}</td>
                    <td>
                      <span className={`badge ${m.tipo_valor === 'GARANTIZADO' ? 'badge-warning' : 'badge-info'}`}>
                        {m.tipo_valor || 'DEFINITIVO'}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-warning">{m.status_llegada}</span>
                    </td>
                    <td>
                      <span className={`badge ${m.estado_levante === 'CON LEVANTE' ? 'badge-success' : 'badge-danger'}`}>
                        {m.estado_levante}
                      </span>
                    </td>
                  </tr>
                ))}
                {maestros.length === 0 && !isLoading && (
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
            {viewMode === 'NUEVO' ? '✨ Crear Nueva Cabecera de Importación' : viewMode === 'MODIFICAR' ? '✏️ Modificar Cabecera de Importación' : '👁️ Consultar Detalles de Importación'}
          </h3>

          {/* SECCIÓN 1: IDENTIFICACIÓN */}
          <h4 style={{ color: 'var(--primary-dark)', marginBottom: '15px' }}>1. Identificación y Documentos</h4>
          <div className="form-grid">
            <div>
              <label className="label-text">N° Factura *</label>
              <input type="text" name="numero_factura" value={formData.numero_factura} onChange={handleChangeTexto} required disabled={isReadOnly} className="form-input" />
            </div>
            <div>
              <label className="label-text">Documento Transporte (BL/AWB)</label>
              <input type="text" name="documento_transporte" value={formData.documento_transporte} onChange={handleChangeTexto} disabled={isReadOnly} className="form-input" />
            </div>
            <div>
              <label className="label-text">N° Contenedor Físico</label>
              <input type="text" name="n_cont_fisico" value={formData.n_cont_fisico} onChange={handleChangeTexto} disabled={isReadOnly} className="form-input" />
            </div>
            <div>
              <label className="label-text">Venta Sucesiva</label>
              <input type="text" name="venta_sucesiva" value={formData.venta_sucesiva} onChange={handleChangeTexto} disabled={isReadOnly} className="form-input" placeholder="Opcional" />
            </div>
          </div>

          {/* SECCIÓN 2: VALORES Y FECHAS */}
          <h4 style={{ color: 'var(--primary-dark)', marginBottom: '15px' }}>2. Valores y Tiempos</h4>
          <div className="form-grid">
            <div>
              <label className="label-text">FOB (USD)</label>
              <input type="number" step="0.01" name="fob_usd" value={formData.fob_usd} onChange={handleChangeTexto} disabled={isReadOnly} className="form-input" />
            </div>
            <div>
              <label className="label-text">Flete (USD)</label>
              <input type="number" step="0.01" name="flete_usd" value={formData.flete_usd} onChange={handleChangeTexto} disabled={isReadOnly} className="form-input" />
            </div>
            <div>
              <label className="label-text">CFR Total (Calculado)</label>
              <input type="text" value={cfrCalculado} disabled className="form-input font-bold" style={{ backgroundColor: '#e8f8f5', color: '#16a085' }} />
            </div>
            <div>
              <label className="label-text">Tipo Valor</label>
              <select name="tipo_valor" value={formData.tipo_valor} onChange={handleChangeTexto} disabled={isReadOnly} className="form-input">
                <option value="DEFINITIVO">DEFINITIVO</option>
                <option value="GARANTIZADO">GARANTIZADO</option>
              </select>
            </div>
            <div>
              <label className="label-text">Fecha Embarque</label>
              <input type="date" name="fecha_embarque" value={formData.fecha_embarque} onChange={handleChangeTexto} disabled={isReadOnly} className="form-input" />
            </div>
            <div>
              <label className="label-text">Fecha Arribo</label>
              <input type="date" name="fecha_arribo" value={formData.fecha_arribo} onChange={handleChangeTexto} disabled={isReadOnly} className="form-input" />
            </div>
          </div>

          {/* SECCIÓN 3: STATUS OPERATIVO */}
          <h4 style={{ color: 'var(--primary-dark)', marginBottom: '15px' }}>3. Estatus Operativo</h4>
          <div className="form-grid">
            <div>
              <label className="label-text">Status de Llegada</label>
              <select name="status_llegada" value={formData.status_llegada} onChange={handleChangeTexto} disabled={isReadOnly} className="form-input">
                <option value="EN TRÁNSITO">EN TRÁNSITO</option>
                <option value="EN PUERTO">EN PUERTO</option>
                <option value="EN ALMACÉN">EN ALMACÉN</option>
                <option value="ENTREGADO">ENTREGADO</option>
              </select>
            </div>
            <div>
              <label className="label-text">Estado Levante</label>
              <select 
                name="estado_levante" 
                value={formData.estado_levante} 
                onChange={handleChangeTexto} 
                disabled={true} 
                className="form-input bg-slate-100 cursor-not-allowed font-semibold text-slate-700"
                title="Calculado automáticamente al autorizar el aforo en las DAMs"
              >
                <option value="SIN LEVANTE">SIN LEVANTE</option>
                <option value="CON LEVANTE">CON LEVANTE</option>
              </select>
              <small className="text-slate-500 text-xs block mt-1">
                🔒 (Calculado automáticamente al autorizar el aforo en las DAMs)
              </small>
            </div>
          </div>

          {/* SECCIÓN 4: ACTORES (SELECTS) */}
          <h4 style={{ color: 'var(--primary-dark)', marginBottom: '15px' }}>4. Actores Involucrados</h4>
          <div className="form-grid">
            <div>
              <label className="label-text">Proveedor (Shipper)</label>
              <Select 
                options={opcionesProveedores} 
                value={opcionesProveedores.find(o => o.value === formData.id_proveedor) || null} 
                onChange={op => setFormData({ ...formData, id_proveedor: op ? op.value : null })} 
                isDisabled={isReadOnly}
                isClearable 
                placeholder="Seleccione..."
              />
            </div>
            <div>
              <label className="label-text">Importador (Facturado a)</label>
              <Select 
                options={opcionesImportadores} 
                value={opcionesImportadores.find(o => o.value === formData.id_importador) || null} 
                onChange={op => setFormData({ ...formData, id_importador: op ? op.value : null })} 
                isDisabled={isReadOnly}
                isClearable 
                placeholder="Seleccione..."
              />
            </div>
            <div>
              <label className="label-text">Agente de Aduanas</label>
              <Select 
                options={opcionesAgentes} 
                value={opcionesAgentes.find(o => o.value === formData.id_agente) || null} 
                onChange={op => setFormData({ ...formData, id_agente: op ? op.value : null })} 
                isDisabled={isReadOnly}
                isClearable 
                placeholder="Seleccione..."
              />
            </div>
            <div>
              <label className="label-text">Almacén Destino</label>
              <Select 
                options={opcionesAlmacenes} 
                value={opcionesAlmacenes.find(o => o.value === formData.id_almacen) || null} 
                onChange={op => setFormData({ ...formData, id_almacen: op ? op.value : null })} 
                isDisabled={isReadOnly}
                isClearable 
                placeholder="Seleccione (Opcional)..."
              />
            </div>
          </div>

          {/* BOTON GUARDAR */}
          {!isReadOnly && (
            <div className="form-actions">
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => { setViewMode('LISTA'); setSelectedId(null); setFormData(estadoInicial); }}
              >
                CANCELAR
              </button>
              <button type="submit" className="btn btn-success">
                💾 GUARDAR / ACTUALIZAR
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
};

export default Logistica;
