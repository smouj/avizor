/**
 * El contrato del puente: a qué dirección entra cada cuenta y a qué dominios
 * puede viajar su sesión.
 *
 * Se prueba aquí porque un error de lista blanca manda la sesión de una red a
 * otra, y porque las redes ampliadas tienen que entrar con una dirección real
 * de inicio de sesión, no con una inventada.
 */
import { describe, expect, it } from 'vitest'

import { browserProfileIdFor, loginUrlFor, sessionHostsFor } from '../src/bridge'
import { NETWORKS, networkOf } from '../src/networks'
import type { MatrixSource } from '../src/types'

describe('direcciones de inicio de sesión', () => {
  it('cada red social del catálogo tiene una dirección real, o es federada', () => {
    for (const network of NETWORKS) {
      const url = loginUrlFor(network.source)
      const federated = network.defaultDomains.length === 0 && network.tier !== 'feed'
      if (federated) {
        // Federadas: sin instancia no hay dirección, y eso se dice.
        expect(url, network.source).toBeNull()
        continue
      }
      if (url === null) continue
      expect(url.startsWith('https://'), `${network.source} debe ser https`).toBe(true)
    }
  })

  it('las redes ampliadas abren en su propio dominio, no en el de otra', () => {
    const expected: Partial<Record<MatrixSource, string>> = {
      itchio: 'https://itch.io/login',
      producthunt: 'https://www.producthunt.com/login',
      discord: 'https://discord.com/login',
      huggingface: 'https://huggingface.co/login',
      npm: 'https://www.npmjs.com/login',
      twitch: 'https://www.twitch.tv/login',
      telegram: 'https://web.telegram.org/',
      github: 'https://github.com/login',
    }
    for (const [source, url] of Object.entries(expected)) {
      const login = loginUrlFor(source as MatrixSource)
      expect(login, source).toBe(url)
      // La dirección de entrada pertenece a la lista blanca de esa cuenta.
      const host = new URL(login as string).hostname
      expect(sessionHostsFor(source as MatrixSource), source).toContain(host)
    }
  })

  it('las fuentes que solo se leen no tienen dónde iniciar sesión', () => {
    expect(loginUrlFor('hackernews')).toBeNull()
    expect(loginUrlFor('rss')).toBeNull()
    // Y por eso tampoco tienen dominios de sesión.
    expect(sessionHostsFor('hackernews')).toEqual([])
    expect(sessionHostsFor('rss')).toEqual([])
  })

  it('una federada usa la instancia de su cuenta y solo esa', () => {
    expect(loginUrlFor('mastodon')).toBeNull()
    expect(loginUrlFor('mastodon', 'mastodon.social')).toBe('https://mastodon.social/auth/sign_in')
    expect(loginUrlFor('lemmy', 'lemmy.world')).toBe('https://lemmy.world/login')
    expect(loginUrlFor('lemmy', 'dos palabras')).toBeNull()
  })
})

describe('perfiles de cuenta', () => {
  it('un perfil por red y cuenta, y ninguno se sale de su red', () => {
    expect(browserProfileIdFor('threads', '@alguien')).toBe('threads/alguien')
    expect(browserProfileIdFor('itchio', 'creador')).toBe('itchio/creador')
    expect(sessionHostsFor('itchio')).toContain('itch.io')
    expect(sessionHostsFor('itchio')).not.toContain('github.com')
  })

  it('cada red ampliada tiene su descriptor en el catálogo', () => {
    expect(networkOf('telegram')?.label).toBe('Telegram')
    expect(networkOf('npm')?.defaultDomains).toContain('www.npmjs.com')
  })
})
