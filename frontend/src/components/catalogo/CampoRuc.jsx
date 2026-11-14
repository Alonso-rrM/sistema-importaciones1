/** Campo de RUC con el botón de consulta a SUNAT (la lógica está en useConsultaRuc.js). */
import { validarRuc } from '../../utils/validaciones';

const CLASE_ENTRADA = 'flex-1 text-xs bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white font-mono focus:outline-none focus:border-teal-500';

export default function CampoRuc({ campo, valor, onCambio, consulta }) {
  // Aviso inmediato al completar los 11 dígitos (prefijo y dígito verificador)
  const error = valor.length === 11 ? validarRuc(valor).error : null;
  return (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          maxLength={11}
          value={valor}
          onChange={(e) => onCambio(e.target.value.replace(/\D/g, ''))}
          placeholder={campo.placeholder}
          aria-invalid={Boolean(error)}
          className={CLASE_ENTRADA}
        />
        <button
          type="button"
          onClick={() => consulta.consultar(valor)}
          disabled={consulta.consultando || valor.length !== 11}
          className="px-3 py-2 bg-teal-600/20 hover:bg-teal-600/30 disabled:opacity-40 text-teal-300 border border-teal-500/30 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap"
        >
          {consulta.consultando ? (
            <>
              <div className="w-3 h-3 border-2 border-teal-300 border-t-transparent rounded-full animate-spin" />
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
      {error && <p className="mt-1 text-[11px] text-rose-400">{error}</p>}
    </div>
  );
}
