/**
 * Actividad: el pulso que la aplicación enseña.
 *
 * Lo que se comprueba aquí es que los números son **contados** y que la pantalla
 * no puede quedar «viva» sin datos: sin items se dice que no hay datos, y con
 * todas las fuentes caídas se dice cuál falló.
 */
import { describe, expect, it } from 'vitest'

import { ACTIVITY_WINDOWS, KEYWORD_LIMIT, buildActivity, type ActivityInput } from '../src/activity'
import { AvizorEngine } from '../src/engine'
import { demoRawItems } from '../src/sources/demo'
import type { Item, SourceConfig, Trend } from '../src/types'

const NOW = 1_760_000_000_000

function item(overrides: Partial<Item> = {}): Item {
  const source = overrides.source ?? 'hackernews'
  return {
    id: `${source}:${overrides.externalId ?? '1'}`,
    source,
    externalId: overrides.externalId ?? '1',
    url: 'https://example.com/a',
    title: 'Un titular de prueba sobre rust y avizor',
    author: { id: 'a', handle: 'a', source },
    publishedAt: NOW - 10_000,
    ingestedAt: NOW - 5_000,
    metrics: {},
    tags: [],
    entities: [],
    simhash: '0'.repeat(16),
    origin: 'https://example.com/api',
    ...overrides,
  }
}

function trend(overrides: Partial<Trend> = {}): Trend {
  return {
    id: overrides.id ?? 't1',
    title: overrides.title ?? 'Un tema',
    keywords: ['rust'],
    entities: [],
    score: overrides.score ?? 50,
    state: overrides.state ?? 'rising',
    velocity: overrides.velocity ?? 2,
    growth: 0.5,
    volume: overrides.volume ?? 12,
    coverage: overrides.coverage ?? 2,
    engagement: 10,
    novelty: 0.4,
    cohesion: 0.6,
    firstSeen: NOW - 60_000,
    lastSeen: NOW - 1_000,
    sources: [],
    sparkline: [1, 2, 3],
    reason: { code: 'multi_source', params: {} },
    sampleIds: [],
    acknowledged: false,
  }
}

function config(overrides: Partial<SourceConfig> = {}): SourceConfig {
  return { kind: 'hackernews', enabled: true, options: {}, ...overrides }
}

function input(overrides: Partial<ActivityInput> = {}): ActivityInput {
  return { items: [item()], trends: [trend()], sources: [config()], ...overrides }
}

describe('ritmo de entrada', () => {
  it('cuenta lo que ha entrado en cada ventana', () => {
    const items = [
      item({ externalId: 'a', publishedAt: NOW - 10_000 }),
      item({ externalId: 'b', publishedAt: NOW - 40_000 }),
      item({ externalId: 'c', publishedAt: NOW - 3 * 60_000 }),
      item({ externalId: 'd', publishedAt: NOW - 30 * 60_000 }),
      item({ externalId: 'e', publishedAt: NOW - 40 * 60_000 }),
    ]
    const activity = buildActivity(input({ items }), NOW)
    expect(activity.rate.perMinute).toBe(2)
    expect(activity.rate.lastFiveMinutes).toBe(3)
    // Los cinco caen dentro de la última hora: 40 minutos siguen siendo una hora.
    expect(activity.rate.lastHour).toBe(5)
  })

  it('lo más viejo que la ventana de escaneo no entra en la cuenta', () => {
    const old = item({ externalId: 'viejo', publishedAt: NOW - ACTIVITY_WINDOWS.scan - 60_000 })
    const activity = buildActivity(input({ items: [old] }), NOW)
    expect(activity.rate.lastHour).toBe(0)
    expect(activity.keywords).toEqual([])
    expect(activity.newestItemAt).toBeNull()
  })
})

