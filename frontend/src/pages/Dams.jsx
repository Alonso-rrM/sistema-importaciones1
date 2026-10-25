import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import Select from 'react-select';
import Paginador from '../components/Paginador';
import useDebounce from '../hooks/useDebounce';

const Dams = () => {
  const location = useLocation();
  const [viewMode, setViewMode] = useState('LISTA');
  const [selectedId, setSelectedId] = useState(null);

  const [dams, setDams] = useState([]);
  const [maestros, setMaestros] = useState([]);
  const [opcionesMaestros, setOpcionesMaestros] = useState([]);
  const [inheritedMaestro, setInheritedMaestro] = useState(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 400);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isGuardando, setIsGuardando] = useState(false);
  const [modalEliminar, setModalEliminar] = useState({ open: false, id: null, motivo: '' });

  const estadoInicial = {
    id_maestro: null, numero_de_dam: '', serie: '', canal_control: 'VERDE', monto_valor_provisional_usd: '', aforo_realizado: false
  };
  const [formData, setFormData] = useState(estadoInicial);

  useEffect(() => { cargarMaestros(); }, []);
  useEffect(() => { cargarDams(); }, [debouncedSearch, page, limit]);

  useEffect(() => {
    if (location.state?.fromMaestro) {
      const fromM = location.state.fromMaestro;
      setInheritedMaestro(fromM);
      setFormData({ ...estadoInicial, id_maestro: fromM.id_maestro });
      toggleDrawer(true, null, fromM);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

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

  const cargarMaestros = async () => {
    try {
      const response = await api.get('/maestros/lookup');
      const mList = response.data || [];
      setMaestros(mList);
      setOpcionesMaestros(mList.map(m => ({ value: m.id_maestro, label: `Factura: ${m.numero_factura} (${m.tipo_valor})` })));
    } catch (error) {}
  };

  const cargarDams = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/dams/', { params: { search: debouncedSearch.trim() || undefined, page, limit } });
      setDams(response.data?.data || []);
      setTotalPages(response.data?.total_paginas || 1);
      setTotalRegistros(response.data?.total_registros || 0);
    } catch (error) {} finally { setIsLoading(false); }
  };

  const toggleDrawer = (open, dam = null, extMaestro = null) => {
    setIsDrawerOpen(open);
    if (open && dam) {
      setViewMode('MODIFICAR');
      setSelectedId(dam.id_dam);
      setInheritedMaestro(maestros.find(m => m.id_maestro === dam.id_maestro) || null);
      setFormData({ ...dam, monto_valor_provisional_usd: dam.monto_valor_provisional_usd || '' });
    } else if (open && !dam) {
      setViewMode('NUEVO');
      setSelectedId(null);
      if (!extMaestro) { setFormData(estadoInicial); setInheritedMaestro(null); }
    }
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    setIsGuardando(true);
    try {
      const payload = { ...formData, monto_valor_provisional_usd: formData.monto_valor_provisional_usd ? parseFloat(formData.monto_valor_provisional_usd) : null };
      if (viewMode === 'NUEVO') await api.post('/dams/', payload);
      else await api.put(`/dams/${selectedId}`, payload);
      cargarDams(); toggleDrawer(false);
    } catch (error) { alert(`Error al guardar:\n${error.response?.data?.detail || 'Revisar datos'}`); } finally { setIsGuardando(false); }
  };

  const handleEliminarConfirm = async () => {
    if (!modalEliminar.motivo || modalEliminar.motivo.length < 10) return alert("Ingrese motivo");
    try {
      await api.delete(`/dams/${modalEliminar.id}`, { data: { motivo: modalEliminar.motivo } });
      setModalEliminar({ open: false, id: null, motivo: '' }); setSelectedId(null); cargarDams();
    } catch (error) { alert(error.response?.data?.detail); }
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 bg-slate-50 font-sans">
      <section className="space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Declaraciones DAMs</h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-800">Módulo Aduanero</span>
          </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => toggleDrawer(true)} className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm">+ NUEVA DAM</button>
          <button disabled={!selectedId} onClick={() => toggleDrawer(true, dams.find(d => d.id_dam === selectedId))} className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-medium disabled:opacity-50">✏️ MODIFICAR</button>
          <button disabled={!selectedId} onClick={() => setModalEliminar({ open: true, id: selectedId, motivo: '' })} className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-medium disabled:opacity-50">🗑️ ELIMINAR</button>
        </div>
        <div className="pt-2 border-t border-slate-100 relative max-w-lg">
          <input type="text" value={searchTerm} onChange={(e) => {setSearchTerm(e.target.value); setPage(1);}} placeholder="Buscar N° DAM o Serie..." className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:ring-1 focus:ring-brand-500" />
          <div className="absolute inset-y-0 top-2 left-0 pl-3 flex items-center pointer-events-none text-slate-400">🔍</div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto min-w-full">
          <table className="min-w-full divide-y divide-slate-200 text-left border-collapse table-fixed">
            <thead>
              <tr className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="px-3 py-3.5 w-16 text-center">ID</th>
                <th className="px-4 py-3.5 w-48">Nº DAM</th>
                <th className="px-4 py-3.5 w-32 text-center">Canal</th>
                <th className="px-4 py-3.5 w-32 text-center">Aforo</th>
                <th className="px-4 py-3.5 w-32 text-right">Prov (USD)</th>
                <th className="px-4 py-3.5 w-40">Maestro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {dams.map(d => {
                const m = maestros.find(mx => mx.id_maestro === d.id_maestro);
                return (
                  <tr key={d.id_dam} onClick={() => setSelectedId(selectedId === d.id_dam ? null : d.id_dam)} className={`hover:bg-slate-50 cursor-pointer transition-colors ${selectedId === d.id_dam ? 'bg-brand-50' : ''}`}>
                    <td className="px-3 py-3.5 font-mono text-slate-500 font-medium text-center">{d.id_dam}</td>
                    <td className="px-4 py-3.5 font-bold font-mono text-slate-900">{d.numero_de_dam}</td>
                    <td className="px-4 py-3.5 text-center"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${d.canal_control==='VERDE'?'bg-emerald-50 text-emerald-700 border-emerald-200':d.canal_control==='ROJO'?'bg-rose-50 text-rose-700 border-rose-200':'bg-orange-50 text-orange-700 border-orange-200'}`}>{d.canal_control}</span></td>
                    <td className="px-4 py-3.5 text-center font-bold">{d.aforo_realizado ? '✅' : '❌'}</td>
                    <td className="px-4 py-3.5 text-right font-mono tabular-nums">{d.monto_valor_provisional_usd || '-'}</td>
                    <td className="px-4 py-3.5 font-mono truncate">{m?.numero_factura || d.id_maestro}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Paginador page={page} totalPages={totalPages} setPage={setPage} limit={limit} setLimit={setLimit} totalRegistros={totalRegistros} />
      </section>

      {modalEliminar.open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="bg-rose-50 p-4 border-b border-rose-100"><h3 className="text-rose-800 font-bold">⚠️ Eliminar DAM</h3></div>
            <div className="p-5"><textarea value={modalEliminar.motivo} onChange={(e) => setModalEliminar({...modalEliminar, motivo: e.target.value})} rows="3" className="w-full text-sm rounded-lg border-slate-300" placeholder="Motivo (min 10)..."></textarea></div>
            <div className="bg-slate-50 p-4 flex justify-end gap-3"><button onClick={() => setModalEliminar({open:false})} className="px-4 py-2 text-sm font-semibold">Cancelar</button><button onClick={handleEliminarConfirm} className="px-4 py-2 text-sm text-white bg-rose-600 rounded-lg">Eliminar</button></div>
          </div>
        </div>
      )}

      <div className={`fixed inset-0 z-50 overflow-hidden ${isDrawerOpen ? '' : 'pointer-events-none'}`}>
        <div className={`fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 ${isDrawerOpen ? 'opacity-100' : 'opacity-0'}`} onClick={() => toggleDrawer(false)}></div>
        <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
          <div className={`w-screen max-w-xl bg-white shadow-2xl flex flex-col h-full transform transition-transform duration-300 ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            <div className="px-6 py-5 bg-slate-900 flex items-center justify-between"><h2 className="text-white font-bold">{viewMode==='NUEVO'?'Nueva DAM':'Modificar DAM'}</h2><button onClick={()=>toggleDrawer(false)} className="text-slate-400">✕</button></div>
            <form onSubmit={handleGuardar} className="p-6 space-y-5 overflow-y-auto">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Maestro Factura *</label>
                <Select options={opcionesMaestros} value={opcionesMaestros.find(o => o.value === formData.id_maestro) || null} onChange={op => { setFormData({...formData, id_maestro: op?op.value:null}); setInheritedMaestro(maestros.find(m => m.id_maestro === (op?op.value:null))); }} isDisabled={viewMode==='MODIFICAR'} className="text-sm"/>
                {inheritedMaestro?.tipo_valor === 'PROVISIONAL' && <span className="text-[10px] text-amber-700 font-bold block mt-2">⚠️ Maestro PROVISIONAL: El monto es obligatorio.</span>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-slate-700 mb-1">Nº DAM *</label><input type="text" name="numero_de_dam" value={formData.numero_de_dam} onChange={e=>setFormData({...formData, numero_de_dam: e.target.value})} required className="w-full text-sm font-mono border-slate-300 rounded-lg p-2" /></div>
                <div><label className="block text-xs font-bold text-slate-700 mb-1">Canal *</label><select value={formData.canal_control} onChange={e=>setFormData({...formData, canal_control: e.target.value})} className="w-full text-sm border-slate-300 rounded-lg p-2 font-bold"><option value="VERDE">VERDE</option><option value="NARANJA">NARANJA</option><option value="ROJO">ROJO</option></select></div>
                <div><label className="block text-xs font-bold text-slate-700 mb-1">Monto Prov (USD)</label><input type="number" step="0.01" value={formData.monto_valor_provisional_usd} onChange={e=>setFormData({...formData, monto_valor_provisional_usd: e.target.value})} className="w-full text-sm font-mono border-slate-300 rounded-lg p-2 text-right" /></div>
              </div>
              {formData.canal_control === 'ROJO' && (
                <div className="bg-rose-50 p-4 border border-rose-200 rounded-lg flex items-center gap-2">
                  <input type="checkbox" checked={formData.aforo_realizado} onChange={e=>setFormData({...formData, aforo_realizado: e.target.checked})} className="w-5 h-5 rounded border-rose-400 text-rose-600 focus:ring-rose-500" />
                  <span className="text-sm font-bold text-rose-800">Aforo Físico Realizado (Obligatorio para Levante)</span>
                </div>
              )}
              <div className="pt-4 flex justify-end gap-3 border-t"><button type="button" onClick={()=>toggleDrawer(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button><button type="submit" disabled={isGuardando} className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm font-bold">Guardar</button></div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
export default Dams;
