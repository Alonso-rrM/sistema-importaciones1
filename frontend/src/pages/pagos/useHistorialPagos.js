/** Pagos realizados (pestaña Historial): búsqueda y paginación. Solo consulta mientras la pestaña está abierta. */
import { useCallback, useState } from 'react';
import api from '../../services/api';
import { avisoDeCarga, useInteraccion } from '../../context/interaccion';
import useConsulta from '../../hooks/useConsulta';
import useDebounce from '../../hooks/useDebounce';

export default function useHistorialPagos(activo) {
  const { avisar } = useInteraccion();
  const [busqueda, setBusqueda] = useState('');
  const busquedaDiferida = useDebounce(busqueda, 400);
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(20);

  const consultar = useCallback(() => api.get('/pagos/', {
    params: { page: pagina, limit: limite, search: busquedaDiferida.trim() || undefined },
  }).then((r) => r.data), [pagina, limite, busquedaDiferida]);

  const { datos, cargando, recargar } = useConsulta(activo ? consultar : null, {
    alFallar: (error) => avisoDeCarga(avisar, 'el historial de pagos')(error),
  });

  return {
    pagos: datos?.data || [],
    totalRegistros: datos?.total_registros || 0,
    totalPaginas: datos?.total_paginas || 1,
    cargando,
    recargar: () => recargar().catch((error) => avisoDeCarga(avisar, 'el historial de pagos')(error)),
    busqueda, setBusqueda, pagina, setPagina, limite, setLimite,
  };
}
