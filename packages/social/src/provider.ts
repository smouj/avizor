/**
 * Contrato de interacción.
 *
 * Un `InteractionProvider` es un adaptador web: sabe entrar en una red con la
 * sesión del usuario, leer su identidad pública y ejecutar operaciones
 * tipeadas. No lee feeds (eso es del motor) y no ejecuta JavaScript que le
 * mande un modelo: solo estas operaciones.
 *
 * `Connector` (motor) → leer. `InteractionProvider` (aquí) → participar.
 */

import { cloneCapabilities, NO_INTERACTION } from './capabilities'
import { isSocialSource, networkOf } from './networks'
import type {
  ActionResult,
  InteractionCapabilities,
  SessionState,
  SocialActor,
  SocialContent,
  SocialOperation,
  SocialSource,
  SocialTarget,
} from './types'

export interface ProviderContext {
  accountId: string
  /** epoch ms inyectado: el adaptador no llama a `Date.now()`. */
  now: number
  signal?: AbortSignal
  log?: (message: string) => void
}

export interface InteractionProvider {
  source: SocialSource
  label: string
  /** Capacidades declaradas por el adaptador. Se declaran pocas y verdaderas. */
  capabilities: InteractionCapabilities
  getSessionState(ctx: ProviderContext): Promise<SessionState>
  like(target: SocialTarget, ctx: ProviderContext): Promise<ActionResult>
  unlike(target: SocialTarget, ctx: ProviderContext): Promise<ActionResult>
  reply(target: SocialTarget, content: SocialContent, ctx: ProviderContext): Promise<ActionResult>
  repost(target: SocialTarget, ctx: ProviderContext): Promise<ActionResult>
  publish(content: SocialContent, ctx: ProviderContext): Promise<ActionResult>
  follow?(actor: SocialActor, ctx: ProviderContext): Promise<ActionResult>
  unfollow?(actor: SocialActor, ctx: ProviderContext): Promise<ActionResult>
  deleteOwnPost?(target: SocialTarget, ctx: ProviderContext): Promise<ActionResult>
}

export class ProviderRegistry {
  private readonly providers = new Map<SocialSource, InteractionProvider>()

  /**
   * Registra un adaptador. Se exige que la red sea social y que el adaptador
   * pueda leer: un adaptador que no sabe leer su propia pantalla tampoco puede
   * verificar una acción, y sin verificación no se publica nada.
   */
  register(provider: InteractionProvider): void {
    if (!isSocialSource(provider.source)) {
      throw new Error(
        `${provider.source} es una fuente de solo lectura: no admite adaptador de interacción.`,
      )
    }
    if (!provider.capabilities.read) {
      throw new Error(
        `El adaptador de ${provider.source} debe declarar «read: true» para poder verificar acciones.`,
      )
    }
    if (provider.capabilities.follow && !provider.follow) {
      throw new Error(`El adaptador de ${provider.source} declara «follow» pero no lo implementa.`)
    }
    if (provider.capabilities.deleteOwnPost && !provider.deleteOwnPost) {
      throw new Error(
        `El adaptador de ${provider.source} declara «deleteOwnPost» pero no lo implementa.`,
      )
    }
    this.providers.set(provider.source, provider)
  }

  get(source: SocialSource): InteractionProvider | null {
    return this.providers.get(source) ?? null
  }

  require(source: SocialSource): InteractionProvider {
    const provider = this.providers.get(source)
    if (!provider) throw new Error(`No hay adaptador de interacción para ${source}.`)
    return provider
  }

  list(): InteractionProvider[] {
    return [...this.providers.values()]
  }

  /** Capacidades declaradas, sin tocar: la sesión las recorta aparte. */
  capabilitiesFor(source: SocialSource): InteractionCapabilities {
    const provider = this.providers.get(source)
    return provider ? cloneCapabilities(provider.capabilities) : { ...NO_INTERACTION }
  }

  /** Etiqueta de la red, aunque no haya adaptador todavía. */
  labelFor(source: SocialSource): string {
    return this.providers.get(source)?.label ?? networkOf(source)?.label ?? source
  }

  has(source: SocialSource): boolean {
    return this.providers.has(source)
  }

  /** Operaciones que el adaptador implementa de verdad, no las declaradas. */
  implementedOperations(source: SocialSource): SocialOperation[] {
    const provider = this.providers.get(source)
    if (!provider) return []
    const ops: SocialOperation[] = ['like', 'unlike', 'reply', 'repost', 'publish']
    if (provider.follow) ops.push('follow')
    if (provider.unfollow) ops.push('unfollow')
    if (provider.deleteOwnPost) ops.push('delete_own_post')
    return ops
  }
}
