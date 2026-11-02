import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import Select from 'react-select';
import Paginador from '../components/Paginador';
import useDebounce from '../hooks/useDebounce';

const selectDarkStyles = {
  control: (base, state) => ({
    ...base,
    backgroundColor: '#020617', // slate-950
    borderColor: state.isFocused ? '#14b8a6' : '#334155', // teal-500 : slate-700
    boxShadow: state.isFocused ? '0 0 0 1px #14b8a6' : 'none',
    '&:hover': { borderColor: '#475569' },
    color: '#f8fafc',
    fontSize: '0.8125rem',
    borderRadius: '0.5rem',
    minHeight: '38px'
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: '#0f172a', // slate-900
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

const Gastos = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [viewMode, setViewMode] = useState('LISTA'); // 'LISTA', 'NUEVO', 'MODIFICAR'
  const [selectedId, setSelectedId] = useState(null);

  const [gastos, setGastos] = useState([]);
  const [maestrosRaw, setMaestrosRaw] = useState([]);
  const [damsRaw, setDamsRaw] = useState([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [monedaFiltro, setMonedaFiltro] = useState('');
  const [tipoGastoFiltro, setTipoGastoFiltro] = useState('');
  const [conceptoFiltro, setConceptoFiltro] = useState('');
  const [proveedorFiltro, setProveedorFiltro] = useState('');
  const [vencimientoFiltro, setVencimientoFiltro] = useState('');
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const [opcionesMaestros, setOpcionesMaestros] = useState([]);
  const [opcionesConceptos, setOpcionesConceptos] = useState([]);
  const [opcionesProveedores, setOpcionesProveedores] = useState([]);
  const [opcionesTiposDoc, setOpcionesTiposDoc] = useState([]);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isGuardando, setIsGuardando] = useState(false);

  // Estado para el modal nativo de eliminación
  const [modalEliminar, setModalEliminar] = useState({ open: false, id: null, motivo: '' });

  const estadoInicialForm = {
    id_maestro_temp: null,
    id_dam: null,
    id_concepto: null,
    id_proveedor: null,
    id_tipo_doc: null,
    numero_documento: '',
    fecha_vencimiento: '',
    monto_original: '',
    moneda: 'USD',
    dam_numero: ''
  };
  const [form, setForm] = useState(estadoInicialForm);

  useEffect(() => {
    cargarCatalogos();
  }, []);

  useEffect(() => {
    cargarListaGastos();
  }, [debouncedSearch, page, limit, estadoFiltro, monedaFiltro, tipoGastoFiltro, conceptoFiltro, proveedorFiltro, vencimientoFiltro]);

  // Si proviene desde Dams.jsx con estado precargado
  useEffect(() => {
    if (location.state?.fromDam) {
      const dam = location.state.fromDam;
      setForm({
        ...estadoInicialForm,
        id_dam: dam.id_dam || '',
        id_maestro_temp: dam.id_maestro || null,
        dam_numero: dam.numero_de_dam || ''
      });
      setViewMode('NUEVO');
      setIsDrawerOpen(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Manejo de la tecla Escape para cerrar modales y paneles
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        if (modalEliminar.open) setModalEliminar({ open: false, id: null, motivo: '' });
        else if (isDrawerOpen) toggleDrawer(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [modalEliminar.open, isDrawerOpen]);

  const cargarListaGastos = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/gastos/', {
        params: {
          search: debouncedSearch.trim() || undefined,
          estado_pago: estadoFiltro || undefined,
          moneda: monedaFiltro || undefined,
          tipo_gasto: tipoGastoFiltro || undefined,
          id_concepto: conceptoFiltro || undefined,
          id_proveedor: proveedorFiltro || undefined,
          vencimiento: vencimientoFiltro || undefined,
          page,
          limit
        }
      });
      const dataList = response.data?.data || [];
      setGastos(dataList);
      setTotalPages(response.data?.total_paginas || 1);
      setTotalRegistros(response.data?.total_registros || 0);

      // Si hay un gasto seleccionado, refrescar su referencia
      if (selectedId) {
        const found = dataList.find(g => g.id_gasto === selectedId);
        if (!found && dataList.length > 0 && viewMode === 'LISTA') {
          setSelectedId(dataList[0].id_gasto);
        }
      } else if (dataList.length > 0 && viewMode === 'LISTA') {
        setSelectedId(dataList[0].id_gasto);
      }
    } catch (error) {
      console.error("Error al obtener gastos:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const limpiarFiltros = () => {
    setSearchTerm('');
    setEstadoFiltro('');
    setMonedaFiltro('');
    setTipoGastoFiltro('');
    setConceptoFiltro('');
    setProveedorFiltro('');
    setVencimientoFiltro('');
    setPage(1);
  };
  const hayFiltrosActivos = !!(searchTerm || estadoFiltro || monedaFiltro || tipoGastoFiltro || conceptoFiltro || proveedorFiltro || vencimientoFiltro);

  const extractList = (res) => {
    if (!res || !res.data) return [];
    if (Array.isArray(res.data)) return res.data;
    if (Array.isArray(res.data.data)) return res.data.data;
    return [];
  };

  const cargarCatalogos = async () => {
    try {
      const [resMaestros, resDams, resConceptos, resProveedores, resTiposDoc] = await Promise.all([
        api.get('/maestros/lookup'),
        api.get('/dams/lookup'),
        api.get('/conceptos/'),
        api.get('/proveedores/'),
        api.get('/tipos-documento/')
      ]);

      const maestrosList = Array.isArray(resMaestros.data) ? resMaestros.data : (resMaestros.data?.data || []);
      const damsList = Array.isArray(resDams.data) ? resDams.data : (resDams.data?.data || []);
      const conceptosList = extractList(resConceptos);
      const proveedoresList = extractList(resProveedores);
      const tiposDocList = extractList(resTiposDoc);

      setMaestrosRaw(maestrosList);
      setDamsRaw(damsList);
      setOpcionesMaestros(maestrosList.map(m => ({ value: m.id_maestro, label: `Factura: ${m.numero_factura}` })));
      setOpcionesConceptos(conceptosList.map(c => ({ value: c.id_concepto, label: c.nombre })));
      setOpcionesProveedores(proveedoresList.map(p => ({
        value: p.id_proveedor,
        label: p.ruc ? `${p.ruc} - ${p.nombre}` : p.nombre
      })));
      setOpcionesTiposDoc(tiposDocList.map(t => ({ value: t.id_tipo_doc, label: t.nombre_documento })));
    } catch (error) {
      console.error('Error cargando catálogos:', error);
    }
  };

  const opcionesDamsFiltradas = useMemo(() => {
    let filtradas = damsRaw;
    if (form.id_maestro_temp) {
      filtradas = damsRaw.filter(dam => dam.id_maestro === form.id_maestro_temp);
    }
    return filtradas.map(dam => ({
      value: dam.id_dam,
      label: `DAM: ${dam.numero_de_dam}`
    }));
  }, [damsRaw, form.id_maestro_temp]);

  // KPIs Multimoneda calculados sobre la página visible
  const kpis = useMemo(() => {
    const totales = {
      USD: { liquidado: 0, pendiente: 0, parcial: 0 },
      PEN: { liquidado: 0, pendiente: 0, parcial: 0 }
    };
    
    gastos.forEach(g => {
      const monto = parseFloat(g.monto_original) || 0;
      const moneda = g.moneda || 'USD';
      if (totales[moneda]) {
        if (g.estado_pago === 'PAGADO') totales[moneda].liquidado += monto;
        if (g.estado_pago === 'PENDIENTE') totales[moneda].pendiente += monto;
        if (g.estado_pago === 'PARCIAL') totales[moneda].parcial += monto;
      }
    });
    return totales;
  }, [gastos]);

  const formatMultiMoneda = (tipo) => {
    if (monedaFiltro === 'USD') return `$${kpis.USD[tipo].toFixed(2)} USD`;
    if (monedaFiltro === 'PEN') return `S/${kpis.PEN[tipo].toFixed(2)} PEN`;
    return `$${kpis.USD[tipo].toFixed(2)} | S/${kpis.PEN[tipo].toFixed(2)}`;
  };

  const toggleDrawer = (open, gasto = null) => {
    setIsDrawerOpen(open);
    if (open && gasto) {
      setViewMode('MODIFICAR');
      setSelectedId(gasto.id_gasto);
      const linkedDam = damsRaw.find(d => d.id_dam === gasto.id_dam);
      setForm({
        id_maestro_temp: linkedDam ? linkedDam.id_maestro : (gasto.id_maestro || null),
        id_dam: gasto.id_dam,
        id_concepto: gasto.id_concepto,
        id_proveedor: gasto.id_proveedor,
        id_tipo_doc: gasto.id_tipo_doc,
        numero_documento: gasto.numero_documento || '',
        fecha_vencimiento: gasto.fecha_vencimiento ? String(gasto.fecha_vencimiento).slice(0, 10) : '',
        monto_original: gasto.monto_original !== undefined && gasto.monto_original !== null ? String(gasto.monto_original) : '',
        moneda: gasto.moneda || 'USD',
        dam_numero: gasto.dam_numero || ''
      });
    } else if (open && !gasto) {
      setViewMode('NUEVO');
      setForm(estadoInicialForm);
    } else {
      setViewMode('LISTA');
    }
  };

  const extractErrorMsg = (error) => {
    const rawDetail = error.response?.data?.detail;
    if (typeof rawDetail === 'string') return rawDetail;
    if (Array.isArray(rawDetail)) return rawDetail.map(d => `${d.loc ? d.loc.slice(1).join('.') : 'campo'}: ${d.msg}`).join(', ');
    if (rawDetail && typeof rawDetail === 'object') return JSON.stringify(rawDetail);
    return error.message || 'Error de conexión con el servidor';
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!form.id_dam) {
      alert("Por favor seleccione una DAM asociada.");
      return;
    }
    if (!form.id_concepto) {
      alert("Por favor seleccione un concepto de gasto.");
      return;
    }
    if (!form.id_proveedor) {
      alert("Por favor seleccione un proveedor.");
      return;
    }
    if (!form.id_tipo_doc) {
      alert("Por favor seleccione un tipo de documento.");
      return;
    }
    const monto = parseFloat(form.monto_original);
    if (isNaN(monto) || monto <= 0) {
      alert("Por favor ingrese un monto total válido mayor a 0.");
      return;
    }

    setIsGuardando(true);
    try {
      const payload = {
        id_dam: parseInt(form.id_dam, 10),
        id_concepto: parseInt(form.id_concepto, 10),
        id_proveedor: parseInt(form.id_proveedor, 10),
        id_tipo_doc: parseInt(form.id_tipo_doc, 10),
        numero_documento: form.numero_documento?.trim() || null,
        fecha_vencimiento: form.fecha_vencimiento || null,
        monto_original: monto,
        moneda: form.moneda || 'USD'
      };

      if (viewMode === 'NUEVO') {
        const res = await api.post('/gastos/', payload);
        setSelectedId(res.data?.id_gasto || null);
      } else {
        await api.put(`/gastos/${selectedId}`, payload);
      }
      await cargarListaGastos();
      toggleDrawer(false);
      setForm(estadoInicialForm);
    } catch (error) {
      alert(`Error al guardar:\n${extractErrorMsg(error)}`);
    } finally {
      setIsGuardando(false);
    }
  };

  const handleEliminarConfirm = async () => {
    if (!modalEliminar.motivo || modalEliminar.motivo.trim().length < 10) {
      alert("Debe ingresar un motivo válido (mínimo 10 caracteres).");
      return;
    }
    try {
      await api.delete(`/gastos/${modalEliminar.id}`, { data: { motivo: modalEliminar.motivo.trim() } });
      setModalEliminar({ open: false, id: null, motivo: '' });
      setSelectedId(null);
      await cargarListaGastos();
    } catch (error) { 
      alert(`Error al eliminar:\n${extractErrorMsg(error)}`);
    }
  };

  const selectedGasto = useMemo(() => {
    return gastos.find(g => g.id_gasto === selectedId) || null;
  }, [gastos, selectedId]);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      
      {/* HEADER DE MÓDULO */}
      <header className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-xl shadow-inner">
            💸
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-tight">Gastos Logísticos de Importación</h1>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                Módulo Contable
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Control de obligaciones aduaneras, fletes y servicios vinculados a DAMs y Facturas
            </p>
          </div>
        </div>

        {/* ACCIONES SUPERIORES */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => toggleDrawer(true)}
            className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-lg transition-colors shadow-lg shadow-teal-600/20 flex items-center gap-1.5"
          >
            <span>+</span>
            <span>Nuevo Gasto</span>
          </button>
          <button
            onClick={() => navigate('/app/pagos')}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-purple-300 text-xs font-semibold rounded-lg border border-purple-500/30 transition-colors flex items-center gap-1.5"
          >
            <span>⚖️</span>
            <span>Ir a Tesorería</span>
          </button>
          <button
            onClick={() => navigate('/app/logistica')}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5"
          >
            <span>📦</span>
            <span>Logística</span>
          </button>
        </div>
      </header>

      {/* KPIS MULTIMONEDA SUPERIORES */}
      <section className="px-5 py-2.5 bg-slate-900/60 border-b border-slate-800/80 shrink-0">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-semibold uppercase text-slate-400 block tracking-wider">Cargados en Vista</span>
              <span className="text-xs font-mono font-bold text-slate-200">{gastos.length} de {totalRegistros}</span>
            </div>
            <span className="text-base text-slate-500">📊</span>
          </div>

          <div className="bg-emerald-950/20 p-2.5 rounded-lg border border-emerald-500/30 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-semibold uppercase text-emerald-400 block tracking-wider">Liquidado (Vista)</span>
              <span className="text-xs font-mono font-bold text-emerald-400 tabular-nums">{formatMultiMoneda('liquidado')}</span>
            </div>
            <span className="text-base text-emerald-400">✅</span>
          </div>

          <div className="bg-rose-950/20 p-2.5 rounded-lg border border-rose-500/30 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-semibold uppercase text-rose-400 block tracking-wider">Pendiente (Vista)</span>
              <span className="text-xs font-mono font-bold text-rose-400 tabular-nums">{formatMultiMoneda('pendiente')}</span>
            </div>
            <span className="text-base text-rose-400">⚠️</span>
          </div>

          <div className="bg-amber-950/20 p-2.5 rounded-lg border border-amber-500/30 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-semibold uppercase text-amber-400 block tracking-wider">Parcial (Vista)</span>
              <span className="text-xs font-mono font-bold text-amber-400 tabular-nums">{formatMultiMoneda('parcial')}</span>
            </div>
            <span className="text-base text-amber-400">⏳</span>
          </div>
        </div>
      </section>

      {/* MASTER-DETAIL WORKSTATION (38% BANDEJA / 62% ESTACIÓN DE DETALLE) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 p-5 min-h-0 overflow-hidden">
        
        {/* ======================================================== */}
        {/* BANDEJA IZQUIERDA (38% / COL-SPAN-5) */}
        {/* ======================================================== */}
        <section className="lg:col-span-5 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl min-h-0">
          
          {/* BARRA DE BÚSQUEDA Y FILTROS */}
          <div className="p-3.5 border-b border-slate-800 bg-slate-900/60 space-y-2 shrink-0">
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                  placeholder="Buscar Documento, DAM, Concepto o Factura..."
                  className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all"
                />
                <span className="absolute inset-y-0 left-2.5 flex items-center text-slate-400 text-xs">🔍</span>
                {searchTerm && (
                  <button onClick={() => { setSearchTerm(''); setPage(1); }} className="absolute inset-y-0 right-2.5 flex items-center text-slate-400 hover:text-white text-xs">✕</button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setMostrarFiltros(prev => !prev)}
                className={`px-2 py-1.5 rounded-lg border text-xs font-mono transition flex items-center gap-1 shrink-0 cursor-pointer ${
                  hayFiltrosActivos 
                    ? 'bg-teal-950/80 border-teal-500 text-teal-300 font-bold shadow-sm' 
                    : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
                title="Alternar filtros contables"
              >
                <span>⚙️</span>
                {hayFiltrosActivos && <span className="w-1.5 h-1.5 rounded-full bg-teal-400"></span>}
              </button>
            </div>

            {/* FILTROS RÁPIDOS PRIMARIOS */}
            <div className="flex items-center gap-1.5">
              <select
                value={estadoFiltro}
                onChange={(e) => { setEstadoFiltro(e.target.value); setPage(1); }}
                className="w-1/2 py-1 px-2 text-[11px] bg-slate-950 border border-slate-700 rounded-md text-slate-300 font-medium focus:outline-none focus:border-teal-500"
              >
                <option value="">Todos los Estados</option>
                <option value="PENDIENTE">PENDIENTE</option>
                <option value="PARCIAL">PARCIAL</option>
                <option value="PAGADO">PAGADO</option>
              </select>

              <select
                value={monedaFiltro}
                onChange={(e) => { setMonedaFiltro(e.target.value); setPage(1); }}
                className="w-1/2 py-1 px-2 text-[11px] bg-slate-950 border border-slate-700 rounded-md text-slate-300 font-medium focus:outline-none focus:border-teal-500"
              >
                <option value="">Todas las Monedas</option>
                <option value="USD">USD ($)</option>
                <option value="PEN">PEN (S/)</option>
              </select>
            </div>

            {/* PANEL COLAPSABLE DE FILTROS AVANZADOS (2 COLUMNAS) */}
            {mostrarFiltros && (
              <div className="p-2 bg-slate-950/90 border border-slate-800 rounded-lg space-y-1.5 text-[10px]">
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <label className="block text-slate-500 uppercase font-bold text-[9px] mb-0.5">Etapa Logística</label>
                    <select 
                      value={tipoGastoFiltro} 
                      onChange={e => { setTipoGastoFiltro(e.target.value); setPage(1); }}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-200 text-[10px]"
                    >
                      <option value="">Todas las Etapas</option>
                      <option value="FIJO_DESPACHO">Fijo Despacho</option>
                      <option value="POST_LEVANTE">Post-Levante</option>
                      <option value="EXTRAORDINARIO">Extraordinario</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-500 uppercase font-bold text-[9px] mb-0.5">Vencimiento</label>
                    <select 
                      value={vencimientoFiltro} 
                      onChange={e => { setVencimientoFiltro(e.target.value); setPage(1); }}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-200 text-[10px]"
                    >
                      <option value="">Todos</option>
                      <option value="VENCIDOS">🚨 Vencidos</option>
                      <option value="POR_VENCER_7D">⏳ Próximos 7 días</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-500 uppercase font-bold text-[9px] mb-0.5">Concepto</label>
                    <select 
                      value={conceptoFiltro} 
                      onChange={e => { setConceptoFiltro(e.target.value); setPage(1); }}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-200 text-[10px] truncate"
                    >
                      <option value="">Todos</option>
                      {opcionesConceptos.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-500 uppercase font-bold text-[9px] mb-0.5">Proveedor</label>
                    <select 
                      value={proveedorFiltro} 
                      onChange={e => { setProveedorFiltro(e.target.value); setPage(1); }}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-200 text-[10px] truncate"
                    >
                      <option value="">Todos</option>
                      {opcionesProveedores.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {hayFiltrosActivos && (
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={limpiarFiltros}
                      className="text-[10px] text-rose-400 hover:text-rose-300 font-mono hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      ✕ Limpiar filtros
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* LISTA DENSA DE GASTOS */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80 p-2 space-y-1 min-h-0">
            {isLoading ? (
              <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
                <span>Cargando registros contables...</span>
              </div>
            ) : gastos.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No se encontraron registros de gastos con los filtros actuales.
              </div>
            ) : (
              gastos.map((g) => {
                const isSelected = selectedId === g.id_gasto;
                const saldoNum = parseFloat(g.saldo_pendiente ?? g.monto_original);
                const originalNum = parseFloat(g.monto_original);
                const simbolo = g.moneda === 'PEN' ? 'S/' : '$';

                return (
                  <div
                    key={g.id_gasto}
                    onClick={() => {
                      setSelectedId(g.id_gasto);
                      if (isDrawerOpen) toggleDrawer(false);
                    }}
                    className={`p-3 rounded-lg cursor-pointer transition-all border ${
                      isSelected
                        ? 'bg-teal-950/30 border-teal-500/80 shadow-md ring-1 ring-teal-500/20'
                        : 'bg-slate-900/60 hover:bg-slate-800/70 border-slate-800/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-teal-400">#{g.id_gasto}</span>
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
                        <span className="text-[10px] text-slate-400 block">Saldo</span>
                        <span className={`font-mono font-bold text-xs tabular-nums ${saldoNum > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {simbolo} {saldoNum.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 text-xs">
                      <div className="font-semibold text-slate-200 truncate">
                        {g.concepto_nombre || 'Gasto General'}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate flex items-center gap-1.5 mt-0.5">
                        <span>🏢</span>
                        <span className="truncate">{g.proveedor_nombre || 'Sin Proveedor'}</span>
                      </div>
                    </div>

                    <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                      <div className="flex items-center gap-2 truncate">
                        <span className="bg-slate-800 px-1.5 py-0.5 rounded font-mono text-[10px] text-slate-300">
                          DAM: {g.dam_numero || 'N/A'}
                        </span>
                        <span className="truncate text-slate-500 font-mono text-[10px]">
                          Doc: {g.numero_documento || 'S/N'}
                        </span>
                      </div>
                      <div className="text-right text-[10px] font-mono text-slate-400">
                        Total: {simbolo} {originalNum.toFixed(2)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* PAGINADOR */}
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
              <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-3xl mb-4 shadow-inner">
                💸
              </div>
              <h3 className="text-base font-bold text-slate-300">Estación de Detalle Contable</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1.5">
                Seleccione un gasto de la bandeja izquierda para auditar sus importes, comprobantes y amortizaciones.
              </p>
              <button
                onClick={() => toggleDrawer(true)}
                className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-teal-600/20"
              >
                + Registrar Nuevo Gasto
              </button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-5 space-y-5">
              
              {/* CABECERA WORKSTATION */}
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

                  {/* BARRA DE ACCIONES PARA EL REGISTRO SELECCIONADO */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleDrawer(true, selectedGasto)}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
                    >
                      <span>✏️</span>
                      <span>Modificar</span>
                    </button>
                    <button
                      onClick={() => setModalEliminar({ open: true, id: selectedGasto.id_gasto, motivo: '' })}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
                    >
                      <span>🗑️</span>
                      <span>Eliminar</span>
                    </button>
                    <button
                      onClick={() => navigate(`/app/pagos?gasto_id=${selectedGasto.id_gasto}`)}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-purple-600/20 flex items-center gap-1.5"
                    >
                      <span>💸</span>
                      <span>Pagar</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1 border-t border-slate-800/80">
                  <div>
                    <span className="text-slate-500 text-[10px] uppercase font-bold block">DAM Asociada</span>
                    <span className="font-mono text-slate-200">{selectedGasto.dam_numero || 'Sin DAM'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] uppercase font-bold block">Factura Maestro</span>
                    <span className="font-mono text-slate-200">{selectedGasto.maestro_factura || 'Sin Factura'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-[10px] uppercase font-bold block">Importador</span>
                    <span className="text-slate-200 truncate block">{selectedGasto.importador_nombre || 'N/A'}</span>
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
                    {selectedGasto.moneda === 'PEN' ? 'S/' : '$'} {parseFloat(selectedGasto.monto_original || 0).toFixed(2)}
                  </div>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Importe total</span>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                  <span className="text-[10px] uppercase font-bold text-emerald-400 block tracking-wider">Amortizado</span>
                  <div className="mt-1 font-mono font-bold text-sm text-emerald-400 tabular-nums">
                    {selectedGasto.moneda === 'PEN' ? 'S/' : '$'} {(parseFloat(selectedGasto.monto_original || 0) - parseFloat(selectedGasto.saldo_pendiente ?? selectedGasto.monto_original ?? 0)).toFixed(2)}
                  </div>
                  <span className="text-[10px] text-emerald-500 mt-0.5 block">Liquidado a la fecha</span>
                </div>

                <div className="bg-rose-950/20 border border-rose-500/30 rounded-xl p-3">
                  <span className="text-[10px] uppercase font-bold text-rose-400 block tracking-wider">Saldo Pendiente</span>
                  <div className="mt-1 font-mono font-bold text-sm text-rose-400 tabular-nums">
                    {selectedGasto.moneda === 'PEN' ? 'S/' : '$'} {parseFloat(selectedGasto.saldo_pendiente ?? selectedGasto.monto_original ?? 0).toFixed(2)}
                  </div>
                  <span className="text-[10px] text-rose-300/70 mt-0.5 block">Por transferir</span>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Vencimiento</span>
                  <div className="mt-1 font-mono text-sm text-slate-200">
                    {selectedGasto.fecha_vencimiento || 'Inmediato'}
                  </div>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Plazo de crédito</span>
                </div>
              </div>

              {/* FICHA TÉCNICA Y AUDITORÍA DEL GASTO */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                  <span className="text-teal-400 text-sm">📑</span>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Información Documentaria y Fiscal
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-lg space-y-2">
                    <span className="text-[11px] uppercase font-bold text-teal-400 block">Comprobante de Pago</span>
                    <div className="flex justify-between border-b border-slate-800/80 pb-1.5">
                      <span className="text-slate-400">Tipo de Documento:</span>
                      <span className="font-semibold text-slate-200">{selectedGasto.tipo_doc_nombre || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-800/80 pb-1.5">
                      <span className="text-slate-400">Número de Documento:</span>
                      <span className="font-mono font-bold text-slate-100">{selectedGasto.numero_documento || 'S/N'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Moneda Declarada:</span>
                      <span className="font-mono text-teal-300">{selectedGasto.moneda}</span>
                    </div>
                  </div>

                  <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-lg space-y-2">
                    <span className="text-[11px] uppercase font-bold text-purple-400 block">Trazabilidad Operativa</span>
                    <div className="flex justify-between border-b border-slate-800/80 pb-1.5">
                      <span className="text-slate-400">DAM Aduanera:</span>
                      <span className="font-mono font-semibold text-slate-200">{selectedGasto.dam_numero || 'Sin DAM'}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-800/80 pb-1.5">
                      <span className="text-slate-400">Factura Maestro:</span>
                      <span className="font-mono font-semibold text-slate-200">{selectedGasto.maestro_factura || 'Sin Factura'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Importador:</span>
                      <span className="font-semibold text-purple-300 truncate max-w-[200px]">{selectedGasto.importador_nombre || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}
        </section>

      </div>

      {/* ======================================================== */}
      {/* DRAWER / MODAL LATERAL DE CREACIÓN / EDICIÓN EN DARK SLATE */}
      {/* ======================================================== */}
      <div className={`fixed inset-0 z-50 overflow-hidden ${isDrawerOpen ? '' : 'pointer-events-none'}`}>
        <div 
          className={`fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity duration-300 ${isDrawerOpen ? 'opacity-100' : 'opacity-0'}`} 
          onClick={() => toggleDrawer(false)}
        ></div>
        
        <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
          <div className={`w-screen max-w-xl bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col h-full transform transition-transform duration-300 ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            
            <div className="px-6 py-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white tracking-tight">
                  {viewMode === 'NUEVO' ? '✨ Registrar Nuevo Gasto' : `✏️ Modificar Gasto #${selectedId}`}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Asignación contable a despachos y proveedores</p>
              </div>
              <button 
                onClick={() => toggleDrawer(false)} 
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors text-base font-bold"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleGuardar} className="flex-1 overflow-y-auto p-6 space-y-5">
              
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                  Maestro (Opcional - Filtro de DAMs)
                </label>
                <Select 
                  options={opcionesMaestros} 
                  value={opcionesMaestros.find(op => op.value === form.id_maestro_temp) || null} 
                  onChange={(op) => {
                    const maestroId = op ? op.value : null;
                    setForm(prev => {
                      const damPertenece = prev.id_dam && damsRaw.some(d => d.id_dam === prev.id_dam && d.id_maestro === maestroId);
                      return {
                        ...prev,
                        id_maestro_temp: maestroId,
                        id_dam: damPertenece ? prev.id_dam : null
                      };
                    });
                  }} 
                  placeholder="Filtrar DAMs por factura maestro..." 
                  isClearable 
                  styles={selectDarkStyles}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                  DAM Asociada *
                </label>
                <Select 
                  options={opcionesDamsFiltradas} 
                  value={
                    opcionesDamsFiltradas.find(op => op.value === form.id_dam) || 
                    (form.id_dam ? { value: form.id_dam, label: form.dam_numero ? `DAM: ${form.dam_numero}` : `DAM #${form.id_dam}` } : null)
                  } 
                  onChange={(op) => {
                    const selectedDamId = op ? op.value : null;
                    setForm(prev => {
                      let updatedMaestro = prev.id_maestro_temp;
                      if (selectedDamId) {
                        const damObj = damsRaw.find(d => d.id_dam === selectedDamId);
                        if (damObj && damObj.id_maestro) {
                          updatedMaestro = damObj.id_maestro;
                        }
                      }
                      return {
                        ...prev,
                        id_dam: selectedDamId,
                        id_maestro_temp: updatedMaestro
                      };
                    });
                  }} 
                  placeholder="Seleccione la DAM vinculada..." 
                  isClearable 
                  styles={selectDarkStyles}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                  Concepto de Gasto *
                </label>
                <Select 
                  options={opcionesConceptos} 
                  value={opcionesConceptos.find(op => op.value === form.id_concepto) || null} 
                  onChange={(op) => setForm({ ...form, id_concepto: op ? op.value : null })} 
                  placeholder="Seleccione concepto contable..." 
                  isClearable 
                  styles={selectDarkStyles}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                  Proveedor de Servicio *
                </label>
                <Select 
                  options={opcionesProveedores} 
                  value={opcionesProveedores.find(op => op.value === form.id_proveedor) || null} 
                  onChange={(op) => setForm({ ...form, id_proveedor: op ? op.value : null })} 
                  placeholder="Seleccione proveedor con RUC..." 
                  isClearable 
                  styles={selectDarkStyles}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                    Tipo de Documento *
                  </label>
                  <Select 
                    options={opcionesTiposDoc} 
                    value={opcionesTiposDoc.find(op => op.value === form.id_tipo_doc) || null} 
                    onChange={(op) => setForm({ ...form, id_tipo_doc: op ? op.value : null })} 
                    placeholder="Tipo de comprobante..." 
                    isClearable 
                    styles={selectDarkStyles}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                    Número de Documento
                  </label>
                  <input 
                    type="text" 
                    value={form.numero_documento} 
                    onChange={(e) => setForm({ ...form, numero_documento: e.target.value })} 
                    placeholder="Ej. F001-123456" 
                    className="w-full text-xs font-mono bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                    Fecha Vencimiento
                  </label>
                  <input 
                    type="date" 
                    value={form.fecha_vencimiento} 
                    onChange={(e) => setForm({ ...form, fecha_vencimiento: e.target.value })} 
                    className="w-full text-xs bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                    Moneda *
                  </label>
                  <select 
                    value={form.moneda} 
                    onChange={(e) => setForm({ ...form, moneda: e.target.value })} 
                    className="w-full text-xs font-bold bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-teal-500"
                  >
                    <option value="USD">USD - Dólares ($)</option>
                    <option value="PEN">PEN - Soles (S/)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                    Monto Original *
                  </label>
                  <input 
                    type="number" 
                    step="0.01" 
                    required 
                    value={form.monto_original} 
                    onChange={(e) => setForm({ ...form, monto_original: e.target.value })} 
                    placeholder="0.00" 
                    className="w-full text-xs font-mono font-bold bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-right text-teal-400 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="pt-6 border-t border-slate-800 flex items-center justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => toggleDrawer(false)} 
                  className="px-4 py-2 border border-slate-700 text-slate-300 hover:bg-slate-800 rounded-lg text-xs font-semibold transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={isGuardando} 
                  className="px-6 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-teal-600/20 flex items-center gap-2"
                >
                  {isGuardando ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>Guardar Gasto</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* MODAL NATIVO DE ELIMINACIÓN DE AUDITORÍA (DARK SLATE) */}
      {/* ======================================================== */}
      {modalEliminar.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden text-slate-100">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                <span>⚠️</span>
                <h3>Eliminar Registro de Gasto</h3>
              </div>
              <button 
                onClick={() => setModalEliminar({ open: false, id: null, motivo: '' })} 
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-300">
                Esta acción registrará la anulación del gasto en la pista de auditoría contable. Por favor especifique el motivo:
              </p>
              
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">
                  Motivo de Anulación (Mín. 10 caracteres) *
                </label>
                <textarea 
                  rows={3} 
                  value={modalEliminar.motivo} 
                  onChange={(e) => setModalEliminar({ ...modalEliminar, motivo: e.target.value })} 
                  placeholder="Indique la justificación de la anulación para auditoría..." 
                  className="w-full text-xs p-3 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500 resize-none"
                />
              </div>
            </div>
            
            <div className="px-5 py-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-end gap-2.5">
              <button 
                type="button" 
                onClick={() => setModalEliminar({ open: false, id: null, motivo: '' })} 
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button 
                type="button" 
                onClick={handleEliminarConfirm} 
                disabled={modalEliminar.motivo.trim().length < 10} 
                className="px-4 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white rounded-lg transition-all shadow-md shadow-rose-600/20"
              >
                Confirmar Eliminación
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Gastos;
