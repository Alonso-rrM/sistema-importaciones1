import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import useDebounce from '../hooks/useDebounce';

const Conceptos = () => {
  const [conceptos, setConceptos] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [viewMode, setViewMode] = useState('DETALLE'); // 'DETALLE', 'NUEVO', 'MODIFICAR'
  
  const [busqueda, setBusqueda] = useState('');
  const debouncedSearch = useDebounce(busqueda, 300);
  const [filtroEstado, setFiltroEstado] = useState('ACTIVO'); // 'ACTIVO', 'INACTIVO', 'TODOS'

  const [isGuardando, setIsGuardando] = useState(false);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  const estadoInicial = {
    nombre: '',
    descripcion: '',
    tipo_gasto: 'FIJO_DESPACHO'
  };
  const [formData, setFormData] = useState(estadoInicial);

  useEffect(() => {
    cargarConceptos();
  }, [filtroEstado]);

  const cargarConceptos = async () => {
    try {
      const mostrarInactivos = filtroEstado !== 'ACTIVO';
      const respuesta = await api.get(`/conceptos/?mostrar_inactivos=${mostrarInactivos}`);
      const data = respuesta.data || [];
      setConceptos(data);

      if (selectedId) {
        const found = data.find(c => c.id_concepto === selectedId);
        if (found) {
          setFormData({
            nombre: found.nombre || '',
            descripcion: found.descripcion || '',
            tipo_gasto: found.tipo_gasto || 'FIJO_DESPACHO'
          });
        }
      } else if (data.length > 0 && viewMode === 'DETALLE') {
        setSelectedId(data[0].id_concepto);
        setFormData({
          nombre: data[0].nombre || '',
          descripcion: data[0].descripcion || '',
          tipo_gasto: data[0].tipo_gasto || 'FIJO_DESPACHO'
        });
      }
    } catch (error) {
      console.error('Error al cargar conceptos:', error);
      mostrarAlerta('No se pudo conectar con la base de datos.', 'error');
    }
  };

  const mostrarAlerta = (texto, tipo = 'info') => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);
  };

  const handleSelect = (c) => {
    setSelectedId(c.id_concepto);
    setViewMode('DETALLE');
    setFormData({
      nombre: c.nombre || '',
      descripcion: c.descripcion || '',
      tipo_gasto: c.tipo_gasto || 'FIJO_DESPACHO'
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
      tipo_gasto: selectedConcepto.tipo_gasto || 'FIJO_DESPACHO'
    });
  };

  const handleCancelarEdicion = () => {
    if (selectedConcepto) {
      setViewMode('DETALLE');
      setFormData({
        nombre: selectedConcepto.nombre || '',
        descripcion: selectedConcepto.descripcion || '',
        tipo_gasto: selectedConcepto.tipo_gasto || 'FIJO_DESPACHO'
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
      mostrarAlerta('El nombre del concepto de pago es obligatorio.', 'error');
      return;
    }

    setIsGuardando(true);
    try {
      const payload = {
        nombre: formData.nombre.trim(),
        descripcion: formData.descripcion?.trim() || null,
        tipo_gasto: formData.tipo_gasto || 'FIJO_DESPACHO'
      };

      if (viewMode === 'NUEVO') {
        const res = await api.post('/conceptos/', payload);
        mostrarAlerta('✅ Concepto registrado exitosamente.', 'exito');
        await cargarConceptos();
        setSelectedId(res.data?.id_concepto || null);
        setViewMode('DETALLE');
      } else if (viewMode === 'MODIFICAR') {
        await api.put(`/conceptos/${selectedId}`, payload);
        mostrarAlerta('✅ Concepto actualizado exitosamente.', 'exito');
        await cargarConceptos();
        setViewMode('DETALLE');
      }
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Error al guardar el registro.';
      mostrarAlerta(`❌ ${errorMsg}`, 'error');
    } finally {
      setIsGuardando(false);
    }
  };

  const handleEliminar = async () => {
    if (!selectedConcepto) return;
    const confirmar = window.confirm(`¿Estás seguro de desactivar el concepto "${selectedConcepto.nombre}"?\nEsta acción lo marcará como INACTIVO.`);
    if (!confirmar) return;

    try {
      await api.delete(`/conceptos/${selectedId}`);
      mostrarAlerta(`✅ Concepto "${selectedConcepto.nombre}" desactivado correctamente.`, 'exito');
      await cargarConceptos();
    } catch (error) {
      const detalle = error.response?.data?.detail || 'No se pudo desactivar.';
      mostrarAlerta(`❌ ${detalle}`, 'error');
    }
  };

  const handleRestaurar = async () => {
    if (!selectedConcepto) return;
    try {
      await api.put(`/conceptos/${selectedId}/restaurar`);
      mostrarAlerta(`✅ Concepto "${selectedConcepto.nombre}" restaurado a ACTIVO.`, 'exito');
      await cargarConceptos();
    } catch (error) {
      const detalle = error.response?.data?.detail || 'No se pudo restaurar.';
      mostrarAlerta(`❌ ${detalle}`, 'error');
    }
  };

  const handleEliminarFisico = async () => {
    if (!selectedConcepto) return;
    const confirmacion = window.confirm(
      `⚠️ ATENCIÓN: ¿Deseas eliminar DEFINITIVAMENTE el concepto "${selectedConcepto.nombre}"?\n\nEsta acción NO se puede deshacer y fallará si tiene gastos asociados.`
    );
    if (!confirmacion) return;

    try {
      await api.delete(`/conceptos/${selectedId}/fisico`);
      mostrarAlerta(`✅ Concepto "${selectedConcepto.nombre}" eliminado definitivamente.`, 'exito');
      setSelectedId(null);
      await cargarConceptos();
    } catch (error) {
      const detalle = error.response?.data?.detail || 'No se pudo eliminar definitivamente.';
      mostrarAlerta(`❌ ${detalle}`, 'error');
    }
  };

  const conceptosFiltrados = useMemo(() => {
    return conceptos.filter((c) => {
      const coincideBusqueda = 
        (c.nombre || '').toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        (c.descripcion || '').toLowerCase().includes(debouncedSearch.toLowerCase());

      if (filtroEstado === 'ACTIVO') return coincideBusqueda && c.estado_registro === 'ACTIVO';
      if (filtroEstado === 'INACTIVO') return coincideBusqueda && c.estado_registro === 'INACTIVO';
      return coincideBusqueda;
    });
  }, [conceptos, debouncedSearch, filtroEstado]);

  const selectedConcepto = useMemo(() => {
    return conceptos.find(c => c.id_concepto === selectedId) || null;
  }, [conceptos, selectedId]);

  const esInactivoSeleccionado = selectedConcepto?.estado_registro === 'INACTIVO';

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      
      {/* HEADER DE MÓDULO */}
      <header className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-xl shadow-inner">
            🏷️
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
            <span>+</span>
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
              <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 text-xs">🔍</span>
              {busqueda && (
                <button onClick={() => setBusqueda('')} className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-white text-xs">✕</button>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => setFiltroEstado('ACTIVO')}
                className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                  filtroEstado === 'ACTIVO'
                    ? 'bg-teal-600 text-white shadow'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Activos ({conceptos.filter(c => c.estado_registro === 'ACTIVO').length})
              </button>
              <button
                type="button"
                onClick={() => setFiltroEstado('INACTIVO')}
                className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                  filtroEstado === 'INACTIVO'
                    ? 'bg-teal-600 text-white shadow'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                Inactivos ({conceptos.filter(c => c.estado_registro === 'INACTIVO').length})
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
                const isInactivo = c.estado_registro === 'INACTIVO';

                return (
                  <div
                    key={c.id_concepto}
                    onClick={() => handleSelect(c)}
                    className={`p-3 rounded-lg cursor-pointer transition-all border ${
                      isSelected
                        ? 'bg-teal-950/30 border-teal-500/80 shadow-md ring-1 ring-teal-500/20'
                        : 'bg-slate-900/60 hover:bg-slate-800/70 border-slate-800/80'
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
                          {c.estado_registro || 'ACTIVO'}
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        c.tipo_gasto === 'FIJO_DESPACHO'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : c.tipo_gasto === 'POST_LEVANTE'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                      }`}>
                        {c.tipo_gasto === 'FIJO_DESPACHO' ? 'Fijo Despacho' : c.tipo_gasto === 'POST_LEVANTE' ? 'Post-Levante' : 'Extraordinario'}
                      </span>
                    </div>

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
          
          {mensaje.texto && (
            <div className={`p-3 border-b text-xs flex items-center justify-between animate-fadeIn ${
              mensaje.tipo === 'exito'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : mensaje.tipo === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-teal-500/10 border-teal-500/30 text-teal-300'
            }`}>
              <span>{mensaje.texto}</span>
              <button onClick={() => setMensaje({ texto: '', tipo: '' })} className="hover:text-white">✕</button>
            </div>
          )}

          {!selectedConcepto && viewMode !== 'NUEVO' ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-500">
              <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-3xl mb-4 shadow-inner">
                🏷️
              </div>
              <h3 className="text-base font-bold text-slate-300">Ficha de Concepto de Gasto</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1.5">
                Seleccione un concepto de la bandeja izquierda para ver o actualizar sus parámetros contables.
              </p>
              <button
                onClick={handleNuevo}
                className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-teal-600/20"
              >
                + Registrar Nuevo Concepto
              </button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-5 space-y-5">
              
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-base font-bold text-white tracking-tight">
                      {viewMode === 'NUEVO' ? '✨ Nuevo Concepto de Pago' : selectedConcepto?.nombre}
                    </h2>
                    {viewMode !== 'NUEVO' && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        esInactivoSeleccionado
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      }`}>
                        {selectedConcepto?.estado_registro || 'ACTIVO'}
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
                            <span>✏️</span>
                            <span>Modificar</span>
                          </button>
                          <button
                            onClick={handleEliminar}
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <span>🗑️</span>
                            <span>Desactivar</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={handleRestaurar}
                            className="px-2.5 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <span>♻️</span>
                            <span>Restaurar</span>
                          </button>
                          <button
                            onClick={handleEliminarFisico}
                            className="px-2.5 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <span>🚫</span>
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
                    <span className="text-teal-400 text-sm">📋</span>
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
                        selectedConcepto?.tipo_gasto === 'FIJO_DESPACHO'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : selectedConcepto?.tipo_gasto === 'POST_LEVANTE'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                      }`}>
                        {selectedConcepto?.tipo_gasto === 'FIJO_DESPACHO'
                          ? '1. Gasto Fijo Operativo (Despacho)'
                          : selectedConcepto?.tipo_gasto === 'POST_LEVANTE'
                          ? '2. Gasto Post-Levante (Devolución/Entrega)'
                          : '3. Gasto Extraordinario (Eventualidades)'}
                      </span>
                    </div>

                    <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-lg space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Descripción / Justificación</span>
                      <span className="text-slate-200 text-xs">{selectedConcepto?.descripcion || 'Sin descripción detallada'}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleGuardar} className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <span className="text-teal-400">✏️</span>
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
                        <option value="FIJO_DESPACHO">1. Gasto Fijo Operativo (Ruta Crítica Despacho)</option>
                        <option value="POST_LEVANTE">2. Gasto Post-Levante (Devolución de Vacío / Entrega)</option>
                        <option value="EXTRAORDINARIO">3. Gasto Extraordinario (Multas / Eventualidades)</option>
                      </select>
                      <p className="text-[10px] text-slate-500 mt-1">
                        Determina cómo medirá el sistema el avance de pagos de este concepto en la barra de progreso del contenedor.
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
