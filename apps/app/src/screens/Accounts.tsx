import { useState } from 'react'

import { Icon } from '@/components/Icon'
import { Avatar, EmptyState } from '@/components/primitives'
import { openExternal } from '@/platform/bridge'
import {
  canOpenAccount,
  isFederated,
  loginUrlForAccount,
  profileIdFor,
  socialSupported,
} from '@/platform/social'
import { useLatido, type LinkedAccount } from '@/state/store'
import { relativeTime } from '@/lib/format'
import type { MessageKey } from '@/i18n'
import {
  NETWORKS,
  networkOf,
  sessionMessageKey,
  type MatrixSource,
  type SocialTier,
} from '@latido/social'

/**
 * Cuentas: las redes del catálogo, con un perfil de navegador por cuenta.
 *
 * Lo que esta pantalla **no** hace, y no debe hacer: prometer interacción. Hoy
 * ninguna red tiene adaptador, así que no hay botones de publicar. Lo que sí
 * hace es todo lo verificable: abrir la web oficial en su propia ventana,
 * comprobar si la sesión sigue viva y leer la identidad pública.
 *
 * Fuera del escritorio no se finge nada: se dice que hace falta la aplicación.
 */

/** Los niveles del diseño, en orden. El `feed` no tiene sesión propia. */
const TIERS: readonly SocialTier[] = ['A', 'B', 'C', 'feed']

function tierKey(tier: SocialTier): MessageKey {
  return `accounts.level.${tier}` as MessageKey
}

