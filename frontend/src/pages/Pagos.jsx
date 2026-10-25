import React, { useState, useEffect } from 'react';
import api from '../services/api';
import Select from 'react-select';
import Paginador from '../components/Paginador';
import useDebounce from '../hooks/useDebounce';

const Pagos = () => {
  const [gastos, setGastos] = useState([]);
  const [bancos, setBancos] = useState([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedGasto, setSelectedGasto] = useState(null);
  const [opcionesVouchers, setOpcionesVouchers] = useState([]);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState('');

  const [form, setForm] = useState({ voucher_id: null, fecha_pago: '', moneda: 'USD', tipo_cambio: '1.00', importe: '', pago_moneda_cruzada: false, monto_moneda_origen: '' });

  useEffect(() => { cargarBancos(); }, []);
  useEffect(() => { cargarGastos(); }, [debouncedSearch, page, limit]);

  const cargarBancos = async () => { try { const res = await api.get('/bancos/'); setBancos(res.data?.data || res.data || []); } catch (error) {} };

  const cargarGastos = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/gastos/', { params: { estado_pago: 'PENDIENTE,PARCIAL', search: debouncedSearch.trim() || undefined, page, limit } });
      setGastos(res.data?.data || []); setTotalPages(res.data?.total_paginas || 1); setTotalRegistros(res.data?.total_registros || 0);
    } catch (error) {} finally { setIsLoading(false); }
  };

  const openDrawer = async (gasto) => {
    setSelectedGasto(gasto);
    setIdempotencyKey(crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`);
    const saldoPendienteNum = parseFloat(gasto.saldo_pendiente ?? gasto.monto_original);
    setForm({ voucher_id: null, fecha_pago: '', moneda: 'USD', tipo_cambio: '1.00', importe: saldoPendienteNum.toFixed(2), pago_moneda_cruzada: false, monto_moneda_origen: '' });
    try {
      if (gasto.id_importador) {
        const resVouchers = await api.get(`/vouchers/?saldo_mayor_cero=true&id_importador=${gasto.id_importador}&limit=100`);
        const vList = resVouchers.data?.data || [];
        const bancosMap = {}; bancos.forEach(b => bancosMap[b.id_banco] = b.nombre);
        setOpcionesVouchers(vList.map(v => ({ value: v.id_voucher, label: `${bancosMap[v.banco_id] || 'Banco'} - ${v.numero_operacion} (Saldo: ${v.moneda} ${v.saldo_disponible})` })));
      } else { setOpcionesVouchers([]); }
    } catch (error) {}
    setIsDrawerOpen(true);
  };

  const registrarPago = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!form.voucher_id) return alert('Seleccione un Voucher de pago.');
    setIsSubmitting(true);
    try {
      const tcVal = parseFloat(form.tipo_cambio) || 1.0;
      let montoOrigenNum = parseFloat(form.importe);
      let gastoFinancieroTc = 0;
      if (form.pago_moneda_cruzada) {
        montoOrigenNum = parseFloat(form.monto_moneda_origen);
        const convertido = form.moneda === 'PEN' ? (parseFloat(form.importe) / tcVal) : parseFloat(form.importe);
        gastoFinancieroTc = Math.max(0, montoOrigenNum - convertido);
      } else { montoOrigenNum = form.moneda === 'PEN' ? (parseFloat(form.importe) / tcVal) : parseFloat(form.importe); }

      await api.post('/pagos/', {
        id_gasto: selectedGasto.id_gasto, id_importador: selectedGasto.id_importador, voucher_id: form.voucher_id,
        fecha_pago: form.fecha_pago || null, moneda: form.moneda, importe: parseFloat(form.importe), tipo_cambio: parseFloat(form.tipo_cambio),
        pago_moneda_cruzada: form.pago_moneda_cruzada, monto_moneda_origen: montoOrigenNum, gasto_financiero_tc: gastoFinancieroTc
      }, { headers: { 'Idempotency-Key': idempotencyKey } });
      
      cargarGastos(); setIsDrawerOpen(false);
    } catch (error) { alert(`Error: ${error.response?.data?.detail || 'Error al pagar'}`); } finally { setIsSubmitting(false); }
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 bg-slate-50 font-sans">
      <section className="space-y-4">
        <div className="flex items-center gap-2"><h1 className="text-2xl font-bold text-slate-900">Liquidación de Pagos</h1><span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-100 text-purple-800">Módulo Tesorería</span></div>
      </section>
      <section className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
        <div className="relative max-w-xl"><input type="text" value={searchTerm} onChange={(e) => {setSearchTerm(e.target.value); setPage(1);}} placeholder="Buscar DAM, Factura, Proveedor..." className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-1 focus:ring-brand-500" /><span className="absolute inset-y-0 left-3 flex items-center text-slate-400">🔍</span></div>
      </section>
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto min-w-full">
          <table className="min-w-full divide-y divide-slate-200 text-left border-collapse table-fixed">
            <thead>
              <tr className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="px-3 py-3.5 w-16 text-center">ID</th>
                <th className="px-4 py-3.5 w-32">DAM</th>
                <th className="px-4 py-3.5 w-48">Importador</th>
                <th className="px-4 py-3.5 w-32">Estado</th>
                <th className="px-4 py-3.5 w-32 text-right">Deuda Orig.</th>
                <th className="px-4 py-3.5 w-32 text-right">Saldo Rest.</th>
                <th className="px-4 py-3.5 w-24 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {gastos.map(g => (
                <tr key={g.id_gasto} className="hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-3.5 font-mono text-center">{g.id_gasto}</td>
                  <td className="px-4 py-3.5 font-mono">{g.dam_numero || 'N/A'}</td>
                  <td className="px-4 py-3.5 font-bold truncate">{g.importador_nombre}</td>
                  <td className="px-4 py-3.5"><span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${g.estado_pago==='PENDIENTE'?'bg-rose-50 text-rose-700 border-rose-200':'bg-amber-50 text-amber-700 border-amber-200'}`}>{g.estado_pago}</span></td>
                  <td className="px-4 py-3.5 text-right font-mono tabular-nums">{g.moneda==='PEN'?'S/':'$'} {parseFloat(g.monto_original).toFixed(2)}</td>
                  <td className="px-4 py-3.5 text-right font-mono tabular-nums font-bold text-rose-700">{g.moneda==='PEN'?'S/':'$'} {parseFloat(g.saldo_pendiente??g.monto_original).toFixed(2)}</td>
                  <td className="px-4 py-3.5 text-center"><button onClick={()=>openDrawer(g)} className="px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-md font-bold text-[10px] uppercase">Pagar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Paginador page={page} totalPages={totalPages} setPage={setPage} limit={limit} setLimit={setLimit} totalRegistros={totalRegistros} />
      </section>
      
      {/* DRAWER PAGO */}
      <div className={`fixed inset-0 z-50 overflow-hidden ${isDrawerOpen ? '' : 'pointer-events-none'}`}>
        <div className={`fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 ${isDrawerOpen ? 'opacity-100' : 'opacity-0'}`} onClick={() => setIsDrawerOpen(false)}></div>
        <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
          <div className={`w-screen max-w-xl bg-white shadow-2xl flex flex-col h-full transform transition-transform duration-300 ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            <div className="px-6 py-5 bg-slate-900 flex items-center justify-between"><h2 className="text-white font-bold">Aplicar Pago a Gasto #{selectedGasto?.id_gasto}</h2><button onClick={()=>setIsDrawerOpen(false)} className="text-slate-400">✕</button></div>
            <form onSubmit={registrarPago} className="p-6 space-y-5 overflow-y-auto">
              <div className="bg-purple-50 p-4 border border-purple-200 rounded-lg text-sm text-purple-900">
                <strong>Importador:</strong> {selectedGasto?.importador_nombre} <br/>
                <strong>Deuda Restante:</strong> <span className="font-mono font-bold text-rose-700">{selectedGasto?.moneda==='PEN'?'S/':'$'} {parseFloat(selectedGasto?.saldo_pendiente??0).toFixed(2)}</span>
              </div>
              <div><label className="block text-xs font-bold text-slate-700 mb-1">Voucher (Saldo)</label><Select options={opcionesVouchers} onChange={op=>setForm({...form, voucher_id: op?op.value:null})} className="text-sm" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-slate-700 mb-1">Moneda del Pago</label><select value={form.moneda} onChange={e=>setForm({...form, moneda: e.target.value, tipo_cambio: e.target.value==='USD'?'1.00':''})} className="w-full text-sm border-slate-300 rounded-lg p-2 font-bold"><option value="USD">USD</option><option value="PEN">PEN</option></select></div>
                <div><label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Cambio</label><input type="number" step="0.0001" value={form.tipo_cambio} onChange={e=>setForm({...form, tipo_cambio: e.target.value})} disabled={form.moneda==='USD'} className="w-full text-sm font-mono border-slate-300 rounded-lg p-2 disabled:bg-slate-100" /></div>
                <div><label className="block text-xs font-bold text-slate-700 mb-1">Importe (En moneda del gasto)</label><input type="number" step="0.01" value={form.importe} onChange={e=>setForm({...form, importe: e.target.value})} className="w-full text-sm font-mono font-bold border-slate-300 rounded-lg p-2 text-right" /></div>
                <div><label className="block text-xs font-bold text-slate-700 mb-1">Fecha Transferencia</label><input type="date" value={form.fecha_pago} onChange={e=>setForm({...form, fecha_pago: e.target.value})} className="w-full text-sm border-slate-300 rounded-lg p-2" /></div>
              </div>
              <div className="bg-emerald-50 p-4 border border-emerald-200 rounded-lg flex items-center gap-2">
                <input type="checkbox" checked={form.pago_moneda_cruzada} onChange={e=>setForm({...form, pago_moneda_cruzada: e.target.checked})} className="w-5 h-5 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500" />
                <span className="text-sm font-bold text-emerald-800">¿Moneda Cruzada (Diferencia Cambiaria Bancaria)?</span>
              </div>
              {form.pago_moneda_cruzada && (
                <div className="p-4 border border-slate-200 rounded-lg">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Débito Real en Voucher (Moneda Origen)</label>
                  <input type="number" step="0.01" value={form.monto_moneda_origen} onChange={e=>setForm({...form, monto_moneda_origen: e.target.value})} className="w-full text-sm font-mono border-slate-300 rounded-lg p-2 text-right" />
                </div>
              )}
              <div className="pt-4 flex justify-end gap-3 border-t"><button type="button" onClick={()=>setIsDrawerOpen(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button><button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-purple-600 text-white rounded-lg text-sm font-bold">Confirmar Pago</button></div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
export default Pagos;
