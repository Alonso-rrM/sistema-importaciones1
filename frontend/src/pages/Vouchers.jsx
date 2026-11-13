/**
 * VOUCHERS BANCARIOS: depósitos de cada importador que financian los pagos.
 * Partes en pages/vouchers/: BandejaVouchers · FormularioVoucher · PagosDelVoucher · ModalEliminarVoucher
 */
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ticket, Scale, Pencil, Trash2, Banknote, Plus, FileText, AlertTriangle } from 'lucide-react';
import api from '../services/api';
import useConsulta from '../hooks/useConsulta';
import useDebounce from '../hooks/useDebounce';
import { MONEDA } from '../constants';
import { mensajeDeError, useInteraccion } from '../context/interaccion';
import BandejaVouchers from './vouchers/BandejaVouchers';
import FormularioVoucher from './vouchers/FormularioVoucher';
import PagosDelVoucher from './vouchers/PagosDelVoucher';
import ModalEliminarVoucher from './vouchers/ModalEliminarVoucher';
import { FILTRO_SALDO } from './vouchers/filtros';

const FORMULARIO_VACIO = {
  banco_id: null,
  id_importador: null,
  numero_operacion: '',
  monto_total: '',
  moneda: MONEDA.USD,
  fecha_transferencia: ''
};

const formularioDesdeVoucher = (v) => ({
  banco_id: v.banco_id || null,
  id_importador: v.id_importador || null,
  numero_operacion: v.numero_operacion || '',
  monto_total: v.monto_total !== undefined && v.monto_total !== null ? String(v.monto_total) : '',
  moneda: v.moneda || MONEDA.USD,
  fecha_transferencia: v.fecha_transferencia ? String(v.fecha_transferencia).slice(0, 10) : '',
  version: v.version
});

