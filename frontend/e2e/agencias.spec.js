// Agencias de aduana como grupos de RUC, y sus RUC primero al registrar un gasto del expediente.
import { test, expect } from '@playwright/test';
import { api, esperarAviso, iniciarSesion, responderDialogo, vigilarErrores } from './ayudas.js';

test.describe.configure({ mode: 'serial' });

const panelRucs = (page) => page.locator('[data-rucs-agencia]');

test('una agencia agrupa sus RUC: agregar uno existente, crear uno nuevo y quitarlo', async ({ page }) => {
  const errores = vigilarErrores(page);
  await iniciarSesion(page);
  await page.goto('/app/agentes');
  await page.locator('section').first().getByText('AGENCIA E2E', { exact: true }).click();
  await expect(panelRucs(page)).toContainText('20100000025');          // su RUC de los datos de ejemplo

  // Agregar un proveedor ya registrado
  await api(page, 'POST', '/proveedores/', { nombre: 'AGENCIA E2E LOGISTICA SAC', ruc: '20200000022' });
  await page.reload();
  await page.locator('section').first().getByText('AGENCIA E2E', { exact: true }).click();
  await page.locator('#agregar-ruc-agencia').fill('20200000022');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Agregar RUC' }).click();
  await esperarAviso(page, 'RUC 20200000022 agregado');
  await expect(panelRucs(page)).toContainText('AGENCIA E2E LOGISTICA SAC');

  // Crear un proveedor nuevo desde la agencia: queda en Proveedores y en el grupo
  await panelRucs(page).getByRole('button', { name: /Nuevo proveedor/ }).click();
  await page.getByPlaceholder('Ej. 20123456789').fill('20100000009');
  await page.getByPlaceholder('Ej. DISTRIBUIDORA LOGÍSTICA S.A.C.').fill('AGENCIA E2E TERCERA SAC');
  await page.locator('[role=dialog] button[type=submit]').click();
  await expect(panelRucs(page)).toContainText('AGENCIA E2E TERCERA SAC');

  // Quitar un RUC del grupo: el proveedor se conserva
  await responderDialogo(page, () => panelRucs(page).getByTitle('Quitar 20100000009 de la agencia').click());
  await esperarAviso(page, 'quitado');
  await expect(panelRucs(page)).not.toContainText('AGENCIA E2E TERCERA SAC');
  const proveedores = await api(page, 'GET', '/proveedores/');
  expect(proveedores.find((p) => p.nombre === 'AGENCIA E2E TERCERA SAC').id_agente).toBeNull();
  expect(errores).toEqual([]);
});

test('al registrar un gasto, los RUC de la agencia del expediente aparecen primero', async ({ page }) => {
  const errores = vigilarErrores(page);
  await iniciarSesion(page);
  await page.goto('/app/gastos');
  await page.getByRole('button', { name: 'Nuevo Gasto' }).first().click();
  const control = (texto) => page.locator('div[class*="control"]', { has: page.getByText(texto, { exact: true }) }).first();
  await control('Seleccione la DAM vinculada...').locator('input').focus();
  await page.keyboard.type('118-2026-10-000001');
  await page.keyboard.press('Enter');                                   // DAM del expediente GF-E2E-1 (AGENCIA E2E)
  await control('Seleccione proveedor con RUC...').locator('input').focus();
  await page.keyboard.press('ArrowDown');
  const menu = page.locator('div[class*="menu"]').first();
  await expect(menu.getByText('RUC de la agencia de aduanas del expediente')).toBeVisible();
  const primera = menu.locator('div[class*="option"]').first();
  await expect(primera).toContainText(/AGENCIA E2E/);
  expect(errores).toEqual([]);
});