describe('nivel y aviso', () => {
  it('con datos recién llegados está en vivo', () => {
    const activity = buildActivity(input({ lastIngestAt: NOW - 20_000 }), NOW)
    expect(activity.level).toBe('live')
    expect(activity.note.code).toBe('live')
  })

  it('con datos de hace unos minutos está reciente', () => {
    const activity = buildActivity(input({ lastIngestAt: NOW - 5 * 60_000 }), NOW)
    expect(activity.level).toBe('recent')
    expect(activity.note.code).toBe('recent')
  })

  it('con datos de hace media hora avisa de que está parado, con los segundos', () => {
    const activity = buildActivity(input({ lastIngestAt: NOW - 30 * 60_000 }), NOW)
    expect(activity.level).toBe('stale')
    expect(activity.note.code).toBe('stale')
    expect(activity.note.params?.seconds).toBe(1800)
  })

  it('sin datos no se finge actividad', () => {
    const activity = buildActivity({ items: [], trends: [], sources: [] }, NOW)
    expect(activity.level).toBe('quiet')
    expect(activity.note.code).toBe('no_data')
    expect(activity.lastIngestAt).toBeNull()
    expect(activity.rate.perMinute).toBe(0)
    expect(activity.keywords).toEqual([])
    expect(activity.highlights).toEqual([])
  })

  it('si todas las fuentes fallan, se dice y se enseña el primer error crudo', () => {
    const activity = buildActivity(
      input({
        sources: [
          config({ kind: 'hackernews', lastError: 'HTTP 503' }),
          config({ kind: 'reddit', lastError: 'HTTP 403' }),
        ],
      }),
      NOW,
    )
    expect(activity.note.code).toBe('all_sources_failed')
    expect(activity.note.params?.sources).toBe(2)
    expect(activity.firstError).toBe('HTTP 503')
  })

  it('una fuente apagada no tapa a las que funcionan, y no cuenta como activa', () => {
    const activity = buildActivity(
      input({
        sources: [
          config({ kind: 'hackernews' }),
          config({ kind: 'reddit', lastError: 'HTTP 403' }),
          config({ kind: 'mastodon', enabled: false, lastError: 'HTTP 500' }),
        ],
      }),
      NOW,
    )
    // Hacker News responde, así que no se puede decir que ninguna fuente responde.
    expect(activity.note.code).not.toBe('all_sources_failed')
    expect(activity.totals.sources).toBe(2)
    expect(activity.firstError).toBe('HTTP 403')
  })

  it('si la única fuente encendida falla, entonces sí: ninguna responde', () => {
    const activity = buildActivity(
      input({
        sources: [
          config({ kind: 'hackernews', lastError: 'HTTP 503' }),
          config({ kind: 'reddit', enabled: false, lastError: 'HTTP 403' }),
        ],
      }),
      NOW,
    )
    expect(activity.note.code).toBe('all_sources_failed')
    expect(activity.note.params?.sources).toBe(1)
  })
})

describe('palabras clave', () => {
  it('cuenta una vez por item, no una vez por aparición', () => {
    const items = [
      item({ externalId: 'a', title: 'rust rust rust', body: 'rust' }),
      item({ externalId: 'b', title: 'Rust y más rust' }),
    ]
    const activity = buildActivity(input({ items }), NOW)
    const rust = activity.keywords.find((keyword) => keyword.word === 'rust')
    expect(rust?.count).toBe(2)
    expect(rust?.sources).toBe(1)
  })

  it('deja fuera las palabras vacías y las muy cortas', () => {
    const items = [item({ externalId: 'a', title: 'para con los del de que' })]
    const activity = buildActivity(input({ items }), NOW)
    expect(activity.keywords).toEqual([])
  })

  it('cuenta en cuántas redes y en cuántos temas aparece cada palabra', () => {
    const items = [
      item({ externalId: 'a', source: 'hackernews', title: 'openai publica', clusterId: 't1' }),
      item({ externalId: 'b', source: 'reddit', title: 'openai otra vez', clusterId: 't2' }),
      item({ externalId: 'c', source: 'reddit', title: 'otra cosa distinta', clusterId: 't2' }),
    ]
    const activity = buildActivity(input({ items }), NOW)
    const openai = activity.keywords.find((keyword) => keyword.word === 'openai')
    expect(openai).toMatchObject({ count: 2, sources: 2, topics: 2 })
  })

  it('el orden es por apariciones y el resultado está acotado', () => {
    const items = Array.from({ length: KEYWORD_LIMIT + 6 }, (_, index) =>
      item({
        externalId: String(index),
        title: index < KEYWORD_LIMIT ? `palabra${index} comun` : 'comun',
      }),
    )
    const activity = buildActivity(input({ items }), NOW)
    expect(activity.keywords).toHaveLength(KEYWORD_LIMIT)
    expect(activity.keywords[0]?.word).toBe('comun')
    expect(activity.keywords[0]?.count).toBe(items.length)
  })
})

