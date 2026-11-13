/** Consulta de RUC en SUNAT para los formularios de catálogo: propone la razón social abreviada. */
import { useState } from 'react';
import api from '../../services/api';
import { useInteraccion } from '../../context/interaccion';
import { acortarRazonSocial } from '../../utils/textUtils';

export default function useConsultaRuc(cambiarCampo) {
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
