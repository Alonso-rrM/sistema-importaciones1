import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../services/api';
import Select from 'react-select';
import Paginador from '../components/Paginador';
import useDebounce from '../hooks/useDebounce';

const Dams = () => {
  const location = useLocation();

  // --- ESTADOS DE VISTA Y SELECCIÓN ---
  const [viewMode, setViewMode] = useState('LISTA'); // LISTA, NUEVO, MODIFICAR, CONSULTAR
  const [selectedId, setSelectedId] = useState(null);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  // --- DATOS ---
  const [dams, setDams] = useState([]);
  const [maestros, setMaestros] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 400);

  // --- PAGINACIÓN ---
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const [opcionesMaestros, setOpcionesMaestros] = useState([]);
  const [inheritedMaestro, setInheritedMaestro] = useState(null);

  const estadoInicial = {
    id_maestro: null,
    numero_de_dam: '',
    serie: '',
    canal_control: 'VERDE',
    aforo_realizado: false,
    monto_valor_provisional_usd: ''
  };

  const [formData, setFormData] = useState(estadoInicial);

  useEffect(() => {
    cargarCatalogos();
  }, []);

  useEffect(() => {
    cargarDams();
  }, [debouncedSearch, page, limit]);

  useEffect(() => {
    if (location.state && location.state.prefillMaestro) {
      const { prefillMaestro } = location.state;
      setInheritedMaestro(prefillMaestro);
      setFormData(prev => ({ ...prev, id_maestro: prefillMaestro.id_maestro }));
      setViewMode('NUEVO');
      setMensaje({
        texto: `Vínculo preconfigurado con Maestro Factura: ${prefillMaestro.numero_factura}`,
        tipo: 'info'
      });
    }
  }, [location.state]);

  const cargarDams = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/dams/', {
        params: {
          search: debouncedSearch.trim() || undefined,
          page,
          limit
        }
      });
      const dataList = response.data?.data ?? (Array.isArray(response.data) ? response.data : []);
      setDams(dataList);
      setTotalPages(response.data?.total_paginas ?? 1);
      setTotalRegistros(response.data?.total_registros ?? dataList.length);
    } catch (error) {
      console.error("Error al obtener DAMs:", error);
      setMensaje({ texto: "Error al obtener DAMs del servidor.", tipo: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  const cargarCatalogos = async () => {
    try {
      const resMaestros = await api.get('/maestros/?limit=100');
      const maestrosList = resMaestros.data?.data ?? (Array.isArray(resMaestros.data) ? resMaestros.data : []);
      setMaestros(maestrosList);

      setOpcionesMaestros(maestrosList.map(m => ({
        value: m.id_maestro,
        label: `Factura: ${m.numero_factura} | Contenedor: ${m.n_cont_fisico || 'S/N'} (${m.tipo_valor})`
      })));
    } catch (error) {
      console.error(error);
      setMensaje({ texto: 'Error al cargar lista de maestros de importación.', tipo: 'error' });
    }
  };

  const handleChangeTexto = (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setFormData({ ...formData, [e.target.name]: value });
  };

  const handleRowClick = (d) => {
    if (viewMode !== 'LISTA') return;
    if (selectedId === d.id_dam) {
      setSelectedId(null);
      setFormData(estadoInicial);
      setInheritedMaestro(null);
    } else {
      setSelectedId(d.id_dam);
      const parent = maestros.find(m => m.id_maestro === d.id_maestro);
      setInheritedMaestro(parent || null);
      setFormData({
        id_maestro: d.id_maestro,
        numero_de_dam: d.numero_de_dam || '',
        serie: d.serie || '',
        canal_control: d.canal_control || 'VERDE',
        aforo_realizado: d.aforo_realizado || false,
        monto_valor_provisional_usd: d.monto_valor_provisional_usd || ''
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
      await api.delete(`/dams/${selectedId}`, {
        data: { motivo: motivo.trim() }
      });
      alert("Registro eliminado lógicamente.");
      setSelectedId(null);
      setFormData(estadoInicial);
      cargarDams();
    } catch (error) {
      console.error("Error en la solicitud DELETE:", error);
      const detail = error.response?.data?.detail || "Error desconocido";
      alert(`Error al eliminar: ${detail}`);
    }
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!formData.id_maestro) {
      setMensaje({ texto: '❌ Debe vincular la DAM a un Maestro de Importación.', tipo: 'error' });
      return;
    }

    const maestroRelacionado = maestros.find(m => m.id_maestro === formData.id_maestro);
    const esGarantizado = maestroRelacionado?.tipo_valor === 'GARANTIZADO' || maestroRelacionado?.tipo_valor === 'PROVISIONAL';

    if (esGarantizado && (!formData.monto_valor_provisional_usd || parseFloat(formData.monto_valor_provisional_usd) <= 0)) {
      setMensaje({
        texto: '❌ REGLA DE NEGOCIO: Si el Embarque es GARANTIZADO, el Monto de Valor Garantizado debe ser mayor a 0 USD.',
        tipo: 'error'
      });
      return;
    }

    setMensaje({ texto: 'Guardando...', tipo: 'info' });

    try {
      const payload = {
        ...formData,
        monto_valor_provisional_usd: formData.monto_valor_provisional_usd ? parseFloat(formData.monto_valor_provisional_usd) : null,
        serie: formData.serie || null
      };

      if (viewMode === 'NUEVO') {
        await api.post('/dams/', payload);
        setMensaje({ texto: '✅ DAM registrada con éxito.', tipo: 'exito' });
      } else if (viewMode === 'MODIFICAR') {
        await api.put(`/dams/${selectedId}`, payload);
        setMensaje({ texto: '✅ DAM modificada con éxito.', tipo: 'exito' });
      }

      cargarDams();
      setViewMode('LISTA');
      setSelectedId(null);
      setFormData(estadoInicial);
      setInheritedMaestro(null);
      setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);
    } catch (error) {
      console.error(error);
      setMensaje({ texto: `❌ Error al guardar: ${error.response?.data?.detail || 'Revisa los datos'}`, tipo: 'error' });
    }
  };

  const isReadOnly = viewMode === 'CONSULTAR';
  const selectedParentMaestro = maestros.find(m => m.id_maestro === formData.id_maestro);
  const isParentGarantizado = selectedParentMaestro?.tipo_valor === 'GARANTIZADO' || selectedParentMaestro?.tipo_valor === 'PROVISIONAL';

  return (
    <div className="page-container">
      <h2 className="page-title">Declaraciones de Importación (DAMs)</h2>

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
        
        <input 
          type="search" 
          placeholder="Buscar por DAM, Serie..." 
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
            onClick={() => { setViewMode('LISTA'); setSelectedId(null); setFormData(estadoInicial); setInheritedMaestro(null); }}
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
                  <th style={{ width: '80px' }}>ID DAM</th>
                  <th style={{ width: '180px' }}>Nº DAM</th>
                  <th style={{ width: '80px' }}>Serie</th>
                  <th style={{ width: '130px' }}>Canal Control</th>
                  <th style={{ width: '170px' }}>Monto Valor Provisional (USD)</th>
                  <th style={{ width: '130px' }}>Aforo Físico</th>
                  <th>Factura Relacionada</th>
                  <th style={{ width: '150px' }}>Contenedor</th>
                </tr>
              </thead>
              <tbody>
                {dams.map(d => {
                  const maestroParent = maestros.find(m => m.id_maestro === d.id_maestro);
                  return (
                    <tr 
                      key={d.id_dam} 
                      onClick={() => handleRowClick(d)}
                      className={selectedId === d.id_dam ? 'selected' : ''}
                    >
                      <td>{d.id_dam}</td>
                      <td className="font-bold">
                        <span className="truncate-text" title={d.numero_de_dam}>{d.numero_de_dam}</span>
                      </td>
                      <td>{d.serie || '-'}</td>
                      <td>
                        <span className={`badge ${
                          d.canal_control === 'VERDE' ? 'badge-success' : 
                          d.canal_control === 'NARANJA' ? 'badge-warning' : 
                          d.canal_control === 'ROJO' ? 'badge-danger' : 'badge-info'
                        }`}>
                          {d.canal_control || 'SIN CANAL'}
                        </span>
                      </td>
                      <td>
                        {d.monto_valor_provisional_usd ? `$${parseFloat(d.monto_valor_provisional_usd).toFixed(2)}` : '-'}
                      </td>
                      <td>{d.aforo_realizado ? '✅ SÍ' : '❌ NO'}</td>
                      <td className="font-bold">
                        <span className="truncate-text" title={maestroParent ? maestroParent.numero_factura : `ID: ${d.id_maestro}`}>
                          {maestroParent ? maestroParent.numero_factura : `ID: ${d.id_maestro}`}
                        </span>
                      </td>
                      <td>
                        <span className="truncate-text" title={maestroParent?.n_cont_fisico || '-'}>
                          {maestroParent?.n_cont_fisico || '-'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {dams.length === 0 && !isLoading && (
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
            {viewMode === 'NUEVO' ? '✨ Crear Nueva Declaración DAM' : viewMode === 'MODIFICAR' ? '✏️ Modificar Declaración DAM' : '👁️ Consultar Detalles de DAM'}
          </h3>

          {/* VINCULACIÓN A MAESTRO */}
          <div className="card mb-3" style={{ backgroundColor: 'var(--bg-hover)', borderLeft: '4px solid var(--purple)' }}>
            <h4 style={{ color: 'var(--purple)', marginBottom: '15px' }}>1. Vincular a Operación de Embarque (Maestro)</h4>
            
            {inheritedMaestro ? (
              <div className="alert alert-info">
                <strong>Vínculo Activo (Logística):</strong>
                <div className="mt-2 font-bold">
                  📄 Factura: {inheritedMaestro.numero_factura} | 
                  📦 Contenedor: {inheritedMaestro.n_cont_fisico || 'N/A'} | 
                  💰 Valoración: {inheritedMaestro.tipo_valor}
                </div>
                <small className="text-muted mt-2" style={{ display: 'block' }}>
                  * El Maestro se ha importado desde la pantalla de Logística.
                </small>
              </div>
            ) : (
              <div>
                <label className="label-text">Buscar y Seleccionar Factura o Contenedor *</label>
                <Select
                  options={opcionesMaestros}
                  value={opcionesMaestros.find(o => o.value === formData.id_maestro) || null}
                  onChange={op => {
                    setFormData({ ...formData, id_maestro: op ? op.value : null });
                    const selected = maestros.find(m => m.id_maestro === (op ? op.value : null));
                    setInheritedMaestro(selected || null);
                  }}
                  isDisabled={isReadOnly}
                  placeholder="Escriba factura o cont para filtrar..."
                  isClearable
                />
              </div>
            )}

            {isParentGarantizado && (
              <div className="alert alert-warning mt-3">
                ⚠️ El Maestro asociado es de Tipo Valor "GARANTIZADO". 
                El campo "Monto Valor Provisional" es OBLIGATORIO y debe ser mayor a $0 USD.
              </div>
            )}
          </div>

          {/* DATOS DE LA DECLARACIÓN */}
          <h4 style={{ color: 'var(--primary-dark)', marginBottom: '15px' }}>2. Detalles de la DAM</h4>
          <div className="form-grid">
            <div>
              <label className="label-text">N° de DAM *</label>
              <input 
                type="text" 
                name="numero_de_dam" 
                value={formData.numero_de_dam} 
                onChange={handleChangeTexto} 
                required 
                disabled={isReadOnly} 
                className="form-input" 
                placeholder="Ej: 118-2026-10-123456"
              />
            </div>
            <div>
              <label className="label-text">Serie</label>
              <input 
                type="text" 
                name="serie" 
                value={formData.serie} 
                onChange={handleChangeTexto} 
                disabled={isReadOnly} 
                className="form-input" 
                placeholder="Ej: 1"
              />
            </div>
            <div>
              <label className="label-text">Canal de Control</label>
              <select 
                name="canal_control" 
                value={formData.canal_control} 
                onChange={handleChangeTexto} 
                disabled={isReadOnly} 
                className="form-input"
              >
                <option value="VERDE">VERDE</option>
                <option value="NARANJA">NARANJA</option>
                <option value="ROJO">ROJO</option>
              </select>
            </div>
            <div>
              <label className="label-text">Monto Valor Provisional (USD) {isParentGarantizado && '*'}</label>
              <input 
                type="number" 
                step="0.01" 
                name="monto_valor_provisional_usd" 
                value={formData.monto_valor_provisional_usd} 
                onChange={handleChangeTexto} 
                disabled={isReadOnly} 
                className="form-input" 
                placeholder="0.00"
              />
            </div>
          </div>

          {/* CONTROL DE CANAL ROJO */}
          {formData.canal_control === 'ROJO' && (
            <div className="alert alert-error">
              <h5 style={{ margin: '0 0 8px 0', color: 'var(--danger-dark)' }}>Aforo Físico Obligatorio (Canal Rojo)</h5>
              <div className="flex-row">
                <input 
                  type="checkbox" 
                  id="aforo_realizado" 
                  name="aforo_realizado" 
                  checked={formData.aforo_realizado} 
                  onChange={handleChangeTexto} 
                  disabled={isReadOnly}
                  style={{ width: '18px', height: '18px' }}
                />
                <label htmlFor="aforo_realizado" className="font-bold" style={{ cursor: 'pointer' }}>
                  ¿Se ha completado el Aforo Físico reglamentario?
                </label>
              </div>
              <small className="mt-2" style={{ display: 'block', color: 'var(--danger-dark)' }}>
                * Nota: Si el embarque es DEFINITIVO, el aforo físico debe ser marcado como realizado antes de poder autorizar el levante.
              </small>
            </div>
          )}

          {/* BOTON GUARDAR */}
          {!isReadOnly && (
            <div className="form-actions">
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => { setViewMode('LISTA'); setSelectedId(null); setFormData(estadoInicial); setInheritedMaestro(null); }}
              >
                CANCELAR
              </button>
              <button type="submit" className="btn btn-success">
                💾 GUARDAR / ACTUALIZAR DAM
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
};

export default Dams;
