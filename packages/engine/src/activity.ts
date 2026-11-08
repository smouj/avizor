/**
 * Actividad: el pulso de lo que está pasando **ahora mismo** en Latido.
 *
 * La aplicación tiene que notarse viva: cuánto está entrando, de dónde, a qué
 * ritmo y sobre qué se está hablando. Todo lo que sale de aquí es **contado**,
 * no decorado: cada número se puede reproducir a mano sobre los items del
 * almacén.
 *
 * Dos reglas que vienen del resto del proyecto:
 *
 * 1. **Nada inventado.** Si no hay datos, se dice que no hay datos; no se pinta
 *    una actividad de relleno para que la pantalla parezca viva.
 * 2. **Los textos no se escriben aquí.** El motor devuelve un `ActivityNote`
 *    estructurado (`code` + parámetros) y la interfaz lo traduce, igual que hace
 *    con el motivo de una tendencia.
 */

import type { Cluster, Item, SourceConfig, SourceKind, Trend, TrendState } from './types'
import { tokenize } from './text'

/** Ventanas de tiempo, en ms. Compartidas con la interfaz para no divergir. */
export const ACTIVITY_WINDOWS = {
  /** Desde el último dato: por debajo de esto, está «en vivo». */
  live: 90_000,
  /** …y por debajo de esto, «reciente». */
  recent: 600_000,
  /** …y por debajo de esto, «parado» con datos viejos. */
  stale: 3_600_000,
  minute: 60_000,
  fiveMinutes: 300_000,
  hour: 3_600_000,
  /** Ventana de la que se leen los items para contar palabras y ritmo. */
  scan: 6 * 3_600_000,
} as const

/** Cuántas palabras clave se publican como máximo. */
export const KEYWORD_LIMIT = 12

/** Cuántos temas destacados se publican como máximo. */
export const HIGHLIGHT_LIMIT = 5

export interface ActivityRate {
  /** Items publicados en el último minuto. */
  perMinute: number
  lastFiveMinutes: number
  lastHour: number
}

export interface ActivityKeyword {
  word: string
  /** Veces que aparece, contando una vez por item. */
  count: number
  /** En cuántas redes distintas se está usando. */
  sources: number
  /** En cuántos temas distintos aparece. */
  topics: number
}

export interface ActivitySourceLiveness {
  source: SourceKind
  /** Items de esta fuente en la ventana corta. */
  recent: number
  /** `false` si la última vez que se intentó falló. */
  ok: boolean
  enabled: boolean
  lastOkAt: number | null
  /** El mensaje crudo de la fuente, tal cual: es un dato, no una frase nuestra. */
  lastError?: string
}

export interface ActivityHighlight {
  id: string
  title: string
  state: TrendState
  score: number
  velocity: number
  coverage: number
  volume: number
}

/** Nivel de actividad. La interfaz decide cómo se pinta; aquí se decide cuál es. */
export type ActivityLevel = 'live' | 'recent' | 'stale' | 'quiet'

export interface ActivityNote {
  code: 'live' | 'recent' | 'stale' | 'quiet' | 'no_data' | 'all_sources_failed'
  params?: Record<string, number | string>
}

export interface ActivitySnapshot {
  at: number
  level: ActivityLevel
  note: ActivityNote
  /** Última vez que entró algo al almacén. */
  lastIngestAt: number | null
  newestItemAt: number | null
  rate: ActivityRate
  totals: {
    items: number
    clusters: number
    trends: number
    alerts: number
    sources: number
  }
  keywords: ActivityKeyword[]
  sources: ActivitySourceLiveness[]
  highlights: ActivityHighlight[]
  /** Primer error de fuente, en crudo, para enseñarlo junto al aviso. */
  firstError?: string
}

export interface ActivityInput {
  items: Item[]
  trends: Trend[]
  sources: SourceConfig[]
  clusters?: Cluster[]
  /** Momento de la última ingesta, si el motor lo sabe. */
  lastIngestAt?: number | null
  alerts?: number
}

function countSince(items: readonly Item[], since: number): number {
  let total = 0
  for (const item of items) if (item.publishedAt >= since) total += 1
  return total
}

function latest(values: readonly number[]): number | null {
  let newest: number | null = null
  for (const value of values) if (newest === null || value > newest) newest = value
  return newest
}

/**
 * Palabras clave de lo que se está hablando: se cuenta **una vez por item**,
 * para que una sola publicación larga no convierta una palabra en tendencia.
 */
