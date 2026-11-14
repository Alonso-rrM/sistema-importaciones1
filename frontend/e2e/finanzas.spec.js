// Flujos de dinero desde las pantallas: registrar un gasto, pagarlo con un voucher, anular el pago
// y corregir el tipo de cambio del día.
import { test, expect } from '@playwright/test';
import { api, campoTrasRotulo, elegirOpcion, esperarAviso, iniciarSesion, responderDialogo, vigilarErrores } from './ayudas.js';

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

  // Un valor con formato inválido no se acepta: el diálogo lo indica y no se cierra
  await page.getByRole('button', { name: 'Corregir' }).click();
  const dialogo = page.locator('[data-dialogo]');
  await dialogo.locator('input').nth(0).fill('3,76');
  await dialogo.locator('[data-dialogo-aceptar]').click();
  await expect(dialogo.getByText('hasta 4 decimales')).toBeVisible();
  await dialogo.locator('[data-dialogo-cancelar]').click();

  await responderDialogo(page, () => page.getByRole('button', { name: 'Corregir' }).click(), '3.7600', '3.7500');
  await expect(page.getByText('TC SUNAT hoy: 3.7600')).toBeVisible();
  expect(errores).toEqual([]);
});

test('anular un pago de la proforma avisa que la DAM perdió el levante', async ({ page }) => {
  await iniciarSesion(page);
  // Preparación por API: DAM canal verde con tributos y percepción pagados (el sistema le da levante)
  const importador = (await api(page, 'GET', '/importadores/')).find((i) => i.nombre === 'IMPORTADORA E2E SAC');
  const sunat = (await api(page, 'GET', '/proveedores/')).find((p) => p.nombre === 'SUNAT');
  const conceptos = await api(page, 'GET', '/conceptos/');
  const doc = (await api(page, 'GET', '/tipos-documento/'))[0];
  const banco = (await api(page, 'GET', '/bancos/'))[0];
  const maestro = await api(page, 'POST', '/maestros/', { numero_factura: 'GF-E2E-REV', id_importador: importador.id_importador, tipo_valor: 'DEFINITIVO' });
  const dam = await api(page, 'POST', '/dams/', { id_maestro: maestro.id_maestro, numero_de_dam: '118-2026-10-000777', canal_control: 'VERDE' });
  const voucher = await api(page, 'POST', '/vouchers/', {
    banco_id: banco.id_banco, id_importador: importador.id_importador, numero_operacion: 'OP-E2E-REV',
    monto_total: '500.00', moneda: 'PEN', fecha_transferencia: new Date().toISOString().slice(0, 10),
  });
  for (const [nombre, monto] of [['TRIBUTOS', '100.00'], ['PERCEPCION', '20.00']]) {
    const concepto = conceptos.find((c) => c.nombre === nombre);
    const gasto = await api(page, 'POST', '/gastos/', {
      id_dam: dam.id_dam, id_concepto: concepto.id_concepto, id_proveedor: sunat.id_proveedor, id_tipo_doc: doc.id_tipo_doc,
      monto_original: monto, moneda: 'PEN', numero_documento: `118-26-10-000777-${nombre === 'TRIBUTOS' ? 1 : 2}-1-01`,   // C.D.A. de cada gasto del Estado
    });
    await api(page, 'POST', '/pagos/', { id_gasto: gasto.id_gasto, voucher_id: voucher.id_voucher, moneda: 'PEN', importe: monto, tipo_cambio: '1' });
  }

  // Anulación desde la pantalla: debe aparecer el aviso de reversión, que hay que reconocer
  await page.goto('/app/pagos');
  await page.getByRole('button', { name: /Historial/ }).click();
  const fila = page.locator('tr', { hasText: 'OP-E2E-REV' }).first();
  await fila.getByRole('button', { name: 'Anular' }).click();
  await page.getByPlaceholder('Justifique la razón de anulación').fill('Prueba e2e: el pago era de otro contenedor');
  await page.getByRole('button', { name: 'Confirmar Anulación' }).click();
  const aviso = page.locator('[data-dialogo]');
  await expect(aviso.getByText('cambió el estado aduanero')).toBeVisible();
  await expect(aviso.getByText('118-2026-10-000777')).toBeVisible();
  await expect(aviso.locator('[data-dialogo-cancelar]')).toHaveCount(0);   // solo se puede reconocer
  await aviso.locator('[data-dialogo-aceptar]').click();
  await expect(aviso).toBeHidden();
});

test('el botón "Pagar" de Gastos abre la obligación en Pagos', async ({ page }) => {
  await iniciarSesion(page);
  await page.goto('/app/gastos');
  await page.getByText('TRIBUTOS').first().click();
  await page.getByRole('button', { name: 'Pagar' }).first().click();
  await expect(page).toHaveURL(/\/app\/pagos\?gasto_id=/);
  await expect(page.getByText(/Gasto #\d+ · TRIBUTOS/)).toBeVisible();
});

test('pagar un gasto en soles con un voucher en dólares usa el tipo de cambio', async ({ page }) => {
  const errores = vigilarErrores(page);
  await iniciarSesion(page);
  await page.goto('/app/pagos');
  await page.getByText('S/ 1200.00', { exact: true }).first().click();      // TRIBUTOS en soles
  await elegirOpcion(page, 'Seleccionar voucher con saldo a favor...', 'OP-E2E-1');   // voucher en dólares
  await campoTrasRotulo(page, 'Importe a Liquidar').fill('376');
  await campoTrasRotulo(page, 'Tipo de Cambio').fill('3.76');
  await responderDialogo(page, () => page.locator('form button[type=submit]').click());
  await esperarAviso(page, 'exitosamente');
  await expect(page.getByText('S/ 824.00', { exact: true }).first()).toBeVisible();   // 1200 - 376
  expect(errores).toEqual([]);
});
