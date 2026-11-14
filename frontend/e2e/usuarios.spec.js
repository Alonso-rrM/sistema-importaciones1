// Pantalla de usuarios (Administrador) y cambio de la contraseña propia.
import { test, expect } from '@playwright/test';
import { api, esperarAviso, iniciarSesion, responderDialogo, vigilarErrores } from './ayudas.js';
import { ROL } from '../src/constants/index.js';

test.describe.configure({ mode: 'serial' });

const NUEVO = { usuario: 'logi.e2e', correo: 'logi.e2e@empresa.test', clave: 'Clave-Logi-001' };

const fila = (page, usuario) => page.locator(`tr[data-usuario="${usuario}"]`);

test('el Administrador crea un usuario y le cambia el rol', async ({ page }) => {
  const errores = vigilarErrores(page);
  await iniciarSesion(page);
  await page.goto('/app/usuarios');
  await expect(fila(page, 'admin')).toContainText('(usted)');
  await expect(fila(page, 'admin').getByRole('button', { name: 'Desactivar' })).toHaveCount(0);   // no puede desactivarse

  await page.getByRole('button', { name: 'Nuevo Usuario' }).click();
  await page.getByLabel('Usuario (para iniciar sesión) *').fill(NUEVO.usuario);
  await page.getByLabel('Correo *').fill(NUEVO.correo);
  await page.getByLabel('Rol *').selectOption(String(ROL.AUDITOR));
  await page.getByLabel('Contraseña *').fill('corta');
  await page.getByLabel('Repetir *').fill('corta');
  await page.getByRole('button', { name: 'Crear usuario' }).click();
  await esperarAviso(page, 'al menos 10 caracteres');

  await page.getByLabel('Contraseña *').fill(NUEVO.clave);
  await page.getByLabel('Repetir *').fill(NUEVO.clave);
  await page.getByRole('button', { name: 'Crear usuario' }).click();
  await esperarAviso(page, `Usuario ${NUEVO.usuario} creado`);
  await expect(fila(page, NUEVO.usuario)).toBeVisible();

  // Cambio de rol: se confirma y rige en el servidor
  await responderDialogo(page, () => fila(page, NUEVO.usuario).getByLabel(`Rol de ${NUEVO.usuario}`)
    .selectOption(String(ROL.OPERACIONES)));
  await esperarAviso(page, 'ahora tiene el rol');
  const usuarios = await api(page, 'GET', '/usuarios/');
  expect(usuarios.find((u) => u.username === NUEVO.usuario).id_rol).toBe(ROL.OPERACIONES);
  expect(errores).toEqual([]);
});

test('el usuario cambia su propia contraseña y vuelve a ingresar con la nueva', async ({ browser }) => {
  // Contexto aparte: sin la sesión del Administrador que comparten las demás pruebas
  const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await contexto.newPage();
  const errores = vigilarErrores(page);
  const ingresar = async (clave) => {
    await page.goto('/login');
    await page.locator('input').nth(0).fill(NUEVO.usuario);
    await page.locator('input[type=password]').fill(clave);
    await page.locator('button[type=submit]').click();
    await page.waitForURL('**/app/**');
  };
  await ingresar(NUEVO.clave);

  await page.getByTitle('Cambiar mi contraseña').click();
  const dialogo = page.locator('[data-dialogo]');
  await dialogo.locator('input').nth(0).fill(NUEVO.clave);
  await dialogo.locator('input').nth(1).fill('Clave-Logi-002');
  await dialogo.locator('input').nth(2).fill('Clave-Logi-002');
  await dialogo.locator('[data-dialogo-aceptar]').click();
  await page.waitForURL('**/login');

  await ingresar('Clave-Logi-002');
  await expect(page).toHaveURL(/\/app\//);
  expect(errores).toEqual([]);
  await contexto.close();
});

test('el Administrador restablece la contraseña y desactiva al usuario', async ({ page }) => {
  const errores = vigilarErrores(page);
  await iniciarSesion(page);
  await page.goto('/app/usuarios');
  await responderDialogo(page, () => fila(page, NUEVO.usuario).getByRole('button', { name: /Restablecer/ }).click(),
    'Clave-Temporal-9', 'Clave-Temporal-9');
  await esperarAviso(page, 'Sus sesiones abiertas se cerraron');

  await responderDialogo(page, () => fila(page, NUEVO.usuario).getByRole('button', { name: 'Desactivar' }).click());
  await esperarAviso(page, 'desactivado');
  await expect(fila(page, NUEVO.usuario)).toHaveCount(0);          // los desactivados se ocultan
  await page.getByLabel('Mostrar desactivados').check();
  await expect(fila(page, NUEVO.usuario)).toContainText('Desactivado');
  expect(errores).toEqual([]);
});
