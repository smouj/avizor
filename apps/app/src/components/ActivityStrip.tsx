import {
  activityNoteKey,
  activityNoteParams,
  activityTone,
  formatAgo,
  sourcesHealth,
  topKeywords,
} from '@/lib/activity'
import { useLatido } from '@/state/store'

/**
 * El pulso, siempre a la vista.
 *
 * Latido tiene que notarse vivo: aquí se ve cuánto está entrando **por minuto**,
 * cuántas fuentes están respondiendo ahora mismo y sobre qué palabras se está
 * hablando más. Todo son cifras contadas sobre los items del almacén; si no hay
 * datos, el pulso lo dice en vez de latir de mentira.
 *
 * El indicador manda cuando el flujo en directo está conectado: es la prueba más
 * fuerte de que algo está entrando en este momento.
 */
export function ActivityStrip(): JSX.Element {
  const { t, activity, realtime, polling, pollError } = useLatido()

  const tone = polling ? 'recent' : activityTone(activity)
  const health = sourcesHealth(activity)
  const keywords = topKeywords(activity, 3)

  const label = polling
    ? t('app.refreshing')
    : realtime === 'live'
      ? t('realtime.live')
      : activity
        ? t(activityNoteKey(activity.note), activityNoteParams(activity.note))
        : t('app.loading')

  const since =
    activity?.lastIngestAt != null && !polling
      ? formatAgo((Date.now() - activity.lastIngestAt) / 1000)
      : null

  const title = pollError
    ? `${t('activity.error')}: ${pollError}`
    : activity?.firstError
      ? `${t('activity.error')}: ${activity.firstError}`
      : label

  return (
    <div className={`activity activity--${tone}`} role="status" aria-live="polite" title={title}>
      <span className="activity__dot" aria-hidden="true" />
      <span className="activity__label">{label}</span>

      {since ? <span className="activity__since">{t(since.unit, { n: since.value })}</span> : null}

      {activity ? (
        <>
          <span className="activity__metric" title={t('activity.rateHint')}>
            <b>{activity.rate.perMinute}</b>
            <span className="activity__unit">{t('activity.perMinute')}</span>
          </span>

          <span className="activity__metric" title={t('activity.sourcesHint')}>
            <b>{health.ok}</b>
            <span className="activity__unit">/{health.total}</span>
          </span>

          {keywords.length > 0 ? (
            <span className="activity__words" title={t('activity.keywordsHint')}>
              {keywords.map((keyword) => (
                <span key={keyword.word} className="activity__word">
                  {keyword.word}
                  <b>{keyword.count}</b>
                </span>
              ))}
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
