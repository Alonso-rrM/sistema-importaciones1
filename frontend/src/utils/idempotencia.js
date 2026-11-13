/** Clave única por intento de pago: si la misma solicitud se envía dos veces, el servidor no cobra dos veces. */
export function nuevaClaveIdempotencia() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `pay-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
