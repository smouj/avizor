/**
 * Hechos crudos del puente de navegador, y su traducción a estado de sesión.
 *
 * El escritorio (Rust) informa de **lo que ve**: la ventana está abierta o no,
 * cuántas cookies hay en cada dominio y cuándo se miró. Nunca valores de cookies.
 * La política —qué significa eso para la interfaz— se decide aquí, que es donde
 * hay pruebas.
 */

import { canInteract, connectedSession, loginRequired } from './session'
import type { SessionState } from './types'

/** Cookies encontradas en un dominio. Solo el recuento. */
export interface HostProbe {
  host: string
  cookies: number
}

/** Lo que el escritorio sabe de la sesión de una cuenta tras mirarla. */
export interface SessionProbe {
  profileId: string
  /** epoch ms de la comprobación. */
  checkedAt: number
  /** ¿Estaba abierta la ventana de esa cuenta? */
  windowOpen: boolean
  hosts: HostProbe[]
  hasSession: boolean
  detail?: string | null
}

/** Lo que se borró al olvidar una sesión. */
export interface ForgetReport {
  profileId: string
  windowClosed: boolean
  directoryRemoved: boolean
  detail?: string | null
}

const NO_WINDOW_DETAIL =
  'la ventana de esta cuenta no está abierta, así que no se pudo comprobar la sesión'

/**
 * Traduce lo que vio el escritorio al estado de sesión que usa el resto del
 * programa. Reglas deliberadas:
 *
 * - Sin ventana abierta no se puede comprobar nada: se dice, y lo que ya se sabía
 *   se conserva como mucho en solo lectura. No se degrada a «caducada» por no
 *   poder mirar.
 * - Con sesión, el estado es `CONNECTED`: que se pueda escribir lo decide la
 *   prueba de interacción del adaptador, no esta comprobación.
 * - Sin cookies y sin sesión, se pide iniciar sesión con el motivo por delante.
 */
export function sessionFromProbe(probe: SessionProbe, previous: SessionState): SessionState {
  const checkedAt = probe.checkedAt > 0 ? probe.checkedAt : null

  if (!probe.windowOpen) {
    const keepConnected = previous.connection === 'CONNECTED'
    const health = keepConnected
      ? canInteract(previous)
        ? 'READ_ONLY'
        : previous.health
      : previous.health
    return {
      connection: previous.connection,
      health,
      checkedAt,
      since: previous.since,
      detail: probe.detail ?? NO_WINDOW_DETAIL,
    }
  }

  if (probe.hasSession) {
    const at = checkedAt ?? previous.since ?? previous.checkedAt
    if (at === null) {
      // Se sabe que hay sesión, pero no cuándo se comprobó ni desde cuándo:
      // se dice eso en vez de poner una fecha inventada.
      return { connection: 'CONNECTED', health: 'CONNECTED', checkedAt: null, since: null }
    }
    return connectedSession(at, previous.since ?? at)
  }

  return loginRequired(
    checkedAt ?? 0,
    probe.detail ?? 'la red no tiene una sesión abierta en este perfil',
  )
}

/** Resumen legible de la comprobación, para la pantalla de Cuentas. */
export function summarizeProbe(probe: SessionProbe): { cookies: number; hosts: number } {
  return {
    cookies: probe.hosts.reduce((total, host) => total + host.cookies, 0),
    hosts: probe.hosts.length,
  }
}
