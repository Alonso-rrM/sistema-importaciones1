// Validación de lo que se digita: el sistema avisa en pantalla y guarda los datos en su forma única.
import { test, expect } from '@playwright/test';
import { api, elegirOpcion, esperarAviso, iniciarSesion, vigilarErrores } from './ayudas.js';

test.describe.configure({ mode: 'serial' });

test('un RUC con el dígito verificador equivocado se avisa al digitarlo y no se guarda', async ({ page }) => {
  const errores = vigilarErrores(page);
  await iniciarSesion(page);
  await page.goto('/app/importadores');
  await page.getByRole('button', { name: 'Nuevo Importador' }).first().click();
  await page.getByPlaceholder('Nombre oficial o abreviado de la empresa').fill('IMPORTADOR RUC MALO');
  await page.getByPlaceholder('Ej. 20123456789').fill('20100047219');   // el correcto termina en 8
  await expect(page.getByText('su dígito verificador no corresponde').first()).toBeVisible();
  await page.locator('form button[type=submit]').click();
  await esperarAviso(page, 'dígito verificador');
  const importadores = await api(page, 'GET', '/importadores/');
  expect(importadores.find((i) => i.nombre === 'IMPORTADOR RUC MALO')).toBeUndefined();
  expect(errores).toEqual([]);
});

test('el N° de DAM se acepta con año corto y se guarda en su forma completa', async ({ page }) => {
  const errores = vigilarErrores(page);
  await iniciarSesion(page);
  const importador = (await api(page, 'GET', '/importadores/')).find((i) => i.nombre === 'IMPORTADORA E2E SAC');
  await api(page, 'POST', '/maestros/', { numero_factura: 'GF-E2E-VAL-1', id_importador: importador.id_importador });
  await page.goto('/app/logistica');
  await page.getByPlaceholder(/Buscar/).first().fill('GF-E2E-VAL-1');
  await page.getByText('FAC: GF-E2E-VAL-1').first().click();

  await page.getByRole('button', { name: /DAM Rápida/ }).first().click();
  const campo = page.getByPlaceholder('Ej: 118-2026-10-123456');
  const formulario = page.locator('form', { has: campo });
  await campo.fill('DAM 55');
  await formulario.locator('button[type=submit]').click();
  await esperarAviso(page, 'Formato esperado');

  await campo.fill('118-26-10-55');
  await formulario.locator('button[type=submit]').click();
  await esperarAviso(page, 'DAM registrada');
  await expect(page.getByText('118-2026-10-000055').first()).toBeVisible();

  // La misma DAM escrita de otra forma es la misma DAM: el sistema la reconoce como repetida
  await page.getByRole('button', { name: /DAM Rápida/ }).first().click();
  await campo.fill('118 2026 10 000055');
  await formulario.locator('button[type=submit]').click();
  await esperarAviso(page, 'ya está registrada');
  expect(errores).toEqual([]);
});

test('el comprobante de un proveedor nacional exige SERIE-NÚMERO y se completa con ceros', async ({ page }) => {
  const errores = vigilarErrores(page);
  await iniciarSesion(page);
  await page.goto('/app/gastos');
  await page.getByRole('button', { name: 'Nuevo Gasto' }).first().click();
  await elegirOpcion(page, 'Seleccione la DAM vinculada...', '118-2026-10-000001');
  await elegirOpcion(page, 'Seleccione concepto contable...', 'FLETE LOCAL');
  await elegirOpcion(page, 'Seleccione proveedor con RUC...', 'NAVIERA E2E');
  await elegirOpcion(page, 'Tipo de comprobante...', 'FACTURA');
  const monto = page.locator('form').getByPlaceholder('0.00').first();

  await page.getByPlaceholder('Ej. F001-123456').fill('F003 88');
  await monto.fill('15');
  await page.getByRole('button', { name: 'Guardar Gasto' }).click();
  await esperarAviso(page, 'SERIE-NÚMERO');

  await page.getByPlaceholder('Ej. F001-123456').fill('f003-88');
  await monto.fill('15.555');
  await page.getByRole('button', { name: 'Guardar Gasto' }).click();
  await esperarAviso(page, 'como máximo 2 decimales');

  await monto.fill('15.50');
  await page.getByRole('button', { name: 'Guardar Gasto' }).click();
  await expect(page.getByText('F003-00000088').first()).toBeVisible();
  expect(errores).toEqual([]);
});

test('un voucher con un monto mal escrito se avisa antes de enviarlo', async ({ page }) => {
  const errores = vigilarErrores(page);
  await iniciarSesion(page);
  await page.goto('/app/vouchers');
  await page.getByRole('button', { name: 'Nuevo Voucher' }).first().click();
  await elegirOpcion(page, 'Seleccionar banco...', 'BANCO E2E');
  await elegirOpcion(page, 'Seleccionar importador...', 'IMPORTADORA E2E SAC');
  await page.getByPlaceholder('Ej. OP-987654').fill('OP-E2E-VAL-1');
  await page.locator('form').getByPlaceholder('0.00').first().fill('100.999');
  await page.locator('form input[type=date]').first().fill(new Date().toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'Guardar Voucher' }).click();
  await esperarAviso(page, 'como máximo 2 decimales');
  const vouchers = (await api(page, 'GET', '/vouchers/', null)).data;
  expect(vouchers.find((v) => v.numero_operacion === 'OP-E2E-VAL-1')).toBeUndefined();
  expect(errores).toEqual([]);
});
