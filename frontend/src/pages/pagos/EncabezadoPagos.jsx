import { useNavigate } from 'react-router-dom';
import { AlertTriangle, FileText, Landmark, Scale } from 'lucide-react';
import { ROL } from '../../constants';

/** Encabezado de Liquidación de Pagos: TC SUNAT del día, modo consulta y accesos a Gastos y Vouchers. */
export default function EncabezadoPagos({ tcOficial, onRegistrarTc, esUsuarioOperaciones, userRole }) {
  const navigate = useNavigate();
  return (
    <header className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-xl shadow-inner">
          <Scale size={20} className="inline-block shrink-0 text-purple-400" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-white tracking-tight">Liquidación de Pagos</h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
              Módulo Tesorería
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Idempotencia Activa
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Amortización transaccional de obligaciones contra Vouchers bancarios con conciliación cambiaria
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className={`px-3 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-2 ${tcOficial ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
          <span>{tcOficial ? `TC SUNAT hoy: ${parseFloat(tcOficial.precio_venta).toFixed(4)}` : 'TC SUNAT de hoy no registrado'}</span>
          {!esUsuarioOperaciones && (
            <button type="button" onClick={onRegistrarTc} className="underline font-sans font-semibold hover:opacity-80">
              {tcOficial ? 'Corregir' : 'Registrar'}
            </button>
          )}
        </div>
        {esUsuarioOperaciones && (
          <div className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-1.5">
            <AlertTriangle size={14} className="inline-block shrink-0" />
            <span>Modo Consulta ({userRole === ROL.AUDITOR ? 'Rol Auditoría' : 'Rol Logística'})</span>
          </div>
        )}
        <button
          onClick={() => navigate('/app/gastos')}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5"
        >
          <FileText size={14} className="inline-block shrink-0" />
          <span>Ver Registro de Gastos</span>
        </button>
        <button
          onClick={() => navigate('/app/vouchers')}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5"
        >
          <Landmark size={14} className="inline-block shrink-0" />
          <span>Ver Vouchers Bancarios</span>
        </button>
      </div>
    </header>
  );
}
