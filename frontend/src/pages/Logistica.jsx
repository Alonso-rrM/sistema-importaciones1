/**
 * LOGÍSTICA: expedientes (contenedores) con sus DAMs y gastos.
 * Compone la pantalla; cada parte vive en pages/logistica/:
 *   BandejaExpedientes · TermometroFinanciero · AvancePagos · FormularioExpediente · RelacionesExpediente
 *   ModalNuevaDam · ModalNuevoGasto · ModalEliminarExpediente
 */
import { useCallback, useMemo, useState } from 'react';
import api from '../services/api';
import { obtenerRol } from '../utils/session';
import useConsulta from '../hooks/useConsulta';
import useDebounce from '../hooks/useDebounce';
import { descargarExcel } from '../utils/exportUtils';
import ModalLiquidacionContenedor from '../components/ModalLiquidacionContenedor';
import ModalCrearProveedorRapido from '../components/ModalCrearProveedorRapido';
import { FileText, Trash2, Unlock, Receipt, FolderOpen } from 'lucide-react';
import { CATEGORIA_PROVEEDOR, ESTADO_DOCUMENTARIO, ESTADO_LEVANTE, ROL, STATUS_LLEGADA, TIPO_VALOR } from '../constants';
import { mensajeDeError, useInteraccion } from '../context/interaccion';
import { validarMonto } from '../utils/validaciones';
import BandejaExpedientes from './logistica/BandejaExpedientes';
import TermometroFinanciero from './logistica/TermometroFinanciero';
import AvancePagos from './logistica/AvancePagos';
import FormularioExpediente from './logistica/FormularioExpediente';
import RelacionesExpediente from './logistica/RelacionesExpediente';
import ModalNuevaDam from './logistica/ModalNuevaDam';
import ModalNuevoGasto from './logistica/ModalNuevoGasto';
import ModalEliminarExpediente from './logistica/ModalEliminarExpediente';

const MODAL = Object.freeze({
  NUEVA_DAM: 'NUEVA_DAM', NUEVO_GASTO: 'NUEVO_GASTO', ELIMINAR: 'ELIMINAR', LIQUIDACION: 'LIQUIDACION', PROVEEDOR: 'PROVEEDOR',
});

const FORMULARIO_VACIO = Object.freeze({
  numero_factura: '', documento_transporte: '', n_cont_fisico: '', status_llegada: STATUS_LLEGADA.EN_TRANSITO,
  fecha_embarque: '', fecha_arribo: '', id_proveedor: '', id_importador: '', id_agente: '', id_almacen: '',
  fob_usd: '', flete_usd: '', tipo_valor: TIPO_VALOR.DEFINITIVO, venta_sucesiva: 'NO',
  estado_documentario: ESTADO_DOCUMENTARIO.SIN_NUMERAR, fecha_levante_maestro: '', fecha_recepcion_almacen: '',
});

const soloFecha = (valor) => (valor ? valor.split('T')[0] : '');
const textoOVacio = (valor) => (valor != null ? String(valor) : '');

const formularioDesdeMaestro = (m) => ({
  numero_factura: m.numero_factura || '',
  documento_transporte: m.documento_transporte || '',
  n_cont_fisico: m.n_cont_fisico || '',
  status_llegada: m.status_llegada || STATUS_LLEGADA.EN_TRANSITO,
  fecha_embarque: soloFecha(m.fecha_embarque),
  fecha_arribo: soloFecha(m.fecha_arribo),
  id_proveedor: textoOVacio(m.id_proveedor),
  id_importador: textoOVacio(m.id_importador),
  id_agente: textoOVacio(m.id_agente),
  id_almacen: textoOVacio(m.id_almacen),
  fob_usd: textoOVacio(m.fob_usd),
  flete_usd: textoOVacio(m.flete_usd),
  tipo_valor: m.tipo_valor || TIPO_VALOR.DEFINITIVO,
  venta_sucesiva: m.venta_sucesiva || 'NO',
  estado_documentario: m.estado_documentario || ESTADO_DOCUMENTARIO.SIN_NUMERAR,
  fecha_levante_maestro: soloFecha(m.fecha_levante_maestro),
  fecha_recepcion_almacen: soloFecha(m.fecha_recepcion_almacen),
  version: m.version,
});

