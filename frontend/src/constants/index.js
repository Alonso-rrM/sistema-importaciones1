/**
 * VALORES FIJOS DEL SISTEMA (frontend)
 * ====================================
 * Espejo de `constantes.py` del backend. Todo rol, estado, moneda o categoría que la pantalla compara
 * o envía se toma de AQUÍ (p. ej. `ESTADO_PAGO.PAGADO`) en lugar de escribir el texto a mano: si el
 * nombre se escribe mal, el editor y el linter lo marcan, en vez de fallar en silencio.
 *
 * Los valores son exactamente los que guarda la base de datos. Si se agrega o cambia uno,
 * hay que hacerlo en los DOS archivos (este y constantes.py).
 */

/** Roles de usuario (el número es el id_rol que devuelve el backend). */
export const ROL = Object.freeze({
  SUPERADMIN: 1,   // Acceso total
  OPERACIONES: 2,  // Logística
  FINANZAS: 3,     // Tesorería
  AUDITOR: 4,      // Solo lectura
});

export const ESTADO_REGISTRO = Object.freeze({
  ACTIVO: 'ACTIVO',
  INACTIVO: 'INACTIVO',
});

export const MONEDA = Object.freeze({
  USD: 'USD',
  PEN: 'PEN',
});

export const ESTADO_PAGO = Object.freeze({
  PENDIENTE: 'PENDIENTE',
  PARCIAL: 'PARCIAL',
  PAGADO: 'PAGADO',
});

// ---------- Contenedor (maestro de importación) ----------

export const TIPO_VALOR = Object.freeze({
  DEFINITIVO: 'DEFINITIVO',
  GARANTIZADO: 'GARANTIZADO',
  PROVISIONAL: 'PROVISIONAL',   // Nombre antiguo de GARANTIZADO (registros históricos)
});

export const ESTADO_DOCUMENTARIO = Object.freeze({
  SIN_NUMERAR: 'SIN NUMERAR',
  EN_PROCESO: 'EN PROCESO',
  ATENCION_PARCIAL: 'ATE. PARCIAL',
  CON_LEVANTE_PENDIENTE_INGRESO: 'CON LEVANTE (PEND. INGRESO)',
  EN_ALMACEN_PENDIENTE_OMC: 'EN ALMACÉN (PEND. OMC)',
  ATENCION_TOTAL: 'ATE. TOTAL',
});

export const ESTADO_LEVANTE = Object.freeze({
  SIN_LEVANTE: 'SIN LEVANTE',
  CON_LEVANTE: 'CON LEVANTE',
});

export const STATUS_LLEGADA = Object.freeze({
  EN_TRANSITO: 'EN TRÁNSITO',
  EN_PUERTO: 'EN PUERTO',
  EN_ALMACEN_TEMPORAL: 'EN ALMACÉN TEMPORAL',
  PENDIENTE_DESCARGA: 'PENDIENTE DESCARGA',
  RETIRO_PROGRAMADO: 'RETIRO PROGRAMADO',
  EN_ALMACEN: 'EN ALMACÉN',
});

// ---------- DAM ----------

export const CANAL_CONTROL = Object.freeze({
  VERDE: 'VERDE',
  NARANJA: 'NARANJA',
  ROJO: 'ROJO',
});

export const ESTADO_DAM = Object.freeze({
  NUMERADA: 'NUMERADA / EN EVALUACIÓN',
  PENDIENTE_PAGO_PROFORMA: 'PENDIENTE PAGO PROFORMA',
  PENDIENTE_AFORO: 'PENDIENTE DE AFORO',
  OBSERVADA: 'OBSERVADA / NOTIFICADA',
  EN_REVISION: 'EN REVISIÓN',
  CON_LEVANTE: 'CON LEVANTE',
  CON_LEVANTE_GARANTIA_ACTIVA: 'CON LEVANTE (GARANTÍA ACTIVA)',
  EN_REVISION_OMC: 'EN REVISIÓN OMC (POST-LEVANTE)',
  PENDIENTE_PAGO_OMC: 'PENDIENTE PAGO OMC',
  GARANTIA_CERRADA: 'GARANTÍA CERRADA / LIQUIDADA',
});

// ---------- Catálogos ----------

export const CATEGORIA_PROVEEDOR = Object.freeze({
  NACIONAL: 'NACIONAL',
  INTERNACIONAL: 'INTERNACIONAL',
  ESTADO_O_TRIBUTO: 'ESTADO_O_TRIBUTO',   // SUNAT y demás entidades del Estado
});

/** Papel del concepto en el despacho aduanero. Lo usa el backend para decidir levantes. */
export const CLASE_ADUANERA = Object.freeze({
  NINGUNA: 'NINGUNA',
  TRIBUTO: 'TRIBUTO',
  PERCEPCION: 'PERCEPCION',
  OMC: 'OMC',
});

export const TIPO_GASTO = Object.freeze({
  FIJO_DESPACHO: 'FIJO_DESPACHO',
  POST_LEVANTE: 'POST_LEVANTE',
  EXTRAORDINARIO: 'EXTRAORDINARIO',
});
