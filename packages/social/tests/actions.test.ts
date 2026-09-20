/**
 * Cola de acciones.
 *
 * Las dos reglas que más importan: nada sale sin confirmación del usuario, y
 * una acción no se da por publicada si la red no lo confirmó. Además, una
 * acción multirred deja un resultado por destino, no un «todo o nada».
 */
import { describe, expect, it } from 'vitest'

import { ActionQueue } from '../src/actions'
import type { ActionResult } from '../src/types'

const NOW = 1_760_000_000_000

function queue(): ActionQueue {
  let tick = 0
  let seq = 0
  return new ActionQueue({
    now: () => NOW + tick++,
    idFactory: () => `act_${++seq}`,
  })
}

function result(overrides: Partial<ActionResult> = {}): ActionResult {
  return {
    source: 'bluesky',
    operation: 'publish',
    outcome: 'success',
    verified: true,
    at: NOW,
    ...overrides,
  }
}

const TWO_NETWORKS = [
  { accountId: 'bluesky:smouj', source: 'bluesky' as const },
  { accountId: 'threads:smouj', source: 'threads' as const },
]

describe('ciclo de vida', () => {
  it('nace como borrador y no sale nada hasta que el usuario confirma', () => {
    const actions = queue()
    const action = actions.enqueue({
      operation: 'publish',
      content: { text: 'Hola' },
      targets: TWO_NETWORKS,
    })
    expect(action.status).toBe('DRAFT')
    expect(action.origin).toBe('user')
    expect(action.targets.map((target) => target.status)).toEqual(['PENDING', 'PENDING'])
    expect(actions.pendingConfirmation()).toHaveLength(1)
  })

  it('solo se puede editar antes de confirmar', () => {
    const actions = queue()
    const action = actions.enqueue({
      operation: 'reply',
      content: { text: 'Hola' },
      targets: TWO_NETWORKS,
    })
    actions.edit(action.id, { text: 'Hola, con más contexto' })
    actions.confirm(action.id)
    expect(() => actions.edit(action.id, { text: 'Otra vez' })).toThrow(/AWAITING_CONFIRMATION/)
  })

  it('no se puede ejecutar sin confirmar ni confirmar dos veces', () => {
    const actions = queue()
    const action = actions.enqueue({
      operation: 'publish',
      content: { text: 'Hola' },
      targets: TWO_NETWORKS,
    })
    expect(() => actions.start(action.id)).toThrow(/confirmada/)
    actions.confirm(action.id)
    expect(actions.get(action.id)?.status).toBe('AWAITING_CONFIRMATION')
    expect(() => actions.confirm(action.id)).toThrow(/borrador/)
    actions.start(action.id)
    expect(actions.get(action.id)?.status).toBe('RUNNING')
  })

  it('una acción necesita destino', () => {
    const actions = queue()
    expect(() =>
      actions.enqueue({ operation: 'publish', content: { text: 'Hola' }, targets: [] }),
    ).toThrow(/al menos una cuenta/)
  })
})

