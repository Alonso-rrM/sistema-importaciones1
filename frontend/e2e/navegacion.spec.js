// Todas las pantallas cargan sin errores de JavaScript.
import { test, expect } from '@playwright/test';
import { iniciarSesion, iniciarSesionDesdeCero, vigilarErrores } from './ayudas.js';

const PANTALLAS = [
  ['reportes', /Reportes|Anal[ií]tica/i],
  ['logistica', /GF-E2E-1/],
  ['dams', /118-2026-10-000001/],
  ['importadores', /IMPORTADORA E2E SAC/],
  ['proveedores', /NAVIERA E2E/],
  ['agentes', /AGENCIA E2E/],
  ['almacenes', /ALMACEN E2E/],
  ['conceptos', /FLETE LOCAL/],
  ['comprobantes', /FACTURA/],
  ['bancos', /BANCO E2E/],
  ['vouchers', /OP-E2E-1/],
  ['gastos', /F001-0*1/],
  ['pagos', /F001-0*1|FLETE LOCAL/],
  ['auditoria', /Auditor[ií]a/i],
  ['admin', /Carga|Administraci[oó]n/i],
  ['usuarios', /Usuarios del Sistema/],
];

test.describe('sin sesión previa', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('sin sesión, la aplicación lleva al login', async ({ page }) => {
    await page.goto('/app/gastos');
    await expect(page).toHaveURL(/\/login/);
  });
});

test('el inicio de sesión lleva al panel', async ({ page }) => {
  const errores = vigilarErrores(page);
  await page.context().clearCookies();
  await iniciarSesionDesdeCero(page);
  await expect(page).toHaveURL(/\/app\//);
  expect(errores).toEqual([]);
});

for (const [ruta, contenido] of PANTALLAS) {
  test(`la pantalla ${ruta} carga sus datos sin errores`, async ({ page }) => {
    const errores = vigilarErrores(page);
    await iniciarSesion(page);
    await page.goto(`/app/${ruta}`);
    await expect(page.getByText(contenido).first()).toBeVisible();
    expect(errores).toEqual([]);
  });
}

test('en una pantalla de laptop todas las opciones del menú lateral son alcanzables', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 657 });   // área útil de una laptop de 1366x768
  await iniciarSesion(page);
  const enPantalla = async (locator) => {
    const caja = await locator.boundingBox();
    return caja !== null && caja.y >= 0 && caja.y + caja.height <= 657;
  };
  // Los botones de abajo quedan siempre visibles
  expect(await enPantalla(page.getByTitle('Cerrar Sesión'))).toBe(true);
  expect(await enPantalla(page.getByTitle('Cambiar mi contraseña'))).toBe(true);
  // La opción de la página actual se mantiene a la vista aunque esté al final de la lista
  await page.goto('/app/admin');
  expect(await enPantalla(page.getByTitle('Administración & Carga Masiva'))).toBe(true);
  // Y la última opción se puede usar desde la primera página desplazando el menú
  await page.goto('/app/reportes');
  const usuarios = page.getByRole('navigation', { name: 'Menú principal' }).getByTitle('Usuarios');
  await usuarios.scrollIntoViewIfNeeded();
  await usuarios.click();
  await expect(page).toHaveURL(/\/app\/usuarios/);
});
