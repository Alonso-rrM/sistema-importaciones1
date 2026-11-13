// Inicia sesión una sola vez y guarda cookies y datos locales para el resto de las pruebas.
import { test as preparar } from '@playwright/test';
import { iniciarSesionDesdeCero } from './ayudas.js';
import { SESION_GUARDADA } from '../playwright.config.js';

preparar('iniciar sesión como administrador', async ({ page }) => {
  await iniciarSesionDesdeCero(page);
  await page.context().storageState({ path: SESION_GUARDADA });
});
