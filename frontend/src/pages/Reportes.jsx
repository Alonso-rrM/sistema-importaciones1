import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { descargarExcel } from '../utils/exportUtils';

const Reportes = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [opcionesImportadores, setOpcionesImportadores] = useState([]);

  // Filtros globales del módulo
  const [rangoTemporal, setRangoTemporal] = useState('TODOS');
  const [importadorFiltro, setImportadorFiltro] = useState('');
  const [tcRef, setTcRef] = useState('3.80');
  const [isExportandoSabana, setIsExportandoSabana] = useState(false);

  useEffect(() => {
    cargarImportadores();
  }, []);

  useEffect(() => {
    cargarCockpit();
  }, [rangoTemporal, importadorFiltro, tcRef]);

  const cargarImportadores = async () => {
    try {
      const res = await api.get('/importadores/');
      setOpcionesImportadores(res.data?.data || res.data || []);
    } catch {
      // Si falla, continúa
    }
  };

  const calcularFechasFiltro = () => {
    const hoy = new Date();
    let fecha_inicio = null;
    let fecha_fin = null;

    if (rangoTemporal === 'MES') {
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      fecha_inicio = inicioMes.toISOString().slice(0, 10);
      fecha_fin = hoy.toISOString().slice(0, 10);
    } else if (rangoTemporal === 'TRIMESTRE') {
      const hace90 = new Date();
      hace90.setDate(hace90.getDate() - 90);
      fecha_inicio = hace90.toISOString().slice(0, 10);
      fecha_fin = hoy.toISOString().slice(0, 10);
    } else if (rangoTemporal === 'ANIO') {
      const inicioAnio = new Date(hoy.getFullYear(), 0, 1);
      fecha_inicio = inicioAnio.toISOString().slice(0, 10);
      fecha_fin = hoy.toISOString().slice(0, 10);
    }

    return { fecha_inicio, fecha_fin };
  };

  const cargarCockpit = async () => {
    setLoading(true);
    try {
      const { fecha_inicio, fecha_fin } = calcularFechasFiltro();
      const params = {
        tipo_cambio_referencial: parseFloat(tcRef) || 3.80
      };
      if (fecha_inicio) params.fecha_inicio = fecha_inicio;
      if (fecha_fin) params.fecha_fin = fecha_fin;
      if (importadorFiltro) params.id_importador = importadorFiltro;

      const res = await api.get('/reportes/analytics-cockpit', { params });
      setData(res.data);
    } catch (err) {
      alert(`Error al cargar analítica: ${err.response?.data?.detail || err.message || 'Error desconocido'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleExportarSabana = async () => {
    setIsExportandoSabana(true);
    try {
      const { fecha_inicio, fecha_fin } = calcularFechasFiltro();
      const params = {
        tipo_cambio_referencial: parseFloat(tcRef) || 3.80
      };
      if (fecha_inicio) params.fecha_inicio = fecha_inicio;
      if (fecha_fin) params.fecha_fin = fecha_fin;
      if (importadorFiltro) params.id_importador = importadorFiltro;

      await descargarExcel(
        '/reportes/sabana-liquidaciones/exportar',
        params,
        'Sabana_Consolidada_Liquidaciones.xlsx'
      );
    } catch (err) {
      alert(`Error al exportar Sábana: ${err.response?.data?.detail || err.message || 'Error desconocido'}`);
    } finally {
      setIsExportandoSabana(false);
    }
  };

  const pipeline = data?.pipeline_logistico || { en_transito: 0, en_puerto: 0, en_almacen: 0, con_levante: 0, total_contenedores: 0 };
  const semaforoUSD = data?.semaforo_tesoreria?.usd || { vencidos: 0, por_vencer_7d: 0, al_dia: 0, total_deuda: 0 };
  const semaforoPEN = data?.semaforo_tesoreria?.pen || { vencidos: 0, por_vencer_7d: 0, al_dia: 0, total_deuda: 0 };
  const etapas = data?.distribucion_etapas || {};

  const totalEtapasEquiv = (etapas.FIJO_DESPACHO?.total_equiv_usd || 0) + (etapas.POST_LEVANTE?.total_equiv_usd || 0) + (etapas.EXTRAORDINARIO?.total_equiv_usd || 0);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-y-auto font-sans p-5 md:p-8 space-y-6">
      
      {/* 1. CABECERA DEL MÓDULO */}
      <header className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-2xl shadow-inner">
            📊
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white tracking-tight">Centro de Reportes & Analítica Gerencial</h1>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                Torre de Control
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Pipeline de contenedores, semáforo financiero de tesorería y descargas de sábanas consolidadas
            </p>
          </div>
        </div>

        {/* BARRA DE FILTROS SUPERIOR */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Rango Temporal */}
          <div className="flex bg-slate-900 border border-slate-700 rounded-lg p-0.5">
            {[
              { id: 'TODOS', label: 'Histórico' },
              { id: 'MES', label: 'Este Mes' },
              { id: 'TRIMESTRE', label: '90 Días' },
              { id: 'ANIO', label: 'Este Año' }
            ].map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRangoTemporal(r.id)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer ${
                  rangoTemporal === r.id
                    ? 'bg-teal-600 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Selector de Importador */}
          <select
            value={importadorFiltro}
            onChange={e => setImportadorFiltro(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500 max-w-[180px] truncate"
          >
            <option value="">Todos los Importadores</option>
            {opcionesImportadores.map(imp => (
              <option key={imp.id_importador} value={imp.id_importador}>{imp.nombre}</option>
            ))}
          </select>

          {/* TC Referencial */}
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs">
            <span className="text-slate-400 text-[10px]">T.C:</span>
            <input
              type="number"
              step="0.01"
              value={tcRef}
              onChange={e => setTcRef(e.target.value)}
              className="w-12 bg-slate-950 border border-slate-700 rounded px-1 text-center text-xs text-white font-mono"
              title="Tipo de cambio referencial para consolidar gastos en USD"
            />
          </div>

          <button
            type="button"
            onClick={cargarCockpit}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 text-xs transition"
            title="Refrescar métricas"
          >
            🔄
          </button>
        </div>
      </header>

      {/* 2. COCKPIT EJECUTIVO VISUAL (3 TARJETAS ESTRATÉGICAS) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <span>⚡</span>
            <span>Cockpit Ejecutivo en Tiempo Real</span>
          </h2>
          {loading && <span className="text-xs text-teal-400 font-mono animate-pulse">Actualizando indicadores...</span>}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          
          {/* TARJETA 1: PIPELINE DEL EMBUDO LOGÍSTICO (PUNTO 1 APROBADO) */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">🚢</span>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Pipeline de Carga</h3>
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-teal-300 border border-teal-500/30">
                  {pipeline.total_contenedores} Contenedores
                </span>
              </div>

              {/* Embudo Visual */}
              <div className="space-y-2.5 my-2">
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-sky-300 font-medium">1. En Tránsito (Navegando)</span>
                    <span className="font-mono font-bold text-white">{pipeline.en_transito}</span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                    <div className="bg-sky-500 h-full rounded-full transition-all" style={{ width: `${pipeline.total_contenedores ? (pipeline.en_transito / pipeline.total_contenedores) * 100 : 0}%` }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-amber-300 font-medium">2. En Puerto (Arribado Callao)</span>
                    <span className="font-mono font-bold text-white">{pipeline.en_puerto}</span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                    <div className="bg-amber-500 h-full rounded-full transition-all" style={{ width: `${pipeline.total_contenedores ? (pipeline.en_puerto / pipeline.total_contenedores) * 100 : 0}%` }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-purple-300 font-medium">3. En Almacén Temporal</span>
                    <span className="font-mono font-bold text-white">{pipeline.en_almacen}</span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                    <div className="bg-purple-500 h-full rounded-full transition-all" style={{ width: `${pipeline.total_contenedores ? (pipeline.en_almacen / pipeline.total_contenedores) * 100 : 0}%` }}></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-emerald-300 font-medium">4. Con Levante Autorizado</span>
                    <span className="font-mono font-bold text-white">{pipeline.con_levante}</span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                    <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${pipeline.total_contenedores ? (pipeline.con_levante / pipeline.total_contenedores) * 100 : 0}%` }}></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
              <span>Monitoreo de flujo físico</span>
              <span className="text-teal-400 font-bold">{pipeline.total_contenedores > 0 ? ((pipeline.con_levante / pipeline.total_contenedores) * 100).toFixed(0) : 0}% liberados</span>
            </div>
          </div>

          {/* TARJETA 2: SEMÁFORO DE TESORERÍA (PUNTO 3 APROBADO) */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">⚖️</span>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Semáforo de Tesorería</h3>
                </div>
                <span className="text-[10px] font-mono text-slate-400 uppercase">Cuentas por Pagar</span>
              </div>

              {/* Los 3 Semáforos en Multimoneda */}
              <div className="space-y-2 text-xs">
                {/* Vencidos (Rojo) */}
                <div className="bg-rose-950/20 border border-rose-500/30 rounded-lg p-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
                    <span className="text-[11px] font-bold text-rose-300">Vencidos (Expirados)</span>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-rose-400 font-bold">${semaforoUSD.vencidos?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                    <div className="text-[10px] text-slate-400">S/ {semaforoPEN.vencidos?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                  </div>
                </div>

                {/* Por Vencer 7 días (Amarillo) */}
                <div className="bg-amber-950/20 border border-amber-500/30 rounded-lg p-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                    <span className="text-[11px] font-bold text-amber-300">Por Vencer (Próx. 7D)</span>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-amber-400 font-bold">${semaforoUSD.por_vencer_7d?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                    <div className="text-[10px] text-slate-400">S/ {semaforoPEN.por_vencer_7d?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                  </div>
                </div>

                {/* Al Día (Verde) */}
                <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-lg p-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    <span className="text-[11px] font-bold text-emerald-300">Al Día (&gt; 7 días)</span>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-emerald-400 font-bold">${semaforoUSD.al_dia?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                    <div className="text-[10px] text-slate-400">S/ {semaforoPEN.al_dia?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 text-[10px] text-slate-400 flex items-center justify-between font-mono">
              <span>Deuda Total Activa:</span>
              <strong className="text-slate-200">${semaforoUSD.total_deuda?.toLocaleString('en-US', { minimumFractionDigits: 2 })} | S/ {semaforoPEN.total_deuda?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
            </div>
          </div>

          {/* TARJETA 3: ESTRUCTURA DE GASTOS POR ETAPA (LOS 3 UNIVERSOS) */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">🏷️</span>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Estructura por Etapa</h3>
                </div>
                <span className="text-[10px] font-mono text-teal-400 font-bold">
                  ${totalEtapasEquiv.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                </span>
              </div>

              {/* Desglose de Universos */}
              <div className="space-y-2.5 my-2">
                {/* FIJO DESPACHO */}
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-300 font-medium">1. Fijos Despacho</span>
                    <span className="font-mono font-bold text-teal-300">
                      ${(etapas.FIJO_DESPACHO?.total_equiv_usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                    <div className="bg-teal-500 h-full rounded-full transition-all" style={{ width: `${totalEtapasEquiv ? ((etapas.FIJO_DESPACHO?.total_equiv_usd || 0) / totalEtapasEquiv) * 100 : 0}%` }}></div>
                  </div>
                </div>

                {/* POST LEVANTE */}
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-300 font-medium">2. Post-Levante</span>
                    <span className="font-mono font-bold text-sky-300">
                      ${(etapas.POST_LEVANTE?.total_equiv_usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                    <div className="bg-sky-500 h-full rounded-full transition-all" style={{ width: `${totalEtapasEquiv ? ((etapas.POST_LEVANTE?.total_equiv_usd || 0) / totalEtapasEquiv) * 100 : 0}%` }}></div>
                  </div>
                </div>

                {/* EXTRAORDINARIO */}
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-amber-300 font-medium">3. Extraordinarios (Demurrage)</span>
                    <span className="font-mono font-bold text-amber-400">
                      ${(etapas.EXTRAORDINARIO?.total_equiv_usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                    <div className="bg-amber-500 h-full rounded-full transition-all" style={{ width: `${totalEtapasEquiv ? ((etapas.EXTRAORDINARIO?.total_equiv_usd || 0) / totalEtapasEquiv) * 100 : 0}%` }}></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
              <span>Fugas de dinero extraordinarias:</span>
              <span className={`font-bold ${((etapas.EXTRAORDINARIO?.total_equiv_usd || 0) > 0) ? 'text-amber-400' : 'text-emerald-400'}`}>
                {totalEtapasEquiv > 0 ? (((etapas.EXTRAORDINARIO?.total_equiv_usd || 0) / totalEtapasEquiv) * 100).toFixed(1) : 0}% del costo
              </span>
            </div>
          </div>

        </div>
      </section>

      {/* 3. CENTRO DE EXPORTACIÓN Y GENERADOR DE REPORTES */}
      <section className="space-y-4 pt-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <span>📁</span>
          <span>Biblioteca Central de Reportes & Datasets para Tablas Dinámicas</span>
        </h2>

        {/* TARJETA DESTACADA: SÁBANA CONSOLIDADA DE TODOS LOS CONTENEDORES */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-teal-500/40 rounded-xl p-5 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-teal-500/20 text-teal-300 border border-teal-500/40 uppercase tracking-wider">
                El Reporte Maestro
              </span>
              <h3 className="text-base font-bold text-white tracking-tight">
                Sábana Consolidada de Liquidaciones (Todos los Contenedores)
              </h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Exporta un único libro de Excel continuo con <strong>todos los contenedores y todos sus gastos abiertos en filas consecutivas</strong>.
              Formato tabular plano puro (Tidy Data: <em>cero celdas combinadas y cero filas vacías</em>) con tipo de cambio referencial y vouchers,
              diseñado para que abras el archivo y crees <strong>Tablas Dinámicas</strong> instantáneas para cruzar proveedores, etapas y landed cost global.
            </p>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 font-mono pt-1">
              <span>• Columnas: 26 campos</span>
              <span>• Agrupación: Factura / Contenedor / DAM</span>
              <span>• Filtro activo: {rangoTemporal}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleExportarSabana}
            disabled={isExportandoSabana}
            className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-2.5 shrink-0 disabled:opacity-50 cursor-pointer"
          >
            <span className="text-base">{isExportandoSabana ? '⏳' : '📥'}</span>
            <span>{isExportandoSabana ? 'Generando Sábana Global...' : 'Descargar Sábana Global (.xlsx)'}</span>
          </button>
        </div>

        {/* ESPACIO RESERVADO PARA REPORTES FUTUROS CON GERENCIA */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="bg-slate-900/50 border border-slate-800 border-dashed rounded-xl p-4 flex items-center gap-3 text-slate-500">
            <span className="text-2xl">📈</span>
            <div>
              <h4 className="text-xs font-bold text-slate-400">Reporte Ejecutivo de Landed Cost (Costo Unitario Puesto)</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">Espacio reservado para las fórmulas de costeo que se definan con Gerencia General.</p>
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 border-dashed rounded-xl p-4 flex items-center gap-3 text-slate-500">
            <span className="text-2xl">🏢</span>
            <div>
              <h4 className="text-xs font-bold text-slate-400">Ranking & Exposición de Proveedores Logísticos</h4>
              <p className="text-[11px] text-slate-500 mt-0.5">Módulo de auditoría de tarifas de navieras y almacenes en preparación.</p>
            </div>
          </div>
        </div>

      </section>

    </div>
  );
};

export default Reportes;

