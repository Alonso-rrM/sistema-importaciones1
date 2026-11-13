/**
 * Carga datos del servidor y los mantiene al día cuando cambian los parámetros de la consulta.
 *
 *   const consultar = useCallback(() => api.get('/gastos/', { params }).then((r) => r.data), [params...]);
 *   const { datos, cargando, recargar } = useConsulta(consultar, { inicial: [] });
 *
 * - `consultar` debe estar memorizada (useCallback): cuando cambian sus dependencias, se vuelve a consultar.
 * - `cargando` es verdadero mientras los datos no correspondan a la consulta actual.
 * - `recargar()` vuelve a consultar a pedido (por ejemplo, después de guardar) y devuelve los datos.
 * - Si `consultar` es null, no se consulta (útil para cargas condicionales, como una pestaña cerrada).
 * - Las respuestas que llegan tarde de una consulta anterior se descartan.
 */
import { useCallback, useEffect, useState } from 'react';

export default function useConsulta(consultar, { inicial = null, alFallar } = {}) {
  const [estado, setEstado] = useState({ datos: inicial, error: null, de: null });

  useEffect(() => {
    if (!consultar) return undefined;
    let vigente = true;
    consultar()
      .then((datos) => vigente && setEstado({ datos, error: null, de: consultar }))
      .catch((error) => {
        if (!vigente) return;
        setEstado((anterior) => ({ ...anterior, error, de: consultar }));
        alFallar?.(error);
      });
    return () => { vigente = false; };
    // alFallar es solo un aviso: no debe provocar una nueva consulta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultar]);

  const recargar = useCallback(async () => {
    if (!consultar) return undefined;
    const datos = await consultar();
    setEstado({ datos, error: null, de: consultar });
    return datos;
  }, [consultar]);

  const setDatos = useCallback((actualizar) => {
    setEstado((anterior) => ({
      ...anterior,
      datos: typeof actualizar === 'function' ? actualizar(anterior.datos) : actualizar,
    }));
  }, []);

  return {
    datos: estado.datos,
    error: estado.error,
    cargando: Boolean(consultar) && estado.de !== consultar,
    recargar,
    setDatos,
  };
}
