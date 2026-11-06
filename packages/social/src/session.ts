/**
 * Estado de la sesión de una cuenta.
 *
 * Una sesión no es un booleano: tiene estados que cambian lo que la interfaz
 * ofrece. Este módulo los construye y decide qué se puede hacer con cada uno.
 * Nunca hay un fallo silencioso: cada estado distinto de `CONNECTED` lleva su
 * motivo en `detail`.
 */

import type { ActionError, SessionState } from './types'

export function disconnectedSession(): SessionState {
  return { connection: 'DISCONNECTED', health: 'LOGIN_REQUIRED', checkedAt: null, since: null }
}

export function loginRequired(now: number, detail?: string): SessionState {
  return {
    connection: 'DISCONNECTED',
    health: 'LOGIN_REQUIRED',
    checkedAt: now,
    since: null,
    ...(detail ? { detail } : {}),
  }
}

/** Sesión recién establecida, pendiente de la primera prueba de interacción. */
export function connectedSession(now: number, since: number = now): SessionState {
  return { connection: 'CONNECTED', health: 'CONNECTED', checkedAt: now, since }
}

/** La prueba de salud confirmó que el camino de interacción funciona. */
export function interactiveSession(previous: SessionState, now: number): SessionState {
  return {
    connection: 'CONNECTED',
    health: 'INTERACTION_AVAILABLE',
    checkedAt: now,
    since: previous.since ?? now,
  }
}

/**
 * La sesión sigue viva pero la interacción no está disponible ahora mismo
 * (cambio de interfaz del sitio, límite temporal, función retirada). Seguir
 * leyendo sí; escribir, no.
 */
export function readOnlySession(
  previous: SessionState,
  now: number,
  detail?: string,
): SessionState {
  return {
    connection: 'CONNECTED',
    health: 'READ_ONLY',
    checkedAt: now,
    since: previous.since,
    ...(detail ? { detail } : {}),
  }
}

export function expiredSession(previous: SessionState, now: number, detail?: string): SessionState {
  return {
    connection: 'DISCONNECTED',
    health: 'SESSION_EXPIRED',
    checkedAt: now,
    since: previous.since,
    ...(detail ? { detail } : {}),
  }
}

/**
 * La interfaz de la red cambió y los selectores del adaptador ya no encajan.
 * No se hace nada a escondidas: se dice y se ofrece la salida manual.
 */
export function selectorsOutdated(
  previous: SessionState,
  now: number,
  detail?: string,
): SessionState {
  return {
    connection: 'CONNECTED',
    health: 'SELECTORS_OUTDATED',
    checkedAt: now,
    since: previous.since,
    ...(detail ? { detail } : {}),
  }
}

export function unavailableSession(now: number, detail?: string): SessionState {
  return {
    connection: 'DISCONNECTED',
    health: 'UNAVAILABLE',
    checkedAt: now,
    since: null,
    ...(detail ? { detail } : {}),
  }
}

/** ¿Hay sesión viva? (leer sí; escribir depende de `canInteract`). */
export function isSessionLive(session: SessionState): boolean {
  return session.connection === 'CONNECTED'
}

/** ¿Se puede escribir en la red ahora mismo? */
export function canInteract(session: SessionState): boolean {
  return session.connection === 'CONNECTED' && session.health === 'INTERACTION_AVAILABLE'
}

/**
 * Clave de traducción para el estado. `apps/app` la resuelve en los dos
 * idiomas; aquí no se escribe texto de interfaz.
 */
export function sessionMessageKey(state: SessionState): string {
  if (state.health === 'SESSION_EXPIRED') return 'session.expired'
  if (state.health === 'SELECTORS_OUTDATED') return 'session.selectorsOutdated'
  if (state.health === 'LOGIN_REQUIRED')
    return state.connection === 'DISCONNECTED' && state.checkedAt === null
      ? 'session.notConnected'
      : 'session.loginRequired'
  if (state.health === 'UNAVAILABLE') return 'session.unavailable'
  if (state.health === 'READ_ONLY') return 'session.readOnly'
  if (state.health === 'INTERACTION_AVAILABLE') return 'session.interactive'
  return 'session.connected'
}

/**
 * Motivo por el que una acción no puede pasar, deducido del estado de sesión.
 * `null` si la sesión está lista para escribir.
 */
export function sessionBlocksInteraction(state: SessionState): ActionError | null {
  if (canInteract(state)) return null
  return { code: errorCodeFor(state.health), message: state.detail ?? '' }
}

function errorCodeFor(health: HealthStatus): ActionError['code'] {
  switch (health) {
    case 'SESSION_EXPIRED':
      return 'SESSION_EXPIRED'
    case 'SELECTORS_OUTDATED':
      return 'SELECTORS_OUTDATED'
    case 'LOGIN_REQUIRED':
      return 'LOGIN_REQUIRED'
    case 'UNAVAILABLE':
      return 'UNAVAILABLE'
    default:
      return 'UNSUPPORTED'
  }
}
