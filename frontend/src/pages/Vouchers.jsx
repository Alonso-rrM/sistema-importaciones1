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

  // --- MODAL DE ELIMINACIÓN ---
  const [voucherAEliminar, setVoucherAEliminar] = useState(null);
  const [motivoEliminacion, setMotivoEliminacion] = useState('');
  const [isEliminando, setIsEliminando] = useState(false);

  useEffect(() => {
    cargarCatalogos();
  }, []);

  useEffect(() => {
    cargarVouchers();
  }, [debouncedSearch, page, limit]);

  // --- CONTROL GLOBAL TECLA ESCAPE (ESC) ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (voucherAEliminar) {
          cerrarModalEliminar();
        } else if (viewMode !== 'LISTA') {
          setViewMode('LISTA');
          setSelectedId(null);
          setFormData(estadoInicial);
        } else if (selectedId) {
          setSelectedId(null);
          setFormData(estadoInicial);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [voucherAEliminar, viewMode, selectedId]);

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

  const selectedVoucher = vouchers.find(v => v.id_voucher === selectedId);
  const tienePagos = selectedVoucher ? parseFloat(selectedVoucher.monto_total) !== parseFloat(selectedVoucher.saldo_disponible) : false;

  const abrirModalEliminar = (voucher) => {
    if (!voucher) return;
    const tieneAmortizaciones = parseFloat(voucher.monto_total) !== parseFloat(voucher.saldo_disponible);
    if (tieneAmortizaciones) {
      setMensaje({
        texto: `❌ Operación denegada: El voucher N° ${voucher.numero_operacion} ya tiene pagos amortizados. Para poder eliminarlo, primero debe anular los pagos asociados en el módulo de Pagos.`,
        tipo: 'error'
      });
      return;
    }
    setVoucherAEliminar(voucher);
    setMotivoEliminacion('');
  };

  const cerrarModalEliminar = () => {
    if (isEliminando) return;
    setVoucherAEliminar(null);
    setMotivoEliminacion('');
  };

  const confirmarEliminacion = async () => {
    if (!voucherAEliminar) return;
    if (motivoEliminacion.trim().length < 10) {
      setMensaje({ texto: '❌ El motivo debe tener al menos 10 caracteres.', tipo: 'error' });
      return;
    }

    setIsEliminando(true);
    try {
      await api.delete(`/vouchers/${voucherAEliminar.id_voucher}`, {
        data: { motivo: motivoEliminacion.trim() }
      });
      setMensaje({ texto: `✅ Voucher N° ${voucherAEliminar.numero_operacion} eliminado exitosamente.`, tipo: 'exito' });
      setVoucherAEliminar(null);
      setMotivoEliminacion('');
      setSelectedId(null);
      setFormData(estadoInicial);
      if (viewMode !== 'LISTA') setViewMode('LISTA');
      cargarVouchers();
      setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);
    } catch (error) {
      console.error(error);
      const rawDetail = error.response?.data?.detail;
      let errorMsg = 'Error al eliminar';
      if (typeof rawDetail === 'string') errorMsg = rawDetail;
      else if (Array.isArray(rawDetail)) errorMsg = rawDetail.map(d => `${d.loc ? d.loc.slice(1).join('.') : 'campo'}: ${d.msg}`).join(', ');
      else if (rawDetail && typeof rawDetail === 'object') errorMsg = JSON.stringify(rawDetail);
      setMensaje({ texto: `❌ ${errorMsg}`, tipo: 'error' });
    } finally {
      setIsEliminando(false);
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
        await api.put(`/vouchers/${selectedId}`, payload);
        setMensaje({ texto: '✅ Voucher actualizado exitosamente.', tipo: 'exito' });
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
          onClick={() => {
            if (!selectedId) {
              setMensaje({ texto: '⚠️ Seleccione primero un voucher haciendo clic sobre una fila, o use el botón 🗑️ directo en la columna Acciones.', tipo: 'info' });
              return;
            }
            abrirModalEliminar(selectedVoucher);
          }}
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

        {selectedId && viewMode === 'LISTA' && (
          <button 
            type="button" 
            className="btn btn-secondary" 
            title="Quitar selección (Escape)"
            onClick={() => { setSelectedId(null); setFormData(estadoInicial); }}
          >
            ✕ DESELECCIONAR
          </button>
        )}

        {viewMode !== 'LISTA' && (
          <button 
            type="button"
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
                  <th style={{ width: '110px' }} className="text-center">Acciones</th>
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
                      <td className="text-center" onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button 
                            type="button" 
                            className="btn btn-warning" 
                            style={{ padding: '4px 8px', fontSize: '13px' }} 
                            title="Modificar Voucher"
                            onClick={() => {
                              setSelectedId(v.id_voucher);
                              setFormData({
                                banco_id: v.banco_id || null,
                                id_importador: v.id_importador || null,
                                numero_operacion: v.numero_operacion || '',
                                monto_total: v.monto_total || '',
                                moneda: v.moneda || 'USD',
                                fecha_transferencia: v.fecha_transferencia || ''
                              });
                              setViewMode('MODIFICAR');
                            }}
                          >
                            ✏️
                          </button>
                          <button 
                            type="button" 
                            className="btn btn-danger" 
                            style={{ padding: '4px 8px', fontSize: '13px' }} 
                            title="Eliminar Voucher"
                            onClick={() => abrirModalEliminar(v)}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {vouchers.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan="9" className="text-center text-muted">No hay registros disponibles.</td>
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

          {viewMode === 'MODIFICAR' && tienePagos && (
            <div className="alert alert-warning mb-3">
              🔒 <strong>Voucher con Pagos Aplicados:</strong> Este voucher ya fue aplicado a liquidaciones de gastos. 
              Por integridad contable, el <strong>Monto Total</strong>, la <strong>Moneda</strong> y la <strong>Empresa Importadora</strong> están bloqueados. 
              Solo puede modificar el Banco, N° de Operación y Fecha.
            </div>
          )}

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
                isDisabled={isReadOnly || (viewMode === 'MODIFICAR' && tienePagos)}
                isClearable 
                placeholder="Seleccione la empresa importadora..."
              />
            </div>
            <div>
              <label className="label-text">N° Operación *</label>
              <input type="text" name="numero_operacion" value={formData.numero_operacion} onChange={handleChangeTexto} required disabled={isReadOnly} className="form-input" />
            </div>
            <div>
              <label className="label-text">Monto Total * {viewMode === 'MODIFICAR' && tienePagos && '(Bloqueado por pagos)'}</label>
              <input 
                type="number" 
                step="0.01" 
                name="monto_total" 
                value={formData.monto_total} 
                onChange={handleChangeTexto} 
                required 
                disabled={isReadOnly || (viewMode === 'MODIFICAR' && tienePagos)} 
                className="form-input font-bold" 
              />
            </div>
            <div>
              <label className="label-text">Moneda * {viewMode === 'MODIFICAR' && tienePagos && '(Bloqueado por pagos)'}</label>
              <select 
                name="moneda" 
                value={formData.moneda} 
                onChange={handleChangeTexto} 
                disabled={isReadOnly || (viewMode === 'MODIFICAR' && tienePagos)} 
                className="form-input font-bold"
              >
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

      {/* ======================= MODAL CONFIRMAR ELIMINACIÓN ======================= */}
      {voucherAEliminar && (
        <div className="modal-overlay" onClick={cerrarModalEliminar}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: 'var(--danger-dark)' }}>
                🗑️ Confirmar Eliminación de Voucher
              </h3>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={cerrarModalEliminar} 
                style={{ padding: '4px 10px' }}
                disabled={isEliminando}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <p style={{ margin: '0 0 10px 0', fontSize: '14px', color: 'var(--text-main)' }}>
                ¿Está seguro de que desea eliminar el voucher <strong>N° {voucherAEliminar.numero_operacion}</strong>?
              </p>
              <div style={{ backgroundColor: 'var(--bg-body)', padding: '12px', borderRadius: '6px', fontSize: '13px', lineHeight: '1.6' }}>
                <div><strong>ID:</strong> #{voucherAEliminar.id_voucher}</div>
                <div><strong>Banco:</strong> {opcionesBancos.find(b => b.value === voucherAEliminar.banco_id)?.label || 'Desconocido'}</div>
                <div><strong>Monto Total:</strong> {voucherAEliminar.moneda} {parseFloat(voucherAEliminar.monto_total).toFixed(2)}</div>
                <div><strong>Saldo Disponible:</strong> {voucherAEliminar.moneda} {parseFloat(voucherAEliminar.saldo_disponible).toFixed(2)}</div>
              </div>
            </div>

            <div>
              <label className="label-text">
                Motivo de Eliminación * 
                <span style={{ fontSize: '12px', marginLeft: '6px', color: motivoEliminacion.trim().length >= 10 ? 'var(--success)' : 'var(--danger)' }}>
                  ({motivoEliminacion.trim().length}/10 caracteres requeridos)
                </span>
              </label>
              <textarea 
                className="form-input" 
                rows="3" 
                placeholder="Indique el motivo de la eliminación (mínimo 10 caracteres)..."
                value={motivoEliminacion}
                onChange={(e) => setMotivoEliminacion(e.target.value)}
                disabled={isEliminando}
                autoFocus
              />
            </div>

            <div className="modal-footer">
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={cerrarModalEliminar} 
                disabled={isEliminando}
              >
                CANCELAR
              </button>
              <button 
                type="button" 
                className="btn btn-danger" 
                onClick={confirmarEliminacion} 
                disabled={motivoEliminacion.trim().length < 10 || isEliminando}
              >
                {isEliminando ? 'Eliminando...' : '🗑️ CONFIRMAR ELIMINACIÓN'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Vouchers;