const fechaOVacia = (valor) => valor?.trim() || null;
const idONulo = (valor) => (valor ? parseInt(valor, 10) : null);
// Los montos viajan como texto: el backend los lee como Decimal, sin errores de coma flotante
const montoONulo = (valor) => (valor !== '' && valor != null ? String(valor).trim() : null);

const cuerpoDelFormulario = (formData) => ({
  numero_factura: (formData.numero_factura || '').trim(),
  documento_transporte: formData.documento_transporte?.trim() || null,
  n_cont_fisico: formData.n_cont_fisico?.trim() || null,
  status_llegada: formData.status_llegada || STATUS_LLEGADA.EN_TRANSITO,
  fecha_embarque: fechaOVacia(formData.fecha_embarque),
  fecha_arribo: fechaOVacia(formData.fecha_arribo),
  fecha_recepcion_almacen: fechaOVacia(formData.fecha_recepcion_almacen),
  id_proveedor: idONulo(formData.id_proveedor),
  id_importador: idONulo(formData.id_importador),
  id_agente: idONulo(formData.id_agente),
  id_almacen: idONulo(formData.id_almacen),
  fob_usd: montoONulo(formData.fob_usd),
  flete_usd: montoONulo(formData.flete_usd),
  tipo_valor: formData.tipo_valor || TIPO_VALOR.DEFINITIVO,
  venta_sucesiva: formData.venta_sucesiva || 'NO',
});

const CATALOGOS_VACIOS = Object.freeze({
  opcionesProveedores: [], opcionesImportadores: [], opcionesAgentes: [], opcionesAlmacenes: [],
  opcionesConceptos: [], opcionesTiposDoc: [],
});

const consultarCatalogos = () => Promise.all(
  ['/proveedores/', '/importadores/', '/agentes/', '/almacenes/', '/conceptos/', '/tipos-documento/'].map((ruta) => api.get(ruta)),
).then(([prov, imp, ag, alm, conc, tipos]) => ({
  opcionesProveedores: prov.data || [],
  opcionesImportadores: imp.data || [],
  opcionesAgentes: ag.data || [],
  opcionesAlmacenes: alm.data || [],
  opcionesConceptos: conc.data || [],
  opcionesTiposDoc: tipos.data || [],
}));

const RELACIONES_VACIAS = Object.freeze({ damsVinculadas: [], gastosVinculados: [], estadoCuenta: null, kpiGastos: null });

/** DAMs, gastos, estado de cuenta e indicadores del expediente abierto. */
const consultaDeRelaciones = ({ id_maestro, numero_factura }) => () => Promise.all([
  api.get(`/reporte-maestro/${id_maestro}`),
  api.get('/gastos/', { params: { search: numero_factura, limit: 100 } }),
  api.get(`/maestros/${id_maestro}/estado_cuenta`).catch(() => ({ data: null })),
  api.get(`/maestros/${id_maestro}/kpi-gastos`).catch(() => ({ data: null })),
]).then(([dams, gastos, cuenta, kpi]) => ({
  damsVinculadas: dams.data?.dams || [],
  gastosVinculados: gastos.data?.data || [],
  estadoCuenta: cuenta.data || null,
  kpiGastos: kpi.data || null,
}));

