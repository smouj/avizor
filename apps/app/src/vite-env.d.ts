/// <reference types="vite/client" />

declare module '*.css'
declare module '@avizor/tokens/tokens.css'

/**
 * Compatibilidad de tipos: @types/react 19 movió `JSX` dentro de `React`.
 * Este alias global evita repetir el import en cada componente.
 */
import type { JSX as ReactJSX } from 'react'

declare global {
  /** Version del package.json, inyectada en build por vite.config.ts. */
  const __APP_VERSION__: string

  /** Variables de entorno de Vite que usa la interfaz. */
  interface ImportMetaEnv {
    /** VITE_DEMO=1 anade los datos de ejemplo a una compilacion de capturas. */
    readonly VITE_DEMO?: string
  }

  namespace JSX {
    type Element = ReactJSX.Element
    type ElementType = ReactJSX.ElementType
    type IntrinsicElements = ReactJSX.IntrinsicElements
  }
}
