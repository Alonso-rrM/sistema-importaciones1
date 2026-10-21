import React, { useState, useEffect } from 'react';
import api from '../services/api';
import Select from 'react-select';
import Paginador from '../components/Paginador';
import useDebounce from '../hooks/useDebounce';

const Pagos = () => {
  const [gastos, setGastos] = useState([]);
  const [bancos, setBancos] = useState([]);
  
  // Paginación y búsqueda server-side
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedGasto, setSelectedGasto] = useState(null);
  const [opcionesVouchers, setOpcionesVouchers] = useState([]);
  
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState('');

  const [form, setForm] = useState({
    voucher_id: null,
    fecha_pago: '',
    moneda: 'USD',
    tipo_cambio: '1.00',
    importe: '',
    pago_moneda_cruzada: false,
    monto_moneda_origen: ''
  });

  // Carga inicial de catálogo auxiliar de bancos
  useEffect(() => {
    cargarBancos();
  }, []);

  const cargarBancos = async () => {
    try {
      const resBancos = await api.get('/bancos/');
      const dataBancos = resBancos.data?.data ?? (Array.isArray(resBancos.data) ? resBancos.data : []);
      setBancos(dataBancos);
    } catch (error) {
      console.error('Error al cargar bancos:', error);
    }
  };

  // Carga de gastos pendientes paginados y filtrados en servidor
  useEffect(() => {
    cargarGastos();
  }, [debouncedSearch, page, limit]);

  const cargarGastos = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/gastos/', {
        params: {
          estado_pago: 'PENDIENTE,PARCIAL',
          search: debouncedSearch.trim() || undefined,
          page,
          limit
        }
      });
      const dataList = res.data?.data ?? (Array.isArray(res.data) ? res.data : []);
      setGastos(dataList);
      setTotalPages(res.data?.total_paginas ?? 1);
      setTotalRegistros(res.data?.total_registros ?? dataList.length);
    } catch (error) {
      console.error('Error al cargar gastos:', error);
      setMensaje({ texto: 'Error de conexión al cargar gastos pendientes.', tipo: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const openModal = async (gasto) => {
    setSelectedGasto(gasto);
    const nuevaClave = (typeof crypto !== 'undefined' && crypto.randomUUID) 
      ? crypto.randomUUID() 
      : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setIdempotencyKey(nuevaClave);

    const saldoPendienteNum = gasto.saldo_pendiente !== undefined && gasto.saldo_pendiente !== null
      ? parseFloat(gasto.saldo_pendiente)
      : parseFloat(gasto.monto_original);

    setForm({
      voucher_id: null,
      fecha_pago: '',
      moneda: 'USD',
      tipo_cambio: '1.00',
      importe: saldoPendienteNum.toFixed(2),
      pago_moneda_cruzada: false,
      monto_moneda_origen: ''
    });
    
    try {
      if (gasto.id_importador) {
        const resVouchers = await api.get(`/vouchers/?saldo_mayor_cero=true&id_importador=${gasto.id_importador}&limit=100`);
        const vList = resVouchers.data?.data ?? (Array.isArray(resVouchers.data) ? resVouchers.data : []);
        
        const bancosMap = {};
        bancos.forEach(b => bancosMap[b.id_banco] = b.nombre);
        
        setOpcionesVouchers(vList.map(v => ({
          value: v.id_voucher,
          label: `${bancosMap[v.banco_id] || 'Banco'} - ${v.numero_operacion} (Saldo: ${v.moneda} ${v.saldo_disponible})`
        })));
      } else {
        setOpcionesVouchers([]);
      }
    } catch (error) {
      console.error("Error fetching vouchers:", error);
    }

    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedGasto(null);
  };

  const handleChangeTexto = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const handleChangeCheckbox = (e) => setForm({ ...form, [e.target.name]: e.target.checked });
  const handleChangeMoneda = (e) => {
    const nuevaMoneda = e.target.value;
    setForm({ 
      ...form, 
      moneda: nuevaMoneda,
      tipo_cambio: nuevaMoneda === 'USD' ? '1.00' : ''
    });
  };

  const registrarPago = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!form.voucher_id) {
      alert('Debe seleccionar un Voucher de pago.');
      return;
    }
    if (!form.importe || parseFloat(form.importe) <= 0) {
      alert('El importe a pagar debe ser mayor a 0.');
      return;
    }

    setIsSubmitting(true);
    try {
      const tcVal = parseFloat(form.tipo_cambio) || 1.0;
      let montoOrigenNum = parseFloat(form.importe);
      let gastoFinancieroTc = 0;

      if (form.pago_moneda_cruzada) {
        if (!form.monto_moneda_origen || parseFloat(form.monto_moneda_origen) <= 0) {
          alert('Para pago de moneda cruzada debe registrar el Débito Real en Voucher.');
          setIsSubmitting(false);
          return;
        }
        montoOrigenNum = parseFloat(form.monto_moneda_origen);
        const montoGastoConvertido = form.moneda === 'PEN' ? (parseFloat(form.importe) / tcVal) : parseFloat(form.importe);
        gastoFinancieroTc = Math.max(0, montoOrigenNum - montoGastoConvertido);
      } else {
        montoOrigenNum = form.moneda === 'PEN' ? (parseFloat(form.importe) / tcVal) : parseFloat(form.importe);
      }

      const payload = {
        id_gasto: selectedGasto.id_gasto,
        id_importador: selectedGasto.id_importador,
        voucher_id: form.voucher_id,
        fecha_pago: form.fecha_pago || null,
        moneda: form.moneda,
        importe: parseFloat(form.importe),
        tipo_cambio: parseFloat(form.tipo_cambio),
        pago_moneda_cruzada: form.pago_moneda_cruzada,
        monto_moneda_origen: montoOrigenNum,
        gasto_financiero_tc: gastoFinancieroTc
      };
      
      await api.post('/pagos/', payload, {
        headers: {
          'Idempotency-Key': idempotencyKey
        }
      });
      setMensaje({ texto: '✅ Pago registrado con éxito.', tipo: 'exito' });
      
      cargarGastos();
      closeModal();
      setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);

    } catch (error) {
      console.error(error);
      if (error.response && error.response.data && error.response.data.detail) {
        alert(`❌ Error: ${error.response.data.detail}`);
      } else {
        alert('❌ Error de conexión al registrar el pago.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const importeNum = parseFloat(form.importe) || 0;
  const tcNum = parseFloat(form.tipo_cambio) || 0;
  const importeConvertido = form.moneda === 'PEN' && tcNum > 0 ? (importeNum / tcNum) : importeNum;
  const montoOrigenNum = parseFloat(form.monto_moneda_origen) || 0;
  const gastoFinancieroCálculo = form.pago_moneda_cruzada ? Math.max(0, montoOrigenNum - importeConvertido) : 0;

  return (
    <div className="page-container">
      <h2 className="page-title" style={{ borderBottomColor: 'var(--purple)' }}>
        Liquidación de Pagos (Gastos Pendientes)
      </h2>

      {mensaje.texto && (
        <div className={`alert ${mensaje.tipo === 'error' ? 'alert-error' : 'alert-success'}`}>
          {mensaje.texto}
        </div>
      )}

      {/* SEARCH BAR CON RESET A PÁGINA 1 */}
      <div className="toolbar">
        <input 
          type="search" 
          placeholder="Buscar por DAM, Factura, Importador, Documento..." 
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setPage(1);
          }}
          className="form-input"
          style={{ maxWidth: '500px' }}
        />
        {isLoading && <span className="text-muted" style={{ fontSize: '13px' }}>Buscando...</span>}
      </div>

      {/* TABLA DE GASTOS */}
      <div className="card">
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '80px' }}>ID Gasto</th>
                <th style={{ width: '160px' }}>DAM</th>
                <th>Importador</th>
                <th style={{ width: '130px' }}>Estado</th>
                <th style={{ width: '130px' }}>Deuda Orig.</th>
                <th style={{ width: '130px' }}>Saldo Rest.</th>
                <th style={{ width: '140px', textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {gastos.map(g => {
                const saldoMostrar = g.saldo_pendiente !== undefined && g.saldo_pendiente !== null
                  ? parseFloat(g.saldo_pendiente)
                  : parseFloat(g.monto_original);

                return (
                  <tr key={g.id_gasto}>
                    <td>{g.id_gasto}</td>
                    <td>{g.dam_numero || 'N/A'}</td>
                    <td className="font-bold">
                      <span className="truncate-text" title={g.importador_nombre || 'Desconocido'}>
                        {g.importador_nombre || 'Desconocido'}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-warning">
                        {g.estado_pago}
                      </span>
                    </td>
                    <td>{g.moneda === 'PEN' ? 'S/' : '$'} {parseFloat(g.monto_original).toFixed(2)}</td>
                    <td className="font-bold" style={{ color: 'var(--danger-dark)' }}>
                      {g.moneda === 'PEN' ? 'S/' : '$'} {saldoMostrar.toFixed(2)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button 
                        onClick={() => openModal(g)}
                        className="btn btn-success"
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                      >
                        💸 Aplicar Pago
                      </button>
                    </td>
                  </tr>
                );
              })}
              {gastos.length === 0 && !isLoading && (
                <tr>
                  <td colSpan="7" className="text-center text-muted">No hay gastos pendientes encontrados.</td>
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

      {/* MODAL DE PAGO */}
      {isModalOpen && selectedGasto && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ color: 'var(--purple)' }}>
                Aplicar Pago a Gasto #{selectedGasto.id_gasto}
              </h3>
              <button className="btn btn-secondary" onClick={closeModal} style={{ padding: '4px 10px' }}>
                ✕
              </button>
            </div>
            
            <div className="alert alert-info">
              <strong>Importador:</strong> {selectedGasto.importador_nombre} <br/>
              <strong>Deuda Restante:</strong> {selectedGasto.moneda === 'PEN' ? 'S/' : '$'} {
                (selectedGasto.saldo_pendiente !== undefined && selectedGasto.saldo_pendiente !== null
                  ? parseFloat(selectedGasto.saldo_pendiente)
                  : parseFloat(selectedGasto.monto_original)).toFixed(2)
              } {selectedGasto.moneda}
            </div>

            <form onSubmit={registrarPago}>
              <div className="mb-3">
                <label className="label-text">Voucher Bancario (Saldo Disponible) *</label>
                <Select
                  options={opcionesVouchers}
                  placeholder="Seleccione un voucher con saldo..."
                  isClearable
                  onChange={(opt) => setForm({ ...form, voucher_id: opt ? opt.value : null })}
                  value={opcionesVouchers.find(o => o.value === form.voucher_id) || null}
                  noOptionsMessage={() => "No hay vouchers con saldo para este importador"}
                />
              </div>

              <div className="mb-3">
                <label className="label-text">Fecha de Pago</label>
                <input 
                  type="date" 
                  name="fecha_pago"
                  value={form.fecha_pago}
                  onChange={handleChangeTexto}
                  className="form-input"
                />
              </div>

              <div className="form-grid mb-3">
                <div>
                  <label className="label-text">Moneda *</label>
                  <select 
                    name="moneda" 
                    value={form.moneda} 
                    onChange={handleChangeMoneda}
                    className="form-input"
                  >
                    <option value="USD">Dólares (USD)</option>
                    <option value="PEN">Soles (PEN)</option>
                  </select>
                </div>
                <div>
                  <label className="label-text">Tipo de Cambio</label>
                  <input 
                    type="number" 
                    step="0.0001"
                    name="tipo_cambio"
                    value={form.tipo_cambio}
                    onChange={handleChangeTexto}
                    disabled={form.moneda === 'USD'}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="mb-3">
                <label className="label-text">Importe Pagado (En Moneda del Gasto) *</label>
                <input 
                  type="number" 
                  step="0.01"
                  name="importe"
                  value={form.importe}
                  onChange={handleChangeTexto}
                  className="form-input font-bold"
                  required
                />
              </div>

              {/* SPRINT 1: Checkbox Moneda Cruzada */}
              <div className="card mb-3" style={{ backgroundColor: 'var(--bg-hover)', borderLeft: '4px solid var(--success)' }}>
                <label className="flex-row font-bold" style={{ cursor: 'pointer', color: 'var(--success-dark)' }}>
                  <input 
                    type="checkbox" 
                    name="pago_moneda_cruzada"
                    checked={form.pago_moneda_cruzada}
                    onChange={handleChangeCheckbox}
                    style={{ width: '18px', height: '18px' }}
                  />
                  ¿Es Pago con Moneda Cruzada? (Diferencia cambiaria bancaria)
                </label>

                {form.pago_moneda_cruzada && (
                  <div className="mt-2">
                    <label className="label-text">
                      Débito Real en Voucher (Monto descontado por el Banco en su Moneda Origen):
                    </label>
                    <input 
                      type="number" 
                      step="0.01"
                      name="monto_moneda_origen"
                      value={form.monto_moneda_origen}
                      onChange={handleChangeTexto}
                      placeholder="Ej. 102.50"
                      className="form-input"
                    />
                    <small className="text-muted mt-2" style={{ display: 'block' }}>
                      Gasto Financiero por TC Calculado: <strong>USD {gastoFinancieroCálculo.toFixed(2)}</strong>
                    </small>
                  </div>
                )}
              </div>

              <div className="form-actions">
                <button 
                  type="button" 
                  onClick={closeModal}
                  className="btn btn-secondary"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="btn btn-purple"
                >
                  {isSubmitting ? 'Procesando...' : 'Confirmar Pago'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Pagos;
