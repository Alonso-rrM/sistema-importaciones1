/**
 * Validación de lo que digita la usuaria, para avisar ANTES de enviar.
 *
 * Es copia de las reglas de domain/validaciones.py (la autoridad es el backend, que vuelve a validar todo).
 * Las dos copias se prueban con los mismos casos: tests/casos_validacion.json.
 *
 * Cada función devuelve { valor, error }: `valor` es la forma canónica (la que guardará el sistema) y
 * `error` un mensaje en español, o null si el dato es válido.
 */

import { CATEGORIA_PROVEEDOR, CLASE_ADUANERA } from '../constants/index.js';

const valido = (valor) => ({ valor, error: null });
const invalido = (error) => ({ valor: null, error });

export const limpiarTexto = (texto) => String(texto ?? '').replace(/\s+/g, ' ').trim();

// ------------------------------------------------------------------ RUC

const PREFIJOS_RUC = ['10', '15', '16', '17', '20'];
const PESOS_RUC = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** Dígito verificador del RUC (módulo 11 de SUNAT) a partir de sus 10 primeros dígitos. */
export function digitoVerificadorRuc(primerosDiez) {
  const suma = [...primerosDiez].reduce((total, digito, i) => total + Number(digito) * PESOS_RUC[i], 0);
  const resto = 11 - (suma % 11);
  return resto === 10 ? 0 : resto === 11 ? 1 : resto;
}

/** RUC peruano. Con `opcional`, vacío es válido (valor null). */
export function validarRuc(texto, { opcional = false } = {}) {
  const ruc = String(texto ?? '').replace(/[\s-]/g, '');
  if (!ruc) return opcional ? valido(null) : invalido('El RUC es obligatorio.');
  if (!/^\d{11}$/.test(ruc)) return invalido('El RUC debe tener 11 dígitos.');
  if (!PREFIJOS_RUC.some((p) => ruc.startsWith(p))) {
    return invalido(`El RUC ${ruc} no es válido: debe empezar con ${PREFIJOS_RUC.join(', ')}.`);
  }
  if (digitoVerificadorRuc(ruc.slice(0, 10)) !== Number(ruc[10])) {
    return invalido(`El RUC ${ruc} no es válido: su dígito verificador no corresponde. Revise si hay un error de digitación.`);
  }
  return valido(ruc);
}

// ------------------------------------------------------------------ N° de DAM

export const EJEMPLO_DAM = '118-2026-10-123456';

/** N° de DAM en su forma canónica ADUANA-AÑO-RÉGIMEN-NÚMERO (118-2026-10-000123). */
export function validarNumeroDam(texto) {
  const original = limpiarTexto(texto);
  if (!original) return invalido('El N° de DAM es obligatorio.');
  const formato = `Formato esperado: aduana-año-régimen-número, por ejemplo ${EJEMPLO_DAM}.`;
  const partes = original.split(/[\s\-/.]+/).filter(Boolean);
  if (partes.length !== 4 || !partes.every((p) => /^\d+$/.test(p))) {
    return invalido(`El N° de DAM «${original}» no es válido. ${formato}`);
  }
  const [aduana, anioDigitado, regimen, numero] = partes;
  const anio = anioDigitado.length === 2 ? `20${anioDigitado}` : anioDigitado;
  if (aduana.length !== 3) return invalido(`El código de aduana de la DAM debe tener 3 dígitos. ${formato}`);
  if (anio.length !== 4 || !anio.startsWith('20')) return invalido(`El año de la DAM debe tener 4 dígitos, por ejemplo 2026. ${formato}`);
  if (regimen.length !== 2) return invalido(`El régimen de la DAM debe tener 2 dígitos, por ejemplo 10. ${formato}`);
  if (numero.length < 1 || numero.length > 6 || Number(numero) === 0) {
    return invalido(`El número correlativo de la DAM debe tener entre 1 y 6 dígitos. ${formato}`);
  }
  return valido(`${aduana}-${anio}-${regimen}-${numero.padStart(6, '0')}`);
}

// ------------------------------------------------------------------ Comprobantes (proveedor nacional)

export const EJEMPLO_COMPROBANTE = 'F001-123';

/** Comprobante SERIE-CORRELATIVO con 8 dígitos (F001-77 -> F001-00000077). Vacío es válido (null). */
export function validarComprobante(texto) {
  const original = limpiarTexto(texto);
  if (!original) return valido(null);
  const coincidencia = original.toUpperCase().replace(/\s*-\s*/g, '-').match(/^([A-Z0-9]{1,4})-(\d{1,8})$/);
  if (!coincidencia) {
    return invalido(`El N° de comprobante «${original}» no es válido. Formato esperado: SERIE-NÚMERO `
      + `(serie de hasta 4 caracteres y número de hasta 8 dígitos), por ejemplo ${EJEMPLO_COMPROBANTE}.`);
  }
  const [, serie, correlativo] = coincidencia;
  if (Number(correlativo) === 0) return invalido(`El número del comprobante «${original}» no puede ser cero.`);
  return valido(`${serie}-${correlativo.padStart(8, '0')}`);
}

