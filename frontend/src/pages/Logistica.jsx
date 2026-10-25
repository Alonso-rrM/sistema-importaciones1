import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import useDebounce from '../hooks/useDebounce';
import Paginador from '../components/Paginador';

const Logistica = () => {
  const navigate = useNavigate();
  const [maestros, setMaestros] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [viewMode, setViewMode] = useState(null); // null = Solo bandeja, 'NUEVO', 'MODIFICAR'

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 400);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRegistros, setTotalRegistros] = useState(0);

  // Catálogos completos
  const [opcionesProveedores, setOpcionesProveedores] = useState([]);
  const [opcionesImportadores, setOpcionesImportadores] = useState([]);
  const [opcionesAgentes, setOpcionesAgentes] = useState([]);
  const [opcionesAlmacenes, setOpcionesAlmacenes] = useState([]);

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

  // Tabs Sub-registros
  const [activeTab, setActiveTab] = useState('DAMS');
  const [damsVinculadas, setDamsVinculadas] = useState([]);
  const [gastosVinculados, setGastosVinculados] = useState([]);
  const [isLoadingSub, setIsLoadingSub] = useState(false);

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
  useEffect(() => { cargarMaestros(); }, [debouncedSearch, page, limit]);

  const cargarCatalogos = async () => {
    try {
      const [resProv, resImp, resAg, resAlm] = await Promise.all([
        api.get('/proveedores/'), api.get('/importadores/'), api.get('/agentes/'), api.get('/almacenes/')
      ]);
      setOpcionesProveedores(resProv.data || []);
      setOpcionesImportadores(resImp.data || []);
      setOpcionesAgentes(resAg.data || []);
      setOpcionesAlmacenes(resAlm.data || []);
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
      const res = await api.get('/maestros/', { params: { search: debouncedSearch.trim() || undefined, page, limit } });
      setMaestros(res.data?.data || []);
      setTotalPages(res.data?.total_paginas || 1);
      setTotalRegistros(res.data?.total_registros || 0);
    } catch (error) { console.error("Error maestros:", error); }
  };

  // Optimización de red: Solo consultar datos del expediente abierto
  const cargarSubRegistros = async (id_maestro, numero_factura) => {
    setIsLoadingSub(true);
    try {
      // Obtiene las DAMs específicas vía endpoint de reporte
      const resDams = await api.get(`/reporte-maestro/${id_maestro}`);
      setDamsVinculadas(resDams.data?.dams || []);

      // Filtra los gastos delegando la búsqueda de la factura al backend
      const resGastos = await api.get('/gastos/', { params: { search: numero_factura, limit: 100 } });
      setGastosVinculados(resGastos.data?.data || []);
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
    // Sanitización de HTML5 Dates y nulls
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
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (isReadOnly) return alert("Este registro cuenta con LEVANTE y está protegido contra edición.");
    setIsGuardando(true);

    try {
      // Escudo contra Pydantic 422: Conversión estricta
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
            <button onClick={handleNuevo} className="inline-flex items-center px-2.5 py-1 text-[11px] font-bold rounded bg-teal-600 hover:bg-teal-500 text-white shadow-sm transition-all">+ Nuevo</button>
          </div>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-500 text-xs">🔍</span>
            <input type="text" value={searchTerm} onChange={e => {setSearchTerm(e.target.value); setPage(1);}} className="w-full bg-slate-900 border border-slate-700 focus:border-teal-500 text-xs text-slate-200 placeholder-slate-500 rounded-md pl-8 py-1.5" placeholder="Buscar Factura o BL..." />
          </div>
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
                <button onClick={() => { if(!hasUnsavedChanges || window.confirm("¿Descartar cambios?")) { setViewMode(null); setHasUnsavedChanges(false); } }} className="lg:hidden p-1.5 bg-slate-700 text-slate-300 rounded hover:bg-slate-600">⬅</button>
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
                    {userRole === 1 && formData.estado_levante === 'CON LEVANTE' && (
                      <button onClick={handleDesbloquearLevante} className="px-2.5 py-1.5 rounded bg-amber-600/20 border border-amber-500/40 hover:bg-amber-600/30 text-amber-300 font-bold text-xs transition-colors">🔓 Desbloquear Levante</button>
                    )}
                    <button onClick={() => navigate('/app/dams', { state: { fromMaestro: formData } })} className="px-3 py-1.5 rounded bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-sm transition-all">📑 + DAM</button>
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

              {/* KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-2.5"><span className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">FOB Declarado</span><div className="text-base font-bold font-mono text-emerald-400">${formData.fob_usd || '0.00'}</div></div>
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-2.5"><span className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Flete Marítimo</span><div className="text-base font-bold font-mono text-sky-400">${formData.flete_usd || '0.00'}</div></div>
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-2.5"><span className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Total CIF Est. (CFR)</span><div className="text-base font-bold font-mono text-slate-100">${cfr}</div></div>
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-2.5"><span className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Estado Levante</span><div className={`text-xs font-bold font-mono uppercase mt-1 ${formData.estado_levante==='CON LEVANTE'?'text-emerald-400':'text-rose-400'}`}>{formData.estado_levante}</div></div>
              </div>

              <form onSubmit={handleGuardar} className="space-y-4">
                
                {/* BLOQUE 1 */}
                <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-teal-400 border-b border-slate-700/80 pb-1.5">1. Identificación & Logística</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div><label className="block text-[10px] font-bold text-slate-400 mb-1">N° Factura *</label><input type="text" value={formData.numero_factura} onChange={e=>handleFormChange('numero_factura', e.target.value)} required disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 focus:border-teal-500 text-slate-100 font-mono text-xs rounded px-2.5 py-2 disabled:opacity-60" /></div>
                    <div><label className="block text-[10px] font-bold text-slate-400 mb-1">BL / Transporte</label><input type="text" value={formData.documento_transporte} onChange={e=>handleFormChange('documento_transporte', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 focus:border-teal-500 text-slate-100 font-mono text-xs rounded px-2.5 py-2 disabled:opacity-60" /></div>
                    <div><label className="block text-[10px] font-bold text-slate-400 mb-1">Contenedor Físico</label><input type="text" value={formData.n_cont_fisico} onChange={e=>handleFormChange('n_cont_fisico', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 focus:border-teal-500 text-slate-100 font-mono text-xs rounded px-2.5 py-2 disabled:opacity-60" /></div>
                    <div><label className="block text-[10px] font-bold text-slate-400 mb-1">Estado Llegada</label><select value={formData.status_llegada} onChange={e=>handleFormChange('status_llegada', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-amber-300 font-bold text-xs rounded px-2.5 py-2 disabled:opacity-60"><option>EN TRÁNSITO</option><option>EN PUERTO</option><option>EN ALMACÉN</option></select></div>
                  </div>
                </div>

                {/* BLOQUE 2 & 3: Fechas y Actores */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-teal-400 border-b border-slate-700/80 pb-1.5">2. Fechas Operativas</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-[10px] font-bold text-slate-400 mb-1">F. Embarque</label><input type="date" value={formData.fecha_embarque} onChange={e=>handleFormChange('fecha_embarque', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-slate-100 text-xs rounded px-2.5 py-2 disabled:opacity-60" /></div>
                      <div><label className="block text-[10px] font-bold text-slate-400 mb-1">F. Arribo</label><input type="date" value={formData.fecha_arribo} onChange={e=>handleFormChange('fecha_arribo', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-slate-100 text-xs rounded px-2.5 py-2 disabled:opacity-60" /></div>
                    </div>
                  </div>
                  <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-teal-400 border-b border-slate-700/80 pb-1.5">3. Valores y Régimen</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-[10px] font-bold text-slate-400 mb-1">FOB (USD)</label><input type="number" step="0.01" value={formData.fob_usd} onChange={e=>handleFormChange('fob_usd', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-slate-100 font-mono text-xs rounded px-2.5 py-2 text-right disabled:opacity-60" /></div>
                      <div><label className="block text-[10px] font-bold text-slate-400 mb-1">Flete (USD)</label><input type="number" step="0.01" value={formData.flete_usd} onChange={e=>handleFormChange('flete_usd', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-slate-100 font-mono text-xs rounded px-2.5 py-2 text-right disabled:opacity-60" /></div>
                      <div><label className="block text-[10px] font-bold text-slate-400 mb-1">Tipo Valor</label><select value={formData.tipo_valor} onChange={e=>handleFormChange('tipo_valor', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-slate-100 text-xs rounded px-2.5 py-2 disabled:opacity-60"><option>DEFINITIVO</option><option>GARANTIZADO</option></select></div>
                      <div><label className="block text-[10px] font-bold text-slate-400 mb-1">Venta Sucesiva</label><select value={formData.venta_sucesiva} onChange={e=>handleFormChange('venta_sucesiva', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-slate-100 text-xs rounded px-2.5 py-2 disabled:opacity-60"><option>NO</option><option>SI</option></select></div>
                    </div>
                  </div>
                </div>

                {/* BLOQUE 4: Actores */}
                <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-teal-400 border-b border-slate-700/80 pb-1.5">4. Actores & Destino</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><label className="block text-[10px] font-bold text-slate-400 mb-1">Importador</label><select value={formData.id_importador} onChange={e=>handleFormChange('id_importador', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-xs rounded px-2.5 py-2 disabled:opacity-60"><option value="">-- Seleccionar --</option>{opcionesImportadores.map(o=><option key={o.id_importador} value={o.id_importador}>{o.nombre}</option>)}</select></div>
                    <div><label className="block text-[10px] font-bold text-slate-400 mb-1">Proveedor (Shipper)</label><select value={formData.id_proveedor} onChange={e=>handleFormChange('id_proveedor', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-xs rounded px-2.5 py-2 disabled:opacity-60"><option value="">-- Seleccionar --</option>{opcionesProveedores.map(o=><option key={o.id_proveedor} value={o.id_proveedor}>{o.nombre}</option>)}</select></div>
                    <div><label className="block text-[10px] font-bold text-slate-400 mb-1">Agente de Aduanas</label><select value={formData.id_agente} onChange={e=>handleFormChange('id_agente', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-xs rounded px-2.5 py-2 disabled:opacity-60"><option value="">-- Seleccionar --</option>{opcionesAgentes.map(o=><option key={o.id_agente} value={o.id_agente}>{o.nombre}</option>)}</select></div>
                    <div><label className="block text-[10px] font-bold text-slate-400 mb-1">Almacén Destino</label><select value={formData.id_almacen} onChange={e=>handleFormChange('id_almacen', e.target.value)} disabled={isReadOnly} className="w-full bg-slate-900 border border-slate-600 text-slate-200 text-xs rounded px-2.5 py-2 disabled:opacity-60"><option value="">-- Seleccionar --</option>{opcionesAlmacenes.map(o=><option key={o.id_almacen} value={o.id_almacen}>{o.nombre}</option>)}</select></div>
                  </div>
                </div>

                {/* Botonera Master */}
                <div className="flex justify-end pt-2 border-t border-slate-700">
                  <button type="submit" disabled={!hasUnsavedChanges || isGuardando || isReadOnly} className="px-5 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded text-xs transition-all disabled:opacity-50 disabled:bg-slate-700">
                    {isGuardando ? 'Procesando...' : (viewMode === 'NUEVO' ? 'Crear Expediente' : 'Guardar Cambios')}
                  </button>
                </div>
              </form>

              {/* TABS DE SUB-REGISTROS */}
              {viewMode === 'MODIFICAR' && (
                <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden flex flex-col mt-4">
                  <div className="flex items-center border-b border-slate-700 bg-slate-800/80 px-2 pt-1">
                    <button type="button" onClick={() => setActiveTab('DAMS')} className={`px-3 py-1.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors ${activeTab === 'DAMS' ? 'border-teal-400 text-teal-300' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
                      <span>DAMs Registradas</span>
                      <span className="px-1.5 py-0.5 rounded-full bg-slate-950 text-[10px] font-mono">{damsVinculadas.length}</span>
                    </button>
                    <button type="button" onClick={() => setActiveTab('GASTOS')} className={`px-3 py-1.5 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors ${activeTab === 'GASTOS' ? 'border-teal-400 text-teal-300' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
                      <span>Gastos Logísticos</span>
                      <span className="px-1.5 py-0.5 rounded-full bg-slate-950 text-[10px] font-mono">{gastosVinculados.length}</span>
                    </button>
                  </div>
                  
                  <div className="p-0 overflow-x-auto min-h-[120px]">
                    {isLoadingSub ? (
                      <div className="p-6 text-center text-teal-500 text-xs font-bold animate-pulse">Cargando vinculaciones...</div>
                    ) : (
                      <>
                        {activeTab === 'DAMS' && (
                          <table className="w-full text-left text-[11px]">
                            <thead className="bg-slate-950 text-slate-400 uppercase text-[9px] font-bold border-b border-slate-800">
                              <tr><th className="px-3 py-2">ID</th><th className="px-3 py-2">Nº DAM</th><th className="px-3 py-2 text-center">Canal</th><th className="px-3 py-2 text-center">Aforo</th><th className="px-3 py-2 text-right">Prov (USD)</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/80 text-slate-300">
                              {damsVinculadas.map(d => (
                                <tr key={d.id_dam} className="hover:bg-slate-800/50 transition-colors cursor-pointer" onClick={() => navigate('/app/dams', { state: { fromMaestro: formData } })}>
                                  <td className="px-3 py-2 font-mono text-slate-500">#{d.id_dam}</td>
                                  <td className="px-3 py-2 font-mono font-bold text-slate-200">{d.numero_de_dam}</td>
                                  <td className="px-3 py-2 text-center"><span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${d.canal_control==='VERDE'?'bg-emerald-900/30 text-emerald-400 border-emerald-800':d.canal_control==='ROJO'?'bg-rose-900/30 text-rose-400 border-rose-800':'bg-orange-900/30 text-orange-400 border-orange-800'}`}>{d.canal_control}</span></td>
                                  <td className="px-3 py-2 text-center">{d.aforo_realizado ? '✅' : '❌'}</td>
                                  <td className="px-3 py-2 text-right font-mono">${d.monto_valor_provisional_usd || '0.00'}</td>
                                </tr>
                              ))}
                              {damsVinculadas.length === 0 && <tr><td colSpan="5" className="px-3 py-6 text-center text-slate-500 italic">No hay DAMs vinculadas a este contenedor.</td></tr>}
                            </tbody>
                          </table>
                        )}

                        {activeTab === 'GASTOS' && (
                          <table className="w-full text-left text-[11px]">
                            <thead className="bg-slate-950 text-slate-400 uppercase text-[9px] font-bold border-b border-slate-800">
                              <tr><th className="px-3 py-2">ID</th><th className="px-3 py-2">Documento</th><th className="px-3 py-2 text-center">Estado</th><th className="px-3 py-2 text-right">Monto</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/80 text-slate-300">
                              {gastosVinculados.map(g => (
                                <tr key={g.id_gasto} className="hover:bg-slate-800/50 transition-colors cursor-pointer" onClick={() => navigate('/app/gastos')}>
                                  <td className="px-3 py-2 font-mono text-slate-500">#{g.id_gasto}</td>
                                  <td className="px-3 py-2 font-mono text-slate-200">{g.numero_documento || 'S/N'}</td>
                                  <td className="px-3 py-2 text-center"><span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${g.estado_pago==='PAGADO'?'bg-emerald-900/30 text-emerald-400 border-emerald-800':g.estado_pago==='PENDIENTE'?'bg-rose-900/30 text-rose-400 border-rose-800':'bg-amber-900/30 text-amber-400 border-amber-800'}`}>{g.estado_pago}</span></td>
                                  <td className="px-3 py-2 text-right font-mono font-bold text-slate-200">{g.moneda === 'PEN' ? 'S/' : '$'}{parseFloat(g.monto_original).toFixed(2)}</td>
                                </tr>
                              ))}
                              {gastosVinculados.length === 0 && <tr><td colSpan="4" className="px-3 py-6 text-center text-slate-500 italic">No hay Gastos vinculados.</td></tr>}
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
      
      {/* Modal Nativo Eliminar */}
      {modalEliminar.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-rose-950/30 border-b border-rose-900/50 p-4"><h3 className="text-rose-400 font-bold">⚠️ Confirmar Eliminación</h3></div>
            <div className="p-5">
              <textarea autoFocus value={modalEliminar.motivo} onChange={(e) => setModalEliminar({...modalEliminar, motivo: e.target.value})} rows="3" className="w-full text-sm bg-slate-950 border border-slate-700 text-slate-200 rounded p-2 focus:border-rose-500" placeholder="Motivo de auditoría (mín 10 caracteres)..."></textarea>
            </div>
            <div className="bg-slate-800/50 p-4 flex justify-end gap-3"><button onClick={() => setModalEliminar({open:false, id:null, motivo:''})} className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-slate-200">Cancelar</button><button onClick={handleEliminarConfirm} className="px-4 py-2 text-sm font-bold text-white bg-rose-600 rounded">Eliminar Maestro</button></div>
          </div>
        </div>
      )}
    </main>
  );
};
export default Logistica;
