// ESLint 10 solo entiende configuración plana: el repo tenía el script `lint`
// pero ningún archivo de configuración, así que `pnpm lint` nunca llegaba a correr.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

const nodeGlobals = {
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  URL: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  fetch: 'readonly',
}

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/target/**', '**/*.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: nodeGlobals },
    rules: {
      // TypeScript ya detecta identificadores inexistentes; no-undef solo aporta ruido.
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: nodeGlobals },
  },
)
