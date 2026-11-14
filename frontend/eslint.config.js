import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import * as constantes from './src/constants/index.js'

// Valores fijos del sistema que NO deben escribirse a mano en las pantallas (ver src/constants).
// Se excluyen tres textos que también se usan con otro significado:
//   'PENDIENTE'   -> opción del filtro de aforo en Dams.jsx
//   'CON LEVANTE' -> búsqueda parcial dentro del estado del contenedor en Logistica.jsx
//   'SIN NUMERAR' -> texto de relleno cuando una DAM aún no tiene estado
const TEXTOS_CON_OTRO_USO = new Set(['PENDIENTE', 'CON LEVANTE', 'SIN NUMERAR'])
const valoresFijos = [...new Set(
  Object.values(constantes).flatMap(grupo => Object.values(grupo)).filter(v => typeof v === 'string')
)].filter(v => !TEXTOS_CON_OTRO_USO.has(v))
const reglaValoresFijos = valoresFijos.map(valor => ({
  selector: `Literal[value=${JSON.stringify(valor)}]`,
  message: `No escriba "${valor}" a mano: use la constante de src/constants.`,
}))

export default defineConfig([
  globalIgnores(['dist', 'dist-e2e', 'playwright-report', 'test-results']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Reglas del compilador de React (inmutabilidad, setState en efectos, pureza...): quedan como ERROR,
      // tal como vienen en la configuración recomendada. Se resolvieron todas en la fase 4 del plan.
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
      // Avisos y confirmaciones: usar useInteraccion() (avisar / confirmar / pedirDatos), no los del navegador
      'no-alert': 'error',
      // Protección contra errores de digitación en estados, monedas, categorías, etc.
      'no-restricted-syntax': ['error', ...reglaValoresFijos],
    },
  },
  {
    // Pruebas en navegador y configuración de Playwright: corren en Node, no en el navegador
    files: ['e2e/**/*.js', 'playwright.config.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { 'react-hooks/rules-of-hooks': 'off', 'no-restricted-syntax': 'off' },
  },
  {
    // El propio archivo de constantes es el único lugar donde esos textos se escriben.
    files: ['src/constants/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
])
