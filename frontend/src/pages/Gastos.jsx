import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Select from 'react-select';
import Paginador from '../components/Paginador';
import useDebounce from '../hooks/useDebounce';

const Gastos = () => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState('LISTA');
  const [selectedId, setSelectedId] = useState(null);

  const [gastos, setGastos] = useState([]);
  const [maestrosRaw, setMaestrosRaw] = useState([]);
  const [damsRaw, setDamsRaw] = useState([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [monedaFiltro, setMonedaFiltro] = useState('');

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

  useEffect(() => { cargarCatalogos(); }, []);
  useEffect(() => { cargarListaGastos(); }, [debouncedSearch, page, limit, estadoFiltro, monedaFiltro]);

  // Manejo de la tecla Escape para cerrar modales y cajón lateral
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
          page,
          limit
        }
      });
      setGastos(response.data?.data || []);
      setTotalPages(response.data?.total_paginas || 1);
      setTotalRegistros(response.data?.total_registros || 0);
    } catch (error) {
      console.error("Error al obtener gastos:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Extractor defensivo para respuestas tanto planas como paginadas
  const extractList = (res) => {
    if (!res || !res.data) return [];
    if (Array.isArray(res.data)) return res.data;
    if (Array.isArray(res.data.data)) return res.data.data;
    return [];
  };

  const cargarCatalogos = async () => {
    try {
      const [resMaestros, resDams, resConceptos, resProveedores, resTiposDoc] = await Promise.all([
        api.get('/maestros/?limit=500'),
        api.get('/dams/?limit=500'),
        api.get('/conceptos/'),
        api.get('/proveedores/'),
        api.get('/tipos-documento/')
      ]);

      const maestrosList = extractList(resMaestros);
      const damsList = extractList(resDams);
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

  // Opciones de DAM filtradas por Maestro si se seleccionó uno, o todas las DAMs si no
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
      setSelectedId(null);
      setForm(estadoInicialForm);
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
        await api.post('/gastos/', payload);
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

  const getBadgeClass = (estado) => {
    if (estado === 'PAGADO') return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (estado === 'PENDIENTE') return "bg-rose-50 text-rose-700 border-rose-200";
    return "bg-amber-50 text-amber-800 border-amber-200";
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 bg-slate-50 font-sans">
      {/* HEADER & KPIs MULTIMONEDA */}
      <section className="space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Gastos Logísticos de Importación</h1>
            <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-sky-100 text-sky-800">Módulo Contable</span>
          </div>
          <p className="text-sm text-slate-500 mt-1">Subtotales calculados sobre la página visible ({gastos.length} registros cargados).</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
            <div className="text-xs font-semibold uppercase text-slate-500 mb-1 tracking-wider">Registros Cargados</div>
            <div className="text-xl font-bold font-mono text-slate-900">{gastos.length} <span className="text-xs text-slate-400 font-sans">de {totalRegistros}</span></div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-sm">
            <div className="text-xs font-semibold uppercase text-emerald-700 mb-1 tracking-wider">Pág Actual: Pagado</div>
            <div className="text-base sm:text-lg font-bold font-mono text-emerald-700 truncate" title={formatMultiMoneda('liquidado')}>{formatMultiMoneda('liquidado')}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-rose-200 bg-rose-50/20 shadow-sm">
            <div className="text-xs font-semibold uppercase text-rose-700 mb-1 tracking-wider">Pág Actual: Pendiente</div>
            <div className="text-base sm:text-lg font-bold font-mono text-rose-700 truncate" title={formatMultiMoneda('pendiente')}>{formatMultiMoneda('pendiente')}</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-sm">
            <div className="text-xs font-semibold uppercase text-amber-800 mb-1 tracking-wider">Pág Actual: Parcial</div>
            <div className="text-base sm:text-lg font-bold font-mono text-amber-800 truncate" title={formatMultiMoneda('parcial')}>{formatMultiMoneda('parcial')}</div>
          </div>
        </div>
      </section>

      {/* TOOLBAR */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <button onClick={() => toggleDrawer(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-sm font-semibold shadow-sm transition-all">
              + NUEVO GASTO
            </button>
            <button disabled={!selectedId} onClick={() => toggleDrawer(true, gastos.find(g => g.id_gasto === selectedId))} className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
              ✏️ MODIFICAR
            </button>
            <button disabled={!selectedId} onClick={() => setModalEliminar({ open: true, id: selectedId, motivo: '' })} className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
              🗑️ ELIMINAR
            </button>
            <button disabled={!selectedId} onClick={() => navigate(`/app/pagos?gasto_id=${selectedId}`)} className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
              💸 REGISTRAR PAGO
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2.5 border-t border-slate-100">
          <div className="md:col-span-6 relative">
            <input 
              type="text" 
              value={searchTerm} 
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }} 
              placeholder="Buscar por Documento, DAM o Factura Maestro..." 
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:ring-2 focus:ring-brand-500 focus:bg-white transition-all outline-none" 
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">🔍</div>
          </div>
          <div className="md:col-span-3">
            <select 
              value={estadoFiltro} 
              onChange={(e) => { setEstadoFiltro(e.target.value); setPage(1); }} 
              className="w-full py-2 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
            >
              <option value="">Todos los Estados</option>
              <option value="PENDIENTE">PENDIENTE</option>
              <option value="PAGADO">PAGADO</option>
              <option value="PARCIAL">PARCIAL</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <select 
              value={monedaFiltro} 
              onChange={(e) => { setMonedaFiltro(e.target.value); setPage(1); }} 
              className="w-full py-2 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
            >
              <option value="">Todas las Monedas</option>
              <option value="USD">USD - Dólares</option>
              <option value="PEN">PEN - Soles</option>
            </select>
          </div>
        </div>
      </section>

      {/* DATA GRID */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto min-w-full">
          <table className="min-w-full divide-y divide-slate-200 text-left border-collapse table-fixed">
            <thead>
              <tr className="bg-slate-50 text-xs font-bold text-slate-700 uppercase tracking-wider">
                <th className="px-3 py-3.5 w-16 text-center">ID</th>
                <th className="px-4 py-3.5 w-56">Proveedor</th>
                <th className="px-4 py-3.5 w-44">Concepto</th>
                <th className="px-4 py-3.5 w-36">Documento</th>
                <th className="px-4 py-3.5 w-28 text-right">Monto</th>
                <th className="px-3 py-3.5 w-20 text-center">Moneda</th>
                <th className="px-4 py-3.5 w-32 text-center">Estado Pago</th>
                <th className="px-4 py-3.5 w-36">DAM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-800">
              {gastos.map(g => {
                const isSelected = selectedId === g.id_gasto;
                const prov = opcionesProveedores.find(op => op.value === g.id_proveedor);
                const conc = opcionesConceptos.find(c => c.value === g.id_concepto);
                const provLabel = g.proveedor_nombre || prov?.label || (g.id_proveedor ? `ID: ${g.id_proveedor}` : '-');
                const concLabel = g.concepto_nombre || conc?.label || (g.id_concepto ? `ID: ${g.id_concepto}` : '-');

                return (
                  <tr 
                    key={g.id_gasto} 
                    onClick={() => setSelectedId(isSelected ? null : g.id_gasto)} 
                    className={`hover:bg-slate-50/80 cursor-pointer transition-colors ${isSelected ? 'bg-sky-50/70' : ''}`}
                  >
                    <td className="px-3 py-3.5 font-mono text-slate-500 font-medium text-center">{g.id_gasto}</td>
                    <td className="px-4 py-3.5 truncate" title={provLabel}>
                      <span className="font-semibold text-slate-900 block truncate">{provLabel}</span>
                    </td>
                    <td className="px-4 py-3.5 font-medium text-slate-700 truncate" title={concLabel}>
                      {concLabel}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-slate-800 font-medium truncate">
                      {g.numero_documento || 'S/N'}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900 tabular-nums">
                      {parseFloat(g.monto_original).toFixed(2)}
                    </td>
                    <td className="px-3 py-3.5 text-center font-semibold text-slate-700">{g.moneda}</td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border tracking-wide ${getBadgeClass(g.estado_pago)}`}>
                        {g.estado_pago}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 truncate" title={g.dam_numero || g.id_dam}>
                      <span className="inline-block px-2.5 py-1 rounded bg-sky-50 text-sky-700 border border-sky-200/70 font-mono text-xs font-semibold">
                        {g.dam_numero || (g.id_dam ? `DAM #${g.id_dam}` : '-')}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {gastos.length === 0 && !isLoading && (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-slate-500 italic text-sm">
                    No se encontraron gastos registrados.
                  </td>
                </tr>
              )}
              {isLoading && (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-brand-600 animate-pulse font-semibold text-sm">
                    Cargando gastos...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* PAGINADOR REUTILIZADO */}
        <Paginador page={page} totalPages={totalPages} setPage={setPage} limit={limit} setLimit={setLimit} totalRegistros={totalRegistros} />
      </section>

      {/* MODAL NATIVO ELIMINAR */}
      {modalEliminar.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="bg-rose-50 border-b border-rose-100 p-4">
              <h3 className="text-rose-800 font-bold flex items-center gap-2 text-base">⚠️ Confirmar Eliminación</h3>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-600">Por auditoría, es obligatorio documentar el motivo de la eliminación de este gasto.</p>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Motivo (Mín. 10 caracteres)</label>
                <textarea 
                  autoFocus 
                  value={modalEliminar.motivo} 
                  onChange={(e) => setModalEliminar({...modalEliminar, motivo: e.target.value})} 
                  rows="3" 
                  className="w-full text-sm rounded-lg border-slate-300 focus:border-rose-500 focus:ring-rose-500 p-2.5 border outline-none" 
                  placeholder="Escriba aquí el motivo detallado..."
                ></textarea>
              </div>
            </div>
            <div className="bg-slate-50 border-t border-slate-200 p-4 flex justify-end gap-3">
              <button onClick={() => setModalEliminar({ open: false, id: null, motivo: '' })} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
              <button onClick={handleEliminarConfirm} className="px-4 py-2 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shadow-sm">ELIMINAR GASTO</button>
            </div>
          </div>
        </div>
      )}

      {/* SLIDE-OVER DRAWER (FORM) */}
      <div className={`fixed inset-0 z-50 overflow-hidden ${isDrawerOpen ? '' : 'pointer-events-none'}`}>
        <div className={`fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 ${isDrawerOpen ? 'opacity-100' : 'opacity-0'}`} onClick={() => toggleDrawer(false)}></div>
        <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
          <div className={`w-screen max-w-xl bg-white shadow-2xl flex flex-col h-full transform transition-transform duration-300 ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            <div className="px-6 py-5 bg-slate-900 flex items-center justify-between border-b border-slate-800">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                {viewMode === 'NUEVO' ? '✨ Nuevo Gasto Logístico' : '✏️ Modificar Gasto Logístico'}
              </h2>
              <button onClick={() => toggleDrawer(false)} className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors text-base font-bold">✕</button>
            </div>
            
            <form onSubmit={handleGuardar} className="flex-1 overflow-y-auto p-6 space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Maestro (Opcional - Filtro)</label>
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
                  placeholder="Filtrar DAMs por factura..." 
                  isClearable 
                  className="text-sm" 
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">DAM Asociada *</label>
                  <Select 
                    options={opcionesDamsFiltradas} 
                    value={
                      opcionesDamsFiltradas.find(op => op.value === form.id_dam) || 
                      (form.id_dam ? { value: form.id_dam, label: form.dam_numero ? `DAM: ${form.dam_numero}` : `DAM #${form.id_dam}` } : null)
                    } 
                    onChange={(op) => {
                      if (op) {
                        const matchedDam = damsRaw.find(d => d.id_dam === op.value);
                        setForm(prev => ({
                          ...prev,
                          id_dam: op.value,
                          id_maestro_temp: matchedDam?.id_maestro || prev.id_maestro_temp,
                          dam_numero: op.label
                        }));
                      } else {
                        setForm(prev => ({ ...prev, id_dam: null, dam_numero: '' }));
                      }
                    }} 
                    placeholder="Seleccionar DAM..." 
                    isClearable
                    className="text-sm" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Concepto *</label>
                  <Select 
                    options={opcionesConceptos} 
                    value={opcionesConceptos.find(op => op.value === form.id_concepto) || null} 
                    onChange={(op) => setForm(prev => ({ ...prev, id_concepto: op ? op.value : null }))} 
                    placeholder="Seleccionar concepto..." 
                    isClearable
                    className="text-sm" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Proveedor *</label>
                <Select 
                  options={opcionesProveedores} 
                  value={opcionesProveedores.find(op => op.value === form.id_proveedor) || null} 
                  onChange={(op) => setForm(prev => ({ ...prev, id_proveedor: op ? op.value : null }))} 
                  placeholder="Buscar proveedor..." 
                  isClearable
                  className="text-sm" 
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Tipo Doc. *</label>
                  <Select 
                    options={opcionesTiposDoc} 
                    value={opcionesTiposDoc.find(op => op.value === form.id_tipo_doc) || null} 
                    onChange={(op) => setForm(prev => ({ ...prev, id_tipo_doc: op ? op.value : null }))} 
                    placeholder="Tipo de documento..." 
                    isClearable
                    className="text-sm" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">N° Documento</label>
                  <input 
                    type="text" 
                    name="numero_documento" 
                    value={form.numero_documento} 
                    onChange={(e) => setForm(prev => ({ ...prev, numero_documento: e.target.value }))} 
                    className="w-full font-mono text-sm rounded-lg border-slate-300 p-2.5 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 border outline-none" 
                    placeholder="F001-00012345" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Moneda *</label>
                  <select 
                    name="moneda" 
                    value={form.moneda} 
                    onChange={(e) => setForm(prev => ({ ...prev, moneda: e.target.value }))} 
                    className="w-full font-semibold text-sm rounded-lg border-slate-300 p-2.5 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 border bg-white outline-none"
                  >
                    <option value="USD">USD ($ - Dólares)</option>
                    <option value="PEN">PEN (S/ - Soles)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Monto Total *</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    value={form.monto_original} 
                    onChange={(e) => setForm(prev => ({ ...prev, monto_original: e.target.value }))} 
                    required 
                    className="w-full text-sm rounded-lg border-slate-300 p-2.5 border text-right font-mono font-bold focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none" 
                    placeholder="0.00" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">Fecha de Vencimiento</label>
                <input 
                  type="date" 
                  value={form.fecha_vencimiento} 
                  onChange={(e) => setForm(prev => ({ ...prev, fecha_vencimiento: e.target.value }))} 
                  className="w-full text-sm rounded-lg border-slate-300 p-2.5 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 border outline-none" 
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3 mt-8">
                <button 
                  type="button" 
                  onClick={() => toggleDrawer(false)} 
                  className="px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={isGuardando} 
                  className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white rounded-lg text-sm font-bold shadow-sm disabled:opacity-50 transition-colors"
                >
                  {isGuardando ? 'Procesando...' : (viewMode === 'NUEVO' ? 'Guardar Registro' : 'Actualizar Gasto')}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Gastos;
