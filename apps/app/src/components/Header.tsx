import { ActivityStrip } from '@/components/ActivityStrip'
import { Icon } from '@/components/Icon'
import { useAvizor } from '@/state/store'

/**
 * Cabecera del canal central: título de la vista, pulso real de la actividad y
 * las acciones de siempre (buscar, tema, idioma, sondear). Se queda pegada
 * arriba.
 *
 * El pulso dice la verdad: si el flujo en directo está conectado lo dice, y si
 * solo hay sondeo enseña cuándo llegó lo último, cuánto entra por minuto, cuántas
 * fuentes responden y de qué se está hablando. Nunca un «en vivo» decorativo.
 */
export function Header({ title, subtitle }: { title: string; subtitle?: string }): JSX.Element {
  const { t, lang, theme, setTheme, setLang, poll, query, setQuery, polling } = useAvizor()

  return (
    <>
      <header className="header">
        <div className="header__titles">
          <span className="header__title">{title}</span>
          {subtitle ? <span className="header__subtitle">{subtitle}</span> : null}
        </div>

        <span className="header__spacer" />

        <label className="search-field">
          <Icon name="search" size="sm" />
          <input
            value={query}
            placeholder={t('app.searchPlaceholder')}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t('app.search')}
          />
          {query ? (
            <button type="button" className="icon-btn" onClick={() => setQuery('')} aria-label={t('app.close')}>
              <Icon name="close" size="sm" />
            </button>
          ) : null}
        </label>

        <ActivityStrip />

        <button
          type="button"
          className="icon-btn"
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          title={theme === 'light' ? t('app.theme.toDark') : t('app.theme.toLight')}
          aria-label={t('app.theme.toDark')}
        >
          <Icon name={theme === 'light' ? 'moon' : 'sun'} />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setLang(lang === 'es' ? 'en' : 'es')}
          title={t('app.language')}
          aria-label={t('app.language')}
        >
          <span className="mono micro">{lang.toUpperCase()}</span>
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => void poll()}
          disabled={polling}
          title={t('app.refresh')}
          aria-label={t('app.refresh')}
        >
          <Icon name="refresh" />
        </button>
      </header>
    </>
  )
}
