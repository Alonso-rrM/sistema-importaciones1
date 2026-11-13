/**
 * Campo de RUC con consulta a SUNAT. Al validar, propone la razón social abreviada en el campo de nombre
 * y permite alternar entre la abreviada y la completa.
 */
import { useState } from 'react';
import api from '../../services/api';
import { useInteraccion } from '../../context/interaccion';
import { acortarRazonSocial } from '../../utils/textUtils';

const CLASE_ENTRADA = 'flex-1 text-xs bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white font-mono focus:outline-none focus:border-teal-500';

export function useConsultaRuc(cambiarCampo) {
  const { avisar } = useInteraccion();
  const [consultando, setConsultando] = useState(false);
  const [razonSocial, setRazonSocial] = useState(null); // { original, sugerido }

  const consultar = async (ruc) => {
    if (ruc.length !== 11 || Number.isNaN(Number(ruc))) {
      avisar('El RUC debe tener 11 dígitos numéricos.', 'error');
      return;
    }
    setConsultando(true);
    try {
      const { data } = await api.get(`/sunat/ruc/${ruc}`);
      if (data.razon_social) {
        const original = data.razon_social;
        const sugerido = data.nombre_sugerido || acortarRazonSocial(original);
        setRazonSocial({ original, sugerido });
        cambiarCampo('nombre', sugerido);
        avisar('✅ SUNAT: RUC válido. Razón social acortada sugerida. Puedes editarla libremente.', 'exito');
      } else {
        avisar('RUC no encontrado en el padrón de SUNAT.', 'info');
      }
    } catch {
      avisar('No se pudo consultar el RUC en SUNAT.', 'error');
    } finally {
      setConsultando(false);
    }
  };

  return { consultando, razonSocial, consultar, olvidar: () => setRazonSocial(null) };
}

export default function CampoRuc({ campo, valor, onCambio, consulta }) {
  return (
    <div className="flex gap-2">
      <input
        type="text"
        maxLength={11}
        value={valor}
        onChange={(e) => onCambio(e.target.value.replace(/\D/g, ''))}
        placeholder={campo.placeholder}
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
  );
}
