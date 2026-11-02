import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import Select from 'react-select';
import Paginador from '../components/Paginador';
import useDebounce from '../hooks/useDebounce';

const selectDarkStyles = {
  control: (base, state) => ({
    ...base,
    backgroundColor: '#0f172a', // slate-900
    borderColor: state.isFocused ? '#a855f7' : '#334155', // purple-500 : slate-700
    boxShadow: state.isFocused ? '0 0 0 1px #a855f7' : 'none',
    '&:hover': { borderColor: '#475569' },
    color: '#f8fafc',
    fontSize: '0.8125rem',
    borderRadius: '0.5rem',
    minHeight: '38px'
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: '#1e293b', // slate-800
    border: '1px solid #334155',
    zIndex: 60
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected ? '#7e22ce' : state.isFocused ? '#334155' : 'transparent',
    color: '#f8fafc',
    fontSize: '0.8125rem',
    cursor: 'pointer'
  }),
  singleValue: (base) => ({
    ...base,
    color: '#f8fafc',
    fontSize: '0.8125rem'
  }),
  input: (base) => ({
    ...base,
    color: '#f8fafc',
    fontSize: '0.8125rem'
  }),
  placeholder: (base) => ({
    ...base,
    color: '#94a3b8',
    fontSize: '0.8125rem'
  })
};

