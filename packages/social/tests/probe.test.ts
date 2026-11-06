/**
 * Traducción de lo que ve el escritorio a estado de sesión.
 *
 * El caso delicado: no poder mirar no es lo mismo que estar caducada. Si la
 * ventana de la cuenta está cerrada, la sesión puede seguir perfectamente viva
 * en su perfil — pero no se puede comprobar, y eso se dice en vez de inventar un
 * veredicto.
 */
import { describe, expect, it } from 'vitest'

import { sessionFromProbe, summarizeProbe, type SessionProbe } from '../src/probe'
import {
  canInteract,
  connectedSession,
  disconnectedSession,
  interactiveSession,
  sessionBlocksInteraction,
} from '../src/session'

const NOW = 1_760_000_000_000
const LATER = NOW + 90_000

function probe(overrides: Partial<SessionProbe> = {}): SessionProbe {
  return {
    profileId: 'threads/smouj',
    checkedAt: LATER,
    windowOpen: true,
    hosts: [{ host: 'www.threads.net', cookies: 4 }],
    hasSession: true,
    ...overrides,
  }
}

describe('sesión a partir de lo que ve el escritorio', () => {
  it('con cookies hay sesión, pero eso no abre la escritura', () => {
    const state = sessionFromProbe(probe(), disconnectedSession())
    expect(state.connection).toBe('CONNECTED')
    expect(state.health).toBe('CONNECTED')
    expect(state.checkedAt).toBe(LATER)
    expect(canInteract(state)).toBe(false)
    expect(sessionBlocksInteraction(state)?.code).toBe('UNSUPPORTED')
  })

  it('sin cookies se pide iniciar sesión con el motivo', () => {
    const state = sessionFromProbe(
      probe({ hasSession: false, hosts: [{ host: 'www.threads.net', cookies: 0 }] }),
      disconnectedSession(),
    )
    expect(state.connection).toBe('DISCONNECTED')
    expect(state.health).toBe('LOGIN_REQUIRED')
    expect(state.detail).toContain('no tiene una sesión abierta')
  })

  it('no poder mirar no es estar caducada: sin ventana se conserva lo que se sabía', () => {
    const known = interactiveSession(connectedSession(NOW), NOW)
    const state = sessionFromProbe(
      probe({ windowOpen: false, hasSession: false, hosts: [] }),
      known,
    )
    expect(state.connection).toBe('CONNECTED')
    expect(state.since).toBe(NOW)
    expect(state.health).toBe('READ_ONLY')
    expect(canInteract(state)).toBe(false)
    expect(state.detail).toContain('no está abierta')
  })

  it('si nunca hubo sesión, cerrar la ventana no la inventa', () => {
    const state = sessionFromProbe(
      probe({ windowOpen: false, hasSession: false, hosts: [] }),
      disconnectedSession(),
    )
    expect(state.connection).toBe('DISCONNECTED')
    expect(state.health).toBe('LOGIN_REQUIRED')
  })

  it('el motivo del escritorio manda cuando lo hay', () => {
    const state = sessionFromProbe(
      probe({
        windowOpen: false,
        hasSession: false,
        hosts: [],
        detail: 'la ventana se cerró en la última prueba',
      }),
      connectedSession(NOW),
    )
    expect(state.detail).toBe('la ventana se cerró en la última prueba')
  })

  it('mantiene el «desde cuándo» de la sesión conocida', () => {
    const state = sessionFromProbe(probe(), connectedSession(NOW))
    expect(state.since).toBe(NOW)
  })

  it('una marca de tiempo sin sentido no se cuela como fecha', () => {
    const state = sessionFromProbe(probe({ checkedAt: 0 }), disconnectedSession())
    expect(state.checkedAt).toBeNull()
    expect(state.since).toBeNull()
    expect(state.connection).toBe('CONNECTED')
  })

  it('sin fecha creíble pero con sesión conocida antes, se conserva el «desde cuándo»', () => {
    const state = sessionFromProbe(probe({ checkedAt: 0 }), connectedSession(NOW))
    expect(state.since).toBe(NOW)
    expect(state.checkedAt).toBe(NOW)
  })

  it('el resumen cuenta cookies y dominios, sin valores', () => {
    const summary = summarizeProbe(
      probe({
        hosts: [
          { host: 'www.reddit.com', cookies: 3 },
          { host: 'oauth.reddit.com', cookies: 1 },
        ],
      }),
    )
    expect(summary).toEqual({ cookies: 4, hosts: 2 })
  })
})
