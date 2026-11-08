/**
 * La actividad, en la interfaz.
 *
 * Se comprueba que la presentación no reinterpreta lo que dijo el motor y que
 * los tiempos se cuentan en la unidad que se lee de un vistazo.
 */
import { describe, expect, it } from 'vitest'

import type { ActivitySnapshot } from '@avizor/engine'

import {
  activityNoteKey,
  activityNoteParams,
  activityTone,
  formatAgo,
  sourcesHealth,
  topKeywords,
} from './activity'

function snapshot(overrides: Partial<ActivitySnapshot> = {}): ActivitySnapshot {
  return {
    at: 1_760_000_000_000,
    level: 'live',
    note: { code: 'live' },
    lastIngestAt: 1_760_000_000_000,
    newestItemAt: 1_760_000_000_000,
    rate: { perMinute: 7, lastFiveMinutes: 30, lastHour: 120 },
    totals: { items: 900, clusters: 40, trends: 12, alerts: 3, sources: 4 },
    keywords: [
      { word: 'openai', count: 9, sources: 3, topics: 2 },
      { word: 'rust', count: 5, sources: 1, topics: 1 },
      { word: 'avizor', count: 4, sources: 1, topics: 1 },
      { word: 'otra', count: 1, sources: 1, topics: 1 },
    ],
    sources: [
      { source: 'hackernews', recent: 20, ok: true, enabled: true, lastOkAt: 1 },
      { source: 'reddit', recent: 5, ok: false, enabled: true, lastOkAt: 1, lastError: 'HTTP 403' },
      { source: 'rss', recent: 0, ok: true, enabled: false, lastOkAt: 1 },
    ],
    highlights: [],
    ...overrides,
  }
}

describe('tono y aviso', () => {
  it('sin datos el pulso está en calma, no «en vivo»', () => {
    expect(activityTone(null)).toBe('quiet')
    expect(activityTone(snapshot({ level: 'stale' }))).toBe('stale')
  })

  it('cada aviso del motor tiene su frase', () => {
    expect(activityNoteKey({ code: 'live' })).toBe('activity.note.live')
    expect(activityNoteKey({ code: 'recent' })).toBe('activity.note.recent')
    expect(activityNoteKey({ code: 'stale' })).toBe('activity.note.stale')
    expect(activityNoteKey({ code: 'quiet' })).toBe('activity.note.quiet')
    expect(activityNoteKey({ code: 'no_data' })).toBe('activity.note.noData')
    expect(activityNoteKey({ code: 'all_sources_failed' })).toBe('activity.note.allFailed')
  })

  it('los parámetros del aviso se pasan tal cual, sin inventar', () => {
    expect(activityNoteParams({ code: 'stale', params: { seconds: 1800 } })).toEqual({
      seconds: 1800,
    })
    expect(activityNoteParams({ code: 'live' })).toEqual({})
  })
})

describe('tiempo desde el último dato', () => {
  it('los segundos se usan mientras son legibles', () => {
    expect(formatAgo(0)).toEqual({ value: 0, unit: 'activity.unitSeconds' })
    expect(formatAgo(45)).toEqual({ value: 45, unit: 'activity.unitSeconds' })
    expect(formatAgo(89)).toEqual({ value: 89, unit: 'activity.unitSeconds' })
  })

  it('luego minutos, y después horas', () => {
    expect(formatAgo(90)).toEqual({ value: 2, unit: 'activity.unitMinutes' })
    expect(formatAgo(1800)).toEqual({ value: 30, unit: 'activity.unitMinutes' })
    expect(formatAgo(5400)).toEqual({ value: 90, unit: 'activity.unitMinutes' })
    expect(formatAgo(7200)).toEqual({ value: 2, unit: 'activity.unitHours' })
  })

  it('un tiempo negativo no se cuela como futuro', () => {
    expect(formatAgo(-30)).toEqual({ value: 0, unit: 'activity.unitSeconds' })
  })
})

describe('fuentes y palabras', () => {
  it('cuenta solo las fuentes encendidas', () => {
    expect(sourcesHealth(snapshot())).toEqual({ ok: 1, total: 2 })
    expect(sourcesHealth(null)).toEqual({ ok: 0, total: 0 })
  })

  it('enseña las palabras más usadas, y solo unas pocas', () => {
    expect(topKeywords(snapshot()).map((keyword) => keyword.word)).toEqual([
      'openai',
      'rust',
      'avizor',
    ])
    expect(topKeywords(snapshot(), 1)).toHaveLength(1)
    expect(topKeywords(null)).toEqual([])
  })
})
