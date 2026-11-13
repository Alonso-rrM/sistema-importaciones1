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
  globalIgnores(['dist']),
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
      // Deuda técnica conocida: estas reglas del compilador de React fallan en las páginas grandes
      // (Gastos, Logística, Pagos, Vouchers...). Quedan como ADVERTENCIA hasta la fase 4 del plan de
      // mejora (división en componentes y hooks); al cerrarla deben volver a 'error'.
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-refresh/only-export-components': 'warn',
      // Protección contra errores de digitación en estados, monedas, categorías, etc.
      'no-restricted-syntax': ['error', ...reglaValoresFijos],
    },
  },
  {
    // El propio archivo de constantes es el único lugar donde esos textos se escriben.
    files: ['src/constants/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
])
