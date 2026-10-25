import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Select from 'react-select';
import Paginador from '../components/Paginador';
import useDebounce from '../hooks/useDebounce';

const selectDarkStyles = {
  control: (base, state) => ({
    ...base,
    backgroundColor: '#020617',
    borderColor: state.isFocused ? '#14b8a6' : '#334155',
    boxShadow: state.isFocused ? '0 0 0 1px #14b8a6' : 'none',
    '&:hover': { borderColor: '#475569' },
    color: '#f8fafc',
    fontSize: '0.8125rem',
    borderRadius: '0.5rem',
    minHeight: '38px'
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    zIndex: 60
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected ? '#0d9488' : state.isFocused ? '#1e293b' : 'transparent',
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

const Vouchers = () => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState('DETALLE'); // 'DETALLE', 'NUEVO', 'MODIFICAR'
  const [selectedId, setSelectedId] = useState(null);

  const [vouchers, setVouchers] = useState([]);
  const [opcionesBancos, setOpcionesBancos] = useState([]);
  const [opcionesImportadores, setOpcionesImportadores] = useState([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [filtroSaldo, setFiltroSaldo] = useState('CON_SALDO'); // 'CON_SALDO', 'TODOS', 'AGOTADOS'

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const [isGuardando, setIsGuardando] = useState(false);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  // Modal de eliminación por auditoría
  const [modalEliminar, setModalEliminar] = useState({ open: false, voucher: null, motivo: '' });
  const [isEliminando, setIsEliminando] = useState(false);

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
  }, [debouncedSearch, page, limit, filtroSaldo]);

  const cargarCatalogos = async () => {
    try {
      const [resBancos, resImportadores] = await Promise.all([
        api.get('/bancos/'),
        api.get('/importadores/')
      ]);
      const bancosList = resBancos.data?.data || resBancos.data || [];
      const importadoresList = resImportadores.data?.data || resImportadores.data || [];

      setOpcionesBancos(bancosList.map(b => ({ value: b.id_banco, label: b.nombre })));
      setOpcionesImportadores(importadoresList.map(i => ({ value: i.id_importador, label: i.nombre })));
    } catch (error) {
      console.error('Error al cargar catálogos:', error);
    }
  };

  const cargarVouchers = async () => {
    setIsLoading(true);
    try {
      const params = {
        page,
        limit,
        search: debouncedSearch.trim() || undefined
      };
      if (filtroSaldo === 'CON_SALDO') params.saldo_mayor_cero = true;
      if (filtroSaldo === 'AGOTADOS') params.saldo_cero = true;

      const res = await api.get('/vouchers/', { params });
      const dataList = res.data?.data || [];
      setVouchers(dataList);
      setTotalPages(res.data?.total_paginas || 1);
      setTotalRegistros(res.data?.total_registros || 0);

      if (selectedId) {
        const found = dataList.find(v => v.id_voucher === selectedId);
        if (found && viewMode === 'DETALLE') {
          syncFormData(found);
        }
      } else if (dataList.length > 0 && viewMode === 'DETALLE') {
        setSelectedId(dataList[0].id_voucher);
        syncFormData(dataList[0]);
      }
    } catch (error) {
      console.error('Error al cargar vouchers:', error);
      mostrarAlerta('No se pudo conectar con el servidor de vouchers.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const syncFormData = (v) => {
    setFormData({
      banco_id: v.banco_id || null,
      id_importador: v.id_importador || null,
      numero_operacion: v.numero_operacion || '',
      monto_total: v.monto_total !== undefined && v.monto_total !== null ? String(v.monto_total) : '',
      moneda: v.moneda || 'USD',
      fecha_transferencia: v.fecha_transferencia ? String(v.fecha_transferencia).slice(0, 10) : ''
    });
  };

  const mostrarAlerta = (texto, tipo = 'info') => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);
  };

  const handleSelect = (v) => {
    setSelectedId(v.id_voucher);
    setViewMode('DETALLE');
    syncFormData(v);
  };

  const handleNuevo = () => {
    setSelectedId(null);
    setViewMode('NUEVO');
    setFormData(estadoInicial);
  };

  const handleModificar = () => {
    if (!selectedVoucher) return;
    setViewMode('MODIFICAR');
    syncFormData(selectedVoucher);
  };

  const handleCancelarEdicion = () => {
    if (selectedVoucher) {
      setViewMode('DETALLE');
      syncFormData(selectedVoucher);
    } else {
      setViewMode('DETALLE');
      if (vouchers.length > 0) {
        handleSelect(vouchers[0]);
      }
    }
  };

  const selectedVoucher = useMemo(() => {
    return vouchers.find(v => v.id_voucher === selectedId) || null;
  }, [vouchers, selectedId]);

  const tienePagos = useMemo(() => {
    if (!selectedVoucher) return false;
    const total = parseFloat(selectedVoucher.monto_total);
    const saldo = parseFloat(selectedVoucher.saldo_disponible);
    return Math.abs(total - saldo) > 0.009;
  }, [selectedVoucher]);

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!formData.banco_id) return mostrarAlerta('Debe seleccionar una entidad bancaria.', 'error');
    if (!formData.id_importador) return mostrarAlerta('Debe seleccionar la empresa importadora.', 'error');
    if (!formData.numero_operacion.trim()) return mostrarAlerta('Debe ingresar el número de operación.', 'error');
    
    const monto = parseFloat(formData.monto_total);
    if (isNaN(monto) || monto <= 0) return mostrarAlerta('El monto total debe ser mayor a 0.', 'error');

    setIsGuardando(true);
    try {
      const payload = {
        banco_id: parseInt(formData.banco_id, 10),
        id_importador: parseInt(formData.id_importador, 10),
        numero_operacion: formData.numero_operacion.trim(),
        monto_total: monto,
        moneda: formData.moneda,
        fecha_transferencia: formData.fecha_transferencia || null
      };

      if (viewMode === 'NUEVO') {
        const res = await api.post('/vouchers/', payload);
        mostrarAlerta('✅ Voucher registrado exitosamente.', 'exito');
        await cargarVouchers();
        setSelectedId(res.data?.id_voucher || null);
        setViewMode('DETALLE');
      } else if (viewMode === 'MODIFICAR') {
        await api.put(`/vouchers/${selectedId}`, payload);
        mostrarAlerta('✅ Voucher actualizado exitosamente.', 'exito');
        await cargarVouchers();
        setViewMode('DETALLE');
      }
    } catch (error) {
      const err = error.response?.data?.detail || 'Error al guardar voucher.';
      mostrarAlerta(`❌ ${err}`, 'error');
    } finally {
      setIsGuardando(false);
    }
  };

  const handleEliminarConfirm = async () => {
    if (!modalEliminar.motivo || modalEliminar.motivo.trim().length < 10) {
      return alert('Debe ingresar un motivo de eliminación válido (mínimo 10 caracteres).');
    }
    setIsEliminando(true);
    try {
      await api.delete(`/vouchers/${modalEliminar.voucher.id_voucher}`, {
        data: { motivo: modalEliminar.motivo.trim() }
      });
      mostrarAlerta(`✅ Voucher #${modalEliminar.voucher.id_voucher} eliminado correctamente.`, 'exito');
      setModalEliminar({ open: false, voucher: null, motivo: '' });
      setSelectedId(null);
      await cargarVouchers();
    } catch (error) {
      const err = error.response?.data?.detail || 'No se pudo eliminar el voucher.';
      mostrarAlerta(`❌ ${err}`, 'error');
    } finally {
      setIsEliminando(false);
    }
  };

  const bancoSeleccionadoNombre = useMemo(() => {
    return opcionesBancos.find(b => b.value === (selectedVoucher?.banco_id || formData.banco_id))?.label || 'N/A';
  }, [opcionesBancos, selectedVoucher, formData.banco_id]);

  const importadorSeleccionadoNombre = useMemo(() => {
    return opcionesImportadores.find(i => i.value === (selectedVoucher?.id_importador || formData.id_importador))?.label || 'N/A';
  }, [opcionesImportadores, selectedVoucher, formData.id_importador]);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      
      {/* HEADER DE MÓDULO */}
      <header className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-xl shadow-inner">
            🎟️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-tight">Vouchers Bancarios y Depósitos</h1>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                Módulo Tesorería
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Control de fondos prepagados y cartas fianza para amortización de obligaciones aduaneras
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleNuevo}
            className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-lg transition-colors shadow-lg shadow-teal-600/20 flex items-center gap-1.5 cursor-pointer"
          >
            <span>+</span>
            <span>Nuevo Voucher</span>
          </button>
          <button
            onClick={() => navigate('/app/pagos')}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-purple-300 text-xs font-semibold rounded-lg border border-purple-500/30 transition-colors flex items-center gap-1.5"
          >
            <span>⚖️</span>
            <span>Ir a Pagos</span>
          </button>
        </div>
      </header>

      {/* MASTER-DETAIL WORKSTATION */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 p-5 min-h-0 overflow-hidden">
        
        {/* BANDEJA IZQUIERDA (38%) */}
        <section className="lg:col-span-5 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl min-h-0">
          
          <div className="p-3.5 border-b border-slate-800 bg-slate-900/60 space-y-2.5 shrink-0">
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                placeholder="Buscar por Nº de Operación..."
                className="w-full pl-9 pr-4 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all"
              />
              <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 text-xs">🔍</span>
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-white text-xs">✕</button>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => { setFiltroSaldo('CON_SALDO'); setPage(1); }}
                className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                  filtroSaldo === 'CON_SALDO'
                    ? 'bg-teal-600 text-white shadow'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Con Saldo
              </button>
              <button
                type="button"
                onClick={() => { setFiltroSaldo('TODOS'); setPage(1); }}
                className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                  filtroSaldo === 'TODOS'
                    ? 'bg-teal-600 text-white shadow'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Todos ({totalRegistros})
              </button>
              <button
                type="button"
                onClick={() => { setFiltroSaldo('AGOTADOS'); setPage(1); }}
                className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                  filtroSaldo === 'AGOTADOS'
                    ? 'bg-teal-600 text-white shadow'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Agotados
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80 p-2 space-y-1 min-h-0">
            {isLoading ? (
              <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
                <span>Cargando vouchers bancarios...</span>
              </div>
            ) : vouchers.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No se encontraron vouchers con los criterios seleccionados.
              </div>
            ) : (
              vouchers.map((v) => {
                const isSelected = selectedId === v.id_voucher;
                const saldoNum = parseFloat(v.saldo_disponible);
                const totalNum = parseFloat(v.monto_total);
                const simbolo = v.moneda === 'PEN' ? 'S/' : '$';
                const tieneSaldo = saldoNum > 0.009;

                const bName = opcionesBancos.find(b => b.value === v.banco_id)?.label || 'Banco';
                const iName = opcionesImportadores.find(i => i.value === v.id_importador)?.label || 'Importador';

                return (
                  <div
                    key={v.id_voucher}
                    onClick={() => handleSelect(v)}
                    className={`p-3 rounded-lg cursor-pointer transition-all border ${
                      isSelected
                        ? 'bg-teal-950/30 border-teal-500/80 shadow-md ring-1 ring-teal-500/20'
                        : 'bg-slate-900/60 hover:bg-slate-800/70 border-slate-800/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-teal-400">#{v.id_voucher}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          tieneSaldo
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        }`}>
                          {tieneSaldo ? 'DISPONIBLE' : 'AGOTADO'}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                          {v.moneda}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">Saldo</span>
                        <span className={`font-mono font-bold text-xs tabular-nums ${tieneSaldo ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {simbolo} {saldoNum.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 text-xs">
                      <div className="font-semibold text-slate-200 truncate">
                        {bName} · Op: {v.numero_operacion}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">
                        🏢 {iName}
                      </div>
                    </div>

                    <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                      <span className="text-[10px] font-mono text-slate-500">
                        Fecha: {v.fecha_transferencia || 'S/F'}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        Total: {simbolo} {totalNum.toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

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

        {/* PANEL DERECHO WORKSTATION (62%) */}
        <section className="lg:col-span-7 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl min-h-0">
          
          {mensaje.texto && (
            <div className={`p-3 border-b text-xs flex items-center justify-between animate-fadeIn ${
              mensaje.tipo === 'exito'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : mensaje.tipo === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-teal-500/10 border-teal-500/30 text-teal-300'
            }`}>
              <span>{mensaje.texto}</span>
              <button onClick={() => setMensaje({ texto: '', tipo: '' })} className="hover:text-white">✕</button>
            </div>
          )}

          {!selectedVoucher && viewMode !== 'NUEVO' ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-500">
              <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-3xl mb-4 shadow-inner">
                🎟️
              </div>
              <h3 className="text-base font-bold text-slate-300">Estación de Gestión de Vouchers</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1.5">
                Seleccione un depósito bancario de la bandeja para consultar consumos, saldos o registrar amortizaciones.
              </p>
              <button
                onClick={handleNuevo}
                className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-teal-600/20"
              >
                + Registrar Nuevo Voucher
              </button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-5 space-y-5">
              
              {/* CABECERA WORKSTATION */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-base font-bold text-white tracking-tight">
                      {viewMode === 'NUEVO' ? '✨ Nuevo Depósito Bancario' : `Voucher #${selectedVoucher?.id_voucher} · ${bancoSeleccionadoNombre}`}
                    </h2>
                    {viewMode !== 'NUEVO' && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        parseFloat(selectedVoucher?.saldo_disponible || 0) > 0.009
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      }`}>
                        {parseFloat(selectedVoucher?.saldo_disponible || 0) > 0.009 ? 'DISPONIBLE' : 'AGOTADO'}
                      </span>
                    )}
                  </div>

                  {viewMode === 'DETALLE' && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleModificar}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <span>✏️</span>
                        <span>Modificar</span>
                      </button>
                      <button
                        onClick={() => setModalEliminar({ open: true, voucher: selectedVoucher, motivo: '' })}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <span>🗑️</span>
                        <span>Eliminar</span>
                      </button>
                      <button
                        onClick={() => navigate('/app/pagos')}
                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-purple-600/20 flex items-center gap-1.5"
                      >
                        <span>💸</span>
                        <span>Liquidar</span>
                      </button>
                    </div>
                  )}
                </div>

                {viewMode !== 'NUEVO' && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1 border-t border-slate-800/80">
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">N° Operación</span>
                      <span className="font-mono text-teal-400 font-bold">{selectedVoucher?.numero_operacion}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">Banco</span>
                      <span className="text-slate-200 font-semibold truncate block">{bancoSeleccionadoNombre}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">Empresa Titular</span>
                      <span className="text-slate-200 font-semibold truncate block">{importadorSeleccionadoNombre}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">Transferencia</span>
                      <span className="font-mono text-slate-200">{selectedVoucher?.fecha_transferencia || 'No indicada'}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* KPIS FINANCIEROS */}
              {viewMode !== 'NUEVO' && selectedVoucher && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Monto Total</span>
                    <div className="mt-1 font-mono font-bold text-sm text-slate-100 tabular-nums">
                      {selectedVoucher.moneda === 'PEN' ? 'S/' : '$'} {parseFloat(selectedVoucher.monto_total).toFixed(2)}
                    </div>
                    <span className="text-[10px] text-slate-500 mt-0.5 block">Depósito inicial</span>
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Consumido</span>
                    <div className="mt-1 font-mono font-bold text-sm text-slate-300 tabular-nums">
                      {selectedVoucher.moneda === 'PEN' ? 'S/' : '$'} {(parseFloat(selectedVoucher.monto_total) - parseFloat(selectedVoucher.saldo_disponible)).toFixed(2)}
                    </div>
                    <span className="text-[10px] text-slate-500 mt-0.5 block">Liquidado en gastos</span>
                  </div>

                  <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-3">
                    <span className="text-[10px] uppercase font-bold text-emerald-400 block tracking-wider">Saldo Disponible</span>
                    <div className="mt-1 font-mono font-bold text-sm text-emerald-400 tabular-nums">
                      {selectedVoucher.moneda === 'PEN' ? 'S/' : '$'} {parseFloat(selectedVoucher.saldo_disponible).toFixed(2)}
                    </div>
                    <span className="text-[10px] text-emerald-500 mt-0.5 block">A favor de la empresa</span>
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Tasa de Consumo</span>
                    <div className="mt-1 font-mono text-sm text-slate-200">
                      {Math.round(((parseFloat(selectedVoucher.monto_total) - parseFloat(selectedVoucher.saldo_disponible)) / parseFloat(selectedVoucher.monto_total)) * 100)}%
                    </div>
                    <span className="text-[10px] text-slate-500 mt-0.5 block">Amortizado</span>
                  </div>
                </div>
              )}

              {/* DETALLE O FORMULARIO */}
              {viewMode === 'DETALLE' ? (
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                    <span className="text-teal-400 text-sm">📋</span>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      Detalles del Comprobante Bancario
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-lg space-y-1.5">
                      <span className="text-[10px] uppercase font-bold text-teal-400 block tracking-wider">Banco & Operación</span>
                      <div className="font-semibold text-slate-200">{bancoSeleccionadoNombre}</div>
                      <div className="font-mono text-slate-400">Nº Op: {selectedVoucher?.numero_operacion}</div>
                    </div>

                    <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-lg space-y-1.5">
                      <span className="text-[10px] uppercase font-bold text-purple-400 block tracking-wider">Empresa Titular</span>
                      <div className="font-semibold text-slate-200">{importadorSeleccionadoNombre}</div>
                      <div className="text-slate-400">Fondos aplicables exclusivamente a esta razón social</div>
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleGuardar} className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <span className="text-teal-400">✏️</span>
                      <span>{viewMode === 'NUEVO' ? 'Registro de Depósito Bancario' : 'Modificación de Voucher'}</span>
                    </h3>
                  </div>

                  {viewMode === 'MODIFICAR' && tienePagos && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-center gap-2">
                      <span>🔒</span>
                      <span><strong>Protección Contable Activa:</strong> Este voucher ya tiene pagos amortizados. El Monto, la Moneda y el Importador están bloqueados por integridad de libros.</span>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                          Entidad Bancaria *
                        </label>
                        <Select
                          options={opcionesBancos}
                          value={opcionesBancos.find(b => b.value === formData.banco_id) || null}
                          onChange={op => setFormData({ ...formData, banco_id: op ? op.value : null })}
                          placeholder="Seleccionar banco..."
                          isClearable
                          styles={selectDarkStyles}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                          Empresa Importadora Titular *
                        </label>
                        <Select
                          options={opcionesImportadores}
                          value={opcionesImportadores.find(i => i.value === formData.id_importador) || null}
                          onChange={op => setFormData({ ...formData, id_importador: op ? op.value : null })}
                          placeholder="Seleccionar importador..."
                          isDisabled={viewMode === 'MODIFICAR' && tienePagos}
                          isClearable
                          styles={selectDarkStyles}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                          N° de Operación Bancaria *
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.numero_operacion}
                          onChange={e => setFormData({ ...formData, numero_operacion: e.target.value })}
                          placeholder="Ej. OP-987654"
                          className="w-full text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-teal-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                          Moneda del Depósito *
                        </label>
                        <select
                          value={formData.moneda}
                          onChange={e => setFormData({ ...formData, moneda: e.target.value })}
                          disabled={viewMode === 'MODIFICAR' && tienePagos}
                          className="w-full text-xs font-bold bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white disabled:bg-slate-950 disabled:text-slate-500 focus:outline-none focus:border-teal-500"
                        >
                          <option value="USD">USD - Dólares ($)</option>
                          <option value="PEN">PEN - Soles (S/)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                          Monto Total Depositado *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={formData.monto_total}
                          onChange={e => setFormData({ ...formData, monto_total: e.target.value })}
                          disabled={viewMode === 'MODIFICAR' && tienePagos}
                          placeholder="0.00"
                          className="w-full text-xs font-mono font-bold bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-right text-emerald-400 disabled:bg-slate-950 disabled:text-slate-500 focus:outline-none focus:border-teal-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                        Fecha de Transferencia / Depósito
                      </label>
                      <input
                        type="date"
                        value={formData.fecha_transferencia}
                        onChange={e => setFormData({ ...formData, fecha_transferencia: e.target.value })}
                        className="w-full sm:w-1/3 text-xs bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-teal-500"
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={handleCancelarEdicion}
                      className="px-4 py-2 border border-slate-700 text-slate-300 hover:bg-slate-800 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isGuardando}
                      className="px-6 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-teal-600/20 flex items-center gap-2 cursor-pointer"
                    >
                      {isGuardando ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Guardando...</span>
                        </>
                      ) : (
                        <span>Guardar Voucher</span>
                      )}
                    </button>
                  </div>
                </form>
              )}

            </div>
          )}
        </section>

      </div>

      {/* MODAL DE ELIMINACIÓN DE AUDITORÍA */}
      {modalEliminar.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden text-slate-100">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                <span>⚠️</span>
                <h3>Eliminar Voucher #{modalEliminar.voucher?.id_voucher}</h3>
              </div>
              <button onClick={() => setModalEliminar({ open: false, voucher: null, motivo: '' })} className="text-slate-400 hover:text-white text-xs">✕</button>
            </div>
            
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-300">
                La eliminación de un voucher bancario es auditada por Tesorería. Por favor justifique el motivo de anulación:
              </p>
              
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">
                  Motivo de Anulación (Mínimo 10 caracteres) *
                </label>
                <textarea
                  rows={3}
                  value={modalEliminar.motivo}
                  onChange={e => setModalEliminar({ ...modalEliminar, motivo: e.target.value })}
                  placeholder="Explique detalladamente la razón de anulación del voucher..."
                  className="w-full text-xs p-3 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500 resize-none"
                />
              </div>
            </div>
            
            <div className="px-5 py-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setModalEliminar({ open: false, voucher: null, motivo: '' })}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleEliminarConfirm}
                disabled={isEliminando || modalEliminar.motivo.trim().length < 10}
                className="px-4 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white rounded-lg transition-all shadow-md shadow-rose-600/20 flex items-center gap-1.5 cursor-pointer"
              >
                {isEliminando ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Eliminando...</span>
                  </>
                ) : (
                  <span>Confirmar Eliminación</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Vouchers;