const Pagos = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const [gastos, setGastos] = useState([]);
  const [bancos, setBancos] = useState([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [estadoFiltro, setEstadoFiltro] = useState('PENDIENTE,PARCIAL');
  
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  
  const [selectedGasto, setSelectedGasto] = useState(null);
  const [opcionesVouchers, setOpcionesVouchers] = useState([]);
  const [isLoadingVouchers, setIsLoadingVouchers] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [mensajeExito, setMensajeExito] = useState(null);
  const [mensajeError, setMensajeError] = useState(null);

  const [form, setForm] = useState({
    voucher_id: null,
    fecha_pago: new Date().toISOString().split('T')[0],
    moneda: 'USD',
    tipo_cambio: '1.00',
    importe: '',
    pago_moneda_cruzada: false,
    monto_moneda_origen: ''
  });

  // Tab activo: 'REGISTRAR' | 'HISTORIAL'
  const [activeTab, setActiveTab] = useState('REGISTRAR');

  // Estados para la pestaña Historial de Pagos Realizados
  const [pagosHistorial, setPagosHistorial] = useState([]);
  const [searchHistorial, setSearchHistorial] = useState('');
  const debouncedSearchHistorial = useDebounce(searchHistorial, 400);
  const [pageHistorial, setPageHistorial] = useState(1);
  const [limitHistorial, setLimitHistorial] = useState(20);
  const [totalRegistrosHistorial, setTotalRegistrosHistorial] = useState(0);
  const [totalPagesHistorial, setTotalPagesHistorial] = useState(1);
  const [isLoadingHistorial, setIsLoadingHistorial] = useState(false);

  // Modal de anulación de pago en Historial
  const [modalEliminarPago, setModalEliminarPago] = useState({ open: false, pago: null, motivo: '' });
  const [isEliminandoPago, setIsEliminandoPago] = useState(false);

  // Decodificación segura del rol del usuario
  const userRole = useMemo(() => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (user.id_rol) return user.id_rol;
      const token = localStorage.getItem('token');
      if (!token) return 1;
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
      return JSON.parse(jsonPayload)?.id_rol || 1;
    } catch {
      return 1;
    }
  }, []);

  const esUsuarioOperaciones = userRole === 3;

  useEffect(() => {
    cargarBancos();
  }, []);

  useEffect(() => {
    cargarGastos();
  }, [debouncedSearch, page, limit, estadoFiltro]);

  useEffect(() => {
    if (activeTab === 'HISTORIAL') {
      cargarPagosHistorial();
    }
  }, [activeTab, debouncedSearchHistorial, pageHistorial, limitHistorial]);

  // Manejo de parámetro URL ?gasto_id=... para auto-seleccionar
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const paramGastoId = params.get('gasto_id');
    if (paramGastoId) {
      seleccionarGastoPorId(paramGastoId);
    }
  }, [location.search]);

  const cargarBancos = async () => {
    try {
      const res = await api.get('/bancos/');
      setBancos(res.data?.data || res.data || []);
    } catch (error) {
      console.error("Error al cargar bancos:", error);
    }
  };

  const cargarGastos = async () => {
    setIsLoading(true);
    try {
      const params = {
        page,
        limit,
        estado_pago: estadoFiltro || undefined,
        search: debouncedSearch.trim() || undefined
      };
      const res = await api.get('/gastos/', { params });
      const lista = res.data?.data || [];
      setGastos(lista);
      setTotalPages(res.data?.total_paginas || 1);
      setTotalRegistros(res.data?.total_registros || 0);

      // Si tenemos un gasto seleccionado, refrescar sus datos si está en la lista
      if (selectedGasto) {
        const actualizado = lista.find(g => g.id_gasto === selectedGasto.id_gasto);
        if (actualizado) {
          setSelectedGasto(actualizado);
        }
      }
    } catch (error) {
      console.error("Error al cargar gastos:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const seleccionarGastoPorId = async (idGasto) => {
    try {
      // Intentar primero con la lista actual
      let gastoEncontrado = gastos.find(g => String(g.id_gasto) === String(idGasto));
      if (!gastoEncontrado) {
        const res = await api.get('/gastos/', { params: { search: String(idGasto) } });
        gastoEncontrado = (res.data?.data || []).find(g => String(g.id_gasto) === String(idGasto));
      }
      if (gastoEncontrado) {
        handleSelectGasto(gastoEncontrado);
      }
    } catch (error) {
      console.error("Error al auto-seleccionar gasto:", error);
    }
  };

  const handleSelectGasto = async (gasto) => {
    setSelectedGasto(gasto);
    setMensajeExito(null);
    setMensajeError(null);

    const uuid = crypto.randomUUID ? crypto.randomUUID() : `pay-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setIdempotencyKey(uuid);

    const saldoPendienteNum = parseFloat(gasto.saldo_pendiente ?? gasto.monto_original);
    const monedaGasto = gasto.moneda || 'USD';
    
    setForm({
      voucher_id: null,
      fecha_pago: new Date().toISOString().split('T')[0],
      moneda: monedaGasto,
      tipo_cambio: monedaGasto === 'USD' ? '1.00' : '3.75',
      importe: saldoPendienteNum > 0 ? saldoPendienteNum.toFixed(2) : '0.00',
      pago_moneda_cruzada: false,
      monto_moneda_origen: ''
    });

    // Cargar vouchers del importador con saldo mayor a cero
    if (gasto.id_importador) {
      setIsLoadingVouchers(true);
      try {
        const resVouchers = await api.get(`/vouchers/?saldo_mayor_cero=true&id_importador=${gasto.id_importador}&limit=100`);
        const vList = resVouchers.data?.data || [];
        const bancosMap = {};
        bancos.forEach(b => { bancosMap[b.id_banco] = b.nombre; });
        
        const opciones = vList.map(v => ({
          value: v.id_voucher,
          label: `${bancosMap[v.banco_id] || 'Banco'} · Op: ${v.numero_operacion} (Saldo: ${v.moneda} ${parseFloat(v.saldo_disponible).toFixed(2)})`,
          voucher: v
        }));
        setOpcionesVouchers(opciones);
      } catch (error) {
        console.error("Error al cargar vouchers:", error);
        setOpcionesVouchers([]);
      } finally {
        setIsLoadingVouchers(false);
      }
    } else {
      setOpcionesVouchers([]);
    }
  };

  const handleLiquidarTotal = () => {
    if (!selectedGasto) return;
    const saldo = parseFloat(selectedGasto.saldo_pendiente ?? selectedGasto.monto_original);
    setForm(prev => ({
      ...prev,
      importe: saldo.toFixed(2)
    }));
  };

  const registrarPago = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (esUsuarioOperaciones) {
      alert("Operación denegada: Tu rol de Operaciones no tiene permisos para autorizar o liquidar pagos.");
      return;
    }
    if (!form.voucher_id) {
      setMensajeError("Debe seleccionar un Voucher bancario con saldo disponible.");
      return;
    }
    if (!form.importe || parseFloat(form.importe) <= 0) {
      setMensajeError("Debe ingresar un importe mayor a 0.");
      return;
    }

    setIsSubmitting(true);
    setMensajeError(null);
    setMensajeExito(null);

    try {
      const tcVal = parseFloat(form.tipo_cambio) || 1.0;
      let montoOrigenNum = parseFloat(form.importe);
      let gastoFinancieroTc = 0;

      if (form.pago_moneda_cruzada) {
        montoOrigenNum = parseFloat(form.monto_moneda_origen) || 0;
        const convertido = form.moneda === 'PEN' ? (parseFloat(form.importe) / tcVal) : parseFloat(form.importe);
        gastoFinancieroTc = Math.max(0, montoOrigenNum - convertido);
      } else {
        montoOrigenNum = form.moneda === 'PEN' ? (parseFloat(form.importe) / tcVal) : parseFloat(form.importe);
      }

      await api.post('/pagos/', {
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
      }, {
        headers: { 'Idempotency-Key': idempotencyKey }
      });

      setMensajeExito(`¡Pago liquidado exitosamente para el Gasto #${selectedGasto.id_gasto}!`);
      
      // Regenerar idempotency key para evitar colisiones en pagos subsecuentes
      const newUuid = crypto.randomUUID ? crypto.randomUUID() : `pay-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      setIdempotencyKey(newUuid);

      // Recargar gastos y actualizar el seleccionado
      await cargarGastos();
      if (activeTab === 'HISTORIAL') {
        await cargarPagosHistorial();
      }

    } catch (error) {
      const detalle = error.response?.data?.detail || 'Error inesperado al procesar la liquidación.';
      setMensajeError(`Error en pago: ${detalle}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const cargarPagosHistorial = async () => {
    setIsLoadingHistorial(true);
    try {
      const params = {
        page: pageHistorial,
        limit: limitHistorial,
        search: debouncedSearchHistorial.trim() || undefined
      };
      const res = await api.get('/pagos/', { params });
      setPagosHistorial(res.data?.data || []);
      setTotalRegistrosHistorial(res.data?.total_registros || 0);
      setTotalPagesHistorial(res.data?.total_paginas || 1);
    } catch (error) {
      console.error("Error al cargar historial de pagos:", error);
    } finally {
      setIsLoadingHistorial(false);
    }
  };

  const handleEliminarPagoHistorial = async () => {
    if (!modalEliminarPago.motivo || modalEliminarPago.motivo.trim().length < 10) {
      alert("Debe ingresar un motivo de anulación válido (mínimo 10 caracteres).");
      return;
    }
    setIsEliminandoPago(true);
    try {
      await api.delete(`/pagos/${modalEliminarPago.pago.id_pago}`, {
        data: { motivo: modalEliminarPago.motivo.trim() }
      });
      setModalEliminarPago({ open: false, pago: null, motivo: '' });
      await cargarPagosHistorial();
      await cargarGastos();
      setMensajeExito(`✅ Pago #${modalEliminarPago.pago.id_pago} anulado y saldos restituidos exitosamente.`);
    } catch (error) {
      const err = error.response?.data?.detail || 'Error al anular pago.';
      setMensajeError(`❌ ${err}`);
    } finally {
      setIsEliminandoPago(false);
    }
  };

  // Cálculos dinámicos para KPIs
  const montoFacturado = parseFloat(selectedGasto?.monto_original || 0);
  const saldoPendiente = parseFloat(selectedGasto?.saldo_pendiente ?? selectedGasto?.monto_original ?? 0);
  const amortizadoAcumulado = Math.max(0, montoFacturado - saldoPendiente);
  const porcentajeAmortizado = montoFacturado > 0 ? Math.min(100, Math.round((amortizadoAcumulado / montoFacturado) * 100)) : 0;

  // Cálculo en vivo de moneda cruzada
  const tcNum = parseFloat(form.tipo_cambio) || 1.0;
  const importeNum = parseFloat(form.importe) || 0;
  const montoOrigenNum = parseFloat(form.monto_moneda_origen) || 0;
  const montoConvertido = form.moneda === 'PEN' ? (importeNum / tcNum) : importeNum;
  const diferenciaCambioCalculada = form.pago_moneda_cruzada ? Math.max(0, montoOrigenNum - montoConvertido) : 0;

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* HEADER DE MÓDULO */}
      <header className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-xl shadow-inner">
            ⚖️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-tight">Liquidación de Pagos</h1>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Módulo Tesorería
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Idempotencia Activa
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Amortización transaccional de obligaciones contra Vouchers bancarios con conciliación cambiaria
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {esUsuarioOperaciones && (
            <div className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-1.5">
              <span>⚠️</span>
              <span>Modo Consulta (Rol Logística)</span>
            </div>
          )}
          <button
            onClick={() => navigate('/app/gastos')}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5"
          >
            <span>📋</span>
            <span>Ver Registro de Gastos</span>
          </button>
          <button
            onClick={() => navigate('/app/vouchers')}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5"
          >
            <span>🏦</span>
            <span>Ver Vouchers Bancarios</span>
          </button>
        </div>
      </header>

      {/* SELECTOR DE PESTAÑAS TESORERÍA */}
      <div className="px-6 pt-2 bg-slate-900/60 border-b border-slate-800 flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('REGISTRAR')}
          className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
            activeTab === 'REGISTRAR'
              ? 'bg-slate-950 text-purple-400 border-purple-500 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-800/50'
          }`}
        >
          <span>💸</span>
          <span>Registrar Nuevo Pago</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('HISTORIAL')}
          className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
            activeTab === 'HISTORIAL'
              ? 'bg-slate-950 text-purple-400 border-purple-500 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-800/50'
          }`}
        >
          <span>📋</span>
          <span>Historial de Pagos Realizados</span>
          {totalRegistrosHistorial > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-500/20 text-purple-300 font-mono">
              {totalRegistrosHistorial}
            </span>
          )}
        </button>
      </div>

      {/* VISTA 1: WORKSTATION REGISTRAR PAGO (38% BANDEJA / 62% ESTACIÓN) */}
      {activeTab === 'REGISTRAR' && (
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 p-5 min-h-0 overflow-hidden">
        
        {/* ======================================================== */}
        {/* BANDEJA IZQUIERDA (38% / COL-SPAN-5) */}
        {/* ======================================================== */}
        <section className="lg:col-span-5 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl min-h-0">
          
          {/* BARRA DE BÚSQUEDA Y FILTROS RÁPIDOS */}
          <div className="p-3.5 border-b border-slate-800 bg-slate-900/60 space-y-2.5 shrink-0">
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                placeholder="Buscar por DAM, Factura, Proveedor, Importador..."
                className="w-full pl-9 pr-4 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-all"
              />
              <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 text-xs">🔍</span>
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* FILTROS POR ESTADO DE PAGO */}
            <div className="flex items-center gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => { setEstadoFiltro('PENDIENTE,PARCIAL'); setPage(1); }}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                  estadoFiltro === 'PENDIENTE,PARCIAL'
                    ? 'bg-purple-600 text-white shadow'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Pendientes ({totalRegistros})
              </button>
              <button
                type="button"
                onClick={() => { setEstadoFiltro(''); setPage(1); }}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                  estadoFiltro === ''
                    ? 'bg-purple-600 text-white shadow'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => { setEstadoFiltro('PAGADO'); setPage(1); }}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                  estadoFiltro === 'PAGADO'
                    ? 'bg-purple-600 text-white shadow'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Liquidados
              </button>
            </div>
          </div>

          {/* LISTA DE OBLIGACIONES */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80 p-2 space-y-1 min-h-0">
            {isLoading ? (
              <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                <span>Cargando obligaciones financieras...</span>
              </div>
            ) : gastos.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No se encontraron obligaciones financieras con los criterios seleccionados.
              </div>
            ) : (
              gastos.map((g) => {
                const isSelected = selectedGasto?.id_gasto === g.id_gasto;
                const saldoNum = parseFloat(g.saldo_pendiente ?? g.monto_original);
                const originalNum = parseFloat(g.monto_original);
                const simboloMoneda = g.moneda === 'PEN' ? 'S/' : '$';

                return (
                  <div
                    key={g.id_gasto}
                    onClick={() => handleSelectGasto(g)}
                    className={`p-3 rounded-lg cursor-pointer transition-all border ${
                      isSelected
                        ? 'bg-purple-950/30 border-purple-500/80 shadow-md ring-1 ring-purple-500/20'
                        : 'bg-slate-900/60 hover:bg-slate-800/70 border-slate-800/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-purple-400">#{g.id_gasto}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          g.estado_pago === 'PENDIENTE'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            : g.estado_pago === 'PARCIAL'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        }`}>
                          {g.estado_pago}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                          {g.moneda}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">Saldo Restante</span>
                        <span className="font-mono font-bold text-xs text-rose-400 tabular-nums">
                          {simboloMoneda} {saldoNum.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 text-xs">
                      <div className="font-semibold text-slate-200 truncate">
                        {g.concepto_nombre || 'Gasto General'}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate flex items-center gap-1.5 mt-0.5">
                        <span>🏢</span>
                        <span className="truncate">{g.proveedor_nombre || 'Proveedor Sin Especificar'}</span>
                      </div>
                    </div>

                    <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                      <div className="flex items-center gap-2 truncate">
                        <span className="bg-slate-800 px-1.5 py-0.5 rounded font-mono text-[10px] text-slate-300">
                          DAM: {g.dam_numero || 'N/A'}
                        </span>
                        <span className="truncate text-slate-500 font-mono text-[10px]">
                          F: {g.maestro_factura || 'N/A'}
                        </span>
                      </div>
                      <div className="text-right text-[10px] font-mono text-slate-400">
                        Deuda: {simboloMoneda} {originalNum.toFixed(2)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* PAGINADOR DE LA BANDEJA */}
          <div className="p-2 border-t border-slate-800 bg-slate-900/90 shrink-0">
            <Paginador
              page={page}
              totalPages={totalPages}
              setPage={setPage}
              limit={limit}
              setLimit={setLimit}
              totalRegistros={totalRegistros}
            />
          </div>
        </section>

        {/* ======================================================== */}
        {/* PANEL DERECHO WORKSTATION (62% / COL-SPAN-7) */}
        {/* ======================================================== */}
        <section className="lg:col-span-7 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl min-h-0">
          {!selectedGasto ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-500">
              <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-3xl mb-4 shadow-inner">
                ⚖️
              </div>
              <h3 className="text-base font-bold text-slate-300">Estación de Liquidación de Tesorería</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1.5">
                Seleccione una obligación de la bandeja izquierda para auditar saldos, asignar un voucher y amortizar el pago.
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-5 space-y-5">
              
              {/* ALERTA DE ÉXITO O ERROR */}
              {mensajeExito && (
                <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center justify-between animate-fadeIn">
                  <div className="flex items-center gap-2">
                    <span className="text-base">✅</span>
                    <span>{mensajeExito}</span>
                  </div>
                  <button onClick={() => setMensajeExito(null)} className="text-emerald-400 hover:text-white">✕</button>
                </div>
              )}
              {mensajeError && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center justify-between animate-fadeIn">
                  <div className="flex items-center gap-2">
                    <span className="text-base">⚠️</span>
                    <span>{mensajeError}</span>
                  </div>
                  <button onClick={() => setMensajeError(null)} className="text-rose-400 hover:text-white">✕</button>
                </div>
              )}

              {/* CABECERA DE LA OBLIGACIÓN SELECCIONADA */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-base font-bold text-white tracking-tight">
                      Gasto #{selectedGasto.id_gasto} · {selectedGasto.concepto_nombre || 'Gasto General'}
                    </h2>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      selectedGasto.estado_pago === 'PENDIENTE'
                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        : selectedGasto.estado_pago === 'PARCIAL'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    }`}>
                      {selectedGasto.estado_pago}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Importador:</span>
                    <span className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-purple-300 text-xs font-semibold">
                      {selectedGasto.importador_nombre || 'N/A'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1 border-t border-slate-800/80">
                  <div>
                    <span className="text-slate-500 text-[10px] uppercase font-bold block">DAM Vinculada</span>
                    <span className="font-mono text-slate-200">{selectedGasto.dam_numero || 'Sin DAM'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] uppercase font-bold block">Factura Maestro</span>
                    <span className="font-mono text-slate-200">{selectedGasto.maestro_factura || 'Sin Factura'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] uppercase font-bold block">Comprobante</span>
                    <span className="text-slate-200 font-mono truncate block">
                      {selectedGasto.tipo_doc_nombre ? `${selectedGasto.tipo_doc_nombre} - ` : ''}{selectedGasto.numero_documento || 'S/N'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] uppercase font-bold block">Proveedor</span>
                    <span className="text-slate-200 truncate block">{selectedGasto.proveedor_nombre || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* DECK DE KPIS FINANCIEROS */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Monto Facturado</span>
                  <div className="mt-1 font-mono font-bold text-sm text-slate-100 tabular-nums">
                    {selectedGasto.moneda === 'PEN' ? 'S/' : '$'} {montoFacturado.toFixed(2)}
                  </div>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Deuda total inicial</span>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                  <span className="text-[10px] uppercase font-bold text-emerald-400 block tracking-wider">Amortizado</span>
                  <div className="mt-1 font-mono font-bold text-sm text-emerald-400 tabular-nums">
                    {selectedGasto.moneda === 'PEN' ? 'S/' : '$'} {amortizadoAcumulado.toFixed(2)}
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1 mt-1.5 overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${porcentajeAmortizado}%` }}></div>
                  </div>
                </div>

                <div className="bg-rose-950/20 border border-rose-500/30 rounded-xl p-3">
                  <span className="text-[10px] uppercase font-bold text-rose-400 block tracking-wider">Saldo Pendiente</span>
                  <div className="mt-1 font-mono font-bold text-sm text-rose-400 tabular-nums">
                    {selectedGasto.moneda === 'PEN' ? 'S/' : '$'} {saldoPendiente.toFixed(2)}
                  </div>
                  <span className="text-[10px] text-rose-300/70 mt-0.5 block">Exigible a pagar</span>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Vencimiento</span>
                  <div className="mt-1 font-mono text-sm text-slate-200">
                    {selectedGasto.fecha_vencimiento || 'Inmediato'}
                  </div>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Término de crédito</span>
                </div>
              </div>

              {/* FORMULARIO DE LIQUIDACIÓN DE TESORERÍA */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="text-purple-400 text-sm">💳</span>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      Aplicar Liquidación Bancaria
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleLiquidarTotal}
                    disabled={saldoPendiente <= 0}
                    className="px-2.5 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40"
                  >
                    ⚡ Liquidar Saldo Completo
                  </button>
                </div>

                <form onSubmit={registrarPago} className="space-y-4">
                  
                  {/* SELECTOR DE VOUCHER BANCARIO */}
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5 flex items-center justify-between">
                      <span>Voucher Bancario de Origen (Importador) *</span>
                      {isLoadingVouchers && <span className="text-purple-400 text-[10px] animate-pulse">Cargando vouchers...</span>}
                    </label>
                    <Select
                      options={opcionesVouchers}
                      value={opcionesVouchers.find(op => op.value === form.voucher_id) || null}
                      onChange={op => setForm({ ...form, voucher_id: op ? op.value : null })}
                      placeholder="Seleccionar voucher con saldo a favor..."
                      isClearable
                      styles={selectDarkStyles}
                      noOptionsMessage={() => "No hay vouchers con saldo disponible para este importador"}
                    />
                    {opcionesVouchers.length === 0 && !isLoadingVouchers && (
                      <p className="mt-1.5 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 flex items-center gap-1.5">
                        <span>⚠️</span>
                        <span>Este importador no posee vouchers con saldo disponible. Registre un nuevo voucher en Tesorería antes de liquidar.</span>
                      </p>
                    )}
                  </div>

                  {/* PARÁMETROS MONETARIOS */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                        Moneda del Pago
                      </label>
                      <select
                        value={form.moneda}
                        onChange={e => setForm({
                          ...form,
                          moneda: e.target.value,
                          tipo_cambio: e.target.value === 'USD' ? '1.00' : (form.tipo_cambio === '1.00' ? '3.75' : form.tipo_cambio)
                        })}
                        className="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg p-2 font-bold text-white focus:outline-none focus:border-purple-500"
                      >
                        <option value="USD">USD ($)</option>
                        <option value="PEN">PEN (S/)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                        Tipo de Cambio
                      </label>
                      <input
                        type="number"
                        step="0.0001"
                        value={form.tipo_cambio}
                        onChange={e => setForm({ ...form, tipo_cambio: e.target.value })}
                        disabled={form.moneda === 'USD'}
                        className="w-full text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg p-2 text-white disabled:bg-slate-950 disabled:text-slate-500 focus:outline-none focus:border-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                        Importe a Liquidar *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={form.importe}
                        onChange={e => setForm({ ...form, importe: e.target.value })}
                        className="w-full text-xs font-mono font-bold bg-slate-900 border border-slate-700 rounded-lg p-2 text-right text-emerald-400 focus:outline-none focus:border-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                        Fecha Transferencia
                      </label>
                      <input
                        type="date"
                        value={form.fecha_pago}
                        onChange={e => setForm({ ...form, fecha_pago: e.target.value })}
                        className="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>

                  {/* BLOQUE DE MONEDA CRUZADA */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-3">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={form.pago_moneda_cruzada}
                        onChange={e => setForm({ ...form, pago_moneda_cruzada: e.target.checked })}
                        className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-purple-600 focus:ring-purple-500 focus:ring-offset-slate-900"
                      />
                      <span className="text-xs font-bold text-slate-200">
                        ¿Moneda Cruzada (Diferencia Cambiaria Bancaria)?
                      </span>
                    </label>

                    {form.pago_moneda_cruzada && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800 animate-fadeIn">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                            Débito Real en Voucher (Moneda Origen) *
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={form.monto_moneda_origen}
                            onChange={e => setForm({ ...form, monto_moneda_origen: e.target.value })}
                            placeholder="0.00"
                            className="w-full text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg p-2 text-right text-white focus:outline-none focus:border-purple-500"
                          />
                        </div>

                        <div className="flex flex-col justify-center p-2 rounded-lg bg-purple-950/20 border border-purple-500/20 text-xs">
                          <span className="text-[10px] text-purple-300 uppercase font-semibold">Gasto Financiero TC Estimado</span>
                          <span className="font-mono font-bold text-purple-400 mt-0.5">
                            {diferenciaCambioCalculada > 0 ? `$ ${diferenciaCambioCalculada.toFixed(2)}` : '$ 0.00 (Sin sobrecosto)'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* BARRA DE EJECUCIÓN Y PROTECCIÓN TRANSACCIONAL */}
                  <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                      <span>🛡️ Idempotency-Key:</span>
                      <span className="text-slate-300 truncate max-w-[140px] sm:max-w-[200px]" title={idempotencyKey}>
                        {idempotencyKey.substring(0, 16)}...
                      </span>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting || esUsuarioOperaciones || !form.voucher_id || saldoPendiente <= 0}
                      className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-lg text-xs font-bold tracking-wide transition-all shadow-lg shadow-purple-600/20 flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Procesando Liquidación...</span>
                        </>
                      ) : (
                        <>
                          <span>💸</span>
                          <span>Confirmar Liquidación de Pago</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

            </div>
          )}
        </section>

      </div>
      )}

      {/* VISTA 2: HISTORIAL DE PAGOS REALIZADOS */}
      {activeTab === 'HISTORIAL' && (
        <div className="flex-1 flex flex-col p-5 overflow-hidden space-y-4 min-h-0">
          {/* BARRA SUPERIOR DE BÚSQUEDA Y TOTAL */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl shrink-0">
            <div className="relative w-full sm:w-96">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 pointer-events-none text-xs">
                🔍
              </span>
              <input
                type="text"
                value={searchHistorial}
                onChange={(e) => {
                  setSearchHistorial(e.target.value);
                  setPageHistorial(1);
                }}
                placeholder="Buscar por DAM, Voucher, Importador, Concepto, Comprobante..."
                className="w-full pl-8 pr-8 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-all"
              />
              {searchHistorial && (
                <button
                  type="button"
                  onClick={() => setSearchHistorial('')}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-500 hover:text-slate-300 text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span>Total Registros: <strong className="text-white font-mono">{totalRegistrosHistorial}</strong></span>
              <button
                type="button"
                onClick={cargarPagosHistorial}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Actualizar listado de pagos"
              >
                <span>🔄</span>
                <span>Actualizar</span>
              </button>
            </div>
          </div>

          {/* TABLA PRINCIPAL DE HISTORIAL */}
          <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col min-h-0 shadow-xl">
            <div className="flex-1 overflow-x-auto overflow-y-auto">
              <table className="w-full text-left text-xs text-slate-300 border-collapse">
                <thead className="bg-slate-950 sticky top-0 z-10 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">ID / Fecha</th>
                    <th className="py-3 px-4">DAM / Factura</th>
                    <th className="py-3 px-4">Importador</th>
                    <th className="py-3 px-4">Concepto / Proveedor</th>
                    <th className="py-3 px-4">Gasto / Comprobante</th>
                    <th className="py-3 px-4 text-right">Importe Pagado</th>
                    <th className="py-3 px-4">Voucher OP / Banco</th>
                    <th className="py-3 px-4 text-center">Tipo Cambio</th>
                    <th className="py-3 px-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {isLoadingHistorial ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-500">
                        <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                        <span>Cargando historial de pagos...</span>
                      </td>
                    </tr>
                  ) : pagosHistorial.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-500">
                        No se encontraron registros de pagos.
                      </td>
                    </tr>
                  ) : (
                    pagosHistorial.map((pago) => (
                      <tr key={pago.id_pago} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-mono font-bold text-slate-100">#{pago.id_pago}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{pago.fecha_pago || 'S/F'}</div>
                          {pago.es_ajuste_sistema && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30">
                              Ajuste ZD
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-mono text-slate-200">{pago.dam_numero || 'Sin DAM'}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-purple-300 truncate max-w-[160px]" title={pago.importador_nombre}>
                            {pago.importador_nombre || 'N/A'}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-200">{pago.concepto_nombre || 'N/A'}</div>
                          <div className="text-[10px] text-slate-400 truncate max-w-[150px]">{pago.proveedor_nombre || ''}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-mono text-slate-300">{pago.gasto_documento || (pago.id_gasto ? `Gasto #${pago.id_gasto}` : 'N/A')}</div>
                          {pago.gasto_monto && (
                            <div className="text-[10px] text-slate-500 font-mono">
                              Total: {pago.gasto_moneda} {parseFloat(pago.gasto_monto).toFixed(2)}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="font-mono font-bold text-emerald-400 text-sm">
                            {pago.moneda === 'PEN' ? 'S/' : '$'} {parseFloat(pago.importe).toFixed(2)}
                          </div>
                          {pago.pago_moneda_cruzada && (
                            <div className="text-[10px] text-amber-400 font-mono">
                              Cruzado (Orig: {parseFloat(pago.monto_moneda_origen).toFixed(2)})
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-mono text-teal-400 font-bold">{pago.numero_operacion || 'S/V'}</div>
                          <div className="text-[10px] text-slate-400">{pago.banco_nombre || 'Sin Banco'}</div>
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-slate-300">
                          {pago.tipo_cambio ? parseFloat(pago.tipo_cambio).toFixed(3) : '1.000'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => setModalEliminarPago({ open: true, pago, motivo: '' })}
                            className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 mx-auto cursor-pointer"
                            title="Anular y reversar este pago"
                          >
                            <span>🗑️</span>
                            <span>Anular</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* PAGINADOR HISTORIAL */}
            <div className="p-3 bg-slate-950 border-t border-slate-800">
              <Paginador
                paginaActual={pageHistorial}
                totalPaginas={totalPagesHistorial}
                onCambiarPagina={(p) => setPageHistorial(p)}
                limite={limitHistorial}
                onCambiarLimite={(l) => { setLimitHistorial(l); setPageHistorial(1); }}
                totalRegistros={totalRegistrosHistorial}
              />
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL DE ANULACIÓN DE PAGO (DARK SLATE) */}
      {/* ======================================================== */}
      {modalEliminarPago.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden text-slate-100">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                <span>🔄</span>
                <h3>Anular Pago #{modalEliminarPago.pago?.id_pago}</h3>
              </div>
              <button 
                type="button"
                onClick={() => setModalEliminarPago({ open: false, pago: null, motivo: '' })} 
                className="text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Importe a Reversar:</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {modalEliminarPago.pago?.moneda === 'PEN' ? 'S/' : '$'} {parseFloat(modalEliminarPago.pago?.importe || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Voucher / Op:</span>
                  <span className="text-slate-200">
                    {modalEliminarPago.pago?.banco_nombre ? `${modalEliminarPago.pago.banco_nombre} - ` : ''}
                    {modalEliminarPago.pago?.numero_operacion || 'S/V'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Gasto Afectado:</span>
                  <span className="font-mono text-slate-200">
                    {modalEliminarPago.pago?.gasto_documento || (modalEliminarPago.pago?.id_gasto ? `Gasto #${modalEliminarPago.pago?.id_gasto}` : 'N/A')}
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-300">
                Al anular este pago, el dinero será devuelto íntegramente al saldo disponible del voucher bancario y el gasto asociado volverá a recalcular su saldo pendiente.
              </p>
              
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">
                  Motivo de Anulación (Mín. 10 caracteres) *
                </label>
                <textarea 
                  rows={3} 
                  value={modalEliminarPago.motivo} 
                  onChange={(e) => setModalEliminarPago({ ...modalEliminarPago, motivo: e.target.value })} 
                  placeholder="Justifique la razón de anulación para la auditoría de Tesorería..." 
                  className="w-full text-xs p-3 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500 resize-none"
                />
              </div>
            </div>
            
            <div className="px-5 py-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-end gap-2.5">
              <button 
                type="button" 
                onClick={() => setModalEliminarPago({ open: false, pago: null, motivo: '' })} 
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button 
                type="button" 
                onClick={handleEliminarPagoHistorial} 
                disabled={isEliminandoPago || modalEliminarPago.motivo.trim().length < 10} 
                className="px-4 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white rounded-lg transition-all shadow-md shadow-rose-600/20 flex items-center gap-1.5 cursor-pointer"
              >
                {isEliminandoPago ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Anulando...</span>
                  </>
                ) : (
                  <span>Confirmar Anulación</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Pagos;
