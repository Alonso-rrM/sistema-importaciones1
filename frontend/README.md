# Frontend del Sistema de Importaciones

React 19 + Vite + Tailwind. La instalación completa (backend y frontend) está en el
[README principal](../README.md) y la estructura del código en [`AGENTS.md`](../AGENTS.md).

| Comando | Para qué |
|---|---|
| `npm ci` | Instala las dependencias exactas de `package-lock.json` |
| `npm run dev` | Servidor de desarrollo en http://localhost:5173 (reenvía `/api` al backend en el puerto 8000) |
| `npm run lint:ci` | ESLint sin errores ni advertencias (lo exige GitHub Actions) |
| `npm test` | Reglas de validación de `src/utils/validaciones.js` con los mismos casos que el backend |
| `npm run build` | Versión para producción en `dist/` |
| `npm run e2e` | Pruebas en navegador con Playwright (ver [`e2e/README.md`](e2e/README.md)) |

`.env.development` define `VITE_API_URL=/api`: el navegador llama a `/api/...` y Vite lo reenvía a la API.
En producción, el servidor web que entregue `dist/` debe reenviar `/api` al backend de la misma forma.