describe('temas destacados y totales', () => {
  it('quita los temas en calma y ordena por pulso', () => {
    const activity = buildActivity(
      input({
        trends: [
          trend({ id: 'a', score: 20, state: 'quiet' }),
          trend({ id: 'b', score: 70, state: 'rising' }),
          trend({ id: 'c', score: 90, state: 'breaking' }),
        ],
      }),
      NOW,
    )
    expect(activity.highlights.map((highlight) => highlight.id)).toEqual(['c', 'b'])
    expect(activity.totals.trends).toBe(3)
  })

  it('los totales son los del almacén, no una estimación', () => {
    const activity = buildActivity(
      input({
        items: [item({ externalId: 'a' }), item({ externalId: 'b' })],
        clusters: [],
        alerts: 4,
      }),
      NOW,
    )
    expect(activity.totals.items).toBe(2)
    expect(activity.totals.alerts).toBe(4)
    expect(activity.totals.clusters).toBe(0)
  })

  it('el estado de cada fuente cuenta lo que ha entrado en la última hora', () => {
    const activity = buildActivity(
      input({
        items: [
          item({ externalId: 'a', source: 'reddit', publishedAt: NOW - 60_000 }),
          item({ externalId: 'b', source: 'reddit', publishedAt: NOW - 120_000 }),
          item({ externalId: 'c', source: 'reddit', publishedAt: NOW - 2 * 3_600_000 }),
        ],
        sources: [config({ kind: 'hackernews' }), config({ kind: 'reddit' })],
      }),
      NOW,
    )
    const reddit = activity.sources.find((source) => source.source === 'reddit')
    expect(reddit?.recent).toBe(2)
    expect(activity.sources[0]?.source).toBe('reddit')
  })

  it('la misma entrada da el mismo resultado', () => {
    const data = input()
    expect(buildActivity(data, NOW)).toEqual(buildActivity(data, NOW))
  })
})

describe('el motor lo sirve con datos reales', () => {
  it('tras ingerir, la actividad está en vivo y con palabras', () => {
    const engine = new AvizorEngine({ clock: () => NOW, sourceConfigs: [] })
    engine.ingest(demoRawItems(NOW), NOW)
    const activity = engine.activity(NOW)
    expect(activity.level).toBe('live')
    expect(activity.totals.items).toBeGreaterThan(0)
    expect(activity.keywords.length).toBeGreaterThan(0)
    // Los datos de ejemplo reparten un día entero de actividad: hay algo en la
    // última hora, pero no se puede exigir que haya algo en el último minuto.
    expect(activity.rate.lastHour).toBeGreaterThan(0)
  })

  it('un motor recién creado dice que todavía no hay datos', () => {
    const engine = new AvizorEngine({ clock: () => NOW, sourceConfigs: [] })
    const activity = engine.activity(NOW)
    expect(activity.note.code).toBe('no_data')
    expect(activity.totals.items).toBe(0)
  })
})
