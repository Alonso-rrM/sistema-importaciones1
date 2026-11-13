import { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import useDebounce from '../hooks/useDebounce';
import { Tags, Search, Plus, Pencil, Trash2, RotateCcw, Ban, FileText } from 'lucide-react';
import { CLASE_ADUANERA, ESTADO_PAGO, ESTADO_REGISTRO, MONEDA, TIPO_GASTO } from '../constants';
import { useInteraccion } from '../context/interaccion';

const Conceptos = () => {
  const { avisar, confirmar } = useInteraccion();
  const [conceptos, setConceptos] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [viewMode, setViewMode] = useState('DETALLE'); // 'DETALLE', 'NUEVO', 'MODIFICAR'
  
  const [busqueda, setBusqueda] = useState('');
  const debouncedSearch = useDebounce(busqueda, 300);
  const [filtroEstado, setFiltroEstado] = useState(ESTADO_REGISTRO.ACTIVO); // 'ACTIVO', 'INACTIVO', 'TODOS'

  const [isGuardando, setIsGuardando] = useState(false);

  // Gastos y Observaciones específicas asociadas al Concepto seleccionado
  const [gastosConcepto, setGastosConcepto] = useState([]);
  const [isLoadingGastos, setIsLoadingGastos] = useState(false);
  const [busquedaGastoObs, setBusquedaGastoObs] = useState('');
  const debouncedGastoObs = useDebounce(busquedaGastoObs, 300);
  const [editandoObsId, setEditandoObsId] = useState(null);
  const [textoObsTemp, setTextoObsTemp] = useState('');
  const [isGuardandoObs, setIsGuardandoObs] = useState(false);

  // Clase aduanera: papel del concepto en el despacho. La usa el backend para decidir el levante de la DAM.
  const CLASES_ADUANERAS = [
    { valor: CLASE_ADUANERA.NINGUNA, etiqueta: 'Ninguna', detalle: 'No interviene en el levante (fletes, almacenaje, multas, etc.)' },
    { valor: CLASE_ADUANERA.TRIBUTO, etiqueta: 'Tributo', detalle: 'Forma parte de la proforma junto con la percepción' },
    { valor: CLASE_ADUANERA.PERCEPCION, etiqueta: 'Percepción', detalle: 'Forma parte de la proforma junto con los tributos' },
    { valor: CLASE_ADUANERA.OMC, etiqueta: CLASE_ADUANERA.OMC, detalle: 'Ajuste de valor OMC: su pago libera o cierra la DAM' },
  ];
  const etiquetaClase = (valor) => CLASES_ADUANERAS.find(c => c.valor === valor)?.etiqueta || 'Ninguna';
  const colorClase = (valor) => (!valor || valor === CLASE_ADUANERA.NINGUNA)
    ? 'bg-slate-500/10 text-slate-400 border-slate-500/30'
    : 'bg-sky-500/10 text-sky-300 border-sky-500/30';

  const estadoInicial = {
    nombre: '',
    descripcion: '',
    tipo_gasto: TIPO_GASTO.FIJO_DESPACHO,
    clase_aduanera: CLASE_ADUANERA.NINGUNA
  };
  const [formData, setFormData] = useState(estadoInicial);

  useEffect(() => {
    cargarConceptos();
  }, [filtroEstado]);

  useEffect(() => {
    if (selectedId && viewMode === 'DETALLE') {
      cargarGastosDelConcepto(selectedId, debouncedGastoObs);
    } else {
      setGastosConcepto([]);
    }
  }, [selectedId, viewMode, debouncedGastoObs]);

  const cargarGastosDelConcepto = async (idConcepto, searchTexto = '') => {
    setIsLoadingGastos(true);
    try {
      const params = { id_concepto: idConcepto, limit: 50 };
      if (searchTexto.trim()) params.search = searchTexto.trim();
      const res = await api.get('/gastos/', { params });
      setGastosConcepto(res.data?.data || []);
    } catch (err) {
      console.error('Error al cargar gastos del concepto:', err);
    } finally {
      setIsLoadingGastos(false);
    }
  };

  const handleGuardarObservacionGasto = async (idGasto) => {
    setIsGuardandoObs(true);
    try {
      await api.put(`/gastos/${idGasto}`, {
        observaciones: textoObsTemp.trim() || null
      });
      avisar('✅ Observación específica del gasto actualizada correctamente.', 'exito');
      setEditandoObsId(null);
      setTextoObsTemp('');
      if (selectedId) cargarGastosDelConcepto(selectedId, debouncedGastoObs);
    } catch (error) {
      const msg = error.response?.data?.detail || 'No se pudo guardar la observación del gasto.';
      avisar(`❌ ${msg}`, 'error');
    } finally {
      setIsGuardandoObs(false);
    }
  };

  const cargarConceptos = async () => {
    try {
      const mostrarInactivos = filtroEstado !== ESTADO_REGISTRO.ACTIVO;
      const respuesta = await api.get(`/conceptos/?mostrar_inactivos=${mostrarInactivos}`);
      const data = respuesta.data || [];
      setConceptos(data);

      if (selectedId) {
        const found = data.find(c => c.id_concepto === selectedId);
        if (found) {
          setFormData({
            nombre: found.nombre || '',
            descripcion: found.descripcion || '',
            tipo_gasto: found.tipo_gasto || TIPO_GASTO.FIJO_DESPACHO,
            clase_aduanera: found.clase_aduanera || CLASE_ADUANERA.NINGUNA
          });
        }
      } else if (data.length > 0 && viewMode === 'DETALLE') {
        setSelectedId(data[0].id_concepto);
        setFormData({
          nombre: data[0].nombre || '',
          descripcion: data[0].descripcion || '',
          tipo_gasto: data[0].tipo_gasto || TIPO_GASTO.FIJO_DESPACHO,
          clase_aduanera: data[0].clase_aduanera || CLASE_ADUANERA.NINGUNA
        });
      }
    } catch (error) {
      console.error('Error al cargar conceptos:', error);
      avisar('No se pudo conectar con la base de datos.', 'error');
    }
  };


  const handleSelect = (c) => {
    setSelectedId(c.id_concepto);
    setViewMode('DETALLE');
    setFormData({
      nombre: c.nombre || '',
      descripcion: c.descripcion || '',
      tipo_gasto: c.tipo_gasto || TIPO_GASTO.FIJO_DESPACHO,
      clase_aduanera: c.clase_aduanera || CLASE_ADUANERA.NINGUNA
    });
  };

  const handleNuevo = () => {
    setSelectedId(null);
    setViewMode('NUEVO');
    setFormData(estadoInicial);
  };

  const handleModificar = () => {
    if (!selectedConcepto) return;
    setViewMode('MODIFICAR');
    setFormData({
      nombre: selectedConcepto.nombre || '',
      descripcion: selectedConcepto.descripcion || '',
      tipo_gasto: selectedConcepto.tipo_gasto || TIPO_GASTO.FIJO_DESPACHO,
      clase_aduanera: selectedConcepto.clase_aduanera || CLASE_ADUANERA.NINGUNA
    });
  };

  const handleCancelarEdicion = () => {
    if (selectedConcepto) {
      setViewMode('DETALLE');
      setFormData({
        nombre: selectedConcepto.nombre || '',
        descripcion: selectedConcepto.descripcion || '',
        tipo_gasto: selectedConcepto.tipo_gasto || TIPO_GASTO.FIJO_DESPACHO,
        clase_aduanera: selectedConcepto.clase_aduanera || CLASE_ADUANERA.NINGUNA
      });
    } else {
      setViewMode('DETALLE');
      if (conceptosFiltrados.length > 0) {
        handleSelect(conceptosFiltrados[0]);
      }
    }
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!formData.nombre.trim()) {
      avisar('El nombre del concepto de pago es obligatorio.', 'error');
      return;
    }

    setIsGuardando(true);
    try {
      const payload = {
        nombre: formData.nombre.trim(),
        descripcion: formData.descripcion?.trim() || null,
        tipo_gasto: formData.tipo_gasto || TIPO_GASTO.FIJO_DESPACHO,
        clase_aduanera: formData.clase_aduanera || CLASE_ADUANERA.NINGUNA
      };

      if (viewMode === 'NUEVO') {
        const res = await api.post('/conceptos/', payload);
        avisar('✅ Concepto registrado exitosamente.', 'exito');
        await cargarConceptos();
        setSelectedId(res.data?.id_concepto || null);
        setViewMode('DETALLE');
      } else if (viewMode === 'MODIFICAR') {
        await api.put(`/conceptos/${selectedId}`, payload);
        avisar('✅ Concepto actualizado exitosamente.', 'exito');
        await cargarConceptos();
        setViewMode('DETALLE');
      }
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Error al guardar el registro.';
      avisar(`❌ ${errorMsg}`, 'error');
    } finally {
      setIsGuardando(false);
    }
  };

  const handleEliminar = async () => {
    if (!selectedConcepto) return;
    const ok = await confirmar({
      titulo: 'Desactivar registro',
      mensaje: `¿Estás seguro de desactivar el concepto "${selectedConcepto.nombre}"?\nEsta acción lo marcará como INACTIVO.`,
      textoAceptar: 'Desactivar',
      peligro: true,
    });
    if (!ok) return;

    try {
      await api.delete(`/conceptos/${selectedId}`);
      avisar(`✅ Concepto "${selectedConcepto.nombre}" desactivado correctamente.`, 'exito');
      await cargarConceptos();
    } catch (error) {
      const detalle = error.response?.data?.detail || 'No se pudo desactivar.';
      avisar(`❌ ${detalle}`, 'error');
    }
  };

  const handleRestaurar = async () => {
    if (!selectedConcepto) return;
    try {
      await api.put(`/conceptos/${selectedId}/restaurar`);
      avisar(`✅ Concepto "${selectedConcepto.nombre}" restaurado a ACTIVO.`, 'exito');
      await cargarConceptos();
    } catch (error) {
      const detalle = error.response?.data?.detail || 'No se pudo restaurar.';
      avisar(`❌ ${detalle}`, 'error');
    }
  };

  const handleEliminarFisico = async () => {
    if (!selectedConcepto) return;
    const confirmacion = await confirmar({
      titulo: 'Eliminar definitivamente',
      mensaje: `⚠️ ATENCIÓN: ¿Deseas eliminar DEFINITIVAMENTE el concepto "${selectedConcepto.nombre}"?\n\nEsta acción NO se puede deshacer y fallará si tiene gastos asociados.`,
      textoAceptar: 'Eliminar definitivamente',
      peligro: true,
    });
    if (!confirmacion) return;

    try {
      await api.delete(`/conceptos/${selectedId}/fisico`);
      avisar(`✅ Concepto "${selectedConcepto.nombre}" eliminado definitivamente.`, 'exito');
      setSelectedId(null);
      await cargarConceptos();
    } catch (error) {
      const detalle = error.response?.data?.detail || 'No se pudo eliminar definitivamente.';
      avisar(`❌ ${detalle}`, 'error');
    }
  };

  const conceptosFiltrados = useMemo(() => {
    return conceptos.filter((c) => {
      const coincideBusqueda = 
        (c.nombre || '').toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        (c.descripcion || '').toLowerCase().includes(debouncedSearch.toLowerCase());

      if (filtroEstado === ESTADO_REGISTRO.ACTIVO) return coincideBusqueda && c.estado_registro === ESTADO_REGISTRO.ACTIVO;
      if (filtroEstado === ESTADO_REGISTRO.INACTIVO) return coincideBusqueda && c.estado_registro === ESTADO_REGISTRO.INACTIVO;
      return coincideBusqueda;
    });
  }, [conceptos, debouncedSearch, filtroEstado]);

  const selectedConcepto = useMemo(() => {
    return conceptos.find(c => c.id_concepto === selectedId) || null;
  }, [conceptos, selectedId]);

  const esInactivoSeleccionado = selectedConcepto?.estado_registro === ESTADO_REGISTRO.INACTIVO;

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      
      {/* HEADER DE MÓDULO */}
      <header className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-xl shadow-inner">
            <Tags size={20} className="inline-block shrink-0 text-teal-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-tight">Catálogo de Conceptos de Pago</h1>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                Módulo Catálogos
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Clasificación contable para gastos de importación (Flete, Almacenaje, Agenciamiento, Cuadrilla, etc.)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleNuevo}
            className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-lg transition-colors shadow-lg shadow-teal-600/20 flex items-center gap-1.5 cursor-pointer"
          >
            <Plus size={14} className="shrink-0" />
            <span>Nuevo Concepto</span>
          </button>
        </div>
      </header>

      {/* MASTER-DETAIL GRID */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 p-5 min-h-0 overflow-hidden">
        
        {/* BANDEJA IZQUIERDA (38%) */}
        <section className="lg:col-span-5 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl min-h-0">
          
          <div className="p-3.5 border-b border-slate-800 bg-slate-900/60 space-y-2.5 shrink-0">
            <div className="relative">
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por Nombre o Descripción..."
                className="w-full pl-9 pr-4 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500 transition-all"
              />
              <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 text-xs">
                <Search size={14} className="inline-block shrink-0" />
              </span>
              {busqueda && (
                <button onClick={() => setBusqueda('')} className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-white text-xs">✕</button>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => setFiltroEstado(ESTADO_REGISTRO.ACTIVO)}
                className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                  filtroEstado === ESTADO_REGISTRO.ACTIVO
                    ? 'bg-teal-600 text-white shadow'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Activos ({conceptos.filter(c => c.estado_registro === ESTADO_REGISTRO.ACTIVO).length})
              </button>
              <button
                type="button"
                onClick={() => setFiltroEstado(ESTADO_REGISTRO.INACTIVO)}
                className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                  filtroEstado === ESTADO_REGISTRO.INACTIVO
                    ? 'bg-teal-600 text-white shadow'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Inactivos ({conceptos.filter(c => c.estado_registro === ESTADO_REGISTRO.INACTIVO).length})
              </button>
              <button
                type="button"
                onClick={() => setFiltroEstado('TODOS')}
                className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                  filtroEstado === 'TODOS'
                    ? 'bg-teal-600 text-white shadow'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Todos ({conceptos.length})
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80 p-2 space-y-1 min-h-0">
            {conceptosFiltrados.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No se encontraron conceptos de pago con los criterios indicados.
              </div>
            ) : (
              conceptosFiltrados.map((c) => {
                const isSelected = selectedId === c.id_concepto;
                const isInactivo = c.estado_registro === ESTADO_REGISTRO.INACTIVO;

                return (
                  <div
                    key={c.id_concepto}
                    onClick={() => handleSelect(c)}
                    className={`p-3 rounded-lg cursor-pointer transition-all border ${
                      isSelected
                        ? 'row-selected'
                        : 'bg-white dark:bg-slate-900/60 hover:bg-slate-50 dark:hover:bg-slate-800/70 border-slate-200 dark:border-slate-800/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-teal-400">#{c.id_concepto}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          isInactivo
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        }`}>
                          {c.estado_registro || ESTADO_REGISTRO.ACTIVO}
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        c.tipo_gasto === TIPO_GASTO.FIJO_DESPACHO
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : c.tipo_gasto === TIPO_GASTO.POST_LEVANTE
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                      }`}>
                        {c.tipo_gasto === TIPO_GASTO.FIJO_DESPACHO ? 'Fijo Despacho' : c.tipo_gasto === TIPO_GASTO.POST_LEVANTE ? 'Post-Levante' : 'Extraordinario'}
                      </span>
                    </div>
                    {c.clase_aduanera && c.clase_aduanera !== CLASE_ADUANERA.NINGUNA && (
                      <div className="mt-1.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${colorClase(c.clase_aduanera)}`} title="Clase aduanera: interviene en el levante de la DAM">
                          Aduana: {etiquetaClase(c.clase_aduanera)}
                        </span>
                      </div>
                    )}

                    <div className="mt-1.5 text-xs font-semibold text-slate-200 truncate">
                      {c.nombre}
                    </div>
                    {c.descripcion && (
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">
                        {c.descripcion}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* PANEL DERECHO WORKSTATION (62%) */}
        <section className="lg:col-span-7 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl min-h-0">

          {!selectedConcepto && viewMode !== 'NUEVO' ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-500">
              <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-3xl mb-4 shadow-inner">
                <Tags size={32} className="inline-block shrink-0 text-teal-400" />
              </div>
              <h3 className="text-base font-bold text-slate-300">Ficha de Concepto de Gasto</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1.5">
                Seleccione un concepto de la bandeja izquierda para ver o actualizar sus parámetros contables.
              </p>
              <button
                onClick={handleNuevo}
                className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-teal-600/20 flex items-center gap-1.5"
              >
                <Plus size={14} className="shrink-0" />
                <span>Registrar Nuevo Concepto</span>
              </button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-5 space-y-5">
              
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-base font-bold text-white tracking-tight">
                      {viewMode === 'NUEVO' ? 'Nuevo Concepto de Pago' : selectedConcepto?.nombre}
                    </h2>
                    {viewMode !== 'NUEVO' && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        esInactivoSeleccionado
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      }`}>
                        {selectedConcepto?.estado_registro || ESTADO_REGISTRO.ACTIVO}
                      </span>
                    )}
                  </div>

                  {viewMode === 'DETALLE' && (
                    <div className="flex items-center gap-2">
                      {!esInactivoSeleccionado ? (
                        <>
                          <button
                            onClick={handleModificar}
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Pencil size={13} className="shrink-0" />
                            <span>Modificar</span>
                          </button>
                          <button
                            onClick={handleEliminar}
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 size={13} className="shrink-0" />
                            <span>Desactivar</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={handleRestaurar}
                            className="px-2.5 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCcw size={13} className="shrink-0" />
                            <span>Restaurar</span>
                          </button>
                          <button
                            onClick={handleEliminarFisico}
                            className="px-2.5 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Ban size={13} className="shrink-0" />
                            <span>Eliminar Definitivo</span>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {viewMode !== 'NUEVO' && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-1 border-t border-slate-800/80">
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">ID</span>
                      <span className="font-mono text-slate-200">#{selectedConcepto?.id_concepto}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">Concepto</span>
                      <span className="text-teal-400 font-semibold truncate block">{selectedConcepto?.nombre}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">Estado</span>
                      <span className="text-slate-200 font-semibold">{selectedConcepto?.estado_registro}</span>
                    </div>
                  </div>
                )}
              </div>

              {viewMode === 'DETALLE' ? (
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                    <FileText size={15} className="text-teal-400 shrink-0" />
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      Datos del Concepto
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-lg space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Denominación</span>
                      <span className="font-bold text-slate-100 text-sm">{selectedConcepto?.nombre}</span>
                    </div>

                    <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-lg space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Etapa Logística (KPI)</span>
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold border mt-0.5 ${
                        selectedConcepto?.tipo_gasto === TIPO_GASTO.FIJO_DESPACHO
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : selectedConcepto?.tipo_gasto === TIPO_GASTO.POST_LEVANTE
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                      }`}>
                        {selectedConcepto?.tipo_gasto === TIPO_GASTO.FIJO_DESPACHO
                          ? '1. Gasto Fijo Operativo (Despacho)'
                          : selectedConcepto?.tipo_gasto === TIPO_GASTO.POST_LEVANTE
                          ? '2. Gasto Post-Levante (Devolución/Entrega)'
                          : '3. Gasto Extraordinario (Eventualidades)'}
                      </span>
                    </div>

                    <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-lg space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Clase Aduanera (Levante)</span>
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold border mt-0.5 ${colorClase(selectedConcepto?.clase_aduanera)}`}>
                        {etiquetaClase(selectedConcepto?.clase_aduanera)}
                      </span>
                      <span className="block text-[10px] text-slate-500">
                        {CLASES_ADUANERAS.find(c => c.valor === (selectedConcepto?.clase_aduanera || CLASE_ADUANERA.NINGUNA))?.detalle}
                      </span>
                    </div>

                    <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-lg space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Descripción / Justificación</span>
                      <span className="text-slate-200 text-xs">{selectedConcepto?.descripcion || 'Sin descripción detallada'}</span>
                    </div>
                  </div>

                  {/* SECCIÓN DE OBSERVACIONES ESPECÍFICAS DE GASTOS DE ESTE CONCEPTO */}
                  <div className="pt-4 border-t border-slate-800 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                          <span>💬 Observaciones en Gastos Específicos de "{selectedConcepto?.nombre}"</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                            {gastosConcepto.length}
                          </span>
                        </h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Registre o busque comentarios específicos de Tesorería para cada gasto de este concepto (ej. sobrecostos, días extra, aforo).
                        </p>
                      </div>

                      <div className="relative w-full sm:w-72">
                        <input
                          type="text"
                          value={busquedaGastoObs}
                          onChange={(e) => setBusquedaGastoObs(e.target.value)}
                          placeholder="Buscar en observaciones, DAM, Factura..."
                          className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500"
                        />
                        <span className="absolute inset-y-0 left-2.5 flex items-center text-slate-400 text-xs">
                          <Search size={12} className="inline-block shrink-0" />
                        </span>
                        {busquedaGastoObs && (
                          <button
                            type="button"
                            onClick={() => setBusquedaGastoObs('')}
                            className="absolute inset-y-0 right-2.5 flex items-center text-slate-400 hover:text-white text-xs"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>

                    {isLoadingGastos ? (
                      <div className="p-6 text-center text-slate-400 text-xs">
                        Cargando gastos registrados con este concepto...
                      </div>
                    ) : gastosConcepto.length === 0 ? (
                      <div className="p-6 text-center text-slate-500 text-xs bg-slate-900/50 border border-slate-800/80 rounded-lg">
                        No se encontraron gastos registrados para este concepto{busquedaGastoObs ? ` con el filtro "${busquedaGastoObs}"` : ''}.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                        {gastosConcepto.map((g) => {
                          const isEditingThis = editandoObsId === g.id_gasto;
                          const simbolo = g.moneda === MONEDA.PEN ? 'S/' : '$';
                          return (
                            <div
                              key={g.id_gasto}
                              className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 text-xs space-y-2 hover:border-slate-700 transition-colors"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono font-bold text-teal-400">Gasto #{g.id_gasto}</span>
                                  <span className="bg-slate-800 px-1.5 py-0.5 rounded font-mono text-[10px] text-slate-300">
                                    DAM: {g.dam_numero || 'N/A'}
                                  </span>
                                  {g.maestro_factura && (
                                    <span className="bg-slate-800 px-1.5 py-0.5 rounded font-mono text-[10px] text-slate-300">
                                      Fact: {g.maestro_factura}
                                    </span>
                                  )}
                                  <span className="text-slate-400 truncate max-w-[180px]">
                                    {g.proveedor_nombre || 'Sin Proveedor'}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-slate-200">
                                    {simbolo} {parseFloat(g.monto_original || 0).toFixed(2)}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                    g.estado_pago === ESTADO_PAGO.PENDIENTE
                                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                      : g.estado_pago === ESTADO_PAGO.PARCIAL
                                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                  }`}>
                                    {g.estado_pago}
                                  </span>
                                </div>
                              </div>

                              {isEditingThis ? (
                                <div className="pt-1 space-y-2">
                                  <textarea
                                    rows={2}
                                    value={textoObsTemp}
                                    onChange={(e) => setTextoObsTemp(e.target.value)}
                                    placeholder='Ej: "Sobrecosto 4 días extra por demora en aforo físico"...'
                                    className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-amber-500/50 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500 resize-y"
                                  />
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => { setEditandoObsId(null); setTextoObsTemp(''); }}
                                      className="px-2.5 py-1 text-[11px] font-semibold text-slate-400 hover:text-slate-200"
                                    >
                                      Cancelar
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isGuardandoObs}
                                      onClick={() => handleGuardarObservacionGasto(g.id_gasto)}
                                      className="px-3 py-1 bg-teal-600 hover:bg-teal-500 text-white rounded text-[11px] font-bold transition-colors disabled:opacity-50 cursor-pointer"
                                    >
                                      {isGuardandoObs ? 'Guardando...' : 'Guardar Observación'}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-start justify-between gap-3 pt-1 border-t border-slate-800/70">
                                  <div className="flex-1">
                                    {g.observaciones ? (
                                      <p className="text-[11px] text-amber-300/95 italic">
                                        💬 <strong className="not-italic text-amber-400">Observación:</strong> "{g.observaciones}"
                                      </p>
                                    ) : (
                                      <p className="text-[11px] text-slate-500 italic">
                                        Sin observación específica registrada en este gasto.
                                      </p>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditandoObsId(g.id_gasto);
                                      setTextoObsTemp(g.observaciones || '');
                                    }}
                                    className="text-[11px] font-semibold text-teal-400 hover:text-teal-300 shrink-0 flex items-center gap-1 cursor-pointer"
                                  >
                                    <Pencil size={11} className="inline-block shrink-0" />
                                    <span>{g.observaciones ? 'Editar' : '+ Agregar observación'}</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <form onSubmit={handleGuardar} className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Pencil size={15} className="text-teal-400 shrink-0" />
                      <span>{viewMode === 'NUEVO' ? 'Registro de Concepto' : 'Edición de Concepto'}</span>
                    </h3>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                        Nombre del Concepto *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.nombre}
                        onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                        placeholder="Ej. Flete Internacional, Almacenaje Callao, Gastos de Despacho..."
                        className="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-teal-500 font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                        Etapa Logística (Clasificación para KPIs) *
                      </label>
                      <select
                        value={formData.tipo_gasto}
                        onChange={(e) => setFormData({ ...formData, tipo_gasto: e.target.value })}
                        className="w-full text-xs font-bold bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-teal-300 focus:outline-none focus:border-teal-500"
                      >
                        <option value={TIPO_GASTO.FIJO_DESPACHO}>1. Gasto Fijo Operativo (Ruta Crítica Despacho)</option>
                        <option value={TIPO_GASTO.POST_LEVANTE}>2. Gasto Post-Levante (Devolución de Vacío / Entrega)</option>
                        <option value={TIPO_GASTO.EXTRAORDINARIO}>3. Gasto Extraordinario (Multas / Eventualidades)</option>
                      </select>
                      <p className="text-[10px] text-slate-500 mt-1">
                        Determina cómo medirá el sistema el avance de pagos de este concepto en la barra de progreso del contenedor.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                        Clase Aduanera (Levante de la DAM) *
                      </label>
                      <select
                        value={formData.clase_aduanera}
                        onChange={(e) => setFormData({ ...formData, clase_aduanera: e.target.value })}
                        className="w-full text-xs font-bold bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sky-300 focus:outline-none focus:border-sky-500"
                      >
                        {CLASES_ADUANERAS.map(c => (
                          <option key={c.valor} value={c.valor}>{c.etiqueta} — {c.detalle}</option>
                        ))}
                      </select>
                      <p className="text-[10px] text-slate-500 mt-1">
                        El sistema da el levante de la DAM cuando los gastos de clase Tributo y Percepción están pagados. Ya no depende del nombre del concepto.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                        Descripción (Opcional)
                      </label>
                      <textarea
                        rows={3}
                        value={formData.descripcion}
                        onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                        placeholder="Detalles sobre este concepto o su aplicación contable..."
                        className="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-teal-500 resize-none"
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
                        <span>Guardar Concepto</span>
                      )}
                    </button>
                  </div>
                </form>
              )}

            </div>
          )}
        </section>

      </div>
    </div>
  );
};

export default Conceptos;
