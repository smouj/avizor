/**
 * Puente de navegador: el contrato, no la implementación.
 *
 * Aquí se declara qué puede pedirle Latido al navegador y qué no. La
 * implementación vive en el escritorio (Tauri): un perfil propio por cuenta,
 * ventana visible, sesión persistente y operaciones tipeadas.
 *
 * Lo que este contrato prohíbe por diseño:
 *
 * - Pedir credenciales: no hay ningún campo donde quepan. El usuario entra en
 *   la página real de la red, dentro del perfil de Latido.
 * - Ejecutar JavaScript arbitrario: solo llegan `TypedActionRequest`.
 * - Hablar con una red desde el perfil de otra: cada operación lleva sus hosts.
 */

import { allowedHostsFor, normalizeHost } from './urls'
import type { ForgetReport, SessionProbe } from './probe'
import type { ActionResult, MatrixSource, PublicIdentity, TypedActionRequest } from './types'

export interface BrowserProfileRef {
  /** Identificador del perfil de Latido para esa cuenta (`threads/smouj`). */
  id: string
  /**
   * Entrada del catálogo a la que pertenece la cuenta. Se admite toda la matriz
   * y no solo las redes sociales: una fuente de solo lectura con página de
   * inicio de sesión (GitHub) también puede tener su cuenta y su perfil.
   */
  source: MatrixSource
}

export interface OpenSessionRequest extends BrowserProfileRef {
  /** Página real de inicio de sesión de la red. Se abre tal cual. */
  loginUrl: string
  /** Redes federadas: dominio de la instancia de la cuenta. */
  instanceHost?: string
}

export interface SessionCheckRequest extends BrowserProfileRef {
  /** Hosts contra los que se comprueba la sesión. Nunca otros. */
  hosts: string[]
}

export interface BrowserBridge {
  /** Abre la web oficial en una ventana visible, con el perfil de esa cuenta. */
  openSession(request: OpenSessionRequest): Promise<void>
  /**
   * ¿Sigue viva la sesión? Devuelve **hechos** (ventana abierta, recuento de
   * cookies por dominio), no un veredicto: la política vive en
   * [`sessionFromProbe`](./probe.ts), donde tiene pruebas.
   */
  checkSession(request: SessionCheckRequest): Promise<SessionProbe>
  /** Identidad pública de la cuenta: avatar, nombre, handle y URL. Nada más. */
  readIdentity(profile: BrowserProfileRef): Promise<PublicIdentity | null>
  /** Ejecuta una operación tipeada. Nunca JavaScript libre. */
  perform(request: TypedActionRequest): Promise<ActionResult>
  /** Borra el perfil entero de esa cuenta: cookies, almacenamiento y sesión. */
  forgetSession(profile: BrowserProfileRef): Promise<ForgetReport>
  /** Abre una URL en el navegador del sistema (el fallback honesto). */
  openUrl(url: string): Promise<void>
}

/**
 * Páginas oficiales de inicio de sesión. Son las del propio sitio; Latido no
 * dibuja ningún formulario propio.
 */
const LOGIN_URLS: Record<MatrixSource, string> = {
  threads: 'https://www.threads.net/login',
  bluesky: 'https://bsky.app/',
  reddit: 'https://www.reddit.com/login/',
  x: 'https://x.com/i/flow/login',
  instagram: 'https://www.instagram.com/accounts/login/',
  facebook: 'https://www.facebook.com/login',
  youtube: 'https://accounts.google.com/ServiceLogin',
  tiktok: 'https://www.tiktok.com/login',
  linkedin: 'https://www.linkedin.com/login',
  pinterest: 'https://www.pinterest.com/login/',
  tumblr: 'https://www.tumblr.com/login',
  // Mastodon y Lemmy son federados: el host lo pone la cuenta.
  mastodon: '',
  lemmy: '',
  itchio: 'https://itch.io/login',
  producthunt: 'https://www.producthunt.com/login',
  discord: 'https://discord.com/login',
  huggingface: 'https://huggingface.co/login',
  npm: 'https://www.npmjs.com/login',
  twitch: 'https://www.twitch.tv/login',
  // Telegram abre sesión en su cliente web con el móvil delante.
  telegram: 'https://web.telegram.org/',
  github: 'https://github.com/login',
  // Hacker News y RSS se leen, pero no tienen dónde iniciar sesión.
  hackernews: '',
  rss: '',
}

/**
 * URL de inicio de sesión de una red. En las federadas hace falta el host de la
 * instancia, que sale de la propia cuenta.
 */
export function loginUrlFor(source: MatrixSource, instanceHost?: string): string | null {
  const base = LOGIN_URLS[source]
  if (base) return base
  if (!instanceHost) return null
  const clean = normalizeHost(instanceHost)
  if (clean === null) return null
  return source === 'mastodon' ? `https://${clean}/auth/sign_in` : `https://${clean}/login`
}

/** Hosts contra los que se comprueba la sesión de una cuenta. */
export function sessionHostsFor(source: MatrixSource, instanceHost?: string): string[] {
  return allowedHostsFor(source, instanceHost ? [instanceHost] : [])
}

/** Ruta del perfil de Latido para una cuenta: un directorio por red y cuenta. */
export function browserProfileIdFor(source: MatrixSource, handle: string): string {
  const clean = handle
    .trim()
    .replace(/^@/, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
  return `${source}/${clean}`
}
