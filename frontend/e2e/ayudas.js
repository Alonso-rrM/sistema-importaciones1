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
 * Responde al diálogo propio de la aplicación (role="dialog", data-dialogo) que abre `accion`.
 * `respuestas`: textos para los campos del diálogo, en orden (vacío para solo confirmar).
 */
export async function responderDialogo(page, accion, ...respuestas) {
  await accion();
  const dialogo = page.locator('[data-dialogo]');
  await expect(dialogo).toBeVisible();
  for (const [i, texto] of respuestas.entries()) await dialogo.locator('input, textarea').nth(i).fill(texto);
  await dialogo.locator('[data-dialogo-aceptar]').click();
  await expect(dialogo).toBeHidden();
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


const API = `http://localhost:${process.env.E2E_PUERTO_API || 8010}`;

/** Llamada directa a la API con la sesión de la página (para preparar datos dentro de una prueba). */
export async function api(page, metodo, ruta, datos) {
  const respuesta = await page.request.fetch(`${API}${ruta}`, {
    method: metodo,
    data: datos,
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  if (!respuesta.ok()) throw new Error(`${metodo} ${ruta} -> ${respuesta.status()} ${await respuesta.text()}`);
  return respuesta.json();
}
