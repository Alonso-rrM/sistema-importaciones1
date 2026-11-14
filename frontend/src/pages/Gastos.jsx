/**
 * GASTOS LOGÍSTICOS DE IMPORTACIÓN
 * Compone la pantalla; cada parte vive en pages/gastos/:
 *   BandejaGastos · DetalleGasto · FormularioGasto (panel lateral) · ModalEliminarGasto
 * La reversión de un pago usa el modal común ModalAnularPago.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Download, Clock, Banknote, CheckCircle2, AlertTriangle, Scale, Package, BarChart3 } from 'lucide-react';
import api from '../services/api';
import useConsulta from '../hooks/useConsulta';
import useDebounce from '../hooks/useDebounce';
import { descargarExcel } from '../utils/exportUtils';
import ModalCrearProveedorRapido from '../components/ModalCrearProveedorRapido';
import ModalAnularPago from '../components/ModalAnularPago';
import { CATEGORIA_PROVEEDOR, ESTADO_PAGO, MONEDA } from '../constants';
import { mensajeDeError, useInteraccion } from '../context/interaccion';
import BandejaGastos from './gastos/BandejaGastos';
import DetalleGasto from './gastos/DetalleGasto';
import FormularioGasto from './gastos/FormularioGasto';
import ModalEliminarGasto from './gastos/ModalEliminarGasto';

const MODO = Object.freeze({ LISTA: 'LISTA', NUEVO: 'NUEVO', MODIFICAR: 'MODIFICAR' });

const FORM_VACIO = Object.freeze({
  id_maestro_temp: null,
  id_dam: null,
  id_concepto: null,
  id_proveedor: null,
  id_tipo_doc: null,
  numero_documento: '',
  fecha_vencimiento: '',
  monto_original: '',
  moneda: MONEDA.USD,
  observaciones: '',
  dam_numero: '',
});

const lista = (res) => {
  const datos = res?.data;
  if (Array.isArray(datos)) return datos;
  return Array.isArray(datos?.data) ? datos.data : [];
};

const etiquetaProveedor = (p) => ({ value: p.id_proveedor, label: p.ruc ? `${p.ruc} - ${p.nombre}` : p.nombre });

const CATALOGOS_VACIOS = Object.freeze({
  damsRaw: [], opcionesMaestros: [], opcionesConceptos: [], opcionesProveedores: [], opcionesTiposDoc: [],
});

const consultarCatalogos = () => Promise.all([
  api.get('/maestros/lookup'),
  api.get('/dams/lookup'),
  api.get('/conceptos/'),
  api.get('/proveedores/'),
  api.get('/tipos-documento/'),
]).then(([maestros, dams, conceptos, proveedores, tiposDoc]) => ({
  damsRaw: lista(dams),
  opcionesMaestros: lista(maestros).map((m) => ({ value: m.id_maestro, label: `Factura: ${m.numero_factura}` })),
  opcionesConceptos: lista(conceptos).map((c) => ({ value: c.id_concepto, label: c.nombre })),
  opcionesProveedores: lista(proveedores).map(etiquetaProveedor),
  opcionesTiposDoc: lista(tiposDoc).map((t) => ({ value: t.id_tipo_doc, label: t.nombre_documento })),
}));

const formDesdeGasto = (gasto, damsRaw) => {
  const damVinculada = damsRaw.find((d) => d.id_dam === gasto.id_dam);
  return {
    id_maestro_temp: damVinculada ? damVinculada.id_maestro : (gasto.id_maestro || null),
    id_dam: gasto.id_dam,
    id_concepto: gasto.id_concepto,
    id_proveedor: gasto.id_proveedor,
    id_tipo_doc: gasto.id_tipo_doc,
    numero_documento: gasto.numero_documento || '',
    fecha_vencimiento: gasto.fecha_vencimiento ? String(gasto.fecha_vencimiento).slice(0, 10) : '',
    monto_original: String(gasto.monto_original ?? ''),
    moneda: gasto.moneda || MONEDA.USD,
    observaciones: gasto.observaciones || '',
    dam_numero: gasto.dam_numero || '',
  };
};

const Gastos = () => {
  const { avisar } = useInteraccion();
  const navigate = useNavigate();
  const location = useLocation();

  // Si viene desde DAMs con una DAM precargada, la pantalla abre directamente el registro de un gasto
  const [desdeDam] = useState(() => location.state?.fromDam ?? null);
  const [viewMode, setViewMode] = useState(desdeDam ? MODO.NUEVO : MODO.LISTA);
  const [isDrawerOpen, setIsDrawerOpen] = useState(Boolean(desdeDam));
  const [form, setForm] = useState(() => (desdeDam ? {
    ...FORM_VACIO,
    id_dam: desdeDam.id_dam || '',
    id_maestro_temp: desdeDam.id_maestro || null,
    dam_numero: desdeDam.numero_de_dam || '',
  } : FORM_VACIO));
  useEffect(() => {
    if (desdeDam) window.history.replaceState({}, document.title);
  }, [desdeDam]);

  const [selectedId, setSelectedId] = useState(null);
  const [isGuardando, setIsGuardando] = useState(false);
  const [isExportando, setIsExportando] = useState(false);
  const [gastoAEliminar, setGastoAEliminar] = useState(null);
  const [pagoAReversar, setPagoAReversar] = useState(null);
  const [modalCrearProveedorOpen, setModalCrearProveedorOpen] = useState(false);

  // ----- Catálogos para filtros y formulario -----
  const { datos: catalogos, setDatos: setCatalogos } = useConsulta(consultarCatalogos, {
    inicial: CATALOGOS_VACIOS, alFallar: (error) => console.error('Error cargando catálogos:', error),
  });
  const { damsRaw, opcionesMaestros, opcionesConceptos, opcionesProveedores, opcionesTiposDoc } = catalogos;

  // ----- Filtros de la bandeja -----
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

  // Parámetros comunes de la bandeja y de la exportación a Excel
  const parametrosFiltro = useMemo(() => ({
    search: debouncedSearch.trim() || undefined,
    estado_pago: estadoFiltro || undefined,
    moneda: monedaFiltro || undefined,
    tipo_gasto: tipoGastoFiltro || undefined,
    id_concepto: conceptoFiltro || undefined,
    id_proveedor: proveedorFiltro || undefined,
    vencimiento: vencimientoFiltro || undefined,
  }), [debouncedSearch, estadoFiltro, monedaFiltro, tipoGastoFiltro, conceptoFiltro, proveedorFiltro, vencimientoFiltro]);

  // ----- Lista de gastos -----
  const consultarGastos = useCallback(
    () => api.get('/gastos/', { params: { ...parametrosFiltro, page, limit } }).then((r) => r.data),
    [parametrosFiltro, page, limit],
  );
  const { datos: paginaGastos, cargando: isLoading, recargar } = useConsulta(consultarGastos, {
    alFallar: (error) => console.error('Error al obtener gastos:', error),
  });
  const gastos = useMemo(() => paginaGastos?.data || [], [paginaGastos]);
  const totalRegistros = paginaGastos?.total_registros || 0;
  const recargarGastos = () => recargar().catch((error) => console.error('Error al obtener gastos:', error));

  // Seleccionado: el elegido; si no está en la página y no se edita nada, el primero de la lista
  const selectedGasto = gastos.find((g) => g.id_gasto === selectedId)
    ?? (viewMode === MODO.LISTA ? gastos[0] ?? null : null);

  const opcionesDamsFiltradas = useMemo(() => {
    const filtradas = form.id_maestro_temp ? damsRaw.filter((dam) => dam.id_maestro === form.id_maestro_temp) : damsRaw;
    return filtradas.map((dam) => ({ value: dam.id_dam, label: `DAM: ${dam.numero_de_dam}` }));
  }, [damsRaw, form.id_maestro_temp]);

  // KPIs multimoneda calculados sobre la página visible
  const kpis = useMemo(() => {
    const totales = {
      [MONEDA.USD]: { liquidado: 0, pendiente: 0, parcial: 0 },
      [MONEDA.PEN]: { liquidado: 0, pendiente: 0, parcial: 0 },
    };
    gastos.forEach((g) => {
      const monto = parseFloat(g.monto_original) || 0;
      const total = totales[g.moneda || MONEDA.USD];
      if (!total) return;
      if (g.estado_pago === ESTADO_PAGO.PAGADO) total.liquidado += monto;
      if (g.estado_pago === ESTADO_PAGO.PENDIENTE) total.pendiente += monto;
      if (g.estado_pago === ESTADO_PAGO.PARCIAL) total.parcial += monto;
    });
    return totales;
  }, [gastos]);

  const formatMultiMoneda = (tipo) => {
    const usd = kpis[MONEDA.USD][tipo].toFixed(2);
    const pen = kpis[MONEDA.PEN][tipo].toFixed(2);
    if (monedaFiltro === MONEDA.USD) return `$${usd} USD`;
    if (monedaFiltro === MONEDA.PEN) return `S/${pen} PEN`;
    return `$${usd} | S/${pen}`;
  };

  // ----- Panel lateral -----
  const abrirNuevo = () => {
    setViewMode(MODO.NUEVO);
    setForm(FORM_VACIO);
    setIsDrawerOpen(true);
  };
  const abrirEdicion = (gasto) => {
    setViewMode(MODO.MODIFICAR);
    setSelectedId(gasto.id_gasto);
    setForm(formDesdeGasto(gasto, damsRaw));
    setIsDrawerOpen(true);
  };
  const cerrarPanel = () => {
    setIsDrawerOpen(false);
    setViewMode(MODO.LISTA);
  };
  const seleccionar = (gasto) => {
    setSelectedId(gasto.id_gasto);
    if (isDrawerOpen) cerrarPanel();
  };

  const handleProveedorCreado = (nuevoProv) => {
    setCatalogos((c) => ({ ...c, opcionesProveedores: [etiquetaProveedor(nuevoProv), ...c.opcionesProveedores] }));
    setForm((prev) => ({ ...prev, id_proveedor: nuevoProv.id_proveedor }));
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    const faltante = [
      [form.id_dam, 'Por favor seleccione una DAM asociada.'],
      [form.id_concepto, 'Por favor seleccione un concepto de gasto.'],
      [form.id_proveedor, 'Por favor seleccione un proveedor.'],
      [form.id_tipo_doc, 'Por favor seleccione un tipo de documento.'],
    ].find(([valor]) => !valor);
    if (faltante) {
      avisar(faltante[1], 'advertencia');
      return;
    }
    const montoTexto = String(form.monto_original ?? '').trim();
    const monto = parseFloat(montoTexto);
    if (isNaN(monto) || monto <= 0) {
      avisar('Por favor ingrese un monto total válido mayor a 0.', 'advertencia');
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
        // El monto viaja como texto: el backend lo lee como Decimal, sin errores de coma flotante
        monto_original: montoTexto,
        moneda: form.moneda || MONEDA.USD,
        observaciones: form.observaciones?.trim() || null,
      };
      if (viewMode === MODO.NUEVO) {
        const res = await api.post('/gastos/', payload);
        setSelectedId(res.data?.id_gasto || null);
      } else {
        await api.put(`/gastos/${selectedId}`, payload);
      }
      await recargarGastos();
      cerrarPanel();
      setForm(FORM_VACIO);
    } catch (error) {
      avisar(`Error al guardar:\n${mensajeDeError(error)}`, 'error');
    } finally {
      setIsGuardando(false);
    }
  };

  const handleExportarExcel = async () => {
    setIsExportando(true);
    try {
      await descargarExcel('/gastos/exportar', parametrosFiltro, 'Reporte_Gastos.xlsx');
    } catch (error) {
      avisar(`Error al exportar reporte: ${mensajeDeError(error, 'Error desconocido')}`, 'error');
    } finally {
      setIsExportando(false);
    }
  };

  const filtros = {
    searchTerm, setSearchTerm, estadoFiltro, setEstadoFiltro, monedaFiltro, setMonedaFiltro,
    tipoGastoFiltro, setTipoGastoFiltro, conceptoFiltro, setConceptoFiltro, proveedorFiltro, setProveedorFiltro,
    vencimientoFiltro, setVencimientoFiltro, mostrarFiltros, setMostrarFiltros, limpiarFiltros, hayFiltrosActivos,
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      
      {/* HEADER DE MÓDULO */}
      <header className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-xl shadow-inner">
            <Banknote size={20} className="inline-block shrink-0 text-teal-400" />
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
            onClick={handleExportarExcel}
            disabled={isExportando}
            className="px-3.5 py-1.5 bg-emerald-700/80 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg border border-emerald-500/40 transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
            title="Descargar todos los gastos filtrados a Excel"
          >
            <span>{isExportando ? <Clock size={13} className="inline-block shrink-0 animate-spin" /> : <Download size={13} className="inline-block shrink-0" />}</span>
            <span>{isExportando ? 'Exportando...' : 'Exportar Excel'}</span>
          </button>
          <button
            onClick={abrirNuevo}
            className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-lg transition-colors shadow-lg shadow-teal-600/20 flex items-center gap-1.5"
          >
            <span>+</span>
            <span>Nuevo Gasto</span>
          </button>
          <button
            onClick={() => navigate('/app/pagos')}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-purple-300 text-xs font-semibold rounded-lg border border-purple-500/30 transition-colors flex items-center gap-1.5"
          >
            <Scale size={14} className="inline-block shrink-0" />
            <span>Ir a Tesorería</span>
          </button>
          <button
            onClick={() => navigate('/app/logistica')}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5"
          >
            <Package size={14} className="inline-block shrink-0" />
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
            <BarChart3 size={16} className="inline-block shrink-0 text-slate-500" />
          </div>

          <div className="bg-emerald-950/20 p-2.5 rounded-lg border border-emerald-500/30 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-semibold uppercase text-emerald-400 block tracking-wider">Liquidado (Vista)</span>
              <span className="text-xs font-mono font-bold text-emerald-400 tabular-nums">{formatMultiMoneda('liquidado')}</span>
            </div>
            <CheckCircle2 size={16} className="inline-block shrink-0 text-emerald-400" />
          </div>

          <div className="bg-rose-950/20 p-2.5 rounded-lg border border-rose-500/30 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-semibold uppercase text-rose-400 block tracking-wider">Pendiente (Vista)</span>
              <span className="text-xs font-mono font-bold text-rose-400 tabular-nums">{formatMultiMoneda('pendiente')}</span>
            </div>
            <AlertTriangle size={16} className="inline-block shrink-0 text-rose-400" />
          </div>

          <div className="bg-amber-950/20 p-2.5 rounded-lg border border-amber-500/30 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-semibold uppercase text-amber-400 block tracking-wider">Parcial (Vista)</span>
              <span className="text-xs font-mono font-bold text-amber-400 tabular-nums">{formatMultiMoneda('parcial')}</span>
            </div>
            <Clock size={16} className="inline-block shrink-0 text-amber-400" />
          </div>
        </div>
      </section>

      {/* BANDEJA (38%) Y FICHA DEL GASTO (62%) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 p-5 min-h-0 overflow-hidden">
        <BandejaGastos
          gastos={gastos} isLoading={isLoading} selectedId={selectedGasto?.id_gasto ?? null} onSeleccionar={seleccionar}
          filtros={filtros} opcionesConceptos={opcionesConceptos} opcionesProveedores={opcionesProveedores}
          page={page} setPage={setPage} limit={limit} setLimit={setLimit}
          totalPages={paginaGastos?.total_paginas || 1} totalRegistros={totalRegistros}
        />
        <DetalleGasto
          gasto={selectedGasto} onNuevo={abrirNuevo} onEditar={abrirEdicion}
          onEliminar={setGastoAEliminar} onReversarPago={setPagoAReversar}
        />
      </div>

      <FormularioGasto
        abierto={isDrawerOpen} viewMode={viewMode} selectedGasto={selectedGasto}
        form={form} setForm={setForm} isGuardando={isGuardando}
        onGuardar={handleGuardar} onCerrar={cerrarPanel} onCrearProveedor={() => setModalCrearProveedorOpen(true)}
        damsRaw={damsRaw} opcionesMaestros={opcionesMaestros} opcionesDamsFiltradas={opcionesDamsFiltradas}
        opcionesConceptos={opcionesConceptos} opcionesProveedores={opcionesProveedores} opcionesTiposDoc={opcionesTiposDoc}
      />

      {gastoAEliminar && (
        <ModalEliminarGasto
          gasto={gastoAEliminar}
          onCerrar={() => setGastoAEliminar(null)}
          onEliminado={async () => { setSelectedId(null); await recargarGastos(); }}
        />
      )}

      {pagoAReversar && (
        <ModalAnularPago
          pago={pagoAReversar}
          titulo={`Reversar Pago #${pagoAReversar.id_pago}`}
          placeholder="Justifique el motivo de anulación o extorno de este pago..."
          textoConfirmar="Confirmar Reversión"
          onCerrar={() => setPagoAReversar(null)}
          onAnulado={recargarGastos}
        />
      )}

      <ModalCrearProveedorRapido
        isOpen={modalCrearProveedorOpen}
        onClose={() => setModalCrearProveedorOpen(false)}
        onProveedorCreado={handleProveedorCreado}
        categoriaDefecto={CATEGORIA_PROVEEDOR.NACIONAL}
      />
    </div>
  );
};

export default Gastos;
