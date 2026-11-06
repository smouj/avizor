/**
 * La actividad, vista desde la interfaz.
 *
 * Aquí solo hay decisiones de presentación, y son puras para poder probarlas sin
 * montar la pantalla: qué tono tiene el pulso, qué texto le corresponde al aviso
 * del motor y cómo se cuenta el tiempo desde el último dato.
 *
 * El motor devuelve códigos, no frases; la frase la pone el diccionario de la
 * interfaz (español e inglés).
 */

import type { ActivityKeyword, ActivityNote, ActivitySnapshot } from '@latido/engine'

export type ActivityTone = 'live' | 'recent' | 'stale' | 'quiet'

export type ActivityNoteKey =
  | 'activity.note.live'
  | 'activity.note.recent'
  | 'activity.note.stale'
  | 'activity.note.quiet'
  | 'activity.note.noData'
  | 'activity.note.allFailed'

export type ActivityUnitKey = 'activity.unitSeconds' | 'activity.unitMinutes' | 'activity.unitHours'

/** El tono del pulso: el mismo nivel que calculó el motor, sin reinterpretarlo. */
export function activityTone(snapshot: ActivitySnapshot | null): ActivityTone {
  return snapshot ? snapshot.level : 'quiet'
}

/** Clave de traducción del aviso del motor. */
export function activityNoteKey(note: ActivityNote): ActivityNoteKey {
  switch (note.code) {
    case 'live':
      return 'activity.note.live'
    case 'recent':
      return 'activity.note.recent'
    case 'stale':
      return 'activity.note.stale'
    case 'no_data':
      return 'activity.note.noData'
    case 'all_sources_failed':
      return 'activity.note.allFailed'
    default:
      return 'activity.note.quiet'
  }
}

export function activityNoteParams(note: ActivityNote): Record<string, string | number> {
  return { ...(note.params ?? {}) }
}

/**
 * Cuánto hace, en la unidad que se lee de un vistazo: segundos, minutos u horas.
 * Se devuelve el número y la clave de la unidad para que traduzca el diccionario.
 */
export function formatAgo(seconds: number): { value: number; unit: ActivityUnitKey } {
  const safe = Math.max(0, Math.round(seconds))
  if (safe < 90) return { value: safe, unit: 'activity.unitSeconds' }
  const minutes = Math.round(safe / 60)
  // Hasta dos horas se cuenta en minutos: «90 min» dice más que «2 h».
  if (minutes < 120) return { value: minutes, unit: 'activity.unitMinutes' }
  return { value: Math.round(minutes / 60), unit: 'activity.unitHours' }
}

/** Cuántas fuentes están respondiendo, de las encendidas. */
export function sourcesHealth(snapshot: ActivitySnapshot | null): { ok: number; total: number } {
  if (!snapshot) return { ok: 0, total: 0 }
  const enabled = snapshot.sources.filter((source) => source.enabled)
  return { ok: enabled.filter((source) => source.ok).length, total: enabled.length }
}

/** Las palabras que más se repiten, para el destello del pulso. */
export function topKeywords(snapshot: ActivitySnapshot | null, limit = 3): ActivityKeyword[] {
  return snapshot ? snapshot.keywords.slice(0, limit) : []
}

/** "12/s" no; "12 en el último minuto" tampoco: la cifra y su unidad, juntas. */
export function rateLabel(perMinute: number): string {
  return `${perMinute}`
}
