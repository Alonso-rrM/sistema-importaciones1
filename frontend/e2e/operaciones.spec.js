// Operaciones desde las pantallas: crear un expediente (contenedor) con su DAM, y crear y eliminar un voucher.
import { test, expect } from '@playwright/test';
import { aceptarAvisosNativos, campoTrasRotulo, elegirOpcion, iniciarSesion, vigilarErrores } from './ayudas.js';

test.describe.configure({ mode: 'serial' });

test('crear un expediente y registrarle una DAM desde Logística', async ({ page }) => {
  const errores = vigilarErrores(page);
  aceptarAvisosNativos(page);
  await iniciarSesion(page);
  await page.goto('/app/logistica');

  await page.getByRole('button', { name: /\+ Nuevo/ }).first().click();
  await campoTrasRotulo(page, 'N° Factura *').fill('GF-E2E-UI-1');
  await page.getByText('Importador', { exact: true }).last().locator('xpath=following::select[1]').selectOption({ label: 'IMPORTADORA E2E SAC' });
  await page.getByRole('button', { name: 'Crear Expediente' }).click();
  await expect(page.getByText('Expediente Factura GF-E2E-UI-1')).toBeVisible();

  // El aviso de "expediente guardado" puede estar cerrándose: se reintenta abrir el formulario de la DAM
  await expect(async () => {
    await page.getByRole('button', { name: /DAM Rápida/ }).first().click();
    await expect(page.getByPlaceholder('Ej: 118-2026-10-123456')).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15000 });
  await page.getByPlaceholder('Ej: 118-2026-10-123456').fill('118-2026-10-000099');
  await page.locator('form', { has: page.getByPlaceholder('Ej: 118-2026-10-123456') }).locator('button[type=submit]').click();
  await expect(page.getByText('118-2026-10-000099').first()).toBeVisible();
  expect(errores).toEqual([]);
});

test('crear un voucher y eliminarlo con su motivo', async ({ page }) => {
  const errores = vigilarErrores(page);
  await iniciarSesion(page);
  await page.goto('/app/vouchers');

  await page.getByRole('button', { name: 'Nuevo Voucher' }).first().click();
  await elegirOpcion(page, 'Seleccionar banco...', 'BANCO E2E');
  await elegirOpcion(page, 'Seleccionar importador...', 'IMPORTADORA E2E SAC');
  await page.getByPlaceholder('Ej. OP-987654').fill('OP-E2E-UI-9');
  await page.locator('form').getByPlaceholder('0.00').first().fill('500');
  await page.locator('form input[type=date]').first().fill(new Date().toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'Guardar Voucher' }).click();
  await expect(page.getByText('OP-E2E-UI-9').first()).toBeVisible();

  await page.getByText('OP-E2E-UI-9').first().click();
  await page.getByRole('button', { name: 'Eliminar' }).click();
  await page.getByPlaceholder('Explique detalladamente la razón').fill('Prueba de extremo a extremo: voucher de prueba');
  await page.getByRole('button', { name: 'Confirmar Eliminación' }).click();
  await expect(page.getByText('OP-E2E-UI-9')).toHaveCount(0);
  expect(errores).toEqual([]);
});
