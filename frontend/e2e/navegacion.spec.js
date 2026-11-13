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
