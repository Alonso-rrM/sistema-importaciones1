import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import useDebounce from '../hooks/useDebounce';
import Paginador from '../components/Paginador';
import { descargarExcel } from '../utils/exportUtils';
import ModalLiquidacionContenedor from '../components/ModalLiquidacionContenedor';

const KPI_KEYS = ['FIJO_DESPACHO', 'POST_LEVANTE', 'EXTRAORDINARIO', 'GLOBAL'];

const Logistica = () => {
  const navigate = useNavigate();
  const [maestros, setMaestros] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [viewMode, setViewMode] = useState(null); // null = Solo bandeja, 'NUEVO', 'MODIFICAR'

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 400);

  // Filtros Avanzados de Bandeja
  const [estadoLevanteFiltro, setEstadoLevanteFiltro] = useState('');
  const [statusLlegadaFiltro, setStatusLlegadaFiltro] = useState('');
  const [importadorFiltro, setImportadorFiltro] = useState('');
  const [tipoValorFiltro, setTipoValorFiltro] = useState('');
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRegistros, setTotalRegistros] = useState(0);

  // Catálogos completos
  const [opcionesProveedores, setOpcionesProveedores] = useState([]);
  const [opcionesImportadores, setOpcionesImportadores] = useState([]);
  const [opcionesAgentes, setOpcionesAgentes] = useState([]);
  const [opcionesAlmacenes, setOpcionesAlmacenes] = useState([]);
  const [opcionesConceptos, setOpcionesConceptos] = useState([]);
  const [opcionesTiposDoc, setOpcionesTiposDoc] = useState([]);

  // Estructura completa
  const estadoInicial = {
    numero_factura: '', documento_transporte: '', n_cont_fisico: '', status_llegada: 'EN TRÁNSITO',
    fecha_embarque: '', fecha_arribo: '', id_proveedor: '', id_importador: '', id_agente: '', id_almacen: '',
    fob_usd: '', flete_usd: '', tipo_valor: 'DEFINITIVO', venta_sucesiva: 'NO', estado_levante: 'SIN LEVANTE'
  };

  const [formData, setFormData] = useState(estadoInicial);
  const [isGuardando, setIsGuardando] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [modalEliminar, setModalEliminar] = useState({ open: false, id: null, motivo: '' });

  // Tabs Sub-registros y Termómetro Financiero
  const [activeTab, setActiveTab] = useState('DAMS');
  const [damsVinculadas, setDamsVinculadas] = useState([]);
  const [gastosVinculados, setGastosVinculados] = useState([]);
  const [estadoCuenta, setEstadoCuenta] = useState(null);
  const [isLoadingSub, setIsLoadingSub] = useState(false);

  // Motor de KPIs de Gastos por Etapa Operativa (BFF)
  const [kpiGastos, setKpiGastos] = useState(null);
  const [kpiViewIndex, setKpiViewIndex] = useState(0);
  const [showKpiDetails, setShowKpiDetails] = useState(false);

  // Modales Inline para Creación Rápida
  const [modalNuevaDam, setModalNuevaDam] = useState({ open: false, numero_de_dam: '', serie: '', canal_control: 'VERDE', monto_valor_provisional_usd: '' });
  const [modalNuevoGasto, setModalNuevoGasto] = useState({ open: false, id_dam: '', id_concepto: '', id_proveedor: '', id_tipo_doc: '', numero_documento: '', monto_original: '', moneda: 'USD' });
  const [isSubmittingInline, setIsSubmittingInline] = useState(false);
  const [isExportando, setIsExportando] = useState(false);
  const [modalLiquidacionOpen, setModalLiquidacionOpen] = useState(false);

  // Detección de Rol desde Token JWT
  const userRole = useMemo(() => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return null;
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
      return JSON.parse(jsonPayload)?.id_rol;
    } catch { return null; }
  }, []);

  const isReadOnly = userRole !== 1 && formData.estado_levante === 'CON LEVANTE' && viewMode === 'MODIFICAR';

  useEffect(() => { cargarCatalogos(); }, []);
  useEffect(() => { 
    cargarMaestros(); 
  }, [debouncedSearch, page, limit, estadoLevanteFiltro, statusLlegadaFiltro, importadorFiltro, tipoValorFiltro]);

  const cargarCatalogos = async () => {
    try {
      const [resProv, resImp, resAg, resAlm, resConc, resTiposDoc] = await Promise.all([
        api.get('/proveedores/'), api.get('/importadores/'), api.get('/agentes/'), api.get('/almacenes/'),
        api.get('/conceptos/'), api.get('/tipos-documento/')
      ]);
      setOpcionesProveedores(resProv.data || []);
      setOpcionesImportadores(resImp.data || []);
      setOpcionesAgentes(resAg.data || []);
      setOpcionesAlmacenes(resAlm.data || []);
      setOpcionesConceptos(resConc.data || []);
      setOpcionesTiposDoc(resTiposDoc.data || []);
    } catch (error) { console.error("Error al cargar catálogos:", error); }
  };

  const proveedoresMap = useMemo(() => {
    const map = {}; opcionesProveedores.forEach(p => { map[p.id_proveedor] = p.nombre; }); return map;
  }, [opcionesProveedores]);

  const importadoresMap = useMemo(() => {
    const map = {}; opcionesImportadores.forEach(i => { map[i.id_importador] = i.nombre; }); return map;
  }, [opcionesImportadores]);

  const cargarMaestros = async () => {
    try {
      const res = await api.get('/maestros/', { 
        params: { 
          search: debouncedSearch.trim() || undefined, 
          page, 
          limit,
          estado_levante: estadoLevanteFiltro || undefined,
          status_llegada: statusLlegadaFiltro || undefined,
          id_importador: importadorFiltro || undefined,
          tipo_valor: tipoValorFiltro || undefined
        } 
      });
      setMaestros(res.data?.data || []);
      setTotalPages(res.data?.total_paginas || 1);
      setTotalRegistros(res.data?.total_registros || 0);
    } catch (error) { console.error("Error maestros:", error); }
  };

  const limpiarFiltros = () => {
    setSearchTerm('');
    setEstadoLevanteFiltro('');
    setStatusLlegadaFiltro('');
    setImportadorFiltro('');
    setTipoValorFiltro('');
    setPage(1);
  };
  const hayFiltrosActivos = !!(searchTerm || estadoLevanteFiltro || statusLlegadaFiltro || importadorFiltro || tipoValorFiltro);

  // Optimización de red: Consulta quirúrgica del expediente abierto
  const cargarSubRegistros = async (id_maestro, numero_factura) => {
    setIsLoadingSub(true);
    try {
      const [resDams, resGastos, resCta, resKpi] = await Promise.all([
        api.get(`/reporte-maestro/${id_maestro}`),
        api.get('/gastos/', { params: { search: numero_factura, limit: 100 } }),
        api.get(`/maestros/${id_maestro}/estado_cuenta`).catch(() => ({ data: null })),
        api.get(`/maestros/${id_maestro}/kpi-gastos`).catch(() => ({ data: null }))
      ]);
      setDamsVinculadas(resDams.data?.dams || []);
      setGastosVinculados(resGastos.data?.data || []);
      setEstadoCuenta(resCta.data || null);
      setKpiGastos(resKpi.data || null);
    } catch (error) {
      console.error("Error al cargar sub-registros", error);
    } finally { setIsLoadingSub(false); }
  };

  const handleFormChange = (campo, valor) => {
    setFormData(prev => ({ ...prev, [campo]: valor }));
    setHasUnsavedChanges(true);
  };

  const handleSelect = (m) => {
    if (hasUnsavedChanges && !window.confirm("⚠️ Tienes cambios sin guardar. ¿Deseas descartarlos y cambiar de registro?")) return;
    setSelectedId(m.id_maestro);
    setViewMode('MODIFICAR');
    setFormData({
      numero_factura: m.numero_factura || '',
      documento_transporte: m.documento_transporte || '',
      n_cont_fisico: m.n_cont_fisico || '',
      status_llegada: m.status_llegada || 'EN TRÁNSITO',
      fecha_embarque: m.fecha_embarque ? m.fecha_embarque.split('T')[0] : '',
      fecha_arribo: m.fecha_arribo ? m.fecha_arribo.split('T')[0] : '',
      id_proveedor: m.id_proveedor != null ? String(m.id_proveedor) : '',
      id_importador: m.id_importador != null ? String(m.id_importador) : '',
      id_agente: m.id_agente != null ? String(m.id_agente) : '',
      id_almacen: m.id_almacen != null ? String(m.id_almacen) : '',
      fob_usd: m.fob_usd != null ? String(m.fob_usd) : '',
      flete_usd: m.flete_usd != null ? String(m.flete_usd) : '',
      tipo_valor: m.tipo_valor || 'DEFINITIVO',
      venta_sucesiva: m.venta_sucesiva || 'NO',
      estado_levante: m.estado_levante || 'SIN LEVANTE'
    });
    setHasUnsavedChanges(false);
    setActiveTab('DAMS');
    setEstadoCuenta(null);
    setKpiGastos(null);
    setKpiViewIndex(0);
    setShowKpiDetails(false);
    cargarSubRegistros(m.id_maestro, m.numero_factura);
  };

  const handleNuevo = () => {
    if (hasUnsavedChanges && !window.confirm("⚠️ Tienes cambios sin guardar. ¿Deseas descartarlos y crear uno nuevo?")) return;
    setSelectedId(null);
    setViewMode('NUEVO');
    setFormData(estadoInicial);
    setHasUnsavedChanges(true);
    setDamsVinculadas([]);
    setGastosVinculados([]);
    setEstadoCuenta(null);
    setKpiGastos(null);
    setKpiViewIndex(0);
    setShowKpiDetails(false);
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (isReadOnly) return alert("Este registro cuenta con LEVANTE y está protegido contra edición.");
    setIsGuardando(true);

    try {
      const payload = {
        numero_factura: (formData.numero_factura || '').trim(),
        documento_transporte: formData.documento_transporte?.trim() || null,
        n_cont_fisico: formData.n_cont_fisico?.trim() || null,
        status_llegada: formData.status_llegada || 'EN TRÁNSITO',
        fecha_embarque: formData.fecha_embarque?.trim() ? formData.fecha_embarque.trim() : null,
        fecha_arribo: formData.fecha_arribo?.trim() ? formData.fecha_arribo.trim() : null,
        id_proveedor: formData.id_proveedor ? parseInt(formData.id_proveedor, 10) : null,
        id_importador: formData.id_importador ? parseInt(formData.id_importador, 10) : null,
        id_agente: formData.id_agente ? parseInt(formData.id_agente, 10) : null,
        id_almacen: formData.id_almacen ? parseInt(formData.id_almacen, 10) : null,
        fob_usd: formData.fob_usd !== '' && formData.fob_usd != null ? parseFloat(formData.fob_usd) : null,
        flete_usd: formData.flete_usd !== '' && formData.flete_usd != null ? parseFloat(formData.flete_usd) : null,
        tipo_valor: formData.tipo_valor || 'DEFINITIVO',
        venta_sucesiva: formData.venta_sucesiva || 'NO'
      };

      if (!payload.numero_factura) return alert("El campo N° Factura es obligatorio.");

      if (viewMode === 'NUEVO') {
        const res = await api.post('/maestros/', payload);
        setSelectedId(res.data.id_maestro);
        setViewMode('MODIFICAR');
        cargarSubRegistros(res.data.id_maestro, payload.numero_factura);
      } else {
        await api.put(`/maestros/${selectedId}`, payload);
      }
      await cargarMaestros();
      setHasUnsavedChanges(false);
      alert("✅ Expediente guardado exitosamente.");
    } catch (error) {
      const detail = error.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : (Array.isArray(detail) ? detail.map(d => `${d.loc ? d.loc.slice(-1) : 'campo'}: ${d.msg}`).join('\n') : 'Error al guardar');
      alert(`Error al guardar:\n${msg}`);
    } finally { setIsGuardando(false); }
  };

  // Micro-acción: Toggle certificación de aforo físico en DAM
  const handleToggleAforo = async (e, dam) => {
    e.stopPropagation();
    if (userRole !== 1 && userRole !== 3) return alert("Solo Administradores o personal de Logística pueden certificar el Aforo Físico.");
    const nuevoEstado = !dam.aforo_realizado;
    if (!window.confirm(`¿Certificar aforo físico de la DAM ${dam.numero_de_dam} como ${nuevoEstado ? 'REALIZADO' : 'PENDIENTE'}?`)) return;
    try {
      await api.put(`/dams/${dam.id_dam}`, { aforo_realizado: nuevoEstado });
      cargarSubRegistros(selectedId, formData.numero_factura);
      cargarMaestros();
    } catch (err) {
      alert(`Error al actualizar aforo: ${err.response?.data?.detail || 'Error desconocido'}`);
    }
  };

  // Creación rápida inline: DAM
  const handleCrearDamInline = async (e) => {
    e.preventDefault();
    if (!modalNuevaDam.numero_de_dam.trim()) return alert("El N° de DAM es obligatorio.");
    setIsSubmittingInline(true);
    try {
      const payload = {
        id_maestro: selectedId,
        numero_de_dam: modalNuevaDam.numero_de_dam.trim(),
        serie: modalNuevaDam.serie?.trim() || null,
        canal_control: modalNuevaDam.canal_control || 'VERDE',
        monto_valor_provisional_usd: modalNuevaDam.monto_valor_provisional_usd ? parseFloat(modalNuevaDam.monto_valor_provisional_usd) : null
      };
      await api.post('/dams/', payload);
      setModalNuevaDam({ open: false, numero_de_dam: '', serie: '', canal_control: 'VERDE', monto_valor_provisional_usd: '' });
      cargarSubRegistros(selectedId, formData.numero_factura);
      cargarMaestros();
      alert("✅ DAM registrada correctamente.");
    } catch (err) {
      alert(`Error al registrar DAM: ${err.response?.data?.detail || 'Error desconocido'}`);
    } finally { setIsSubmittingInline(false); }
  };

  // Creación rápida inline: Gasto
  const handleCrearGastoInline = async (e) => {
    e.preventDefault();
    if (!modalNuevoGasto.id_dam) return alert("Debe seleccionar una DAM asociada.");
    if (!modalNuevoGasto.id_concepto) return alert("Debe seleccionar un concepto.");
    if (!modalNuevoGasto.id_proveedor) return alert("Debe seleccionar un proveedor.");
    if (!modalNuevoGasto.id_tipo_doc) return alert("Debe seleccionar un tipo de documento.");
    const monto = parseFloat(modalNuevoGasto.monto_original);
    if (isNaN(monto) || monto <= 0) return alert("El monto debe ser mayor a 0.");

    setIsSubmittingInline(true);
    try {
      const payload = {
        id_dam: parseInt(modalNuevoGasto.id_dam, 10),
        id_concepto: parseInt(modalNuevoGasto.id_concepto, 10),
        id_proveedor: parseInt(modalNuevoGasto.id_proveedor, 10),
        id_tipo_doc: parseInt(modalNuevoGasto.id_tipo_doc, 10),
        numero_documento: modalNuevoGasto.numero_documento?.trim() || null,
        monto_original: monto,
        moneda: modalNuevoGasto.moneda || 'USD'
      };
      await api.post('/gastos/', payload);
      setModalNuevoGasto({ open: false, id_dam: '', id_concepto: '', id_proveedor: '', id_tipo_doc: '', numero_documento: '', monto_original: '', moneda: 'USD' });
      cargarSubRegistros(selectedId, formData.numero_factura);
      alert("✅ Gasto registrado y vinculado al contenedor.");
    } catch (err) {
      alert(`Error al registrar Gasto: ${err.response?.data?.detail || 'Error desconocido'}`);
    } finally { setIsSubmittingInline(false); }
  };

  const handleDesbloquearLevante = async () => {
    if (!window.confirm("¿Seguro que deseas desbloquear este expediente con LEVANTE? Su estado pasará a SIN LEVANTE.")) return;
    try {
      await api.post(`/maestros/${selectedId}/desbloquear/`);
      alert("✅ Expediente desbloqueado correctamente.");
      setFormData(prev => ({ ...prev, estado_levante: 'SIN LEVANTE' }));
      cargarMaestros();
    } catch (error) { alert(`Error al desbloquear: ${error.response?.data?.detail || 'Error desconocido'}`); }
  };

  const handleEliminarConfirm = async () => {
    if (!modalEliminar.motivo || modalEliminar.motivo.length < 10) return alert("Debe ingresar un motivo válido de al menos 10 caracteres.");
    try {
      await api.delete(`/maestros/${modalEliminar.id}`, { data: { motivo: modalEliminar.motivo } });
      setModalEliminar({ open: false, id: null, motivo: '' });
      setSelectedId(null);
      setViewMode(null);
      cargarMaestros();
    } catch (error) { alert(`Error al eliminar: ${error.response?.data?.detail || 'Error desconocido'}`); }
  };

  const cfr = (parseFloat(formData.fob_usd || 0) + parseFloat(formData.flete_usd || 0)).toFixed(2);
  const amortizacion = estadoCuenta?.porcentaje_amortizado ? parseFloat(estadoCuenta.porcentaje_amortizado).toFixed(1) : '0.0';

  const handleExportarExcel = async () => {
    setIsExportando(true);
    try {
      const params = {};
      if (debouncedSearch) params.search = debouncedSearch;
      if (estadoLevanteFiltro) params.estado_levante = estadoLevanteFiltro;
      if (statusLlegadaFiltro) params.status_llegada = statusLlegadaFiltro;
      if (importadorFiltro) params.id_importador = importadorFiltro;
      if (tipoValorFiltro) params.tipo_valor = tipoValorFiltro;

      await descargarExcel('/maestros/exportar', params, 'Reporte_Logistica.xlsx');
    } catch (error) {
      alert(`Error al exportar reporte: ${error.response?.data?.detail || error.message || 'Error desconocido'}`);
    } finally {
      setIsExportando(false);
    }
  };

  return (
    <main className="flex-1 flex overflow-hidden h-full">
      {/* BANDEJA IZQUIERDA (38%) */}
      <section className={`w-full lg:w-[42%] 2xl:w-[38%] border-r border-slate-800 bg-slate-900/60 flex-col shrink-0 overflow-hidden ${viewMode ? 'hidden lg:flex' : 'flex'}`}>
        <div className="p-3 border-b border-slate-800 bg-slate-800/50 flex flex-col gap-2.5 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">Expedientes</h2>
              <span className="px-1.5 py-0.5 rounded bg-slate-700 text-[10px] font-mono text-slate-300">{totalRegistros}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button 
                type="button" 
                onClick={handleExportarExcel} 
                disabled={isExportando}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded bg-emerald-700/80 hover:bg-emerald-600 text-white shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                title="Descargar todos los expedientes filtrados a Excel"
              >
                <span>{isExportando ? '⏳' : '📥'}</span>
                <span>{isExportando ? 'Exportando...' : 'Excel'}</span>
              </button>
              <button onClick={handleNuevo} className="inline-flex items-center px-2.5 py-1 text-[11px] font-bold rounded bg-teal-600 hover:bg-teal-500 text-white shadow-sm transition-all">+ Nuevo</button>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-500 text-xs">🔍</span>
              <input 
                type="text" 
                value={searchTerm} 
                onChange={e => { setSearchTerm(e.target.value); setPage(1); }} 
                className="w-full bg-slate-900 border border-slate-700 focus:border-teal-500 text-xs text-slate-200 placeholder-slate-500 rounded-md pl-8 pr-2 py-1.5" 
                placeholder="Buscar Factura, BL o Contenedor..." 
              />
            </div>
            <button
              type="button"
              onClick={() => setMostrarFiltros(prev => !prev)}
              className={`px-2 py-1.5 rounded border text-xs font-mono transition flex items-center gap-1 shrink-0 cursor-pointer ${
                hayFiltrosActivos 
                  ? 'bg-teal-950/80 border-teal-500 text-teal-300 font-bold shadow-sm' 
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
              title="Alternar filtros avanzados"
            >
              <span>⚙️</span>
              {hayFiltrosActivos && <span className="w-1.5 h-1.5 rounded-full bg-teal-400"></span>}
            </button>
          </div>

          {/* PANEL COLAPSABLE DE FILTROS COMPACTOS (2 COLUMNAS) */}
          {mostrarFiltros && (
            <div className="p-2 bg-slate-950/90 border border-slate-800 rounded-md space-y-1.5 text-[10px]">
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="block text-slate-500 uppercase font-bold text-[9px] mb-0.5">Levante</label>
                  <select 
                    value={estadoLevanteFiltro} 
                    onChange={e => { setEstadoLevanteFiltro(e.target.value); setPage(1); }}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-200 text-[10px]"
                  >
                    <option value="">Todos</option>
                    <option value="SIN LEVANTE">Sin Levante</option>
                    <option value="CON LEVANTE">Con Levante</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 uppercase font-bold text-[9px] mb-0.5">Llegada</label>
                  <select 
                    value={statusLlegadaFiltro} 
                    onChange={e => { setStatusLlegadaFiltro(e.target.value); setPage(1); }}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-200 text-[10px]"
                  >
                    <option value="">Todos</option>
                    <option value="EN TRÁNSITO">En Tránsito</option>
                    <option value="EN PUERTO">En Puerto</option>
                    <option value="EN ALMACÉN">En Almacén</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 uppercase font-bold text-[9px] mb-0.5">Importador</label>
                  <select 
                    value={importadorFiltro} 
                    onChange={e => { setImportadorFiltro(e.target.value); setPage(1); }}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-200 text-[10px] truncate"
                  >
                    <option value="">Todos</option>
                    {opcionesImportadores.map(imp => (
                      <option key={imp.id_importador} value={imp.id_importador}>{imp.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 uppercase font-bold text-[9px] mb-0.5">Tipo Valor</label>
                  <select 
                    value={tipoValorFiltro} 
                    onChange={e => { setTipoValorFiltro(e.target.value); setPage(1); }}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-200 text-[10px]"
                  >
                    <option value="">Todos</option>
                    <option value="DEFINITIVO">Definitivo</option>
                    <option value="GARANTIZADO">Garantizado</option>
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

        <div className="flex-1 overflow-y-auto divide-y divide-slate-800">
          {maestros.map(m => {
            const isActive = selectedId === m.id_maestro;
            const provNombre = proveedoresMap[m.id_proveedor];
            const impNombre = importadoresMap[m.id_importador];

            return (
              <article key={m.id_maestro} onClick={() => handleSelect(m)} className={`p-3 border-l-2 cursor-pointer transition-colors group ${isActive ? 'bg-teal-900/20 border-teal-500' : 'border-transparent hover:bg-slate-800/40'}`}>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-[10px] font-medium px-1 rounded border ${isActive ? 'text-teal-400 bg-teal-500/10 border-teal-500/20' : 'text-slate-400 bg-slate-700 border-slate-600'}`}>#{m.id_maestro}</span>
                    <span className={`text-sm font-bold font-mono tracking-tight ${isActive ? 'text-teal-300' : 'text-slate-200'}`}>FAC: {m.numero_factura}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded border ${m.estado_levante === 'CON LEVANTE' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/15 border-rose-500/30 text-rose-300'}`}>{m.estado_levante}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1 font-mono">
                  <span className="truncate">BL: {m.documento_transporte || 'S/N'}</span>
                  <span>{m.n_cont_fisico || 'S/Cont'}</span>
                </div>
                {(provNombre || impNombre) && (
                  <div className="text-[10px] text-slate-500 truncate">
                    {provNombre && <span>Prov: <strong className="text-slate-400">{provNombre}</strong></span>}
                    {provNombre && impNombre && <span className="mx-1">•</span>}
                    {impNombre && <span>Imp: <strong className="text-slate-400">{impNombre}</strong></span>}
                  </div>
                )}
              </article>
            );
          })}
          {maestros.length === 0 && <div className="p-6 text-center text-slate-500 text-xs">No se encontraron expedientes.</div>}
        </div>
        <footer className="p-2 border-t border-slate-800 bg-slate-800/50 shrink-0">
          <Paginador page={page} totalPages={totalPages} setPage={setPage} limit={limit} setLimit={setLimit} totalRegistros={totalRegistros} />
        </footer>
      </section>

      {/* PANEL DERECHO: DETALLES (62%) */}
      <section className={`flex-1 flex-col h-full bg-slate-900 overflow-hidden ${!viewMode ? 'hidden lg:flex' : 'flex'}`}>
        {!viewMode ? (
          <div className="flex-1 flex items-center justify-center text-slate-600">
            <div className="text-center"><span className="text-4xl">📂</span><p className="mt-3 text-sm font-medium">Seleccione un expediente de la bandeja para auditar o pulse "+ Nuevo".</p></div>
          </div>
        ) : (
          <>
            <header className="p-4 border-b border-slate-800 bg-slate-800/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <button onClick={() => { if (!hasUnsavedChanges || window.confirm("¿Descartar cambios?")) { setViewMode(null); setHasUnsavedChanges(false); } }} className="lg:hidden p-1.5 bg-slate-700 text-slate-300 rounded hover:bg-slate-600">⬅</button>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-base font-bold font-mono text-white">{viewMode === 'NUEVO' ? 'Nuevo Expediente' : `Expediente Factura ${formData.numero_factura}`}</h1>
                    {hasUnsavedChanges && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="Cambios sin guardar"></span>}
                  </div>
                  {viewMode === 'MODIFICAR' && <div className="text-[11px] text-slate-400 font-mono mt-0.5">ID: #{selectedId} • Régimen: <span className="text-teal-400">{formData.tipo_valor}</span></div>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {viewMode === 'MODIFICAR' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setModalLiquidacionOpen(true)}
                      className="px-2.5 py-1.5 rounded bg-indigo-600/30 border border-indigo-500/50 hover:bg-indigo-600/50 text-indigo-200 font-bold text-xs transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
                      title="Ver e imprimir liquidación de caja de este contenedor o exportar a Excel"
                    >
                      <span>🧾</span>
                      <span>Liquidación Caja</span>
                    </button>
                    {userRole === 1 && formData.estado_levante === 'CON LEVANTE' && (
                      <button onClick={handleDesbloquearLevante} className="px-2.5 py-1.5 rounded bg-amber-600/20 border border-amber-500/40 hover:bg-amber-600/30 text-amber-300 font-bold text-xs transition-colors">🔓 Desbloquear Levante</button>
                    )}
                    <button onClick={() => setModalNuevaDam(prev => ({ ...prev, open: true }))} className="px-2.5 py-1.5 rounded bg-teal-600/20 border border-teal-500/40 hover:bg-teal-600/30 text-teal-300 font-bold text-xs transition-colors">📑 + DAM Rápida</button>
                    <button onClick={() => setModalEliminar({ open: true, id: selectedId, motivo: '' })} className="px-2 py-1.5 rounded text-rose-400 hover:bg-rose-500/10 transition-colors">🗑️</button>
                  </>
                )}
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {isReadOnly && (
                <div className="p-3 bg-amber-950/40 border border-amber-600/50 rounded-lg flex items-center gap-2.5 text-amber-300 text-xs">
                  <span className="text-base">🔒</span><div><strong>Expediente Blindado con LEVANTE:</strong> Solo usuarios administradores pueden modificar los datos de esta operación.</div>
                </div>
              )}

              {/* KPIs ADUANEROS Y DE CARGA */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-2.5"><span className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">FOB Declarado</span><div className="text-base font-bold font-mono text-emerald-400">${formData.fob_usd || '0.00'}</div></div>
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-2.5"><span className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Flete Marítimo</span><div className="text-base font-bold font-mono text-sky-400">${formData.flete_usd || '0.00'}</div></div>
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-2.5"><span className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Total CIF Est. (CFR)</span><div className="text-base font-bold font-mono text-slate-100">${cfr}</div></div>
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-2.5"><span className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Estado Levante</span><div className={`text-xs font-bold font-mono uppercase mt-1 ${formData.estado_levante === 'CON LEVANTE' ? 'text-emerald-400' : 'text-rose-400'}`}>{formData.estado_levante}</div></div>
              </div>

              {/* TERMÓMETRO FINANCIERO DE LA OPERACIÓN (Punto 1) */}
              {viewMode === 'MODIFICAR' && estadoCuenta && (
                <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-teal-500/30 rounded-lg p-3 shadow-md">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base">📊</span>
                      <span className="text-xs font-bold uppercase tracking-wider text-teal-300">Termómetro Financiero del Contenedor</span>
                      <span className="text-[10px] text-slate-400 font-mono">(Liquidación PEN)</span>
                      <button
                        type="button"
                        onClick={() => setModalLiquidacionOpen(true)}
                        className="text-[10px] text-teal-300 hover:text-white underline font-mono ml-1 cursor-pointer"
                        title="Abrir liquidación formal de gastos de este contenedor"
                      >
                        [ Ver Liquidación ]
                      </button>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-mono">
                      <div><span className="text-slate-400 text-[10px] uppercase block">Total Gastos:</span><strong className="text-slate-200">S/ {parseFloat(estadoCuenta.total_general_gastos_pen || 0).toFixed(2)}</strong></div>
                      <div><span className="text-slate-400 text-[10px] uppercase block">Pagado:</span><strong className="text-emerald-400">S/ {parseFloat(estadoCuenta.total_general_pagado_pen || 0).toFixed(2)}</strong></div>
                      <div><span className="text-slate-400 text-[10px] uppercase block">Saldo Pendiente:</span><strong className={`${parseFloat(estadoCuenta.saldo_general_pendiente_pen || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>S/ {parseFloat(estadoCuenta.saldo_general_pendiente_pen || 0).toFixed(2)}</strong></div>
                    </div>
                  </div>
                  {/* Barra de Progreso de Amortización */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-slate-400">Progreso de Amortización</span>
                      <span className={`font-bold ${parseFloat(amortizacion) >= 100 ? 'text-emerald-400' : 'text-amber-400'}`}>{amortizacion}%</span>
                    </div>
                    <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-700">
                      <div className={`h-full transition-all duration-500 ${parseFloat(amortizacion) >= 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-amber-500 to-teal-500'}`} style={{ width: `${Math.min(100, Math.max(0, parseFloat(amortizacion)))}%` }}></div>
                    </div>
                  </div>
                </div>
              )}

              {/* CONTROL DE AVANCE OPERATIVO DE PAGOS (FASE C - MOTOR DE KPIS) */}
              {viewMode === 'MODIFICAR' && kpiGastos && kpiGastos.kpis && (() => {
                const currentKpiKey = KPI_KEYS[kpiViewIndex] || 'FIJO_DESPACHO';
                const kpiActual = kpiGastos.kpis[currentKpiKey];
                if (!kpiActual) return null;

                const colorStyles = {
                  emerald: {
                    bar: 'bg-emerald-500',
                    text: 'text-emerald-400',
                    border: 'border-emerald-500/40',
                    badge: 'bg-emerald-950/70 text-emerald-300 border-emerald-700/60'
                  },
                  amber: {
                    bar: 'bg-amber-500',
                    text: 'text-amber-400',
                    border: 'border-amber-500/40',
                    badge: 'bg-amber-950/70 text-amber-300 border-amber-700/60'
                  },
                  rose: {
                    bar: 'bg-rose-500',
                    text: 'text-rose-400',
                    border: 'border-rose-500/40',
                    badge: 'bg-rose-950/70 text-rose-300 border-rose-700/60'
                  },
                  slate: {
                    bar: 'bg-slate-600',
                    text: 'text-slate-400',
                    border: 'border-slate-700',
                    badge: 'bg-slate-800 text-slate-400 border-slate-700'
                  }
                };

                const currentStyle = colorStyles[kpiActual.color] || colorStyles.slate;

                return (
                  <div className={`bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border ${currentStyle.border} rounded-lg p-3.5 shadow-lg transition-all`}>
                    {/* ENCABEZADO Y SELECTOR DE ETAPA CON FLECHAS */}
                    <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-slate-800">
                      <div className="flex items-center gap-2">
                        {/* Botón Flecha Izquierda */}
                        <button
                          type="button"
                          onClick={() => setKpiViewIndex(prev => (prev === 0 ? KPI_KEYS.length - 1 : prev - 1))}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-600 hover:border-teal-500 text-slate-200 hover:text-white rounded text-xs font-bold transition flex items-center justify-center cursor-pointer shadow-sm"
                          title="Etapa anterior (◀)"
                        >
                          ◀
                        </button>

                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm">🎯</span>
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-100">
                              {kpiActual.nombre_etapa}
                            </span>
                            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase font-bold ${currentStyle.badge}`}>
                              {currentKpiKey.replace('_', ' ')}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {currentKpiKey === 'FIJO_DESPACHO' && 'Medido contra el universo de conceptos obligatorios del catálogo'}
                            {currentKpiKey === 'POST_LEVANTE' && 'Gastos operativos posteriores al levante aduanero'}
                            {currentKpiKey === 'EXTRAORDINARIO' && 'Gastos extraordinarios o incidencias no previstas'}
                            {currentKpiKey === 'GLOBAL' && 'Visión consolidada de todos los conceptos del expediente'}
                          </span>
                        </div>

                        {/* Botón Flecha Derecha */}
                        <button
                          type="button"
                          onClick={() => setKpiViewIndex(prev => (prev === KPI_KEYS.length - 1 ? 0 : prev + 1))}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-600 hover:border-teal-500 text-slate-200 hover:text-white rounded text-xs font-bold transition flex items-center justify-center cursor-pointer shadow-sm"
                          title="Etapa siguiente (▶)"
                        >
                          ▶
                        </button>
                      </div>

                      {/* Métricas y Selector Rápido */}
                      <div className="flex items-center gap-2">
                        {/* Selector de pills rápido */}
                        <div className="hidden sm:flex items-center bg-slate-950/80 p-0.5 rounded-md border border-slate-800 text-[10px] font-mono">
                          {KPI_KEYS.map((key, idx) => (
                            <button
                              key={key}
                              type="button"
                              onClick={() => setKpiViewIndex(idx)}
                              className={`px-2 py-0.5 rounded transition cursor-pointer ${
                                kpiViewIndex === idx
                                  ? 'bg-teal-600 text-white font-bold shadow'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {key === 'FIJO_DESPACHO' && 'Fijos'}
                              {key === 'POST_LEVANTE' && 'Post-Lev.'}
                              {key === 'EXTRAORDINARIO' && 'Extraord.'}
                              {key === 'GLOBAL' && 'Global'}
                            </button>
                          ))}
                        </div>

                        {/* Botón Toggle Desglose */}
                        <button
                          type="button"
                          onClick={() => setShowKpiDetails(prev => !prev)}
                          className="text-[11px] px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white rounded font-mono flex items-center gap-1 transition cursor-pointer shadow-sm"
                        >
                          <span>{showKpiDetails ? '👁️ Ocultar' : '📋 Ver Checklist'}</span>
                          <span className="text-[10px] text-teal-400 font-bold">({kpiActual.items?.length || 0})</span>
                        </button>
                      </div>
                    </div>

                    {/* BARRA DE PROGRESO Y CONTADORES */}
                    <div className="mt-2.5 space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-slate-300 font-bold">
                            Avance: <span className={currentStyle.text}>{kpiActual.conceptos_pagados} de {kpiActual.total_conceptos_universo} cancelados</span>
                          </span>
                          <div className="flex items-center gap-2 text-[10px]">
                            {kpiActual.conceptos_pagados > 0 && (
                              <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
                                {kpiActual.conceptos_pagados} Pagados
                              </span>
                            )}
                            {kpiActual.conceptos_pendientes > 0 && (
                              <span className="text-amber-400 flex items-center gap-1 font-semibold">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>
                                {kpiActual.conceptos_pendientes} Pendientes
                              </span>
                            )}
                            {kpiActual.conceptos_no_registrados > 0 && (
                              <span className="text-rose-400 flex items-center gap-1 font-semibold">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 inline-block"></span>
                                {kpiActual.conceptos_no_registrados} No Registrados
                              </span>
                            )}
                          </div>
                        </div>

                        <span className={`text-sm font-bold ${currentStyle.text}`}>
                          {kpiActual.porcentaje}%
                        </span>
                      </div>

                      {/* Barra de progreso interactiva */}
                      <div
                        onClick={() => setShowKpiDetails(prev => !prev)}
                        className="w-full bg-slate-950 rounded-full h-3 border border-slate-700/80 overflow-hidden cursor-pointer group relative p-0.5 shadow-inner"
                        title="Haz clic para ver u ocultar el desglose de conceptos"
                      >
                        <div
                          className={`h-full rounded-full ${currentStyle.bar} transition-all duration-500 shadow-sm`}
                          style={{ width: `${Math.min(100, Math.max(0, kpiActual.porcentaje))}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* DETALLE CHECKLIST DESPLEGABLE */}
                    {showKpiDetails && (
                      <div className="mt-3 pt-2.5 border-t border-slate-800">
                        <div className="text-[11px] font-bold text-slate-300 mb-2 flex items-center justify-between">
                          <span className="uppercase tracking-wider">Desglose de Conceptos ({kpiActual.items?.length || 0}):</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {currentKpiKey === 'FIJO_DESPACHO' ? 'Catálogo Obligatorio' : 'Gastos Registrados'}
                          </span>
                        </div>

                        {(!kpiActual.items || kpiActual.items.length === 0) ? (
                          <div className="text-xs text-slate-500 italic py-2 text-center bg-slate-950/40 rounded border border-slate-800">
                            No hay conceptos registrados para esta etapa operativa.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                            {kpiActual.items.map((item, idx) => {
                              const isPagado = item.estado === 'PAGADO';
                              const isPendiente = item.estado === 'PENDIENTE';
                              const isNoRegistrado = item.estado === 'NO_REGISTRADO';

                              return (
                                <div
                                  key={idx}
                                  className={`p-2 rounded border text-xs flex items-center justify-between gap-2 font-mono ${
                                    isPagado
                                      ? 'bg-emerald-950/20 border-emerald-800/40 text-slate-200'
                                      : isPendiente
                                      ? 'bg-amber-950/20 border-amber-800/40 text-slate-200'
                                      : 'bg-rose-950/20 border-rose-800/40 text-slate-300'
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5 truncate">
                                    <span className="text-sm">
                                      {isPagado && '✅'}
                                      {isPendiente && '⏳'}
                                      {isNoRegistrado && '⚠️'}
                                    </span>
                                    <span className="font-semibold truncate text-[11px]" title={item.nombre_concepto}>
                                      {item.nombre_concepto}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    {isPagado && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-300 border border-emerald-700/60 font-bold">
                                        PAGADO
                                      </span>
                                    )}
                                    {isPendiente && (
                                      <div className="text-right">
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300 border border-amber-700/60 font-bold block">
                                          PENDIENTE
                                        </span>
                                        {item.saldo_pendiente > 0 && (
                                          <span className="text-[9px] text-amber-400/90 block mt-0.5">
                                            S/ {Number(item.saldo_pendiente).toFixed(2)}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                    {isNoRegistrado && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-900/60 text-rose-300 border border-rose-700/60 font-bold">
                                        NO REGISTRADO
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* FORMULARIO MASTER */}
              <form onSubmit={handleGuardar} className="space-y-4">

                {/* BLOQUE 1 */}
                <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-teal-400 border-b border-slate-700/80 pb-1.5">1. Identificación & Logística</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div><label className="block text-[10px] font-bold text-slate-400 mb-1">N° Factura *</label><input type="text" value={formData.numero_factura} onChange={e => handleFormChange('numero_factura', e.target.value)} required disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 focus:border-teal-500 text-slate-100 font-mono text-xs rounded px-2.5 py-2 disabled:opacity-60" /></div>
                    <div><label className="block text-[10px] font-bold text-slate-400 mb-1">BL / Transporte</label><input type="text" value={formData.documento_transporte} onChange={e => handleFormChange('documento_transporte', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 focus:border-teal-500 text-slate-100 font-mono text-xs rounded px-2.5 py-2 disabled:opacity-60" /></div>
                    <div><label className="block text-[10px] font-bold text-slate-400 mb-1">Contenedor Físico</label><input type="text" value={formData.n_cont_fisico} onChange={e => handleFormChange('n_cont_fisico', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 focus:border-teal-500 text-slate-100 font-mono text-xs rounded px-2.5 py-2 disabled:opacity-60" /></div>
                    <div><label className="block text-[10px] font-bold text-slate-400 mb-1">Estado Llegada</label><select value={formData.status_llegada} onChange={e => handleFormChange('status_llegada', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-amber-300 font-bold text-xs rounded px-2.5 py-2 disabled:opacity-60"><option>EN TRÁNSITO</option><option>EN PUERTO</option><option>EN ALMACÉN</option></select></div>
                  </div>
                </div>

                {/* BLOQUE 2 & 3: Fechas y Actores */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-teal-400 border-b border-slate-700/80 pb-1.5">2. Fechas Operativas</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-[10px] font-bold text-slate-400 mb-1">F. Embarque</label><input type="date" value={formData.fecha_embarque} onChange={e => handleFormChange('fecha_embarque', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-slate-100 text-xs rounded px-2.5 py-2 disabled:opacity-60" /></div>
                      <div><label className="block text-[10px] font-bold text-slate-400 mb-1">F. Arribo</label><input type="date" value={formData.fecha_arribo} onChange={e => handleFormChange('fecha_arribo', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-slate-100 text-xs rounded px-2.5 py-2 disabled:opacity-60" /></div>
                    </div>
                  </div>
                  <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-teal-400 border-b border-slate-700/80 pb-1.5">3. Valores y Régimen</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-[10px] font-bold text-slate-400 mb-1">FOB (USD)</label><input type="number" step="0.01" value={formData.fob_usd} onChange={e => handleFormChange('fob_usd', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-slate-100 font-mono text-xs rounded px-2.5 py-2 text-right disabled:opacity-60" /></div>
                      <div><label className="block text-[10px] font-bold text-slate-400 mb-1">Flete (USD)</label><input type="number" step="0.01" value={formData.flete_usd} onChange={e => handleFormChange('flete_usd', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-slate-100 font-mono text-xs rounded px-2.5 py-2 text-right disabled:opacity-60" /></div>
                      <div><label className="block text-[10px] font-bold text-slate-400 mb-1">Tipo Valor</label><select value={formData.tipo_valor} onChange={e => handleFormChange('tipo_valor', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-slate-100 text-xs rounded px-2.5 py-2 disabled:opacity-60"><option>DEFINITIVO</option><option>GARANTIZADO</option></select></div>
                      <div><label className="block text-[10px] font-bold text-slate-400 mb-1">Venta Sucesiva</label><select value={formData.venta_sucesiva} onChange={e => handleFormChange('venta_sucesiva', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-slate-100 text-xs rounded px-2.5 py-2 disabled:opacity-60"><option>NO</option><option>SI</option></select></div>
                    </div>
                  </div>
                </div>

                {/* BLOQUE 4: Actores */}
                <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-teal-400 border-b border-slate-700/80 pb-1.5">4. Actores & Destino</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><label className="block text-[10px] font-bold text-slate-400 mb-1">Importador</label><select value={formData.id_importador} onChange={e => handleFormChange('id_importador', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-xs rounded px-2.5 py-2 disabled:opacity-60"><option value="">-- Seleccionar --</option>{opcionesImportadores.map(o => <option key={o.id_importador} value={o.id_importador}>{o.nombre}</option>)}</select></div>
                    <div><label className="block text-[10px] font-bold text-slate-400 mb-1">Proveedor (Shipper)</label><select value={formData.id_proveedor} onChange={e => handleFormChange('id_proveedor', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-xs rounded px-2.5 py-2 disabled:opacity-60"><option value="">-- Seleccionar --</option>{opcionesProveedores.map(o => <option key={o.id_proveedor} value={o.id_proveedor}>{o.nombre}</option>)}</select></div>
                    <div><label className="block text-[10px] font-bold text-slate-400 mb-1">Agente de Aduanas</label><select value={formData.id_agente} onChange={e => handleFormChange('id_agente', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-xs rounded px-2.5 py-2 disabled:opacity-60"><option value="">-- Seleccionar --</option>{opcionesAgentes.map(o => <option key={o.id_agente} value={o.id_agente}>{o.nombre}</option>)}</select></div>
                    <div><label className="block text-[10px] font-bold text-slate-400 mb-1">Almacén Destino</label><select value={formData.id_almacen} onChange={e => handleFormChange('id_almacen', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-xs rounded px-2.5 py-2 disabled:opacity-60"><option value="">-- Seleccionar --</option>{opcionesAlmacenes.map(o => <option key={o.id_almacen} value={o.id_almacen}>{o.nombre}</option>)}</select></div>
                  </div>
                </div>

                {/* Botonera Master */}
                <div className="flex justify-end pt-2 border-t border-slate-700">
                  <button type="submit" disabled={!hasUnsavedChanges || isGuardando || isReadOnly} className="px-5 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded text-xs transition-all disabled:opacity-50 disabled:bg-slate-700">
                    {isGuardando ? 'Procesando...' : (viewMode === 'NUEVO' ? 'Crear Expediente' : 'Guardar Cambios')}
                  </button>
                </div>
              </form>

              {/* TABS DE SUB-REGISTROS RICAS */}
              {viewMode === 'MODIFICAR' && (
                <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden flex flex-col mt-4">
                  <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800/80 px-2 pt-1">
                    <div className="flex items-center">
                      <button type="button" onClick={() => setActiveTab('DAMS')} className={`px-3 py-1.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors ${activeTab === 'DAMS' ? 'border-teal-400 text-teal-300' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
                        <span>DAMs Registradas</span>
                        <span className="px-1.5 py-0.5 rounded-full bg-slate-950 text-[10px] font-mono">{damsVinculadas.length}</span>
                      </button>
                      <button type="button" onClick={() => setActiveTab('GASTOS')} className={`px-3 py-1.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors ${activeTab === 'GASTOS' ? 'border-teal-400 text-teal-300' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
                        <span>Gastos Logísticos</span>
                        <span className="px-1.5 py-0.5 rounded-full bg-slate-950 text-[10px] font-mono">{gastosVinculados.length}</span>
                      </button>
                    </div>
                    <div className="pb-1 pr-1 flex items-center gap-1.5">
                      {activeTab === 'DAMS' && (
                        <button onClick={() => setModalNuevaDam(prev => ({ ...prev, open: true }))} className="px-2.5 py-1 bg-teal-600 hover:bg-teal-500 text-white rounded text-[10px] font-bold shadow-sm transition-all flex items-center gap-1">
                          <span>+</span> Nueva DAM Rápida
                        </button>
                      )}
                      {activeTab === 'GASTOS' && (
                        <button onClick={() => setModalNuevoGasto(prev => ({ ...prev, open: true, id_dam: damsVinculadas[0]?.id_dam ? String(damsVinculadas[0].id_dam) : '' }))} className="px-2.5 py-1 bg-teal-600 hover:bg-teal-500 text-white rounded text-[10px] font-bold shadow-sm transition-all flex items-center gap-1">
                          <span>+</span> Registrar Gasto Rápido
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="p-0 overflow-x-auto min-h-[140px]">
                    {isLoadingSub ? (
                      <div className="p-6 text-center text-teal-500 text-xs font-bold animate-pulse">Cargando relaciones operativas...</div>
                    ) : (
                      <>
                        {/* TABLA RICA DE DAMS */}
                        {activeTab === 'DAMS' && (
                          <table className="w-full text-left text-[11px] whitespace-nowrap">
                            <thead className="bg-slate-950 text-slate-400 uppercase text-[9px] font-bold border-b border-slate-800">
                              <tr>
                                <th className="px-3 py-2 w-12">ID</th>
                                <th className="px-3 py-2">Nº DAM</th>
                                <th className="px-3 py-2 w-16">Serie</th>
                                <th className="px-3 py-2 text-center w-24">Canal</th>
                                <th className="px-3 py-2 text-center w-28">Aforo Físico</th>
                                <th className="px-3 py-2 text-right w-28">Valor Prov (USD)</th>
                                <th className="px-3 py-2 text-center w-20">Acción</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/80 text-slate-300">
                              {damsVinculadas.map(d => {
                                const requiereAforo = d.canal_control === 'ROJO' && !d.aforo_realizado;
                                return (
                                  <tr key={d.id_dam} className="hover:bg-slate-800/50 transition-colors group">
                                    <td className="px-3 py-2 font-mono text-slate-500 group-hover:text-teal-400">#{d.id_dam}</td>
                                    <td className="px-3 py-2 font-mono font-bold text-slate-200">
                                      <div className="flex items-center gap-1.5">
                                        <span>{d.numero_de_dam}</span>
                                        {requiereAforo && (
                                          <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" title="Aforo obligatorio pendiente"></span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-3 py-2 font-mono text-slate-400">{d.serie || 'N/A'}</td>
                                    <td className="px-3 py-2 text-center">
                                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${d.canal_control === 'VERDE' ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800' : d.canal_control === 'ROJO' ? 'bg-rose-900/30 text-rose-400 border-rose-800' : 'bg-orange-900/30 text-orange-400 border-orange-800'}`}>
                                        {d.canal_control}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      <button
                                        type="button"
                                        onClick={(e) => handleToggleAforo(e, d)}
                                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all border ${d.aforo_realizado ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700 hover:bg-emerald-900/60' : 'bg-rose-900/40 text-rose-300 border-rose-700 hover:bg-rose-900/60'}`}
                                        title="Click para alternar certificación de aforo"
                                      >
                                        {d.aforo_realizado ? '✅ Realizado' : '❌ Pendiente'}
                                      </button>
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono font-bold text-slate-200">${d.monto_valor_provisional_usd ? parseFloat(d.monto_valor_provisional_usd).toFixed(2) : '0.00'}</td>
                                    <td className="px-3 py-2 text-center">
                                      <button onClick={() => navigate('/app/dams', { state: { fromMaestro: formData } })} className="text-[10px] text-teal-400 hover:underline">Ver detalle ➔</button>
                                    </td>
                                  </tr>
                                );
                              })}
                              {damsVinculadas.length === 0 && <tr><td colSpan="7" className="px-3 py-6 text-center text-slate-500 italic">No hay DAMs vinculadas a este expediente.</td></tr>}
                            </tbody>
                          </table>
                        )}

                        {/* TABLA RICA DE GASTOS LOGÍSTICOS CON MICRO-ACCIÓN 💸 PAGAR */}
                        {activeTab === 'GASTOS' && (
                          <table className="w-full text-left text-[11px] whitespace-nowrap">
                            <thead className="bg-slate-950 text-slate-400 uppercase text-[9px] font-bold border-b border-slate-800">
                              <tr>
                                <th className="px-3 py-2 w-12">ID</th>
                                <th className="px-3 py-2 max-w-[140px]">Proveedor</th>
                                <th className="px-3 py-2 max-w-[140px]">Concepto</th>
                                <th className="px-3 py-2">Documento</th>
                                <th className="px-3 py-2 text-right">Monto</th>
                                <th className="px-3 py-2 text-center w-16">Moneda</th>
                                <th className="px-3 py-2 text-center w-24">Estado Pago</th>
                                <th className="px-3 py-2">DAM</th>
                                <th className="px-3 py-2 text-center w-20">Acción</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/80 text-slate-300">
                              {gastosVinculados.map(g => (
                                <tr key={g.id_gasto} className="hover:bg-slate-800/50 transition-colors group">
                                  <td className="px-3 py-2 font-mono text-slate-500 group-hover:text-teal-400">#{g.id_gasto}</td>
                                  <td className="px-3 py-2 font-bold text-slate-200 truncate max-w-[140px]" title={g.proveedor_nombre}>{g.proveedor_nombre || 'N/A'}</td>
                                  <td className="px-3 py-2 font-bold text-teal-300 truncate max-w-[140px]" title={g.concepto_nombre}>{g.concepto_nombre || 'N/A'}</td>
                                  <td className="px-3 py-2 font-mono text-slate-300">{g.numero_documento || 'S/N'}</td>
                                  <td className="px-3 py-2 text-right font-mono font-bold text-slate-200">{parseFloat(g.monto_original || 0).toFixed(2)}</td>
                                  <td className="px-3 py-2 text-center font-bold text-slate-400">{g.moneda}</td>
                                  <td className="px-3 py-2 text-center"><span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${g.estado_pago === 'PAGADO' ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800' : g.estado_pago === 'PENDIENTE' ? 'bg-rose-900/30 text-rose-400 border-rose-800' : 'bg-amber-900/30 text-amber-400 border-amber-800'}`}>{g.estado_pago}</span></td>
                                  <td className="px-3 py-2 font-mono text-slate-400 truncate max-w-[120px]">{g.dam_numero || '-'}</td>
                                  <td className="px-3 py-2 text-center">
                                    {g.estado_pago !== 'PAGADO' ? (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); navigate(`/app/pagos?gasto_id=${g.id_gasto}`); }}
                                        className="px-2 py-0.5 rounded bg-purple-600/30 hover:bg-purple-600 text-purple-300 hover:text-white text-[10px] font-bold border border-purple-500/40 transition-all flex items-center gap-1 mx-auto shadow-sm"
                                        title="Registrar pago de este gasto"
                                      >
                                        <span>💸</span> Pagar
                                      </button>
                                    ) : (
                                      <span className="text-[10px] text-emerald-400 font-bold">Liquidado</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                              {gastosVinculados.length === 0 && <tr><td colSpan="9" className="px-3 py-6 text-center text-slate-500 italic">No hay Gastos vinculados a esta operación.</td></tr>}
                            </tbody>
                          </table>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* MODAL INLINE: REGISTRAR DAM RÁPIDA (Punto 3) */}
      {modalNuevaDam.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-teal-950/40 border-b border-teal-800/50 p-4 flex items-center justify-between">
              <h3 className="text-teal-300 font-bold text-sm flex items-center gap-2"><span>📑</span> Registrar DAM para {formData.numero_factura}</h3>
              <button onClick={() => setModalNuevaDam(prev => ({ ...prev, open: false }))} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleCrearDamInline} className="p-5 space-y-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">N° de DAM *</label>
                <input
                  type="text"
                  required
                  value={modalNuevaDam.numero_de_dam}
                  onChange={e => setModalNuevaDam({ ...modalNuevaDam, numero_de_dam: e.target.value })}
                  placeholder="Ej: 118-2026-10-123456"
                  className="w-full bg-slate-950 border border-slate-700 text-slate-100 font-mono text-xs rounded p-2 focus:border-teal-500 font-bold"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Serie</label>
                  <input
                    type="text"
                    value={modalNuevaDam.serie}
                    onChange={e => setModalNuevaDam({ ...modalNuevaDam, serie: e.target.value })}
                    placeholder="001"
                    className="w-full bg-slate-950 border border-slate-700 text-slate-100 font-mono text-xs rounded p-2 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Canal de Control</label>
                  <select
                    value={modalNuevaDam.canal_control}
                    onChange={e => setModalNuevaDam({ ...modalNuevaDam, canal_control: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-100 text-xs rounded p-2 focus:border-teal-500 font-bold"
                  >
                    <option value="VERDE">VERDE</option>
                    <option value="NARANJA">NARANJA</option>
                    <option value="ROJO">ROJO</option>
                  </select>
                </div>
              </div>
              {formData.tipo_valor === 'GARANTIZADO' && (
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Monto Garantizado (USD) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={modalNuevaDam.monto_valor_provisional_usd}
                    onChange={e => setModalNuevaDam({ ...modalNuevaDam, monto_valor_provisional_usd: e.target.value })}
                    placeholder="0.00"
                    className="w-full bg-slate-950 border border-slate-700 text-emerald-400 font-mono text-xs rounded p-2 focus:border-teal-500 text-right font-bold"
                  />
                </div>
              )}
              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button type="button" onClick={() => setModalNuevaDam(prev => ({ ...prev, open: false }))} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white">Cancelar</button>
                <button type="submit" disabled={isSubmittingInline} className="px-4 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded text-xs font-bold shadow-md disabled:opacity-50">
                  {isSubmittingInline ? 'Guardando...' : 'Crear DAM'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL INLINE: REGISTRAR GASTO RÁPIDO (Punto 3) */}
      {modalNuevoGasto.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-teal-950/40 border-b border-teal-800/50 p-4 flex items-center justify-between">
              <h3 className="text-teal-300 font-bold text-sm flex items-center gap-2"><span>💸</span> Registrar Gasto Operativo para {formData.numero_factura}</h3>
              <button onClick={() => setModalNuevoGasto(prev => ({ ...prev, open: false }))} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleCrearGastoInline} className="p-5 space-y-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">DAM Vinculada *</label>
                <select
                  required
                  value={modalNuevoGasto.id_dam}
                  onChange={e => setModalNuevoGasto({ ...modalNuevoGasto, id_dam: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded p-2 focus:border-teal-500 font-mono font-bold"
                >
                  <option value="">-- Seleccionar DAM --</option>
                  {damsVinculadas.map(d => (
                    <option key={d.id_dam} value={d.id_dam}>DAM {d.numero_de_dam} (Canal {d.canal_control})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Concepto *</label>
                  <select
                    required
                    value={modalNuevoGasto.id_concepto}
                    onChange={e => setModalNuevoGasto({ ...modalNuevoGasto, id_concepto: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded p-2 focus:border-teal-500 font-bold"
                  >
                    <option value="">-- Seleccionar --</option>
                    {opcionesConceptos.map(c => (
                      <option key={c.id_concepto} value={c.id_concepto}>{c.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Proveedor *</label>
                  <select
                    required
                    value={modalNuevoGasto.id_proveedor}
                    onChange={e => setModalNuevoGasto({ ...modalNuevoGasto, id_proveedor: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded p-2 focus:border-teal-500"
                  >
                    <option value="">-- Seleccionar --</option>
                    {opcionesProveedores.map(p => (
                      <option key={p.id_proveedor} value={p.id_proveedor}>{p.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Tipo Documento *</label>
                  <select
                    required
                    value={modalNuevoGasto.id_tipo_doc}
                    onChange={e => setModalNuevoGasto({ ...modalNuevoGasto, id_tipo_doc: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded p-2 focus:border-teal-500"
                  >
                    <option value="">-- Seleccionar --</option>
                    {opcionesTiposDoc.map(t => (
                      <option key={t.id_tipo_doc} value={t.id_tipo_doc}>{t.nombre_documento}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">N° Documento</label>
                  <input
                    type="text"
                    value={modalNuevoGasto.numero_documento}
                    onChange={e => setModalNuevoGasto({ ...modalNuevoGasto, numero_documento: e.target.value })}
                    placeholder="Ej: F001-9988"
                    className="w-full bg-slate-950 border border-slate-700 text-slate-100 font-mono text-xs rounded p-2 focus:border-teal-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Monto *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={modalNuevoGasto.monto_original}
                    onChange={e => setModalNuevoGasto({ ...modalNuevoGasto, monto_original: e.target.value })}
                    placeholder="0.00"
                    className="w-full bg-slate-950 border border-slate-700 text-emerald-400 font-mono text-xs rounded p-2 focus:border-teal-500 text-right font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Moneda *</label>
                  <select
                    value={modalNuevoGasto.moneda}
                    onChange={e => setModalNuevoGasto({ ...modalNuevoGasto, moneda: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-100 text-xs rounded p-2 focus:border-teal-500 font-bold"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="PEN">PEN (S/)</option>
                  </select>
                </div>
              </div>
              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button type="button" onClick={() => setModalNuevoGasto(prev => ({ ...prev, open: false }))} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white">Cancelar</button>
                <button type="submit" disabled={isSubmittingInline} className="px-4 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded text-xs font-bold shadow-md disabled:opacity-50">
                  {isSubmittingInline ? 'Guardando...' : 'Registrar Gasto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Nativo Eliminar */}
      {modalEliminar.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-rose-950/30 border-b border-rose-900/50 p-4"><h3 className="text-rose-400 font-bold">⚠️ Confirmar Eliminación</h3></div>
            <div className="p-5">
              <textarea autoFocus value={modalEliminar.motivo} onChange={(e) => setModalEliminar({ ...modalEliminar, motivo: e.target.value })} rows="3" className="w-full text-sm bg-slate-950 border border-slate-700 text-slate-200 rounded p-2 focus:border-rose-500" placeholder="Motivo de auditoría (mín 10 caracteres)..."></textarea>
            </div>
            <div className="bg-slate-800/50 p-4 flex justify-end gap-3"><button onClick={() => setModalEliminar({ open: false, id: null, motivo: '' })} className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-slate-200">Cancelar</button><button onClick={handleEliminarConfirm} className="px-4 py-2 text-sm font-bold text-white bg-rose-600 rounded">Eliminar Maestro</button></div>
          </div>
        </div>
      )}

      {/* Modal de Liquidación de Despacho y Caja A4 + Excel */}
      <ModalLiquidacionContenedor
        isOpen={modalLiquidacionOpen}
        idMaestro={selectedId}
        onClose={() => setModalLiquidacionOpen(false)}
      />
    </main>
  );
};
export default Logistica;
