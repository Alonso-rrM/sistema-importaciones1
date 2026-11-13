// Ayudas comunes para las pruebas de extremo a extremo.
import { expect } from '@playwright/test';

export const ADMIN = { usuario: process.env.E2E_ADMIN_USUARIO || 'admin', clave: process.env.E2E_ADMIN_CLAVE || 'Clave-E2E-12345' };

/**
 * Registra los errores de JavaScript y de consola de la página. Las respuestas 4xx esperadas
 * (validaciones del backend) no cuentan como error de la pantalla.
 */
export function vigilarErrores(page) {
  const errores = [];
  page.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const texto = m.text();
    if (/Failed to load resource: the server responded with a status of 4\d\d/.test(texto)) return;
    errores.push(`console: ${texto.slice(0, 200)}`);
  });
  return errores;
}

/** Inicia sesión desde la pantalla de login (solo lo usan la preparación de la sesión y la prueba de login). */
export async function iniciarSesionDesdeCero(page) {
  await page.goto('/login');
  await page.locator('input').nth(0).fill(ADMIN.usuario);
  await page.locator('input[type=password]').fill(ADMIN.clave);
  await page.locator('button[type=submit]').click();
  await page.waitForURL('**/app/**');
}

/** Las pruebas reutilizan la sesión guardada (ver e2e/sesion.setup.js): basta con abrir la aplicación. */
export async function iniciarSesion(page) {
  await page.goto('/app/logistica');
  await page.waitForURL('**/app/**');
}

/**
 * Responde a la confirmación o pregunta que dispara `accion`, sea un diálogo nativo del navegador
 * (window.confirm / window.prompt) o un diálogo propio de la aplicación (role="dialog" con data-dialogo).
 * `respuesta`: texto a ingresar (para preguntas) o null para solo aceptar.
 */
export async function responderDialogo(page, accion, respuesta = null) {
  let nativo = false;
  const manejador = async (dialogo) => {
    nativo = true;
    if (respuesta !== null && dialogo.type() === 'prompt') await dialogo.accept(respuesta);
    else await dialogo.accept();
  };
  page.once('dialog', manejador);
  await accion();
  const propio = page.locator('[data-dialogo]');
  try {
    await propio.waitFor({ state: 'visible', timeout: 1500 });
  } catch {
    page.off('dialog', manejador);
    if (!nativo) throw new Error('Se esperaba un diálogo de confirmación y no apareció.');
    return;
  }
  page.off('dialog', manejador);
  if (respuesta !== null) await propio.locator('input, textarea').first().fill(respuesta);
  await propio.locator('[data-dialogo-aceptar]').click();
  await expect(propio).toBeHidden();
}

/** Espera un aviso de la aplicación que contenga el texto (banner de la pantalla o aviso flotante). */
export async function esperarAviso(page, texto) {
  await expect(page.getByText(texto, { exact: false }).first()).toBeVisible();
}

/** Elige una opción en un desplegable con búsqueda (react-select) a partir de su texto de ayuda. */
export async function elegirOpcion(page, placeholder, textoOpcion) {
  // El texto de ayuda de react-select está superpuesto a su campo de búsqueda: se enfoca ese campo
  const control = page.locator('div[class*="control"]', { has: page.getByText(placeholder, { exact: true }) }).first();
  await control.locator('input').focus();
  await page.keyboard.type(textoOpcion);
  await page.getByRole('option', { name: new RegExp(textoOpcion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).first().click();
}

/** Campo de entrada que sigue a un rótulo visible (para formularios cuyos rótulos no están enlazados al campo). */
export function campoTrasRotulo(page, rotulo) {
  return page.getByText(rotulo, { exact: false }).first().locator('xpath=following::input[1]');
}

/**
 * Acepta los avisos informativos nativos (window.alert) que muestre la pantalla, para que no bloqueen la prueba.
 * Cuando la aplicación usa avisos propios, simplemente no hay nada que aceptar.
 */
export function aceptarAvisosNativos(page) {
  page.on('dialog', async (dialogo) => {
    if (dialogo.type() === 'alert') await dialogo.accept();
  });
}