describe('resultados por destino', () => {
  it('un éxito sin verificar no se da por publicado', () => {
    const actions = queue()
    const action = actions.enqueue({
      operation: 'publish',
      content: { text: 'Hola' },
      targets: [TWO_NETWORKS[0]!],
    })
    actions.confirm(action.id)
    actions.start(action.id)
    const settled = actions.report(action.id, result({ verified: false }))
    expect(settled.status).toBe('FAILED')
    expect(settled.targets[0]?.error?.message).toContain('no confirmó')
    expect(actions.summary(action.id).success).toBe(0)
  })

  it('un éxito verificado cierra la acción', () => {
    const actions = queue()
    const action = actions.enqueue({
      operation: 'like',
      content: { text: '' },
      targets: [TWO_NETWORKS[0]!],
    })
    actions.confirm(action.id)
    actions.start(action.id)
    const settled = actions.report(action.id, result({ operation: 'like', externalId: 'abc' }))
    expect(settled.status).toBe('SUCCESS')
    expect(settled.finishedAt).toBeGreaterThanOrEqual(NOW)
    expect(settled.targets[0]?.result?.externalId).toBe('abc')
  })

  it('multirred: un éxito y un fallo dan éxito parcial, no «todo o nada»', () => {
    const actions = queue()
    const action = actions.enqueue({
      operation: 'publish',
      content: { text: 'Hola' },
      targets: TWO_NETWORKS,
    })
    actions.confirm(action.id)
    actions.start(action.id)
    actions.report(action.id, result({ source: 'bluesky' }), 'bluesky:smouj')
    const settled = actions.report(
      action.id,
      result({
        source: 'threads',
        outcome: 'failed',
        verified: false,
        error: { code: 'SESSION_EXPIRED', message: 'Sesión caducada' },
      }),
      'threads:smouj',
    )
    expect(settled.status).toBe('SUCCESS')
    expect(actions.summary(action.id)).toMatchObject({
      total: 2,
      success: 1,
      failed: 1,
      partial: true,
    })
  })

  it('si fallan todas, la acción falla', () => {
    const actions = queue()
    const action = actions.enqueue({
      operation: 'publish',
      content: { text: 'Hola' },
      targets: TWO_NETWORKS,
    })
    actions.confirm(action.id)
    actions.start(action.id)
    actions.fail(action.id, 'bluesky:smouj', { code: 'NETWORK', message: 'Sin conexión' })
    const settled = actions.fail(action.id, 'threads:smouj', {
      code: 'NETWORK',
      message: 'Sin conexión',
    })
    expect(settled.status).toBe('FAILED')
  })

  it('una cancelación deja los destinos sin hacer como omitidos', () => {
    const actions = queue()
    const action = actions.enqueue({
      operation: 'publish',
      content: { text: 'Hola' },
      targets: TWO_NETWORKS,
    })
    actions.confirm(action.id)
    actions.start(action.id)
    actions.report(action.id, result({ source: 'bluesky' }), 'bluesky:smouj')
    const cancelled = actions.cancel(action.id)
    expect(cancelled.targets.map((target) => target.status)).toEqual(['SUCCESS', 'SKIPPED'])
  })

  it('no se cancela lo que ya terminó ni se informa de lo que no corre', () => {
    const actions = queue()
    const action = actions.enqueue({
      operation: 'publish',
      content: { text: 'Hola' },
      targets: [TWO_NETWORKS[0]!],
    })
    expect(() => actions.report(action.id, result())).toThrow(/estado DRAFT/)
    actions.confirm(action.id)
    actions.start(action.id)
    actions.report(action.id, result())
    expect(() => actions.cancel(action.id)).toThrow(/ya terminó/)
  })

  it('informar de una red que no es destino se rechaza', () => {
    const actions = queue()
    const action = actions.enqueue({
      operation: 'publish',
      content: { text: 'Hola' },
      targets: [TWO_NETWORKS[0]!],
    })
    actions.confirm(action.id)
    actions.start(action.id)
    expect(() => actions.report(action.id, result({ source: 'mastodon' }))).toThrow(
      /no tiene destino/,
    )
  })
})

describe('persistencia y limpieza', () => {
  it('el historial guardado se puede volver a cargar y no lleva secretos', () => {
    const actions = queue()
    const action = actions.enqueue({
      operation: 'publish',
      content: { text: 'Hola' },
      targets: TWO_NETWORKS,
    })
    actions.confirm(action.id)
    actions.start(action.id)
    actions.report(action.id, result({ source: 'bluesky' }), 'bluesky:smouj')
    const saved = actions.toJSON()
    const json = JSON.stringify(saved)
    expect(json).not.toMatch(/password|contraseña|token|cookie/i)

    const reloaded = queue()
    reloaded.hydrate(saved)
    expect(reloaded.list()).toHaveLength(1)
    expect(reloaded.get(action.id)?.targets[1]?.status).toBe('RUNNING')
  })

  it('la poda se lleva lo viejo y terminado, y deja lo que sigue en curso', () => {
    const actions = queue()
    const done = actions.enqueue({
      operation: 'publish',
      content: { text: 'Vieja' },
      targets: [TWO_NETWORKS[0]!],
    })
    actions.confirm(done.id)
    actions.start(done.id)
    actions.report(done.id, result())
    const draft = actions.enqueue({
      operation: 'publish',
      content: { text: 'Nueva' },
      targets: [TWO_NETWORKS[0]!],
    })
    expect(actions.prune(NOW + 1)).toBe(1)
    expect(actions.get(done.id)).toBeNull()
    expect(actions.get(draft.id)).not.toBeNull()
  })
})
