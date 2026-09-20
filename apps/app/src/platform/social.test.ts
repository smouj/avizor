/**
 * Cuentas sociales desde la interfaz.
 *
 * Lo que se comprueba aquí es lo que puede hacer daño: que en el navegador no se
 * finja un soporte que no existe, que una red federada sin instancia no abra
 * nada, y que los argumentos que llegan al escritorio sean los que son (perfil,
 * dirección de inicio de sesión y dominios de esa cuenta, no otros).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: { command: string; args?: Record<string, unknown> }[] = []

vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (command: string, args?: Record<string, unknown>) => {
    calls.push({ command, args })
    if (command === 'social_open_profiles') return []
    if (command === 'social_read_identity') return null
    if (command === 'social_check_session') {
      return {
        profileId: 'threads/smouj',
        checkedAt: 1,
        windowOpen: true,
        hosts: [],
        hasSession: false,
      }
    }
    return { profileId: 'threads/smouj', windowClosed: true, directoryRemoved: true }
  },
}))

async function withDesktop<T>(run: () => Promise<T>): Promise<T> {
  ;(globalThis as { window?: unknown }).window = { __TAURI_INTERNALS__: {} }
  vi.resetModules()
  try {
    return await run()
  } finally {
    delete (globalThis as { window?: unknown }).window
  }
}

async function withBrowser<T>(run: () => Promise<T>): Promise<T> {
  delete (globalThis as { window?: unknown }).window
  vi.resetModules()
  return run()
}

beforeEach(() => {
  calls.length = 0
})

describe('en el escritorio', () => {
  it('abre la ventana de la cuenta con su perfil, su dirección y sus dominios', async () => {
    await withDesktop(async () => {
      const social = await import('./social')
      const result = await social.openSession({ source: 'threads', handle: 'smouj' })
      expect(result.ok).toBe(true)
      expect(calls).toHaveLength(1)
      expect(calls[0]?.command).toBe('social_open_session')
      expect(calls[0]?.args).toMatchObject({
        profileId: 'threads/smouj',
        loginUrl: 'https://www.threads.net/login',
      })
      expect(calls[0]?.args?.hosts).toEqual(expect.arrayContaining(['www.threads.net']))
    })
  })

  it('una red federada sin instancia no abre nada y lo explica', async () => {
    await withDesktop(async () => {
      const social = await import('./social')
      const result = await social.openSession({ source: 'mastodon', handle: 'smouj' })
      expect(result.ok).toBe(false)
      expect(result.error).toContain('instancia')
      expect(calls).toHaveLength(0)
    })
  })

  it('con instancia, Mastodon usa su propia dirección y su propio dominio', async () => {
    await withDesktop(async () => {
      const social = await import('./social')
      const target = {
        source: 'mastodon' as const,
        handle: 'smouj',
        instanceHost: 'mastodon.social',
      }
      expect(social.loginUrlForAccount(target)).toBe('https://mastodon.social/auth/sign_in')
      expect(social.hostsForAccount(target)).toEqual(['mastodon.social'])
      await social.openSession(target)
      expect(calls[0]?.args).toMatchObject({ loginUrl: 'https://mastodon.social/auth/sign_in' })
    })
  })

  it('el puente existe y no promete interacción: todavía no hay adaptador', async () => {
    await withDesktop(async () => {
      const social = await import('./social')
      const bridge = social.desktopBrowserBridge()
      expect(bridge).not.toBeNull()
      const result = await bridge!.perform({
        source: 'threads',
        browserProfileId: 'threads/smouj',
        operation: 'publish',
        content: { text: 'Hola' },
      })
      expect(result.outcome).toBe('unsupported')
      expect(result.verified).toBe(false)
      expect(result.error?.code).toBe('UNSUPPORTED')
    })
  })

  it('olvidar la sesión pide cerrar la ventana y borrar el perfil', async () => {
    await withDesktop(async () => {
      const social = await import('./social')
      const report = await social.forgetSession({ source: 'reddit', handle: 'smouj' })
      expect(calls[0]?.command).toBe('social_forget_session')
      expect(calls[0]?.args).toMatchObject({ profileId: 'reddit/smouj' })
      expect(report?.directoryRemoved).toBe(true)
    })
  })
})

describe('en el navegador', () => {
  it('no hay puente: no se finge soporte', async () => {
    await withBrowser(async () => {
      const social = await import('./social')
      expect(social.socialSupported()).toBe(false)
      expect(social.desktopBrowserBridge()).toBeNull()
    })
  })

  it('y se dice por qué, en vez de fallar en silencio', async () => {
    await withBrowser(async () => {
      const social = await import('./social')
      const result = await social.openSession({ source: 'bluesky', handle: 'smouj.bsky.social' })
      expect(result.ok).toBe(false)
      expect(result.error).toContain('escritorio')
      expect(calls).toHaveLength(0)
    })
  })

  it('las funciones que devuelven datos no inventan nada', async () => {
    await withBrowser(async () => {
      const social = await import('./social')
      expect(await social.checkSession({ source: 'x', handle: 'smouj' })).toBeNull()
      expect(await social.readIdentity({ source: 'x', handle: 'smouj' })).toBeNull()
      expect(await social.openProfiles()).toEqual([])
    })
  })
})