const Vouchers = () => {
  const { avisar } = useInteraccion();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState('DETALLE'); // 'DETALLE', 'NUEVO', 'MODIFICAR'
  const [selectedId, setSelectedId] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [filtroSaldo, setFiltroSaldo] = useState(FILTRO_SALDO.TODOS);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [isGuardando, setIsGuardando] = useState(false);
  const [voucherAEliminar, setVoucherAEliminar] = useState(null);
  const [formData, setFormData] = useState(FORMULARIO_VACIO);

  // ----- Catálogos para los desplegables -----
  const consultarCatalogos = useCallback(async () => {
    const [resBancos, resImportadores] = await Promise.all([api.get('/bancos/'), api.get('/importadores/')]);
    const bancos = resBancos.data?.data || resBancos.data || [];
    const importadores = resImportadores.data?.data || resImportadores.data || [];
    return {
      bancos: bancos.map((b) => ({ value: b.id_banco, label: b.nombre })),
      importadores: importadores.map((i) => ({ value: i.id_importador, label: i.nombre })),
    };
  }, []);
  const { datos: catalogos } = useConsulta(consultarCatalogos, {
    inicial: { bancos: [], importadores: [] },
    alFallar: (error) => console.error('Error al cargar catálogos:', error),
  });
  const opcionesBancos = catalogos.bancos;
  const opcionesImportadores = catalogos.importadores;

  // ----- Bandeja de vouchers -----
  const consultarVouchers = useCallback(() => {
    const params = { page, limit, search: debouncedSearch.trim() || undefined };
    if (filtroSaldo === FILTRO_SALDO.CON_SALDO) params.saldo_mayor_cero = true;
    if (filtroSaldo === FILTRO_SALDO.AGOTADOS) params.saldo_cero = true;
    return api.get('/vouchers/', { params }).then((r) => r.data);
  }, [page, limit, debouncedSearch, filtroSaldo]);
  const { datos: paginaVouchers, cargando: isLoading, recargar } = useConsulta(consultarVouchers, {
    alFallar: () => avisar('No se pudo conectar con el servidor de vouchers.', 'error'),
  });
  const vouchers = paginaVouchers?.data || [];
  const totalPages = paginaVouchers?.total_paginas || 1;
  const totalRegistros = paginaVouchers?.total_registros || 0;
  const cargarVouchers = () => recargar().catch(() => avisar('No se pudo conectar con el servidor de vouchers.', 'error'));

  // Voucher mostrado: el elegido o, en modo detalle, el primero de la bandeja
  const selectedVoucher = vouchers.find((v) => v.id_voucher === selectedId)
    || (viewMode === 'DETALLE' ? vouchers[0] || null : null);

  const handleSelect = (v) => {
    setSelectedId(v.id_voucher);
    setViewMode('DETALLE');
  };

  const handleNuevo = () => {
    setSelectedId(null);
    setViewMode('NUEVO');
    setFormData(FORMULARIO_VACIO);
  };

  const handleModificar = () => {
    if (!selectedVoucher) return;
    setSelectedId(selectedVoucher.id_voucher);
    setFormData(formularioDesdeVoucher(selectedVoucher));
    setViewMode('MODIFICAR');
  };

  const handleCancelarEdicion = () => setViewMode('DETALLE');

  const tienePagos = selectedVoucher
    ? Math.abs(parseFloat(selectedVoucher.monto_total || 0) - parseFloat(selectedVoucher.saldo_disponible || 0)) > 0.009
    : false;
  const voucherTieneUso = tienePagos;

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!formData.banco_id) return avisar('Debe seleccionar una entidad bancaria.', 'error');
    if (!formData.id_importador) return avisar('Debe seleccionar la empresa importadora.', 'error');
    if (!formData.numero_operacion.trim()) return avisar('Debe ingresar el número de operación.', 'error');
    const monto = parseFloat(formData.monto_total);
    if (isNaN(monto) || monto <= 0) return avisar('El monto total debe ser mayor a 0.', 'error');

    setIsGuardando(true);
    try {
      const payload = {
        banco_id: parseInt(formData.banco_id, 10),
        id_importador: parseInt(formData.id_importador, 10),
        numero_operacion: formData.numero_operacion.trim(),
        monto_total: String(formData.monto_total).trim(),   // texto: decimal exacto en el servidor
        moneda: formData.moneda,
        fecha_transferencia: formData.fecha_transferencia || null
      };
      if (viewMode === 'NUEVO') {
        const res = await api.post('/vouchers/', payload);
        avisar('✅ Voucher registrado exitosamente.', 'exito');
        await cargarVouchers();
        setSelectedId(res.data?.id_voucher || null);
      } else {
        await api.put(`/vouchers/${selectedVoucher.id_voucher}`, { ...payload, version: formData.version });
        avisar('✅ Voucher actualizado exitosamente.', 'exito');
        await cargarVouchers();
      }
      setViewMode('DETALLE');
    } catch (error) {
      avisar(`❌ ${mensajeDeError(error, 'Error al guardar voucher.')}`, 'error');
    } finally {
      setIsGuardando(false);
    }
  };

  const nombreDe = (opciones, id) => opciones.find((o) => o.value === id)?.label || 'N/A';
  const bancoSeleccionadoNombre = nombreDe(opcionesBancos, selectedVoucher?.banco_id || formData.banco_id);
  const importadorSeleccionadoNombre = nombreDe(opcionesImportadores, selectedVoucher?.id_importador || formData.id_importador);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      
      {/* HEADER DE MÓDULO */}
      <header className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-xl shadow-inner">
            <Ticket size={20} className="inline-block shrink-0 text-teal-400" />
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
            <Plus size={14} className="shrink-0" />
            <span>Nuevo Voucher</span>
          </button>
          <button
            onClick={() => navigate('/app/pagos')}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-purple-300 text-xs font-semibold rounded-lg border border-purple-500/30 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Scale size={14} className="shrink-0" />
            <span>Ir a Pagos</span>
          </button>
        </div>
      </header>

      {/* MASTER-DETAIL WORKSTATION */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 p-5 min-h-0 overflow-hidden">
        
        {/* BANDEJA IZQUIERDA (38%) */}
        <BandejaVouchers
          vouchers={vouchers} isLoading={isLoading} selectedId={selectedVoucher?.id_voucher ?? null} handleSelect={handleSelect}
          opcionesBancos={opcionesBancos} opcionesImportadores={opcionesImportadores}
          searchTerm={searchTerm} setSearchTerm={setSearchTerm} filtroSaldo={filtroSaldo} setFiltroSaldo={setFiltroSaldo}
          page={page} setPage={setPage} limit={limit} setLimit={setLimit} totalPages={totalPages} totalRegistros={totalRegistros}
        />

        {/* PANEL DERECHO WORKSTATION (62%) */}
        <section className="lg:col-span-7 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl min-h-0">

          {!selectedVoucher && viewMode !== 'NUEVO' ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-500">
              <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-3xl mb-4 shadow-inner">
                <Ticket size={32} className="inline-block shrink-0 text-teal-400" />
              </div>
              <h3 className="text-base font-bold text-slate-300">Estación de Gestión de Vouchers</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1.5">
                Seleccione un depósito bancario de la bandeja para consultar consumos, saldos o registrar amortizaciones.
              </p>
              <button
                onClick={handleNuevo}
                className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-teal-600/20 flex items-center gap-1.5"
              >
                <Plus size={14} className="shrink-0" />
                <span>Registrar Nuevo Voucher</span>
              </button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-5 space-y-5">
              
              {/* CABECERA WORKSTATION */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-base font-bold text-white tracking-tight">
                      {viewMode === 'NUEVO' ? 'Nuevo Depósito Bancario' : `Voucher #${selectedVoucher?.id_voucher} · ${bancoSeleccionadoNombre}`}
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
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Pencil size={13} className="shrink-0" />
                        <span>Modificar</span>
                      </button>
                      <button
                        onClick={() => setVoucherAEliminar(selectedVoucher)}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 size={13} className="shrink-0" />
                        <span>Eliminar</span>
                      </button>
                      <button
                        onClick={() => navigate('/app/pagos')}
                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-purple-600/20 flex items-center gap-1.5"
                      >
                        <Banknote size={14} className="shrink-0" />
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
                      {selectedVoucher?.moneda === MONEDA.PEN ? 'S/' : '$'} {parseFloat(selectedVoucher?.monto_total || 0).toFixed(2)}
                    </div>
                    <span className="text-[10px] text-slate-500 mt-0.5 block">Depósito inicial</span>
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Consumido</span>
                    <div className="mt-1 font-mono font-bold text-sm text-slate-300 tabular-nums">
                      {selectedVoucher?.moneda === MONEDA.PEN ? 'S/' : '$'} {(parseFloat(selectedVoucher?.monto_total || 0) - parseFloat(selectedVoucher?.saldo_disponible || 0)).toFixed(2)}
                    </div>
                    <span className="text-[10px] text-slate-500 mt-0.5 block">Liquidado en gastos</span>
                  </div>

                  <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-3">
                    <span className="text-[10px] uppercase font-bold text-emerald-400 block tracking-wider">Saldo Disponible</span>
                    <div className="mt-1 font-mono font-bold text-sm text-emerald-400 tabular-nums">
                      {selectedVoucher?.moneda === MONEDA.PEN ? 'S/' : '$'} {parseFloat(selectedVoucher?.saldo_disponible || 0).toFixed(2)}
                    </div>
                    <span className="text-[10px] text-emerald-500 mt-0.5 block">A favor de la empresa</span>
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Tasa de Consumo</span>
                    <div className="mt-1 font-mono text-sm text-slate-200">
                      {parseFloat(selectedVoucher?.monto_total || 0) > 0 ? Math.round(((parseFloat(selectedVoucher?.monto_total || 0) - parseFloat(selectedVoucher?.saldo_disponible || 0)) / parseFloat(selectedVoucher?.monto_total || 1)) * 100) : 0}%
                    </div>
                    <span className="text-[10px] text-slate-500 mt-0.5 block">Amortizado</span>
                  </div>
                </div>
              )}

              {/* DETALLE O FORMULARIO */}
              {viewMode === 'DETALLE' ? (
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                    <FileText size={15} className="text-teal-400 shrink-0" />
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

                  {voucherTieneUso && (
                    <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-200 text-xs flex items-center gap-3">
                      <AlertTriangle size={16} className="text-amber-400 shrink-0" />
                      <div>
                        <strong className="text-amber-300">Voucher en uso activo:</strong> Tiene consumidos <strong>{selectedVoucher.moneda} {(parseFloat(selectedVoucher.monto_total) - parseFloat(selectedVoucher.saldo_disponible)).toFixed(2)}</strong>.
                        Para eliminar este voucher, primero reverse los pagos vinculados abajo.
                      </div>
                    </div>
                  )}

                  {/* SECCIÓN DE PAGOS VINCULADOS A ESTE VOUCHER */}
                  <PagosDelVoucher key={selectedVoucher.id_voucher} voucher={selectedVoucher} onPagoReversado={cargarVouchers} />
                </div>
              ) : (
                <FormularioVoucher
                  formData={formData} setFormData={setFormData} viewMode={viewMode} isGuardando={isGuardando}
                  handleGuardar={handleGuardar} handleCancelarEdicion={handleCancelarEdicion}
                  opcionesBancos={opcionesBancos} opcionesImportadores={opcionesImportadores} tienePagos={tienePagos}
                />
              )}

            </div>
          )}
        </section>

      </div>

      {voucherAEliminar && (
        <ModalEliminarVoucher
          voucher={voucherAEliminar}
          voucherTieneUso={voucherTieneUso}
          onCerrar={() => setVoucherAEliminar(null)}
          onEliminado={async () => { setSelectedId(null); await cargarVouchers(); }}
        />
      )}

    </div>
  );
};

export default Vouchers;
