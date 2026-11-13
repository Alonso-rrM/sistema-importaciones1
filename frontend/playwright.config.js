// Pruebas de extremo a extremo: levantan el backend (FastAPI) y el frontend compilado contra una base de
// PRUEBAS, y recorren las pantallas como lo haría la usuaria. Ver e2e/README.md.
import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, '..');
const PUERTO_API = Number(process.env.E2E_PUERTO_API || 8010);
const PUERTO_WEB = Number(process.env.E2E_PUERTO_WEB || 4180);
const PYTHON = process.env.E2E_PYTHON || 'python';
const BASE_E2E = process.env.E2E_DATABASE_URL;
export const SESION_GUARDADA = path.join(aqui, 'e2e', '.sesion', 'admin.json');

if (!BASE_E2E) {
  throw new Error('Defina E2E_DATABASE_URL (base de PRUEBAS desechable cuyo nombre contenga "test").');
}

export default defineConfig({
  testDir: './e2e',
  // Las pruebas comparten una sola base de datos: se ejecutan en orden, de a una
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/preparar.js',
  use: {
    baseURL: `http://localhost:${PUERTO_WEB}`,
    viewport: { width: 1440, height: 950 },
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Inicia sesión UNA vez y guarda la sesión: el login tiene un límite de intentos por minuto
    { name: 'sesion', testMatch: /sesion\.setup\.js/ },
    {
      name: 'chromium',
      dependencies: ['sesion'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 950 }, storageState: SESION_GUARDADA },
    },
  ],
  webServer: [
    {
      command: `${PYTHON} -m uvicorn main:app --port ${PUERTO_API}`,
      cwd: raiz,
      url: `http://localhost:${PUERTO_API}/`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        DATABASE_URL: BASE_E2E,
        SECRET_KEY: 'clave-solo-para-pruebas-e2e-0123456789abcdef',
        CORS_ORIGINS: `http://localhost:${PUERTO_WEB}`,
      },
    },
    {
      command: `npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --port ${PUERTO_WEB} --strictPort`,
      cwd: aqui,
      url: `http://localhost:${PUERTO_WEB}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { VITE_API_URL: `http://localhost:${PUERTO_API}` },
    },
  ],
});