function keywordsOf(items: readonly Item[], limit = KEYWORD_LIMIT): ActivityKeyword[] {
  const counts = new Map<string, number>()
  const sources = new Map<string, Set<SourceKind>>()
  const topics = new Map<string, Set<string>>()

  for (const item of items) {
    const text = `${item.title ?? ''} ${item.body ?? ''}`.trim()
    if (text === '') continue
    const seen = new Set(tokenize(text, 4))
    for (const token of seen) {
      counts.set(token, (counts.get(token) ?? 0) + 1)
      const sourceSet = sources.get(token) ?? new Set<SourceKind>()
      sourceSet.add(item.source)
      sources.set(token, sourceSet)
      if (item.clusterId) {
        const topicSet = topics.get(token) ?? new Set<string>()
        topicSet.add(item.clusterId)
        topics.set(token, topicSet)
      }
    }
  }

  return [...counts.entries()]
    .map(([word, count]) => ({
      word,
      count,
      sources: sources.get(word)?.size ?? 0,
      topics: topics.get(word)?.size ?? 0,
    }))
    .sort((a, b) => b.count - a.count || b.sources - a.sources || a.word.localeCompare(b.word))
    .slice(0, limit)
}

function levelOf(reference: number | null, now: number, hasItems: boolean): ActivityLevel {
  if (reference === null) return hasItems ? 'quiet' : 'quiet'
  const age = now - reference
  if (age <= ACTIVITY_WINDOWS.live) return 'live'
  if (age <= ACTIVITY_WINDOWS.recent) return 'recent'
  if (age <= ACTIVITY_WINDOWS.stale) return 'stale'
  return 'quiet'
}

/**
 * Construye la foto de actividad. Es una función pura: mismo almacén y mismo
 * reloj, mismo resultado.
 */
export function buildActivity(input: ActivityInput, now: number): ActivitySnapshot {
  const { items, trends, sources } = input
  const windowItems = items
    .filter((item) => item.publishedAt >= now - ACTIVITY_WINDOWS.scan)
    .sort((a, b) => b.publishedAt - a.publishedAt)

  const newestItemAt = latest(windowItems.map((item) => item.publishedAt))
  const lastIngestAt = input.lastIngestAt ?? latest(items.map((item) => item.ingestedAt))
  const level = levelOf(lastIngestAt, now, windowItems.length > 0)

  const recentBySource = new Map<SourceKind, number>()
  for (const item of windowItems) {
    if (item.publishedAt < now - ACTIVITY_WINDOWS.hour) continue
    recentBySource.set(item.source, (recentBySource.get(item.source) ?? 0) + 1)
  }

  const liveness: ActivitySourceLiveness[] = sources
    .map((config) => ({
      source: config.kind,
      recent: recentBySource.get(config.kind) ?? 0,
      ok: config.lastError === undefined,
      enabled: config.enabled,
      lastOkAt: config.lastOkAt ?? null,
      ...(config.lastError ? { lastError: config.lastError } : {}),
    }))
    .sort((a, b) => b.recent - a.recent || a.source.localeCompare(b.source))

  const highlights = trends
    .filter((trend) => trend.state !== 'quiet')
    .sort((a, b) => b.score - a.score || b.volume - a.volume)
    .slice(0, HIGHLIGHT_LIMIT)
    .map((trend) => ({
      id: trend.id,
      title: trend.title,
      state: trend.state,
      score: trend.score,
      velocity: trend.velocity,
      coverage: trend.coverage,
      volume: trend.volume,
    }))

  const failing = liveness.filter((source) => !source.ok && source.enabled)
  const enabled = liveness.filter((source) => source.enabled)
  const allFailed = enabled.length > 0 && failing.length === enabled.length

  const note: ActivityNote = ((): ActivityNote => {
    if (allFailed) return { code: 'all_sources_failed', params: { sources: failing.length } }
    if (windowItems.length === 0 && lastIngestAt === null) return { code: 'no_data' }
    if (level === 'live') return { code: 'live' }
    if (level === 'recent') return { code: 'recent' }
    if (level === 'stale') {
      return {
        code: 'stale',
        params: { seconds: Math.max(1, Math.round((now - (lastIngestAt ?? now)) / 1000)) },
      }
    }
    return { code: 'quiet' }
  })()

  return {
    at: now,
    level,
    note,
    lastIngestAt,
    newestItemAt,
    rate: {
      perMinute: countSince(windowItems, now - ACTIVITY_WINDOWS.minute),
      lastFiveMinutes: countSince(windowItems, now - ACTIVITY_WINDOWS.fiveMinutes),
      lastHour: countSince(windowItems, now - ACTIVITY_WINDOWS.hour),
    },
    totals: {
      items: items.length,
      clusters: input.clusters?.length ?? 0,
      trends: trends.length,
      alerts: input.alerts ?? 0,
      sources: sources.filter((config) => config.enabled).length,
    },
    keywords: keywordsOf(windowItems),
    sources: liveness,
    highlights,
    ...(failing[0]?.lastError ? { firstError: failing[0].lastError } : {}),
  }
}
