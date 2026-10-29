import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import useDebounce from '../hooks/useDebounce';
import { acortarRazonSocial } from '../utils/textUtils';

const Importadores = () => {
  const [importadores, setImportadores] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [viewMode, setViewMode] = useState('DETALLE'); // 'DETALLE', 'NUEVO', 'MODIFICAR'
  
  const [busqueda, setBusqueda] = useState('');
  const debouncedSearch = useDebounce(busqueda, 300);
  const [filtroEstado, setFiltroEstado] = useState('ACTIVO'); // 'ACTIVO', 'INACTIVO', 'TODOS'
  
  const [buscandoRuc, setBuscandoRuc] = useState(false);
  const [sunatData, setSunatData] = useState(null);
  const [isGuardando, setIsGuardando] = useState(false);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  const estadoInicial = {
    ruc: '',
    nombre: ''
  };
  const [formData, setFormData] = useState(estadoInicial);

  useEffect(() => {
    cargarImportadores();
  }, [filtroEstado]);

  const cargarImportadores = async () => {
    try {
      const mostrarInactivos = filtroEstado !== 'ACTIVO';
      const respuesta = await api.get(`/importadores/?mostrar_inactivos=${mostrarInactivos}`);
      const data = respuesta.data || [];
      setImportadores(data);

      if (selectedId) {
        const found = data.find(i => i.id_importador === selectedId);
        if (found) {
          setFormData({ ruc: found.ruc || '', nombre: found.nombre || '' });
        }
      } else if (data.length > 0 && viewMode === 'DETALLE') {
        setSelectedId(data[0].id_importador);
        setFormData({ ruc: data[0].ruc || '', nombre: data[0].nombre || '' });
      }
    } catch (error) {
      console.error('Error al cargar importadores:', error);
      mostrarAlerta('No se pudo conectar con la base de datos.', 'error');
    }
  };

  const mostrarAlerta = (texto, tipo = 'info') => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);
  };

  const handleSelect = (imp) => {
    setSelectedId(imp.id_importador);
    setViewMode('DETALLE');
    setFormData({
      ruc: imp.ruc || '',
      nombre: imp.nombre || ''
    });
  };

  const handleNuevo = () => {
    setSelectedId(null);
    setViewMode('NUEVO');
    setSunatData(null);
    setFormData(estadoInicial);
  };

  const handleModificar = () => {
    if (!selectedImportador) return;
    setViewMode('MODIFICAR');
    setSunatData(null);
    setFormData({
      ruc: selectedImportador.ruc || '',
      nombre: selectedImportador.nombre || ''
    });
  };

  const handleCancelarEdicion = () => {
    setSunatData(null);
    if (selectedImportador) {
      setViewMode('DETALLE');
      setFormData({
        ruc: selectedImportador.ruc || '',
        nombre: selectedImportador.nombre || ''
      });
    } else {
      setViewMode('DETALLE');
      if (importadoresFiltrados.length > 0) {
        handleSelect(importadoresFiltrados[0]);
      }
    }
  };

  // Búsqueda RUC en SUNAT con acortamiento inteligente
  const buscarRuc = async () => {
    if (formData.ruc.length !== 11 || isNaN(formData.ruc)) {
      mostrarAlerta('El RUC debe tener 11 dígitos numéricos.', 'error');
      return;
    }
    setBuscandoRuc(true);
    try {
      const respuesta = await api.get(`/sunat/ruc/${formData.ruc}`);
      if (respuesta.data.razon_social) {
        const original = respuesta.data.razon_social;
        const sugerido = respuesta.data.nombre_sugerido || acortarRazonSocial(original);
        setSunatData({ original, sugerido });
        setFormData(prev => ({
          ...prev,
          nombre: sugerido
        }));
        mostrarAlerta(`✅ SUNAT: RUC válido. Razón social acortada sugerida. Puedes editarla libremente.`, 'exito');
      } else {
        mostrarAlerta('RUC no encontrado en el padrón de SUNAT.', 'info');
      }
    } catch (error) {
      mostrarAlerta('No se pudo consultar el RUC en SUNAT.', 'error');
    } finally {
      setBuscandoRuc(false);
    }
  };

  // Guardar (Crear o Actualizar)
  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!formData.nombre.trim()) {
      mostrarAlerta('La Razón Social es obligatoria.', 'error');
      return;
    }

    setIsGuardando(true);
    try {
      const payload = {
        ruc: formData.ruc.trim() || null,
        nombre: formData.nombre.trim()
      };

      if (viewMode === 'NUEVO') {
        const res = await api.post('/importadores/', payload);
        mostrarAlerta('✅ Importador registrado exitosamente.', 'exito');
        await cargarImportadores();
        setSelectedId(res.data?.id_importador || null);
        setViewMode('DETALLE');
      } else if (viewMode === 'MODIFICAR') {
        await api.put(`/importadores/${selectedId}`, payload);
        mostrarAlerta('✅ Importador actualizado exitosamente.', 'exito');
        await cargarImportadores();
        setViewMode('DETALLE');
      }
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Error al guardar el registro.';
      mostrarAlerta(`❌ ${errorMsg}`, 'error');
    } finally {
      setIsGuardando(false);
    }
  };

  // Desactivación lógica
  const handleEliminar = async () => {
    if (!selectedImportador) return;
    const confirmar = window.confirm(`¿Estás seguro de desactivar al importador "${selectedImportador.nombre}"?\nEsta acción lo marcará como INACTIVO.`);
    if (!confirmar) return;

    try {
      await api.delete(`/importadores/${selectedId}`);
      mostrarAlerta(`✅ Importador "${selectedImportador.nombre}" desactivado correctamente.`, 'exito');
      await cargarImportadores();
    } catch (error) {
      const detalle = error.response?.data?.detail || 'No se pudo desactivar.';
      mostrarAlerta(`❌ ${detalle}`, 'error');
    }
  };

  // Restaurar
  const handleRestaurar = async () => {
    if (!selectedImportador) return;
    try {
      await api.put(`/importadores/${selectedId}/restaurar`);
      mostrarAlerta(`✅ Importador "${selectedImportador.nombre}" restaurado a ACTIVO.`, 'exito');
      await cargarImportadores();
    } catch (error) {
      const detalle = error.response?.data?.detail || 'No se pudo restaurar.';
      mostrarAlerta(`❌ ${detalle}`, 'error');
    }
  };

  // Eliminación física definitiva
  const handleEliminarFisico = async () => {
    if (!selectedImportador) return;
    const confirmacion = window.confirm(
      `⚠️ ATENCIÓN: ¿Deseas eliminar DEFINITIVAMENTE al importador "${selectedImportador.nombre}"?\n\nEsta acción NO se puede deshacer y fallará si tiene operaciones vinculadas.`
    );
    if (!confirmacion) return;

    try {
      await api.delete(`/importadores/${selectedId}/fisico`);
      mostrarAlerta(`✅ Importador "${selectedImportador.nombre}" eliminado definitivamente.`, 'exito');
      setSelectedId(null);
      await cargarImportadores();
    } catch (error) {
      const detalle = error.response?.data?.detail || 'No se pudo eliminar definitivamente.';
      mostrarAlerta(`❌ ${detalle}`, 'error');
    }
  };

  const importadoresFiltrados = useMemo(() => {
    return importadores.filter((imp) => {
      const coincideBusqueda = 
        (imp.nombre || '').toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        (imp.ruc || '').includes(debouncedSearch);

      if (filtroEstado === 'ACTIVO') return coincideBusqueda && imp.estado_registro === 'ACTIVO';
      if (filtroEstado === 'INACTIVO') return coincideBusqueda && imp.estado_registro === 'INACTIVO';
      return coincideBusqueda;
    });
  }, [importadores, debouncedSearch, filtroEstado]);

  const selectedImportador = useMemo(() => {
    return importadores.find(i => i.id_importador === selectedId) || null;
  }, [importadores, selectedId]);

  const esInactivoSeleccionado = selectedImportador?.estado_registro === 'INACTIVO';

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      
      {/* HEADER DE MÓDULO UNIFICADO */}
      <header className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-xl shadow-inner">
            🏢
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-tight">Catálogo de Importadores</h1>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                Módulo Catálogos
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Gestión de empresas importadoras maestras con validación SUNAT y trazabilidad operativa
            </p>
          </div>
        </div>

        {/* ACCIÓN PRINCIPAL */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleNuevo}
            className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-lg transition-colors shadow-lg shadow-teal-600/20 flex items-center gap-1.5 cursor-pointer"
          >
            <span>+</span>
            <span>Nuevo Importador</span>
          </button>
        </div>
      </header>

      {/* WORKSTATION GRID MASTER-DETAIL (38% BANDEJA / 62% ESTACIÓN DE DETALLE) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 p-5 min-h-0 overflow-hidden">
        
        {/* ======================================================== */}
        {/* BANDEJA IZQUIERDA (38% / COL-SPAN-5) */}
        {/* ======================================================== */}
        <section className="lg:col-span-5 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl min-h-0">
          
          {/* BUSCADOR Y PESTAÑAS DE ESTADO */}
          <div className="p-3.5 border-b border-slate-800 bg-slate-900/60 space-y-2.5 shrink-0">
            <div className="relative">
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por RUC o Razón Social..."
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
                Activos ({importadores.filter(i => i.estado_registro === 'ACTIVO').length})
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
                Inactivos ({importadores.filter(i => i.estado_registro === 'INACTIVO').length})
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
                Todos ({importadores.length})
              </button>
            </div>
          </div>

          {/* LISTA DE TARJETAS DENSAS */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80 p-2 space-y-1 min-h-0">
            {importadoresFiltrados.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No se encontraron importadores con los criterios especificados.
              </div>
            ) : (
              importadoresFiltrados.map((imp) => {
                const isSelected = selectedId === imp.id_importador;
                const isInactivo = imp.estado_registro === 'INACTIVO';

                return (
                  <div
                    key={imp.id_importador}
                    onClick={() => handleSelect(imp)}
                    className={`p-3 rounded-lg cursor-pointer transition-all border ${
                      isSelected
                        ? 'bg-teal-950/30 border-teal-500/80 shadow-md ring-1 ring-teal-500/20'
                        : 'bg-slate-900/60 hover:bg-slate-800/70 border-slate-800/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-teal-400">#{imp.id_importador}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          isInactivo
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        }`}>
                          {imp.estado_registro || 'ACTIVO'}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-slate-400">
                        RUC: {imp.ruc || 'S/N'}
                      </span>
                    </div>

                    <div className="mt-1.5 text-xs font-semibold text-slate-200 truncate">
                      {imp.nombre}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* ======================================================== */}
        {/* PANEL DERECHO WORKSTATION (62% / COL-SPAN-7) */}
        {/* ======================================================== */}
        <section className="lg:col-span-7 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl min-h-0">
          
          {/* ALERTA DE MENSAJES */}
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

          {!selectedImportador && viewMode !== 'NUEVO' ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-500">
              <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-3xl mb-4 shadow-inner">
                🏢
              </div>
              <h3 className="text-base font-bold text-slate-300">Ficha Maestra de Importador</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1.5">
                Seleccione un importador de la bandeja izquierda para consultar o actualizar su información fiscal.
              </p>
              <button
                onClick={handleNuevo}
                className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-teal-600/20"
              >
                + Registrar Nuevo Importador
              </button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-5 space-y-5">
              
              {/* CABECERA DE LA FICHA SELECCIONADA */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-base font-bold text-white tracking-tight">
                      {viewMode === 'NUEVO' ? '✨ Nuevo Importador' : selectedImportador?.nombre}
                    </h2>
                    {viewMode !== 'NUEVO' && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        esInactivoSeleccionado
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      }`}>
                        {selectedImportador?.estado_registro || 'ACTIVO'}
                      </span>
                    )}
                  </div>

                  {/* ACCIONES SOBRE EL REGISTRO */}
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
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">ID Sistema</span>
                      <span className="font-mono text-slate-200">#{selectedImportador?.id_importador}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">RUC Fiscal</span>
                      <span className="font-mono text-teal-400 font-bold">{selectedImportador?.ruc || 'No declarado'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">Estado Contable</span>
                      <span className="text-slate-200 font-semibold">{selectedImportador?.estado_registro}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* MODO VISTA: DETALLE DE INFORMACIÓN */}
              {viewMode === 'DETALLE' ? (
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                    <span className="text-teal-400 text-sm">📋</span>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      Datos Generales de la Empresa
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-lg space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Razón Social</span>
                      <span className="font-bold text-slate-100 text-sm">{selectedImportador?.nombre}</span>
                    </div>

                    <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-lg space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Registro Único de Contribuyente (RUC)</span>
                      <span className="font-mono font-bold text-teal-300 text-sm">{selectedImportador?.ruc || 'Sin RUC'}</span>
                    </div>
                  </div>
                </div>
              ) : (
                /* MODO EDICIÓN / CREACIÓN DE IMPORTADOR */
                <form onSubmit={handleGuardar} className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <span className="text-teal-400">✏️</span>
                      <span>{viewMode === 'NUEVO' ? 'Formulario de Registro' : 'Edición de Datos Fiscales'}</span>
                    </h3>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-1.5">
                        RUC (11 Dígitos)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          maxLength={11}
                          value={formData.ruc}
                          onChange={(e) => setFormData({ ...formData, ruc: e.target.value.replace(/\D/g, '') })}
                          placeholder="Ej. 20123456789"
                          className="flex-1 text-xs font-mono bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-teal-500"
                        />
                        <button
                          type="button"
                          onClick={buscarRuc}
                          disabled={buscandoRuc || formData.ruc.length !== 11}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-teal-300 border border-teal-500/30 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          {buscandoRuc ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin"></div>
                              <span>Consultando...</span>
                            </>
                          ) : (
                            <>
                              <span>🔍</span>
                              <span>Validar SUNAT</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-bold text-slate-300 uppercase tracking-wide">
                          Razón Social / Nombre Comercial *
                        </label>
                        {sunatData?.original && (
                          <button
                            type="button"
                            onClick={() => {
                              const nuevoNombre = formData.nombre === sunatData.sugerido ? sunatData.original : sunatData.sugerido;
                              setFormData(prev => ({ ...prev, nombre: nuevoNombre }));
                            }}
                            className="text-[10px] text-teal-400 hover:text-teal-300 underline font-semibold cursor-pointer"
                          >
                            {formData.nombre === sunatData.sugerido ? '📄 Ver Razón Social Completa' : '✂️ Usar Nombre Acortado'}
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        required
                        value={formData.nombre}
                        onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                        placeholder="Nombre oficial o abreviado de la empresa..."
                        className="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:outline-none focus:border-teal-500 font-medium"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        💡 Puedes editar libremente este nombre para ajustarlo a tu estándar operativo.
                      </p>
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
                        <span>Guardar Importador</span>
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

export default Importadores;
