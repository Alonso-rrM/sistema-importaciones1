/**
 * LIQUIDACIÓN DE PAGOS (Tesorería)
 * Compone la pantalla; cada parte vive en pages/pagos/:
 *   EncabezadoPagos (TC del día) · BandejaObligaciones · PanelLiquidacion · HistorialPagos
 */
import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Banknote, FileText } from 'lucide-react';
import api from '../services/api';
import useConsulta from '../hooks/useConsulta';
import useDebounce from '../hooks/useDebounce';
import { obtenerRol } from '../utils/session';
import { ROL } from '../constants';
import EncabezadoPagos from './pagos/EncabezadoPagos';
import BandejaObligaciones, { FILTRO_PENDIENTES } from './pagos/BandejaObligaciones';
import PanelLiquidacion from './pagos/PanelLiquidacion';
import HistorialPagos from './pagos/HistorialPagos';
import useHistorialPagos from './pagos/useHistorialPagos';
import useTipoCambioDelDia from './pagos/useTipoCambioDelDia';

const PESTANA = Object.freeze({ REGISTRAR: 'REGISTRAR', HISTORIAL: 'HISTORIAL' });

const Pagos = () => {
  const location = useLocation();
  // Rol solo para la interfaz (los permisos reales los valida el backend).
  // Solo Admin y Tesorería liquidan pagos; Logística y Auditoría quedan en modo consulta.
  const userRole = obtenerRol();
  const esUsuarioOperaciones = ![ROL.SUPERADMIN, ROL.FINANZAS].includes(userRole);

  const [activeTab, setActiveTab] = useState(PESTANA.REGISTRAR);
  const { tcOficial, tcSugerido, registrar: registrarTcOficial } = useTipoCambioDelDia();
  const historial = useHistorialPagos(activeTab === PESTANA.HISTORIAL);

  const consultarBancos = useCallback(() => api.get('/bancos/').then((r) => r.data?.data || r.data || []), []);
  const { datos: bancos } = useConsulta(consultarBancos, {
    inicial: [], alFallar: (error) => console.error('Error al cargar bancos:', error),
  });

  // ----- Bandeja de obligaciones -----
  const [busqueda, setBusqueda] = useState('');
  const busquedaDiferida = useDebounce(busqueda, 400);
  const [filtro, setFiltro] = useState(FILTRO_PENDIENTES);
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(20);
  const consultarGastos = useCallback(() => api.get('/gastos/', {
    params: { page: pagina, limit: limite, estado_pago: filtro || undefined, search: busquedaDiferida.trim() || undefined },
  }).then((r) => r.data), [pagina, limite, filtro, busquedaDiferida]);
  const { datos: paginaGastos, cargando, recargar } = useConsulta(consultarGastos, {
    alFallar: (error) => console.error('Error al cargar gastos:', error),
  });
  const gastos = paginaGastos?.data || [];

  // ----- Obligación seleccionada -----
  // `seleccion.vez` cambia en cada clic: el panel se vuelve a montar y su formulario empieza limpio
  const [seleccion, setSeleccion] = useState({ gasto: null, vez: 0 });
  const seleccionar = (gasto) => setSeleccion((s) => ({ gasto, vez: s.vez + 1 }));
  // Datos frescos del seleccionado tras un pago o una anulación (mismo gasto, sin reiniciar el panel)
  const gastoSeleccionado = gastos.find((g) => g.id_gasto === seleccion.gasto?.id_gasto) || seleccion.gasto;

  const recargarGastos = () => recargar().catch((error) => console.error('Error al cargar gastos:', error));

  // ?gasto_id=... en la URL: abre esa obligación (por ejemplo, desde el botón "Pagar" de Gastos)
  const idGastoEnUrl = new URLSearchParams(location.search).get('gasto_id');
  useEffect(() => {
    if (!idGastoEnUrl) return undefined;
    let vigente = true;
    api.get('/gastos/', { params: { search: String(idGastoEnUrl) } })
      .then((res) => {
        const encontrado = (res.data?.data || []).find((g) => String(g.id_gasto) === String(idGastoEnUrl));
        if (vigente && encontrado) setSeleccion((s) => ({ gasto: encontrado, vez: s.vez + 1 }));
      })
      .catch((error) => console.error('Error al auto-seleccionar gasto:', error));
    return () => { vigente = false; };
  }, [idGastoEnUrl]);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <EncabezadoPagos tcOficial={tcOficial} onRegistrarTc={registrarTcOficial}
        esUsuarioOperaciones={esUsuarioOperaciones} userRole={userRole} />

      {/* SELECTOR DE PESTAÑAS TESORERÍA */}
      <div className="px-6 pt-2 bg-slate-900/60 border-b border-slate-800 flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab(PESTANA.REGISTRAR)}
          className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-all border-b-2 flex items-center gap-2 cursor-pointer ${activeTab === PESTANA.REGISTRAR
              ? 'bg-slate-950 text-purple-400 border-purple-500 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-800/50'
            }`}
        >
          <Banknote size={15} className="inline-block shrink-0" />
          <span>Registrar Nuevo Pago</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab(PESTANA.HISTORIAL)}
          className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-all border-b-2 flex items-center gap-2 cursor-pointer ${activeTab === PESTANA.HISTORIAL
              ? 'bg-slate-950 text-purple-400 border-purple-500 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-800/50'
            }`}
        >
          <FileText size={15} className="inline-block shrink-0" />
          <span>Historial de Pagos Realizados</span>
          {historial.totalRegistros > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-500/20 text-purple-300 font-mono">
              {historial.totalRegistros}
            </span>
          )}
        </button>
      </div>

      {activeTab === PESTANA.REGISTRAR && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 p-5 min-h-0 overflow-hidden">
          <BandejaObligaciones
            gastos={gastos} cargando={cargando} seleccionado={gastoSeleccionado} onSeleccionar={seleccionar}
            busqueda={busqueda} setBusqueda={setBusqueda} filtro={filtro} setFiltro={setFiltro}
            pagina={pagina} setPagina={setPagina} limite={limite} setLimite={setLimite}
            totalPaginas={paginaGastos?.total_paginas || 1} totalRegistros={paginaGastos?.total_registros || 0}
          />
          <PanelLiquidacion
            key={`${gastoSeleccionado?.id_gasto ?? 'ninguno'}-${seleccion.vez}`}
            gasto={gastoSeleccionado} bancos={bancos} tcSugerido={tcSugerido}
            esUsuarioOperaciones={esUsuarioOperaciones} onPagoRegistrado={recargarGastos}
          />
        </div>
      )}

      {activeTab === PESTANA.HISTORIAL && <HistorialPagos historial={historial} onPagoAnulado={recargarGastos} />}
    </div>
  );
};

export default Pagos;
