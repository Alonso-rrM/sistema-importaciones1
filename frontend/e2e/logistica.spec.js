// Pantalla de Logística: modificar un expediente, registrar un gasto rápido, ver su avance y eliminarlo.
import { test, expect } from '@playwright/test';
import { api, campoTrasRotulo, esperarAviso, iniciarSesion, vigilarErrores } from './ayudas.js';

test.describe.configure({ mode: 'serial' });

/** Crea por API un expediente con una DAM y devuelve ambos. */
async function crearExpedienteDePrueba(page, factura, numeroDam) {
  const importador = (await api(page, 'GET', '/importadores/')).find((i) => i.nombre === 'IMPORTADORA E2E SAC');
  const maestro = await api(page, 'POST', '/maestros/', { numero_factura: factura, id_importador: importador.id_importador, tipo_valor: 'DEFINITIVO' });
  const dam = numeroDam
    ? await api(page, 'POST', '/dams/', { id_maestro: maestro.id_maestro, numero_de_dam: numeroDam, canal_control: 'VERDE' })
    : null;
  return { maestro, dam };
}

async function abrirExpediente(page, factura) {
  await page.goto('/app/logistica');
  await page.getByPlaceholder(/Buscar/).first().fill(factura);
  await page.getByText(`FAC: ${factura}`).first().click();
  await expect(page.getByText(`Expediente Factura ${factura}`)).toBeVisible();
}

test('modificar el documento de transporte de un expediente', async ({ page }) => {
  const errores = vigilarErrores(page);
  await iniciarSesion(page);
  const { maestro } = await crearExpedienteDePrueba(page, 'GF-E2E-LOG-1');
  await abrirExpediente(page, 'GF-E2E-LOG-1');

  await campoTrasRotulo(page, 'BL / Transporte').fill('BL-E2E-777');
  await page.getByRole('button', { name: 'Guardar Cambios' }).click();
  await esperarAviso(page, 'Expediente guardado');
  await expect(page.getByText('BL: BL-E2E-777').first()).toBeVisible();   // la bandeja refleja el cambio

  // Un segundo guardado usa la versión nueva (sin conflicto de bloqueo optimista)
  await campoTrasRotulo(page, 'Contenedor Físico').fill('MSKU1234567');
  await page.getByRole('button', { name: 'Guardar Cambios' }).click();
  await esperarAviso(page, 'Expediente guardado');
  const guardado = (await api(page, 'GET', '/maestros/?search=GF-E2E-LOG-1', null)).data.find((m) => m.id_maestro === maestro.id_maestro);
  expect(guardado.documento_transporte).toBe('BL-E2E-777');
  expect(guardado.n_cont_fisico).toBe('MSKU1234567');
  expect(errores).toEqual([]);
});

test('registrar un gasto rápido desde el expediente', async ({ page }) => {
  const errores = vigilarErrores(page);
  await iniciarSesion(page);
  await crearExpedienteDePrueba(page, 'GF-E2E-LOG-2', '118-2026-10-000555');
  await abrirExpediente(page, 'GF-E2E-LOG-2');

  await page.getByRole('button', { name: /Gastos Logísticos/ }).click();
  await page.getByRole('button', { name: /Registrar Gasto Rápido/ }).click();
  const formulario = page.locator('form', { has: page.getByPlaceholder('Ej: F001-9988') });
  const listas = formulario.locator('select');
  await expect(listas.nth(0)).toHaveValue(/\d+/);   // la DAM del expediente viene elegida
  await listas.nth(1).selectOption({ label: 'FLETE LOCAL' });
  await listas.nth(2).selectOption({ label: 'NAVIERA E2E' });
  await listas.nth(3).selectOption({ label: 'FACTURA' });
  await formulario.getByPlaceholder('Ej: F001-9988').fill('F020-5');
  await formulario.getByPlaceholder('0.00').fill('33.40');
  await formulario.locator('button[type=submit]').click();
  await esperarAviso(page, 'Gasto registrado');
  await expect(page.locator('tr', { hasText: 'FLETE LOCAL' }).first()).toBeVisible();
  await expect(page.getByText('33.40').first()).toBeVisible();
  // El avance de pagos del contenedor se muestra con el gasto pendiente
  await expect(page.getByText('Termómetro Financiero del Contenedor')).toBeVisible();
  expect(errores).toEqual([]);
});

test('eliminar un expediente exige un motivo', async ({ page }) => {
  const errores = vigilarErrores(page);
  await iniciarSesion(page);
  const { maestro } = await crearExpedienteDePrueba(page, 'GF-E2E-LOG-3');
  await abrirExpediente(page, 'GF-E2E-LOG-3');

  await page.getByTitle('Eliminar Expediente').click();
  await page.getByPlaceholder('Motivo de auditoría').fill('corto');
  await page.getByRole('button', { name: 'Eliminar Maestro' }).click();
  await esperarAviso(page, 'al menos 10 caracteres');
  await page.getByPlaceholder('Motivo de auditoría').fill('Prueba e2e: expediente creado por error');
  await page.getByRole('button', { name: 'Eliminar Maestro' }).click();
  await expect(page.getByText(`FAC: GF-E2E-LOG-3`)).toHaveCount(0);

  const restantes = (await api(page, 'GET', '/maestros/', null)).data.filter((m) => m.id_maestro === maestro.id_maestro);
  expect(restantes).toEqual([]);
  expect(errores).toEqual([]);
});