const Logistica = () => {
  const { avisar, confirmar } = useInteraccion();
  // Rol solo para la interfaz (los permisos reales los valida el backend)
  const userRole = obtenerRol();

  const [selectedId, setSelectedId] = useState(null);
  const [viewMode, setViewMode] = useState(null); // null = Solo bandeja, 'NUEVO', 'MODIFICAR'
  const [formData, setFormData] = useState(FORMULARIO_VACIO);
  const [isGuardando, setIsGuardando] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isExportando, setIsExportando] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(null);
  const cerrarModal = () => setModalAbierto(null);

  // ----- Catálogos -----
  const { datos: catalogos, setDatos: setCatalogos } = useConsulta(consultarCatalogos, {
    inicial: CATALOGOS_VACIOS, alFallar: (error) => console.error('Error al cargar catálogos:', error),
  });
  const { opcionesProveedores, opcionesImportadores, opcionesAgentes, opcionesAlmacenes, opcionesConceptos, opcionesTiposDoc } = catalogos;
  const proveedoresMap = useMemo(
    () => Object.fromEntries(opcionesProveedores.map((p) => [p.id_proveedor, p.nombre])), [opcionesProveedores]);
  const importadoresMap = useMemo(
    () => Object.fromEntries(opcionesImportadores.map((i) => [i.id_importador, i.nombre])), [opcionesImportadores]);
  const agregarProveedor = (nuevo) => setCatalogos((c) => ({ ...c, opcionesProveedores: [nuevo, ...c.opcionesProveedores] }));

  // ----- Filtros y lista de expedientes -----
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [estadoLevanteFiltro, setEstadoLevanteFiltro] = useState('');
  const [statusLlegadaFiltro, setStatusLlegadaFiltro] = useState('');
  const [importadorFiltro, setImportadorFiltro] = useState('');
  const [tipoValorFiltro, setTipoValorFiltro] = useState('');
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const limpiarFiltros = () => {
    setSearchTerm('');
    setEstadoLevanteFiltro('');
    setStatusLlegadaFiltro('');
    setImportadorFiltro('');
    setTipoValorFiltro('');
    setPage(1);
  };
  const hayFiltrosActivos = !!(searchTerm || estadoLevanteFiltro || statusLlegadaFiltro || importadorFiltro || tipoValorFiltro);

  // Parámetros comunes de la bandeja y de la exportación a Excel
  const parametrosFiltro = useMemo(() => ({
    search: debouncedSearch.trim() || undefined,
    estado_levante: estadoLevanteFiltro || undefined,
    status_llegada: statusLlegadaFiltro || undefined,
    id_importador: importadorFiltro || undefined,
    tipo_valor: tipoValorFiltro || undefined,
  }), [debouncedSearch, estadoLevanteFiltro, statusLlegadaFiltro, importadorFiltro, tipoValorFiltro]);

  const consultarMaestros = useCallback(
    () => api.get('/maestros/', { params: { ...parametrosFiltro, page, limit } }).then((r) => r.data),
    [parametrosFiltro, page, limit],
  );
  const { datos: paginaMaestros, recargar } = useConsulta(consultarMaestros, {
    alFallar: (error) => console.error('Error maestros:', error),
  });
  const maestros = useMemo(() => paginaMaestros?.data || [], [paginaMaestros]);
  const recargarMaestros = () => recargar().catch((error) => console.error('Error maestros:', error));

  // Tras recargar la lista, el formulario toma la versión más reciente del expediente abierto
  // (las acciones automáticas —DAMs, aforo, pagos— cambian su estado y su versión).
  // Si hay cambios sin guardar NO se toca: al guardar, el backend devolverá 409 si hubo conflicto.
  const [maestrosVistos, setMaestrosVistos] = useState(maestros);
  if (maestros !== maestrosVistos) {
    setMaestrosVistos(maestros);
    const fresco = maestros.find((x) => x.id_maestro === selectedId);
    if (viewMode === 'MODIFICAR' && !hasUnsavedChanges && fresco && fresco.version !== formData.version) {
      setFormData(formularioDesdeMaestro(fresco));
    }
  }

  // ----- Relaciones del expediente abierto (DAMs, gastos, estado de cuenta, indicadores) -----
  // Se identifican por el id y el número de factura guardados (no por lo que se está escribiendo)
  const [expediente, setExpediente] = useState(null);
  const consultarRelaciones = useMemo(() => (expediente ? consultaDeRelaciones(expediente) : null), [expediente]);
  const { datos: datosRelaciones, cargando: isLoadingSub, recargar: recargarRelaciones } = useConsulta(consultarRelaciones, {
    alFallar: (error) => console.error('Error al cargar sub-registros', error),
  });
  const relaciones = (expediente && !isLoadingSub && datosRelaciones) || RELACIONES_VACIAS;
  const actualizarRelaciones = () => recargarRelaciones().catch((error) => console.error('Error al cargar sub-registros', error));

  const isReadOnly = userRole !== ROL.SUPERADMIN && formData.estado_documentario === ESTADO_DOCUMENTARIO.ATENCION_TOTAL && viewMode === 'MODIFICAR';

  const handleFormChange = (campo, valor) => {
    setFormData((prev) => ({ ...prev, [campo]: valor }));
    setHasUnsavedChanges(true);
  };

  const descartarCambios = (mensaje) => !hasUnsavedChanges || confirmar({
    titulo: 'Cambios sin guardar', mensaje, textoAceptar: 'Descartar cambios', peligro: true,
  });

  const handleSelect = async (m) => {
    if (!(await descartarCambios('Tienes cambios sin guardar. ¿Deseas descartarlos y cambiar de registro?'))) return;
    setSelectedId(m.id_maestro);
    setViewMode('MODIFICAR');
    setFormData(formularioDesdeMaestro(m));
    setHasUnsavedChanges(false);
    setExpediente({ id_maestro: m.id_maestro, numero_factura: m.numero_factura });
  };

  const handleNuevo = async () => {
    if (!(await descartarCambios('Tienes cambios sin guardar. ¿Deseas descartarlos y crear uno nuevo?'))) return;
    setSelectedId(null);
    setViewMode('NUEVO');
    setFormData(FORMULARIO_VACIO);
    setHasUnsavedChanges(true);
    setExpediente(null);
  };

  const volverALaBandeja = async () => {
    if (!(await descartarCambios('¿Descartar los cambios sin guardar?'))) return;
    setViewMode(null);
    setHasUnsavedChanges(false);
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (isReadOnly) return avisar('Este registro cuenta con LEVANTE y está protegido contra edición.', 'advertencia');
    if (formData.status_llegada === STATUS_LLEGADA.EN_ALMACEN && !formData.fecha_recepcion_almacen) {
      return avisar('Debe ingresar la Fecha de Recepción en Almacén.', 'advertencia');
    }
    const payload = cuerpoDelFormulario(formData);
    if (!payload.numero_factura) return avisar('El campo N° Factura es obligatorio.', 'advertencia');
    for (const [campo, etiqueta] of [['fob_usd', 'El FOB'], ['flete_usd', 'El flete']]) {
      const { error } = validarMonto(formData[campo], { etiqueta, permitirCero: true, opcional: true });
      if (error) return avisar(error, 'advertencia');
    }
    // Fechas coherentes: se revisan si cambió alguna (puede haber expedientes antiguos inconsistentes)
    const guardado = maestros.find((m) => m.id_maestro === selectedId);
    const fechasCambiaron = viewMode === 'NUEVO'
      || payload.fecha_embarque !== (soloFecha(guardado?.fecha_embarque) || null)
      || payload.fecha_arribo !== (soloFecha(guardado?.fecha_arribo) || null);
    if (fechasCambiaron && payload.fecha_embarque && payload.fecha_arribo && payload.fecha_arribo < payload.fecha_embarque) {
      return avisar('La fecha de arribo no puede ser anterior a la fecha de embarque.', 'advertencia');
    }

    setIsGuardando(true);
    try {
      if (viewMode === 'NUEVO') {
        const res = await api.post('/maestros/', payload);
        setSelectedId(res.data.id_maestro);
        setViewMode('MODIFICAR');
        setFormData((prev) => ({ ...prev, version: res.data?.version }));
        setExpediente({ id_maestro: res.data.id_maestro, numero_factura: payload.numero_factura });
      } else {
        // Bloqueo optimista: se envía la versión leída; el backend responde 409 si otro usuario la cambió
        const res = await api.put(`/maestros/${selectedId}`, { ...payload, version: formData.version });
        setFormData((prev) => ({ ...prev, version: res.data?.version }));
        if (payload.numero_factura !== expediente?.numero_factura) {
          setExpediente({ id_maestro: selectedId, numero_factura: payload.numero_factura });
        }
      }
      setHasUnsavedChanges(false);
      await recargarMaestros();
      avisar('✅ Expediente guardado exitosamente.', 'exito');
    } catch (error) {
      avisar(`Error al guardar:\n${mensajeDeError(error, 'Error al guardar')}`, 'error');
    } finally {
      setIsGuardando(false);
    }
  };

  const handleDesbloquearLevante = async () => {
    if (!(await confirmar({
      titulo: 'Desbloquear expediente',
      mensaje: '¿Seguro que deseas desbloquear este expediente con LEVANTE? Su estado pasará a SIN LEVANTE.',
      textoAceptar: 'Desbloquear',
      peligro: true,
    }))) return;
    try {
      await api.post(`/maestros/${selectedId}/desbloquear/`);
      avisar('✅ Expediente desbloqueado correctamente.', 'exito');
      setFormData((prev) => ({ ...prev, estado_levante: ESTADO_LEVANTE.SIN_LEVANTE }));
      recargarMaestros();
    } catch (error) {
      avisar(`Error al desbloquear: ${mensajeDeError(error, 'Error desconocido')}`, 'error');
    }
  };

  const alEliminarExpediente = () => {
    setSelectedId(null);
    setViewMode(null);
    setHasUnsavedChanges(false);
    setExpediente(null);
    recargarMaestros();
  };

  const alCrearProveedorDelExpediente = (nuevo) => {
    agregarProveedor(nuevo);
    handleFormChange('id_proveedor', String(nuevo.id_proveedor));
  };

  const cfr = (parseFloat(formData.fob_usd || 0) + parseFloat(formData.flete_usd || 0)).toFixed(2);

  const handleExportarExcel = async () => {
    setIsExportando(true);
    try {
      await descargarExcel('/maestros/exportar', parametrosFiltro, 'Reporte_Logistica.xlsx');
    } catch (error) {
      avisar(`Error al exportar reporte: ${mensajeDeError(error, 'Error desconocido')}`, 'error');
    } finally {
      setIsExportando(false);
    }
  };

  const filtros = {
    searchTerm, setSearchTerm, estadoLevanteFiltro, setEstadoLevanteFiltro, statusLlegadaFiltro, setStatusLlegadaFiltro,
    importadorFiltro, setImportadorFiltro, tipoValorFiltro, setTipoValorFiltro, mostrarFiltros, setMostrarFiltros,
    limpiarFiltros, hayFiltrosActivos,
  };
  const datosExpediente = { id_maestro: selectedId, numero_factura: formData.numero_factura, tipo_valor: formData.tipo_valor };

  return (
    <main className="flex-1 flex overflow-hidden h-full">
      <BandejaExpedientes
        maestros={maestros} selectedId={selectedId} viewMode={viewMode}
        onSeleccionar={handleSelect} onNuevo={handleNuevo} onExportar={handleExportarExcel} isExportando={isExportando}
        filtros={filtros} opcionesImportadores={opcionesImportadores}
        proveedoresMap={proveedoresMap} importadoresMap={importadoresMap}
        page={page} setPage={setPage} limit={limit} setLimit={setLimit}
        totalPages={paginaMaestros?.total_paginas || 1} totalRegistros={paginaMaestros?.total_registros || 0}
      />

      {/* PANEL DERECHO: DETALLES (62%) */}
      <section className={`flex-1 flex-col h-full bg-slate-900 overflow-hidden ${!viewMode ? 'hidden lg:flex' : 'flex'}`}>
        {!viewMode ? (
          <div className="flex-1 flex items-center justify-center text-slate-600">
            <div className="text-center"><FolderOpen size={40} className="mx-auto text-slate-600 mb-2" /><p className="mt-3 text-sm font-medium">Seleccione un expediente de la bandeja para auditar o pulse "+ Nuevo".</p></div>
          </div>
        ) : (
          <>
            <header className="p-4 border-b border-slate-800 bg-slate-800/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <button onClick={volverALaBandeja} className="lg:hidden p-1.5 bg-slate-700 text-slate-300 rounded hover:bg-slate-600">⬅</button>
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
                      onClick={() => setModalAbierto(MODAL.LIQUIDACION)}
                      className="px-2.5 py-1.5 rounded bg-indigo-600/30 border border-indigo-500/50 hover:bg-indigo-600/50 text-indigo-200 font-bold text-xs transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
                      title="Ver e imprimir liquidación de caja de este contenedor o exportar a Excel"
                    >
                      <Receipt size={14} className="inline-block shrink-0" />
                      <span>Liquidación Caja</span>
                    </button>
                    {userRole === ROL.SUPERADMIN && (formData.estado_documentario === ESTADO_DOCUMENTARIO.ATENCION_TOTAL || formData.estado_documentario?.includes('CON LEVANTE')) && (
                      <button onClick={handleDesbloquearLevante} className="px-2.5 py-1.5 rounded bg-amber-600/20 border border-amber-500/40 hover:bg-amber-600/30 text-amber-300 font-bold text-xs transition-colors flex items-center gap-1.5"><Unlock size={14} className="inline-block shrink-0" /> Desbloquear Levante</button>
                    )}
                    <button onClick={() => setModalAbierto(MODAL.NUEVA_DAM)} className="px-2.5 py-1.5 rounded bg-teal-600/20 border border-teal-500/40 hover:bg-teal-600/30 text-teal-300 font-bold text-xs transition-colors flex items-center gap-1.5"><FileText size={14} className="inline-block shrink-0" /> + DAM Rápida</button>
                    <button onClick={() => setModalAbierto(MODAL.ELIMINAR)} className="px-2 py-1.5 rounded text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center justify-center" title="Eliminar Expediente"><Trash2 size={15} className="inline-block shrink-0" /></button>
                  </>
                )}
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {isReadOnly && (
                <div className="p-3 bg-amber-950/40 border border-amber-600/50 rounded-lg flex items-center gap-2.5 text-amber-300 text-xs">
                  <span className="text-base">🔒</span><div><strong>Expediente Atendido Totalmente (ATE. TOTAL):</strong> Solo usuarios administradores pueden modificar los datos de esta operación cerrada.</div>
                </div>
              )}

              {/* KPIs ADUANEROS Y DE CARGA */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-2.5"><span className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">FOB Declarado</span><div className="text-base font-bold font-mono text-emerald-400">${formData.fob_usd || '0.00'}</div></div>
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-2.5"><span className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Flete Marítimo</span><div className="text-base font-bold font-mono text-sky-400">${formData.flete_usd || '0.00'}</div></div>
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-2.5"><span className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Total CIF Est. (CFR)</span><div className="text-base font-bold font-mono text-slate-100">${cfr}</div></div>
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-2.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Estado Documentario</span>
                  <div className={`text-xs font-bold font-mono uppercase mt-1 ${formData.estado_documentario?.includes(ESTADO_DOCUMENTARIO.ATENCION_TOTAL) || formData.estado_documentario?.includes('CON LEVANTE') ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {formData.estado_documentario || ESTADO_DOCUMENTARIO.SIN_NUMERAR}
                  </div>
                </div>
              </div>

              {viewMode === 'MODIFICAR' && relaciones.estadoCuenta && (
                <TermometroFinanciero estadoCuenta={relaciones.estadoCuenta} onVerLiquidacion={() => setModalAbierto(MODAL.LIQUIDACION)} />
              )}

              {viewMode === 'MODIFICAR' && <AvancePagos key={selectedId} kpiGastos={relaciones.kpiGastos} />}

              <FormularioExpediente
                formData={formData} handleFormChange={handleFormChange} isReadOnly={isReadOnly}
                hasUnsavedChanges={hasUnsavedChanges} isGuardando={isGuardando} viewMode={viewMode}
                onGuardar={handleGuardar} onCrearProveedor={() => setModalAbierto(MODAL.PROVEEDOR)}
                opcionesImportadores={opcionesImportadores} opcionesProveedores={opcionesProveedores}
                opcionesAgentes={opcionesAgentes} opcionesAlmacenes={opcionesAlmacenes}
              />

              {viewMode === 'MODIFICAR' && (
                <RelacionesExpediente
                  key={selectedId}
                  damsVinculadas={relaciones.damsVinculadas} gastosVinculados={relaciones.gastosVinculados}
                  isLoadingSub={isLoadingSub}
                  onNuevaDam={() => setModalAbierto(MODAL.NUEVA_DAM)} onNuevoGasto={() => setModalAbierto(MODAL.NUEVO_GASTO)}
                />
              )}
            </div>
          </>
        )}
      </section>

      {modalAbierto === MODAL.NUEVA_DAM && (
        <ModalNuevaDam
          expediente={datosExpediente}
          onCerrar={cerrarModal}
          onCreada={() => { actualizarRelaciones(); recargarMaestros(); }}
        />
      )}

      {modalAbierto === MODAL.NUEVO_GASTO && (
        <ModalNuevoGasto
          expediente={datosExpediente} damsVinculadas={relaciones.damsVinculadas}
          opcionesConceptos={opcionesConceptos} opcionesProveedores={opcionesProveedores} opcionesTiposDoc={opcionesTiposDoc}
          onProveedorCreado={agregarProveedor} onCerrar={cerrarModal} onRegistrado={actualizarRelaciones}
        />
      )}

      {modalAbierto === MODAL.ELIMINAR && (
        <ModalEliminarExpediente idMaestro={selectedId} onCerrar={cerrarModal} onEliminado={alEliminarExpediente} />
      )}

      <ModalLiquidacionContenedor
        isOpen={modalAbierto === MODAL.LIQUIDACION}
        idMaestro={selectedId}
        onClose={cerrarModal}
      />

      <ModalCrearProveedorRapido
        isOpen={modalAbierto === MODAL.PROVEEDOR}
        onClose={cerrarModal}
        onProveedorCreado={alCrearProveedorDelExpediente}
        categoriaDefecto={CATEGORIA_PROVEEDOR.INTERNACIONAL}
      />
    </main>
  );
};

export default Logistica;
