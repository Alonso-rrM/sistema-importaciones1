import React, { useState, useEffect, useMemo } from 'react';
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
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h2 style={{ color: '#2c3e50', borderBottom: '2px solid #8e44ad', paddingBottom: '10px' }}>Liquidación de Pagos (Gastos Pendientes)</h2>

      {mensaje.texto && (
        <div style={{ padding: '15px', marginBottom: '20px', borderRadius: '5px', backgroundColor: mensaje.tipo === 'error' ? '#f8d7da' : '#d4edda', color: mensaje.tipo === 'error' ? '#721c24' : '#155724', fontWeight: 'bold' }}>
          {mensaje.texto}
        </div>
      )}

      {/* SEARCH BAR CON RESET A PÁGINA 1 */}
      <div style={{ marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <input 
          type="search" 
          placeholder="Buscar por DAM, Factura, Importador, Documento..." 
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setPage(1);
          }}
          style={{ padding: '10px', width: '100%', maxWidth: '500px', borderRadius: '5px', border: '1px solid #ccc' }}
        />
        {isLoading && <span style={{ color: '#7f8c8d', fontSize: '13px' }}>Buscando...</span>}
      </div>

      {/* TABLA DE GASTOS */}
      <div style={{ overflowX: 'auto', backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '8px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#ecf0f1', textAlign: 'left' }}>
              <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>ID Gasto</th>
              <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>DAM</th>
              <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Importador</th>
              <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Estado</th>
              <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Deuda Orig.</th>
              <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Saldo Rest.</th>
              <th style={{ padding: '12px', borderBottom: '2px solid #ddd', textAlign: 'center' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {gastos.map(g => {
              const saldoMostrar = g.saldo_pendiente !== undefined && g.saldo_pendiente !== null
                ? parseFloat(g.saldo_pendiente)
                : parseFloat(g.monto_original);

              return (
                <tr key={g.id_gasto} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '12px' }}>{g.id_gasto}</td>
                  <td style={{ padding: '12px' }}>{g.dam_numero || 'N/A'}</td>
                  <td style={{ padding: '12px', fontWeight: 'bold' }}>{g.importador_nombre || 'Desconocido'}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ 
                      backgroundColor: g.estado_pago === 'PENDIENTE' ? '#e67e22' : '#f39c12', 
                      color: 'white', 
                      padding: '4px 8px', 
                      borderRadius: '4px', 
                      fontSize: '12px', 
                      fontWeight: 'bold' 
                    }}>
                      {g.estado_pago}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>{g.moneda === 'PEN' ? 'S/' : '$'} {parseFloat(g.monto_original).toFixed(2)}</td>
                  <td style={{ padding: '12px', color: '#c0392b', fontWeight: 'bold' }}>
                    {g.moneda === 'PEN' ? 'S/' : '$'} {saldoMostrar.toFixed(2)}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <button 
                      onClick={() => openModal(g)}
                      style={{ backgroundColor: '#2ecc71', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      💸 Aplicar Pago
                    </button>
                  </td>
                </tr>
              );
            })}
            {gastos.length === 0 && !isLoading && (
              <tr><td colSpan="7" style={{ padding: '20px', textAlign: 'center', color: '#7f8c8d' }}>No hay gastos pendientes encontrados.</td></tr>
            )}
          </tbody>
        </table>

        {/* COMPONENTE PAGINADOR */}
        <Paginador 
          page={page} 
          totalPages={totalPages} 
          setPage={setPage} 
          limit={limit} 
          setLimit={setLimit} 
          totalRegistros={totalRegistros} 
        />
      </div>

      {/* MODAL DE PAGO */}
      {isModalOpen && selectedGasto && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ color: '#8e44ad', marginTop: 0, borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
              Aplicar Pago a Gasto #{selectedGasto.id_gasto}
            </h3>
            
            <div style={{ backgroundColor: '#f9f0fd', padding: '10px', borderRadius: '5px', marginBottom: '15px', color: '#68258c' }}>
              <strong>Importador:</strong> {selectedGasto.importador_nombre} <br/>
              <strong>Deuda Restante:</strong> {selectedGasto.moneda === 'PEN' ? 'S/' : '$'} {
                (selectedGasto.saldo_pendiente !== undefined && selectedGasto.saldo_pendiente !== null
                  ? parseFloat(selectedGasto.saldo_pendiente)
                  : parseFloat(selectedGasto.monto_original)).toFixed(2)
              } {selectedGasto.moneda}
            </div>

            <form onSubmit={registrarPago}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Voucher Bancario (Saldo Disponible)</label>
                <Select
                  options={opcionesVouchers}
                  placeholder="Seleccione un voucher con saldo..."
                  isClearable
                  onChange={(opt) => setForm({ ...form, voucher_id: opt ? opt.value : null })}
                  value={opcionesVouchers.find(o => o.value === form.voucher_id) || null}
                  noOptionsMessage={() => "No hay vouchers con saldo para este importador"}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px' }}>Fecha de Pago:</label>
                <input 
                  type="date" 
                  name="fecha_pago"
                  value={form.fecha_pago}
                  onChange={handleChangeTexto}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '5px' }}>Moneda:</label>
                  <select 
                    name="moneda" 
                    value={form.moneda} 
                    onChange={handleChangeMoneda}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                  >
                    <option value="USD">Dólares (USD)</option>
                    <option value="PEN">Soles (PEN)</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '5px' }}>Tipo de Cambio:</label>
                  <input 
                    type="number" 
                    step="0.0001"
                    name="tipo_cambio"
                    value={form.tipo_cambio}
                    onChange={handleChangeTexto}
                    disabled={form.moneda === 'USD'}
                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: form.moneda === 'USD' ? '#f5f5f5' : 'white' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px' }}>Importe Pagado (En Moneda del Gasto):</label>
                <input 
                  type="number" 
                  step="0.01"
                  name="importe"
                  value={form.importe}
                  onChange={handleChangeTexto}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', fontWeight: 'bold' }}
                />
              </div>

              {/* SPRINT 1: Checkbox Moneda Cruzada */}
              <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#e8f8f5', borderRadius: '5px', border: '1px solid #a3e4d7' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 'bold', color: '#16a085', cursor: 'pointer' }}>
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
                  <div style={{ marginTop: '10px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '13px' }}>
                      Débito Real en Voucher (Monto descontado por el Banco en su Moneda Origen):
                    </label>
                    <input 
                      type="number" 
                      step="0.01"
                      name="monto_moneda_origen"
                      value={form.monto_moneda_origen}
                      onChange={handleChangeTexto}
                      placeholder="Ej. 102.50"
                      style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                    />
                    <small style={{ color: '#7f8c8d', display: 'block', marginTop: '5px' }}>
                      Gasto Financiero por TC Calculado: <strong>USD {gastoFinancieroCálculo.toFixed(2)}</strong>
                    </small>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button 
                  type="button" 
                  onClick={closeModal}
                  style={{ padding: '10px 15px', border: 'none', borderRadius: '4px', backgroundColor: '#bdc3c7', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  style={{ padding: '10px 15px', border: 'none', borderRadius: '4px', backgroundColor: '#8e44ad', color: 'white', fontWeight: 'bold', cursor: isSubmitting ? 'not-allowed' : 'pointer' }}
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