export function AccountsScreen(): JSX.Element {
  const t = useLatido((state) => state.t)
  const lang = useLatido((state) => state.lang)
  const accounts = useLatido((state) => state.accounts)
  const accountBusy = useLatido((state) => state.accountBusy)
  const addAccount = useLatido((state) => state.addAccount)
  const openAccountSession = useLatido((state) => state.openAccountSession)
  const checkAccount = useLatido((state) => state.checkAccount)
  const readAccountIdentity = useLatido((state) => state.readAccountIdentity)
  const forgetAccount = useLatido((state) => state.forgetAccount)
  const toast = useLatido((state) => state.toast)

  const [source, setSource] = useState<MatrixSource>('threads')
  const [handle, setHandle] = useState('')
  const [instanceHost, setInstanceHost] = useState('')
  const [error, setError] = useState<string | null>(null)

  const desktop = socialSupported()
  const federated = isFederated(source)

  const submit = (): void => {
    const result = addAccount(source, handle, instanceHost)
    if (!result.ok) {
      setError(t(result.error))
      return
    }
    setError(null)
    setHandle('')
    setInstanceHost('')
    toast(t('accounts.added'), 'ok')
  }

  return (
    <div className="content content--narrow">
      {!desktop ? (
        <section className="section section--tight">
          <article className="panel">
            <div className="panel__head">
              <span className="inline">
                <Icon name="info" size="sm" />
                <span className="row__title">{t('accounts.desktopOnly')}</span>
              </span>
            </div>
          </article>
        </section>
      ) : null}

      {/* El aviso va siempre a la vista: es el estado real de hoy, no una nota al pie. */}
      <section className="section section--tight">
        <p className="small muted">{t('accounts.noAdapterNotice')}</p>
      </section>

      <section className="section">
        <div className="section__head">
          <span className="label">{t('accounts.catalog')}</span>
          <span className="mono micro faint">{NETWORKS.length}</span>
        </div>
        <p className="small muted">{t('accounts.catalogHint')}</p>

        {TIERS.map((tier) => {
          const networks = NETWORKS.filter((network) => network.tier === tier)
          if (networks.length === 0) return null
          return (
            <article className="panel" key={tier}>
              <div className="panel__head">
                <span className="label">{t(tierKey(tier))}</span>
                <span className="mono micro faint">{networks.length}</span>
              </div>
              <div className="chips">
                {networks.map((network) => {
                  const addable = canOpenAccount(network.source)
                  return (
                    <button
                      key={network.source}
                      type="button"
                      className="chip"
                      aria-pressed={source === network.source}
                      disabled={!addable}
                      onClick={() => {
                        setSource(network.source)
                        setError(null)
                      }}
                      title={addable ? network.label : t('accounts.error.noLogin')}
                    >
                      <Icon name={addable ? 'at' : 'eye'} size="sm" />
                      {network.label}
                      <span className="micro faint">
                        {network.readConnector
                          ? t('accounts.badge.read')
                          : t('accounts.badge.noRead')}
                      </span>
                    </button>
                  )
                })}
              </div>
            </article>
          )
        })}
      </section>

      <section className="section">
        <span className="label">{t('accounts.add')}</span>
        <article className="panel">
          <div className="stack stack--tight">
            <label className="field">
              <span className="label">{t('accounts.select')}</span>
              <select
                className="select"
                value={source}
                onChange={(event) => {
                  setSource(event.target.value as MatrixSource)
                  setError(null)
                }}
              >
                {TIERS.map((tier) => {
                  const addable = NETWORKS.filter(
                    (network) => network.tier === tier && canOpenAccount(network.source),
                  )
                  if (addable.length === 0) return null
                  return (
                    <optgroup key={tier} label={t(tierKey(tier))}>
                      {addable.map((network) => (
                        <option key={network.source} value={network.source}>
                          {network.label}
                        </option>
                      ))}
                    </optgroup>
                  )
                })}
              </select>
            </label>

            <label className="field">
              <span className="label">{t('accounts.handle')}</span>
              <input
                className="input"
                value={handle}
                placeholder={t('accounts.handlePlaceholder')}
                onChange={(event) => {
                  setHandle(event.target.value)
                  setError(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submit()
                }}
              />
            </label>

            {federated ? (
              <label className="field">
                <span className="label">{t('accounts.instance')}</span>
                <input
                  className="input"
                  value={instanceHost}
                  placeholder={t('accounts.instancePlaceholder')}
                  onChange={(event) => {
                    setInstanceHost(event.target.value)
                    setError(null)
                  }}
                />
              </label>
            ) : null}

            {error ? <span className="small warn-text">{error}</span> : null}

            <div className="inline">
              <button type="button" className="btn btn--primary btn--small" onClick={submit}>
                <Icon name="plus" size="sm" />
                {t('accounts.add')}
              </button>
              {/* Lo que la red va a pedir, antes de añadirla: perfil y dominios. */}
              <span className="mono micro faint">
                {profileIdFor({ source, handle: handle || '…' })} ·{' '}
                {loginUrlForAccount({ source, handle, instanceHost }) ?? '—'}
              </span>
            </div>
          </div>
        </article>
      </section>

      <section className="section">
        <div className="section__head">
          <span className="label">{t('accounts.mine')}</span>
          <span className="mono micro faint">
            {t('accounts.count', { count: accounts.length })}
          </span>
        </div>

        {accounts.length === 0 ? (
          <EmptyState icon="at" title={t('accounts.empty')} hint={t('accounts.emptyHint')} />
        ) : (
          <div className="grid-cards">
            {accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                busy={accountBusy === account.id}
                desktop={desktop}
                lang={lang}
                now={Date.now()}
                onOpen={() => void openAccountSession(account.id)}
                onCheck={() => void checkAccount(account.id)}
                onIdentity={() => void readAccountIdentity(account.id)}
                onForget={() => {
                  // Olvidar borra el perfil entero: se pregunta antes, siempre.
                  if (window.confirm(t('accounts.forgetConfirm'))) void forgetAccount(account.id)
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function AccountCard({
  account,
  busy,
  desktop,
  lang,
  now,
  onOpen,
  onCheck,
  onIdentity,
  onForget,
}: {
  account: LinkedAccount
  busy: boolean
  desktop: boolean
  lang: 'es' | 'en'
  now: number
  onOpen: () => void
  onCheck: () => void
  onIdentity: () => void
  onForget: () => void
}): JSX.Element {
  const t = useLatido((state) => state.t)
  const network = networkOf(account.source)
  const identity = account.identity
  const name = identity?.displayName ?? account.handle

  return (
    <article className="entity-card">
      <div className="entity-card__head">
        <Avatar name={name} {...(identity?.avatarUrl ? { url: identity.avatarUrl } : {})} />
        <span className="grow">
          <span className="entity-card__name truncate">{name}</span>
          <span className="entity-card__kind">
            {network?.label ?? account.source} · @{account.handle}
          </span>
        </span>
      </div>

      <div className="inline inline--wrap">
        {/* El estado es el del modelo: su etiqueta y su código, sin inventar ninguno. */}
        <span className="tag">
          <Icon name="shield" size="sm" />
          {t(sessionMessageKey(account.session) as MessageKey)}
        </span>
        <span className="mono micro faint">{account.session.health}</span>
      </div>

      <span className="micro faint">
        {account.session.checkedAt
          ? t('accounts.checkedAt', {
              time: relativeTime(account.session.checkedAt, now, lang),
            })
          : t('accounts.neverChecked')}
        {account.session.since
          ? ` · ${t('accounts.sessionSince', {
              time: relativeTime(account.session.since, now, lang),
            })}`
          : ''}
        {` · ${t('accounts.addedAt', { time: relativeTime(account.addedAt, now, lang) })}`}
      </span>

      <span className="micro faint mono truncate">
        {t('accounts.profile')}: {profileIdFor(account)}
      </span>

      {identity ? (
        <div className="inline inline--wrap">
          <span className="small truncate">{identity.displayName ?? identity.handle}</span>
          {identity.profileUrl ? (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => void openExternal(identity.profileUrl as string)}
            >
              <Icon name="external" size="sm" />
              {t('accounts.identityUrl')}
            </button>
          ) : null}
        </div>
      ) : (
        <span className="micro faint">{t('accounts.identityNone')}</span>
      )}

      <div className="inline inline--wrap">
        <button
          type="button"
          className="btn btn--outline btn--small"
          disabled={!desktop || busy}
          onClick={onOpen}
        >
          <Icon name="external" size="sm" />
          {t('accounts.openSession')}
        </button>
        <button
          type="button"
          className="btn btn--outline btn--small"
          disabled={!desktop || busy}
          onClick={onCheck}
        >
          <Icon name="refresh" size="sm" />
          {t('accounts.check')}
        </button>
        <button
          type="button"
          className="btn btn--outline btn--small"
          disabled={!desktop || busy}
          onClick={onIdentity}
        >
          <Icon name="eye" size="sm" />
          {t('accounts.readIdentity')}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          disabled={!desktop || busy}
          onClick={onForget}
        >
          <Icon name="trash" size="sm" />
          {t('accounts.forget')}
        </button>
      </div>
    </article>
  )
}
