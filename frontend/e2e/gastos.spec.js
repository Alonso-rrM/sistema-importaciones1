// Pantalla de Gastos: modificar, reversar un pago, eliminar con motivo y registrar desde una DAM.
import { test, expect } from '@playwright/test';
import { api, esperarAviso, iniciarSesion, vigilarErrores } from './ayudas.js';

test.describe.configure({ mode: 'serial' });

/** Crea por API un gasto de flete en la DAM de prueba y devuelve el gasto creado. */
async function crearGastoDePrueba(page, numeroDocumento, monto) {
  const dam = (await api(page, 'GET', '/dams/lookup')).find((d) => d.numero_de_dam === '118-2026-10-000001');
  const flete = (await api(page, 'GET', '/conceptos/')).find((c) => c.nombre === 'FLETE LOCAL');
  const naviera = (await api(page, 'GET', '/proveedores/')).find((p) => p.nombre === 'NAVIERA E2E');
  const factura = (await api(page, 'GET', '/tipos-documento/')).find((t) => t.nombre_documento === 'FACTURA');
  return api(page, 'POST', '/gastos/', {
    id_dam: dam.id_dam, id_concepto: flete.id_concepto, id_proveedor: naviera.id_proveedor, id_tipo_doc: factura.id_tipo_doc,
    numero_documento: numeroDocumento, monto_original: monto, moneda: 'USD',
  });
}

async function abrirGasto(page, gasto) {
  await page.goto('/app/gastos');
  await page.getByPlaceholder('Buscar Documento, DAM, Concepto').fill(gasto.numero_documento);
  await page.getByText(gasto.numero_documento).first().click();
  await expect(page.getByRole('button', { name: 'Modificar' }).first()).toBeVisible();
}

test('modificar el monto de un gasto', async ({ page }) => {
  const errores = vigilarErrores(page);
  await iniciarSesion(page);
  const gasto = await crearGastoDePrueba(page, 'F010-11', '70.00');
  await abrirGasto(page, gasto);

  await page.getByRole('button', { name: 'Modificar' }).first().click();
  await expect(page.getByText(`Modificar Gasto #${gasto.id_gasto}`)).toBeVisible();
  await page.locator('form').getByPlaceholder('0.00').first().fill('95.50');
  await page.getByRole('button', { name: 'Guardar Gasto' }).click();
  await expect(page.getByRole('heading', { name: `Modificar Gasto #${gasto.id_gasto}` })).toBeHidden();

  const guardado = (await api(page, 'GET', '/gastos/', null)).data.find((g) => g.id_gasto === gasto.id_gasto);
  expect(guardado.monto_original).toBe('95.50');
  expect(errores).toEqual([]);
});

test('reversar un pago desde la ficha del gasto', async ({ page }) => {
  const errores = vigilarErrores(page);
  await iniciarSesion(page);
  const gasto = await crearGastoDePrueba(page, 'F010-12', '40.00');
  const voucher = (await api(page, 'GET', '/vouchers/', null)).data.find((v) => v.numero_operacion === 'OP-E2E-1');
  await api(page, 'POST', '/pagos/', { id_gasto: gasto.id_gasto, voucher_id: voucher.id_voucher, moneda: 'USD', importe: '15.00', tipo_cambio: '1' });
  await abrirGasto(page, gasto);

  await page.getByRole('button', { name: 'Reversar' }).first().click();
  await expect(page.getByText(/Reversar Pago #\d+/)).toBeVisible();
  await page.getByPlaceholder('Justifique el motivo de anulación o extorno').fill('Prueba e2e: reversar desde Gastos');
  await page.getByRole('button', { name: 'Confirmar Reversión' }).click();
  await esperarAviso(page, 'anulado');
  await expect(page.getByRole('button', { name: 'Reversar' })).toHaveCount(0);

  const actualizado = (await api(page, 'GET', '/gastos/', null)).data.find((g) => g.id_gasto === gasto.id_gasto);
  expect(actualizado.estado_pago).toBe('PENDIENTE');
  expect(errores).toEqual([]);
});

test('eliminar un gasto exige un motivo', async ({ page }) => {
  const errores = vigilarErrores(page);
  await iniciarSesion(page);
  const gasto = await crearGastoDePrueba(page, 'F010-13', '25.00');
  await abrirGasto(page, gasto);

  await page.getByRole('button', { name: 'Eliminar' }).first().click();
  await expect(page.getByText(`Eliminar Registro de Gasto #${gasto.id_gasto}`)).toBeVisible();
  await page.getByPlaceholder('Indique la justificación').fill('Prueba e2e: gasto duplicado');
  await page.getByRole('button', { name: 'Confirmar Eliminación' }).click();
  await esperarAviso(page, `Gasto #${gasto.id_gasto} eliminado`);

  const restantes = (await api(page, 'GET', '/gastos/', null)).data.filter((g) => g.id_gasto === gasto.id_gasto);
  expect(restantes).toEqual([]);
  expect(errores).toEqual([]);
});

test('"Registrar Gasto" desde una DAM abre el formulario con la DAM elegida', async ({ page }) => {
  const errores = vigilarErrores(page);
  await iniciarSesion(page);
  await page.goto('/app/dams');
  await page.getByText('118-2026-10-000001').first().click();
  await page.getByRole('button', { name: '+ Registrar Gasto' }).first().click();
  await expect(page).toHaveURL(/\/app\/gastos/);
  await expect(page.getByRole('button', { name: 'Guardar Gasto' })).toBeVisible();
  await expect(page.locator('form').getByText('DAM: 118-2026-10-000001')).toBeVisible();
  // Escape cierra el panel
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Guardar Gasto' })).toBeHidden();
  expect(errores).toEqual([]);
});
