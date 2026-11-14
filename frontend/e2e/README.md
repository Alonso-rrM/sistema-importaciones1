# Pruebas en navegador (extremo a extremo)

Recorren el sistema como lo haría la usuaria: abren las pantallas, llenan formularios, registran y anulan
pagos, crean expedientes, etc. Sirven para comprobar que un cambio en el frontend no rompió ninguna pantalla.

## Qué necesitan

- Python con las dependencias del backend (`pip install -r requirements-dev.txt`).
- Node con las dependencias del frontend (`npm ci`) y el navegador de Playwright
  (`npx playwright install chromium`, una sola vez).
- Una base PostgreSQL **desechable** cuyo nombre contenga `test`. **Las pruebas borran todo su contenido.**

## Cómo correrlas (desde `frontend/`)

```bash
E2E_DATABASE_URL=postgresql://usuario:clave@localhost:5432/erp_e2e_test npm run e2e
```

Playwright prepara la base (`scripts/preparar_base_e2e.py`), levanta el backend en el puerto 8010 y el
frontend compilado en el 4180, e inicia sesión una sola vez (el login tiene un límite de intentos por minuto).

Variables opcionales: `E2E_PYTHON` (intérprete de Python, por defecto `python`), `E2E_PUERTO_API`,
`E2E_PUERTO_WEB`, `E2E_ADMIN_USUARIO`, `E2E_ADMIN_CLAVE`.

## Archivos

| Archivo | Qué prueba |
|---|---|
| `navegacion.spec.js` | Login y que cada pantalla cargue sus datos sin errores de JavaScript |
| `catalogos.spec.js` | Alta, modificación, baja y restauración en cada catálogo |
| `finanzas.spec.js` | Registrar un gasto, pagarlo, anular el pago y corregir el tipo de cambio |
| `operaciones.spec.js` | Crear un expediente con su DAM; crear y eliminar un voucher |
| `gastos.spec.js` | Modificar un gasto, reversar uno de sus pagos, eliminarlo con motivo y registrarlo desde una DAM |
| `logistica.spec.js` | Modificar un expediente, registrarle un gasto rápido y eliminarlo con motivo |
| `ayudas.js` | Funciones comunes (iniciar sesión, responder diálogos, elegir opciones) |
