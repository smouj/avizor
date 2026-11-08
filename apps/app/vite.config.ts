import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * Dos destinos con una sola base de código:
 *  - `tauri dev` y `tauri build` usan `build` (dist) dentro del WebView.
 *  - `vite build` produce una web estática que funciona en cualquier navegador.
 */
// La version sale del package.json en tiempo de build: antes estaba escrita a
// mano en Ajustes y se quedo en 0.2.2 durante tres versiones.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: {
      // El motor se consume en TypeScript directamente: sin paso de compilación
      // intermedio, el error aparece en el sitio donde se escribe.
      '@': resolve(here, 'src'),
      '@avizor/engine': resolve(here, '../../packages/engine/src/index.ts'),
      '@avizor/social': resolve(here, '../../packages/social/src/index.ts'),
      '@avizor/tokens/tokens.css': resolve(here, '../../packages/tokens/dist/tokens.css'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Vite 7 tipa manualChunks como función: el objeto ya no es válido.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/zustand/')) {
            return 'vendor';
          }
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
