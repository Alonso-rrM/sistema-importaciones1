// Flujos de dinero desde las pantallas: registrar un gasto, pagarlo con un voucher, anular el pago
// y corregir el tipo de cambio del día.
import { test, expect } from '@playwright/test';
import { campoTrasRotulo, elegirOpcion, esperarAviso, iniciarSesion, responderDialogo, vigilarErrores } from './ayudas.js';

test.describe.configure({ mode: 'serial' });

test('registrar un gasto desde la pantalla de Gastos', async ({ page }) => {
  const errores = vigilarErrores(page);
  await iniciarSesion(page);
  await page.goto('/app/gastos');
  await page.getByRole('button', { name: 'Nuevo Gasto' }).first().click();
  await elegirOpcion(page, 'Seleccione la DAM vinculada...', '118-2026-10-000001');
  await elegirOpcion(page, 'Seleccione concepto contable...', 'FLETE LOCAL');
  await elegirOpcion(page, 'Seleccione proveedor con RUC...', 'NAVIERA E2E');
  await elegirOpcion(page, 'Tipo de comprobante...', 'FACTURA');
  await page.getByPlaceholder('Ej. F001-123456').fill('F002-77');
  await page.locator('form').getByPlaceholder('0.00').first().fill('80');
  await page.getByRole('button', { name: 'Guardar Gasto' }).click();
  await expect(page.getByText('F002-00000077').first()).toBeVisible();
  expect(errores).toEqual([]);
});

test('pagar un gasto con un voucher y luego anular el pago', async ({ page }) => {
  const errores = vigilarErrores(page);
  await iniciarSesion(page);
  await page.goto('/app/pagos');

  // Seleccionar el gasto de flete (USD 250) y pagar USD 100 con el voucher OP-E2E-1
  await page.getByText('$ 250.00', { exact: true }).first().click();
  await elegirOpcion(page, 'Seleccionar voucher con saldo a favor...', 'OP-E2E-1');
  await campoTrasRotulo(page, 'Importe a Liquidar').fill('100');
  await responderDialogo(page, () => page.locator('form button[type=submit]').click());
  await esperarAviso(page, 'exitosamente');
  await expect(page.getByText('$ 150.00', { exact: true }).first()).toBeVisible();   // saldo tras el pago


  // Historial: anular el pago con un motivo
  await page.getByRole('button', { name: /Historial/ }).click();
  const fila = page.locator('tr', { hasText: 'OP-E2E-1' }).first();
  await expect(fila).toBeVisible();
  await fila.getByRole('button', { name: 'Anular' }).click();
  await page.getByPlaceholder('Justifique la razón de anulación').fill('Prueba de extremo a extremo: anular pago');
  await page.getByRole('button', { name: 'Confirmar Anulación' }).click();
  await expect(page.locator('tr', { hasText: 'OP-E2E-1' })).toHaveCount(0);
  // El gasto recupera su saldo completo
  await page.getByRole('button', { name: /Registrar Nuevo Pago/ }).click();
  await expect(page.getByText('$ 250.00', { exact: true }).first()).toBeVisible();
  expect(errores).toEqual([]);
});

test('corregir el tipo de cambio del día desde Pagos', async ({ page }) => {
  const errores = vigilarErrores(page);
  await iniciarSesion(page);
  await page.goto('/app/pagos');
  await expect(page.getByText('TC SUNAT hoy: 3.7520')).toBeVisible();

  // Diálogos nativos (venta y luego compra) o el formulario propio de la aplicación
  const respuestas = ['3.7600', '3.7500'];
  const manejador = (d) => d.accept(respuestas.shift());
  page.on('dialog', manejador);
  await page.getByRole('button', { name: 'Corregir' }).click();
  const propio = page.locator('[data-dialogo]');
  if (await propio.isVisible().catch(() => false)) {
    await propio.locator('input').nth(0).fill('3.7600');
    await propio.locator('input').nth(1).fill('3.7500');
    await propio.locator('[data-dialogo-aceptar]').click();
  }
  await expect(page.getByText('TC SUNAT hoy: 3.7600')).toBeVisible();
  page.off('dialog', manejador);
  expect(errores).toEqual([]);
});
