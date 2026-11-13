// Ciclo completo de cada catálogo desde la pantalla: alta, modificación, baja lógica y restauración.
import { test, expect } from '@playwright/test';
import { esperarAviso, iniciarSesion, responderDialogo, vigilarErrores } from './ayudas.js';

const CATALOGOS = [
  { ruta: 'bancos', boton: 'Nuevo Banco', nombre: 'BANCO PRUEBA UI', placeholderNombre: 'Ej. BCP, BBVA' },
  { ruta: 'almacenes', boton: 'Nuevo Almacén', nombre: 'ALMACEN PRUEBA UI', placeholderNombre: 'Ej. DP World Callao' },
  { ruta: 'agentes', boton: 'Nuevo Agente', nombre: 'AGENCIA PRUEBA UI', placeholderNombre: 'agencia de aduanas', ruc: '20200000011', placeholderRuc: 'Ej. 20111222333' },
  { ruta: 'importadores', boton: 'Nuevo Importador', nombre: 'IMPORTADOR PRUEBA UI', placeholderNombre: 'Nombre oficial o abreviado de la empresa', ruc: '20200000012', placeholderRuc: 'Ej. 20123456789' },
  { ruta: 'proveedores', boton: 'Nuevo Proveedor', nombre: 'PROVEEDOR PRUEBA UI', placeholderNombre: 'Nombre oficial o abreviado del proveedor', ruc: '20200000013', placeholderRuc: 'Ej. 20987654321' },
  { ruta: 'comprobantes', boton: 'Nuevo Comprobante', nombre: 'NOTA DE CREDITO UI', placeholderNombre: 'Ej. Factura Comercial' },
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

test('almacenes: la ubicación se guarda y se muestra', async ({ page }) => {
  await iniciarSesion(page);
  await page.goto('/app/almacenes');
  await page.getByRole('button', { name: 'Nuevo Almacén' }).first().click();
  await page.getByPlaceholder('Ej. DP World Callao').fill('ALMACEN CON UBICACION');
  await page.getByPlaceholder('Ej. Av. Manco Cápac').fill('Av. Néstor Gambetta 123, Callao');
  await page.locator('form button[type=submit]').click();
  await esperarAviso(page, 'exitosamente');
  await page.reload();
  await page.locator('section').first().getByText('ALMACEN CON UBICACION', { exact: true }).click();
  await expect(page.getByText('Av. Néstor Gambetta 123, Callao').first()).toBeVisible();
});

test('proveedores: se puede registrar una entidad del Estado y filtrar por categoría', async ({ page }) => {
  await iniciarSesion(page);
  await page.goto('/app/proveedores');
  await page.getByRole('button', { name: 'Nuevo Proveedor' }).first().click();
  await page.getByPlaceholder('Ej. 20987654321').fill('20200000099');
  await page.locator('form select').selectOption({ label: 'Estado / Tributo (SUNAT)' });
  await page.getByPlaceholder('Nombre oficial o abreviado del proveedor').fill('MUNICIPALIDAD DEL CALLAO');
  await page.locator('form button[type=submit]').click();
  await esperarAviso(page, 'exitosamente');

  const lista = page.locator('section').first();
  await lista.locator('select').selectOption({ label: 'Estado / Tributo (SUNAT)' });
  await expect(lista.getByText('MUNICIPALIDAD DEL CALLAO', { exact: true })).toBeVisible();
  await expect(lista.getByText('SUNAT', { exact: true })).toBeVisible();          // creado en los datos de ejemplo
  await expect(lista.getByText('NAVIERA E2E', { exact: true })).toBeHidden();     // nacional: queda fuera del filtro
});

test('comprobantes: el multiplicador se guarda como número (-1 para notas de crédito)', async ({ page }) => {
  await iniciarSesion(page);
  await page.goto('/app/comprobantes');
  await page.getByRole('button', { name: 'Nuevo Comprobante' }).first().click();
  await page.getByPlaceholder('Ej. Factura Comercial').fill('NOTA DE DEBITO UI');
  await page.locator('form select').selectOption({ label: '-1 (Resta al costo - Notas de Crédito, Devoluciones)' });
  await page.locator('form button[type=submit]').click();
  await esperarAviso(page, 'exitosamente');
  await expect(page.getByText('Resta al Gasto (-1)').first()).toBeVisible();
});
