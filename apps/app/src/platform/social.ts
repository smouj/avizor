/**
 * Cuentas sociales: la parte de la interfaz que habla con el escritorio.
 *
 * El navegador **no** puede hacer esto: abrir la web oficial de una red con un
 * perfil propio, mantener su sesión y leer su identidad requiere el shell de
 * escritorio. Fuera de él, estas funciones lo dicen en vez de fingir que existe
 * el soporte.
 *
 * Lo que nunca viaja por aquí: contraseñas, tokens ni valores de cookies. El
 * inicio de sesión ocurre en la página del servicio, dentro de la ventana de
 * Avizor; lo único que se lee después es la identidad pública.
 */

import type {
  ActionResult,
  BrowserBridge,
  ForgetReport,
  MatrixSource,
  OpenSessionRequest,
  PublicIdentity,
  SessionCheckRequest,
  SessionProbe,
  TypedActionRequest,
} from '@avizor/social'
import { browserProfileIdFor, loginUrlFor, networkOf, sessionHostsFor } from '@avizor/social'

import { isDesktop } from './bridge'

/** Una cuenta como la maneja la interfaz: red, handle e instancia si es federada. */
export interface AccountTarget {
  /**
   * Entrada del catálogo. Se admite toda la matriz: una fuente de solo lectura
   * con página de inicio de sesión (GitHub) también puede tener su cuenta.
   */
  source: MatrixSource
  handle: string
  /** Solo en redes federadas (Mastodon, Lemmy): el dominio de la instancia. */
  instanceHost?: string
}

/** ¿Esta red es federada? (Su instancia la pone la cuenta, no el catálogo.) */
export function isFederated(source: MatrixSource): boolean {
  const descriptor = networkOf(source)
  if (!descriptor) return false
  return descriptor.tier !== 'feed' && descriptor.defaultDomains.length === 0
}

/** ¿Se le puede abrir sesión a esta red? (Las de solo lectura, sin login, no.) */
export function canOpenAccount(source: MatrixSource): boolean {
  return loginUrlFor(source) !== null || isFederated(source)
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: call } = await import('@tauri-apps/api/core')
  return call<T>(command, args)
}

const NO_DESKTOP = 'las cuentas sociales necesitan la aplicación de escritorio'

export const socialSupported = (): boolean => isDesktop()

/** Identificador del perfil de navegador de esa cuenta (`threads/smouj`). */
export function profileIdFor(target: AccountTarget): string {
  return browserProfileIdFor(target.source, target.handle)
}

/** Página oficial de inicio de sesión de esa cuenta. */
export function loginUrlForAccount(target: AccountTarget): string | null {
  return loginUrlFor(target.source, target.instanceHost)
}

/** Dominios contra los que se comprueba y se usa la sesión de esa cuenta. */
export function hostsForAccount(target: AccountTarget): string[] {
  return sessionHostsFor(target.source, target.instanceHost)
}

/**
 * Abre la ventana de la cuenta en la web oficial. Es el único camino para
 * iniciar sesión, y se hace en una ventana visible: sin formularios propios y
 * sin nada escondido.
 */
export async function openSession(
  target: AccountTarget,
): Promise<{ ok: boolean; error: string | null }> {
  const loginUrl = loginUrlForAccount(target)
  if (!loginUrl) {
    return {
      ok: false,
      error: isFederated(target.source)
        ? 'esta red es federada: hace falta el dominio de tu instancia para abrir su inicio de sesión'
        : 'esta fuente solo se lee: no tiene una página de inicio de sesión',
    }
  }
  if (!isDesktop()) return { ok: false, error: NO_DESKTOP }
  try {
    await invoke('social_open_session', {
      profileId: profileIdFor(target),
      loginUrl,
      hosts: hostsForAccount(target),
    })
    return { ok: true, error: null }
  } catch (error) {
    return { ok: false, error: String(error) }
  }
}

/** Mira si la sesión de esa cuenta sigue viva. Devuelve hechos, no veredictos. */
export async function checkSession(target: AccountTarget): Promise<SessionProbe | null> {
  if (!isDesktop()) return null
  try {
    return await invoke<SessionProbe>('social_check_session', {
      profileId: profileIdFor(target),
      hosts: hostsForAccount(target),
    })
  } catch {
    return null
  }
}

/** Identidad pública de la cuenta (avatar, nombre, handle, URL). */
export async function readIdentity(target: AccountTarget): Promise<PublicIdentity | null> {
  if (!isDesktop()) return null
  try {
    return await invoke<PublicIdentity | null>('social_read_identity', {
      profileId: profileIdFor(target),
    })
  } catch {
    return null
  }
}

/** Olvida la sesión: cierra la ventana y borra el perfil entero de esa cuenta. */
export async function forgetSession(target: AccountTarget): Promise<ForgetReport | null> {
  if (!isDesktop()) return null
  try {
    return await invoke<ForgetReport>('social_forget_session', {
      profileId: profileIdFor(target),
    })
  } catch {
    return null
  }
}

/** Cuentas con la ventana abierta ahora mismo. */
export async function openProfiles(): Promise<string[]> {
  if (!isDesktop()) return []
  try {
    return await invoke<string[]>('social_open_profiles')
  } catch {
    return []
  }
}

/**
 * El puente de navegador tal como lo ve la capa social. En el navegador devuelve
 * `null` a propósito: prometerlo cuando no se puede cumplir sería mentir.
 *
 * `perform()` todavía responde «sin soporte» porque **ninguna red tiene aún
 * adaptador de interacción**. El día que exista, este es el único sitio que
 * cambia; la matriz de capacidades seguirá diciendo la verdad mientras tanto.
 */
export function desktopBrowserBridge(): BrowserBridge | null {
  if (!isDesktop()) return null

  const unsupported = (request: TypedActionRequest): ActionResult => ({
    source: request.source,
    operation: request.operation,
    outcome: 'unsupported',
    verified: false,
    error: {
      code: 'UNSUPPORTED',
      message: 'Todavía no hay adaptador de interacción para esta red.',
      fallbackUrl: request.target?.url,
    },
    at: Date.now(),
  })

  return {
    async openSession(request: OpenSessionRequest): Promise<void> {
      await invoke('social_open_session', {
        profileId: request.id,
        loginUrl: request.loginUrl,
        // Los dominios son los de esa cuenta y ninguna otra: la comprobación se
        // repite en el shell antes de abrir la ventana.
        hosts: sessionHostsFor(request.source, request.instanceHost),
      })
    },
    async checkSession(request: SessionCheckRequest): Promise<SessionProbe> {
      return invoke<SessionProbe>('social_check_session', {
        profileId: request.id,
        hosts: request.hosts,
      })
    },
    async readIdentity(profile): Promise<PublicIdentity | null> {
      return invoke<PublicIdentity | null>('social_read_identity', { profileId: profile.id })
    },
    async perform(request: TypedActionRequest): Promise<ActionResult> {
      return unsupported(request)
    },
    async forgetSession(profile): Promise<ForgetReport> {
      return invoke<ForgetReport>('social_forget_session', { profileId: profile.id })
    },
    async openUrl(url: string): Promise<void> {
      const { openExternal } = await import('./bridge')
      await openExternal(url)
    },
  }
}
