import React, { useState, useEffect } from 'react';
import api from '../services/api';
import Select from 'react-select';
import Paginador from '../components/Paginador';
import useDebounce from '../hooks/useDebounce';

const Vouchers = () => {
  // --- ESTADOS DE VISTA Y SELECCIÓN ---
  const [viewMode, setViewMode] = useState('LISTA'); // LISTA, NUEVO, MODIFICAR, CONSULTAR
  const [selectedId, setSelectedId] = useState(null);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  // --- DATOS ---
  const [vouchers, setVouchers] = useState([]);
  const [opcionesBancos, setOpcionesBancos] = useState([]);
  const [opcionesImportadores, setOpcionesImportadores] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 400);

  // --- PAGINACIÓN ---
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const estadoInicial = {
    banco_id: null,
    id_importador: null,
    numero_operacion: '',
    monto_total: '',
    moneda: 'USD',
    fecha_transferencia: ''
  };

  const [formData, setFormData] = useState(estadoInicial);

  useEffect(() => {
    cargarCatalogos();
  }, []);

  useEffect(() => {
    cargarVouchers();
  }, [debouncedSearch, page, limit]);

  const cargarCatalogos = async () => {
    try {
      const [resBancos, resImportadores] = await Promise.all([
        api.get('/bancos/'),
        api.get('/importadores/')
      ]);
      const bList = resBancos.data?.data ?? (Array.isArray(resBancos.data) ? resBancos.data : []);
      const iList = resImportadores.data?.data ?? (Array.isArray(resImportadores.data) ? resImportadores.data : []);
      setOpcionesBancos(bList.map(b => ({ value: b.id_banco, label: b.nombre })));
      setOpcionesImportadores(iList.map(i => ({ value: i.id_importador, label: `${i.ruc} - ${i.nombre}` })));
    } catch (error) {
      console.error('Error al cargar catálogos:', error);
    }
  };

  const cargarVouchers = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/vouchers/', {
        params: {
          search: debouncedSearch.trim() || undefined,
          page,
          limit
        }
      });
      const dataList = response.data?.data ?? (Array.isArray(response.data) ? response.data : []);
      setVouchers(dataList);
      setTotalPages(response.data?.total_paginas ?? 1);
      setTotalRegistros(response.data?.total_registros ?? dataList.length);
    } catch (error) {
      console.error('Error al obtener vouchers:', error);
      setMensaje({ texto: 'Error al obtener vouchers del servidor.', tipo: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRowClick = (voucher) => {
    if (viewMode !== 'LISTA') return;
    if (selectedId === voucher.id_voucher) {
      setSelectedId(null);
      setFormData(estadoInicial);
    } else {
      setSelectedId(voucher.id_voucher);
      setFormData({
        banco_id: voucher.banco_id || null,
        id_importador: voucher.id_importador || null,
        numero_operacion: voucher.numero_operacion || '',
        monto_total: voucher.monto_total || '',
        moneda: voucher.moneda || 'USD',
        fecha_transferencia: voucher.fecha_transferencia || ''
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
      await api.delete(`/vouchers/${selectedId}`, {
        data: { motivo: motivo.trim() }
      });
      alert("Registro eliminado exitosamente.");
      setSelectedId(null);
      setFormData(estadoInicial);
      cargarVouchers();
    } catch (error) {
      console.error(error);
      const detail = error.response?.data?.detail || 'Error de conexión al eliminar';
      alert(`Error: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
    }
  };

  const handleChangeTexto = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleGuardar = async (e) => {
    e.preventDefault();

    if (!formData.banco_id) {
      setMensaje({ texto: '❌ Debe seleccionar una Entidad Bancaria.', tipo: 'error' });
      return;
    }
    if (!formData.id_importador) {
      setMensaje({ texto: '❌ Debe seleccionar la Empresa Importadora.', tipo: 'error' });
      return;
    }
    if (!formData.monto_total || parseFloat(formData.monto_total) <= 0) {
      setMensaje({ texto: '❌ El monto total debe ser mayor a 0.', tipo: 'error' });
      return;
    }

    setMensaje({ texto: 'Guardando...', tipo: 'info' });

    const payload = { ...formData };
    payload.monto_total = parseFloat(payload.monto_total);

    try {
      if (viewMode === 'NUEVO') {
        await api.post('/vouchers/', payload);
        setMensaje({ texto: '✅ Voucher registrado exitosamente.', tipo: 'exito' });
      } else if (viewMode === 'MODIFICAR') {
        setMensaje({ texto: '❌ La modificación directa de vouchers no está soportada todavía.', tipo: 'error' });
        return;
      }
      
      cargarVouchers();
      setViewMode('LISTA');
      setSelectedId(null);
      setFormData(estadoInicial);
      setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);
    } catch (error) {
      console.error(error);
      const rawDetail = error.response?.data?.detail;
      let errorMsg = 'Revisa los datos';
      if (typeof rawDetail === 'string') {
        errorMsg = rawDetail;
      } else if (Array.isArray(rawDetail)) {
        errorMsg = rawDetail.map(d => `${d.loc ? d.loc.slice(1).join('.') : 'campo'}: ${d.msg}`).join(', ');
      } else if (rawDetail && typeof rawDetail === 'object') {
        errorMsg = JSON.stringify(rawDetail);
      }
      setMensaje({ texto: `❌ Error al guardar: ${errorMsg}`, tipo: 'error' });
    }
  };

  const isReadOnly = viewMode === 'CONSULTAR';

  return (
    <div className="page-container">
      <h2 className="page-title">Vouchers Bancarios</h2>

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
          placeholder="Buscar por Nº Operación..." 
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
                  <th style={{ width: '180px' }}>Banco</th>
                  <th>Importador</th>
                  <th style={{ width: '150px' }}>N° Operación</th>
                  <th style={{ width: '90px' }}>Moneda</th>
                  <th style={{ width: '130px' }}>Monto Total</th>
                  <th style={{ width: '140px' }}>Saldo Disponible</th>
                  <th style={{ width: '160px' }}>Fecha Transferencia</th>
                </tr>
              </thead>
              <tbody>
                {vouchers.map(v => {
                  const bancoName = opcionesBancos.find(b => b.value === v.banco_id)?.label || 'Desconocido';
                  const importadorName = opcionesImportadores.find(i => i.value === v.id_importador)?.label || `ID: ${v.id_importador}`;
                  return (
                    <tr 
                      key={v.id_voucher} 
                      onClick={() => handleRowClick(v)}
                      className={selectedId === v.id_voucher ? 'selected' : ''}
                    >
                      <td>{v.id_voucher}</td>
                      <td className="font-bold">{bancoName}</td>
                      <td>
                        <span className="truncate-text" title={importadorName}>
                          {importadorName}
                        </span>
                      </td>
                      <td className="font-bold">{v.numero_operacion}</td>
                      <td>
                        <span className={`badge ${v.moneda === 'USD' ? 'badge-success' : 'badge-warning'}`}>
                          {v.moneda}
                        </span>
                      </td>
                      <td className="font-bold">{parseFloat(v.monto_total).toFixed(2)}</td>
                      <td>
                        <span className={`badge ${parseFloat(v.saldo_disponible) > 0 ? 'badge-success' : 'badge-danger'}`}>
                          {parseFloat(v.saldo_disponible).toFixed(2)}
                        </span>
                      </td>
                      <td>{v.fecha_transferencia || '-'}</td>
                    </tr>
                  );
                })}
                {vouchers.length === 0 && !isLoading && (
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
            {viewMode === 'NUEVO' ? '✨ Crear Nuevo Voucher Bancario' : viewMode === 'MODIFICAR' ? '✏️ Modificar Voucher' : '👁️ Consultar Voucher'}
          </h3>

          <div className="form-grid">
            <div>
              <label className="label-text">Banco *</label>
              <Select 
                options={opcionesBancos} 
                value={opcionesBancos.find(o => o.value === formData.banco_id) || null} 
                onChange={op => setFormData({ ...formData, banco_id: op ? op.value : null })} 
                isDisabled={isReadOnly}
                isClearable 
                placeholder="Seleccione el banco..."
              />
            </div>
            <div>
              <label className="label-text">Empresa Importadora *</label>
              <Select 
                options={opcionesImportadores} 
                value={opcionesImportadores.find(o => o.value === formData.id_importador) || null} 
                onChange={op => setFormData({ ...formData, id_importador: op ? op.value : null })} 
                isDisabled={isReadOnly}
                isClearable 
                placeholder="Seleccione la empresa importadora..."
              />
            </div>
            <div>
              <label className="label-text">N° Operación *</label>
              <input type="text" name="numero_operacion" value={formData.numero_operacion} onChange={handleChangeTexto} required disabled={isReadOnly} className="form-input" />
            </div>
            <div>
              <label className="label-text">Monto Total *</label>
              <input type="number" step="0.01" name="monto_total" value={formData.monto_total} onChange={handleChangeTexto} required disabled={isReadOnly} className="form-input font-bold" />
            </div>
            <div>
              <label className="label-text">Moneda *</label>
              <select name="moneda" value={formData.moneda} onChange={handleChangeTexto} disabled={isReadOnly} className="form-input font-bold">
                <option value="USD">USD</option>
                <option value="PEN">PEN</option>
              </select>
            </div>
            <div>
              <label className="label-text">Fecha de Transferencia *</label>
              <input type="date" name="fecha_transferencia" value={formData.fecha_transferencia} onChange={handleChangeTexto} required disabled={isReadOnly} className="form-input" />
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
                💾 GUARDAR
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
};

export default Vouchers;