// ------------------------------------------------------------------ Montos

/**
 * Monto de dinero digitado: número con punto decimal y hasta 2 decimales (hasta 13 dígitos enteros).
 * Devuelve el texto tal cual (sin espacios) para enviarlo al backend, que lo lee como Decimal.
 * Opciones: `etiqueta` (para el mensaje), `permitirCero`, `opcional` (vacío -> null).
 */
export function validarMonto(texto, { etiqueta = 'El monto', permitirCero = false, opcional = false } = {}) {
  const monto = String(texto ?? '').trim();
  if (!monto) return opcional ? valido(null) : invalido(`${etiqueta} es obligatorio.`);
  if (!/^\d{1,13}(\.\d+)?$/.test(monto)) {
    return invalido(`${etiqueta} debe ser un número positivo (use punto para los decimales, sin comas ni símbolos).`);
  }
  if (/\.\d{3,}$/.test(monto)) return invalido(`${etiqueta} admite como máximo 2 decimales.`);
  if (!permitirCero && Number(monto) === 0) return invalido(`${etiqueta} debe ser mayor que 0.`);
  return valido(monto);
}

// ------------------------------------------------------------------ C.D.A. (SUNAT)

export const EJEMPLO_CDA = '118-26-10-535304-25-4-01';

/** C.D.A. como lo imprime SUNAT: la DAM con año de 2 dígitos y número de 6, más su sufijo. Vacío es válido (null). */
export function validarCda(texto) {
  const original = limpiarTexto(texto);
  if (!original) return valido(null);
  const formato = `Formato esperado: el N° de la DAM seguido de su sufijo, por ejemplo ${EJEMPLO_CDA}.`;
  const partes = original.split(/[\s\-/.]+/).filter(Boolean);
  if (partes.length < 5 || !partes.every((p) => /^\d+$/.test(p))) return invalido(`El C.D.A. «${original}» no es válido. ${formato}`);
  const dam = validarNumeroDam(partes.slice(0, 4).join('-'));
  if (dam.error) return invalido(`El C.D.A. «${original}» no empieza con un N° de DAM válido. ${formato}`);
  const sufijo = partes.slice(4);
  if (sufijo.length > 4 || sufijo.some((p) => p.length > 4)) return invalido(`El sufijo del C.D.A. «${original}» no es válido. ${formato}`);
  const [aduana, anio, regimen, numero] = dam.valor.split('-');
  return valido([aduana, anio.slice(2), regimen, numero, ...sufijo].join('-'));
}

/** N° de DAM (año de 4 dígitos, como lo guarda el sistema) al que pertenece un C.D.A. ya normalizado. */
export const damDelCda = (cda) => validarNumeroDam(cda.split('-').slice(0, 4).join('-')).valor;

// ------------------------------------------------------------------ N° de documento de un gasto

/**
 * N° de documento de un gasto (misma regla que routers/finanzas.py):
 * - concepto del Estado (clase aduanera tributo, percepción u OMC) -> C.D.A.;
 * - si no, proveedor nacional -> comprobante SERIE-CORRELATIVO; del exterior o el Estado -> texto libre.
 */
export function validarDocumentoGasto({ categoria, claseAduanera }, texto) {
  if (claseAduanera && claseAduanera !== CLASE_ADUANERA.NINGUNA) return validarCda(texto);
  if (categoria === CATEGORIA_PROVEEDOR.INTERNACIONAL || categoria === CATEGORIA_PROVEEDOR.ESTADO_O_TRIBUTO) {
    return valido(limpiarTexto(texto) || null);
  }
  return validarComprobante(texto);
}

// ------------------------------------------------------------------ Cuentas de usuario

/** Nombre de usuario: 3 a 50 letras, números, punto, guion o guion bajo. */
export function validarUsuario(texto) {
  const usuario = String(texto ?? '').trim();
  return /^[A-Za-z0-9._-]{3,50}$/.test(usuario)
    ? valido(usuario)
    : invalido('El usuario debe tener 3 a 50 caracteres: letras, números, punto, guion o guion bajo.');
}

/** Correo electrónico en minúsculas. */
export function validarCorreo(texto) {
  const correo = String(texto ?? '').trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(correo) ? valido(correo) : invalido('Correo electrónico inválido.');
}

/** Contraseña segura: 10 o más caracteres, con mayúscula, minúscula y número (máx. 72 bytes). */
export function validarClave(texto) {
  const clave = String(texto ?? '');
  if (clave.length < 10) return invalido('La contraseña debe tener al menos 10 caracteres.');
  if (new TextEncoder().encode(clave).length > 72) return invalido('La contraseña no puede superar 72 bytes.');
  if (!(/[a-z]/.test(clave) && /[A-Z]/.test(clave) && /\d/.test(clave))) {
    return invalido('La contraseña debe incluir mayúsculas, minúsculas y números.');
  }
  return valido(clave);
}
