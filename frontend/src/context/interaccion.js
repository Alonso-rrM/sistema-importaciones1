/**
 * AVISOS Y DIÁLOGOS DE LA APLICACIÓN (reemplazan a window.alert / confirm / prompt)
 *
 *   const { avisar, confirmar, pedirDatos } = useInteraccion();
 *
 *   avisar('Banco registrado.', 'exito');                     // aviso flotante: 'exito' | 'error' | 'info' | 'advertencia'
 *   if (!(await confirmar({ titulo: '¿Desactivar?', mensaje: '...', peligro: true }))) return;
 *   const datos = await pedirDatos({ titulo: 'Tipo de cambio', campos: [{ nombre: 'venta', etiqueta: 'Venta' }] });
 *   if (!datos) return;                                       // null = la usuaria canceló
 *
 * El proveedor que los dibuja está en components/ProveedorInteraccion.jsx (se monta una vez en App.jsx).
 */
import { createContext, useContext } from 'react';

export const InteraccionContext = createContext(null);

export function useInteraccion() {
  const contexto = useContext(InteraccionContext);
  if (!contexto) throw new Error('useInteraccion debe usarse dentro de <ProveedorInteraccion>.');
  return contexto;
}

/** Mensaje legible de un error de la API (FastAPI devuelve `detail` como texto o como lista de validaciones). */
export function mensajeDeError(error, porDefecto = 'Error desconocido') {
  const detalle = error?.response?.data?.detail;
  if (Array.isArray(detalle)) return detalle.map((d) => d.msg).join(' ') || porDefecto;
  return detalle || error?.message || porDefecto;
}
