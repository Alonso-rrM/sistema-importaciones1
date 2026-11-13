// Ciclo completo de cada catálogo desde la pantalla: alta, modificación, baja lógica y restauración.
import { test, expect } from '@playwright/test';
import { esperarAviso, iniciarSesion, responderDialogo, vigilarErrores } from './ayudas.js';

const CATALOGOS = [
  { ruta: 'bancos', boton: 'Nuevo Banco', nombre: 'BANCO PRUEBA UI', placeholderNombre: 'Ej. BCP, BBVA' },
  { ruta: 'almacenes', boton: 'Nuevo Almacén', nombre: 'ALMACEN PRUEBA UI', placeholderNombre: 'Ej. DP World Callao' },
  { ruta: 'agentes', boton: 'Nuevo Agente', nombre: 'AGENCIA PRUEBA UI', placeholderNombre: 'agencia de aduanas', ruc: '20200000011', placeholderRuc: 'Ej. 20111222333' },
  { ruta: 'importadores', boton: 'Nuevo Importador', nombre: 'IMPORTADOR PRUEBA UI', placeholderNombre: 'Nombre oficial o abreviado de la empresa', ruc: '20200000012', placeholderRuc: 'Ej. 20123456789' },
  { ruta: 'proveedores', boton: 'Nuevo Proveedor', nombre: 'PROVEEDOR PRUEBA UI', placeholderNombre: 'Nombre oficial o abreviado del proveedor', ruc: '20200000013', placeholderRuc: 'Ej. 20987654321' },
];

for (const cat of CATALOGOS) {
  test(`catálogo ${cat.ruta}: alta, modificación, baja y restauración`, async ({ page }) => {
    const errores = vigilarErrores(page);
    await iniciarSesion(page);
    await page.goto(`/app/${cat.ruta}`);

    // Alta
    await page.getByRole('button', { name: cat.boton }).first().click();
    if (cat.ruc) await page.getByPlaceholder(cat.placeholderRuc).fill(cat.ruc);
    await page.getByPlaceholder(cat.placeholderNombre).fill(cat.nombre);
    await page.locator('form button[type=submit]').click();
    await esperarAviso(page, 'exitosamente');
    const lista = page.locator('section').first();
    await expect(lista.getByText(cat.nombre, { exact: true })).toBeVisible();

    // Modificación
    await lista.getByText(cat.nombre, { exact: true }).click();
    await page.getByRole('button', { name: 'Modificar' }).click();
    await page.getByPlaceholder(cat.placeholderNombre).fill(`${cat.nombre} 2`);
    await page.locator('form button[type=submit]').click();
    await esperarAviso(page, 'actualizado');
    await expect(lista.getByText(`${cat.nombre} 2`, { exact: true })).toBeVisible();

    // Baja lógica: desaparece de "Activos" y aparece en "Inactivos"
    await lista.getByText(`${cat.nombre} 2`, { exact: true }).click();
    await responderDialogo(page, () => page.getByRole('button', { name: 'Desactivar' }).click());
    await esperarAviso(page, 'desactivado');
    await expect(lista.getByText(`${cat.nombre} 2`, { exact: true })).toBeHidden();
    await page.getByRole('button', { name: /^Inactivos/ }).click();
    await lista.getByText(`${cat.nombre} 2`, { exact: true }).click();

    // Restauración
    await page.getByRole('button', { name: 'Restaurar' }).click();
    await esperarAviso(page, 'restaurado');
    await page.getByRole('button', { name: /^Activos/ }).click();
    await expect(lista.getByText(`${cat.nombre} 2`, { exact: true })).toBeVisible();

    expect(errores).toEqual([]);
  });
}

test('catálogo de bancos: un nombre duplicado muestra el mensaje del sistema', async ({ page }) => {
  await iniciarSesion(page);
  await page.goto('/app/bancos');
  await page.getByRole('button', { name: 'Nuevo Banco' }).first().click();
  await page.getByPlaceholder('Ej. BCP, BBVA').fill('BANCO E2E');
  await page.locator('form button[type=submit]').click();
  await esperarAviso(page, 'ya está registrado');
});
