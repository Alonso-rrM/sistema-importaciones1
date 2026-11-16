/** Consulta de RUC en SUNAT para los formularios de catálogo: propone la razón social abreviada. */
import { useState } from 'react';
import api from '../../services/api';
import { mensajeDeError, useInteraccion } from '../../context/interaccion';
import { acortarRazonSocial } from '../../utils/textUtils';
import { validarRuc } from '../../utils/validaciones';

const PUEDE_GUARDAR_IGUAL = 'Puede escribir el nombre a mano y guardar igual.';

export default function useConsultaRuc(cambiarCampo) {
  const { avisar } = useInteraccion();
  const [consultando, setConsultando] = useState(false);
  const [razonSocial, setRazonSocial] = useState(null); // { original, sugerido }

  const consultar = async (ruc) => {
    const { error } = validarRuc(ruc);
    if (error) {
      avisar(error, 'error');
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
        avisar(`RUC no encontrado en el padrón de SUNAT. ${PUEDE_GUARDAR_IGUAL}`, 'info');
      }
    } catch (error) {
      // La consulta es solo una ayuda: si falla (SUNAT no responde, RUC de baja o no habido, sin token
      // configurado), se muestra el motivo y el registro se puede guardar igual.
      avisar(`SUNAT: ${mensajeDeError(error, 'no se pudo consultar el RUC.')} ${PUEDE_GUARDAR_IGUAL}`, 'advertencia');
    } finally {
      setConsultando(false);
    }
  };

  return { consultando, razonSocial, consultar, olvidar: () => setRazonSocial(null) };
}
