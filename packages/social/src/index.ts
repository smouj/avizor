/**
 * @latido/social — superficie pública.
 *
 * La capa social de Latido: cuentas, sesiones web, capacidades reales,
 * compositor, cola de acciones y el contrato del puente de navegador.
 *
 * No hay claves API en ninguna parte de este paquete, y no las habrá: la
 * autenticación es siempre la del sitio, en su propia página.
 */

export type {
  ActionError,
  ActionErrorCode,
  ActionOutcome,
  ActionResult,
  ActionStatus,
  ActionTarget,
  ConnectionStatus,
  FeedSource,
  HealthStatus,
  InteractionCapabilities,
  MatrixSource,
  PublicIdentity,
  SessionState,
  SocialAccount,
  SocialAction,
  SocialActor,
  SocialContent,
  SocialMediaRef,
  SocialOperation,
  SocialSource,
  SocialTarget,
  SocialTier,
  TargetStatus,
  TypedActionRequest,
} from './types'

export {
  NETWORKS,
  isSocialSource,
  networkOf,
  networksByTier,
  socialSourcesWithAdapter,
  type NetworkDescriptor,
} from './networks'

export {
  NO_INTERACTION,
  capabilityForOperation,
  checkOperationAllowed,
  cloneCapabilities,
  contentCapabilitiesMissing,
  effectiveCapabilities,
  fullCapabilities,
  readOnlyCapabilities,
  supports,
  unsupportedOperations,
} from './capabilities'

export {
  canInteract,
  connectedSession,
  disconnectedSession,
  expiredSession,
  interactiveSession,
  isSessionLive,
  loginRequired,
  readOnlySession,
  selectorsOutdated,
  sessionBlocksInteraction,
  sessionMessageKey,
  unavailableSession,
} from './session'

export {
  sessionFromProbe,
  summarizeProbe,
  type ForgetReport,
  type HostProbe,
  type SessionProbe,
} from './probe'

export {
  allowedHostsFor,
  checkHostAllowed,
  hostAllowed,
  hostMatchesDomain,
  isSafeExternalUrl,
  parseSafeUrl,
} from './urls'

export {
  COMPOSE_CONSTRAINTS,
  UNKNOWN_CONSTRAINTS,
  constraintsFor,
  countCharacters,
  publishableAccounts,
  summarizeCompose,
  validateCompose,
  validateForAccount,
  type ComposeConstraints,
  type ComposeProblem,
  type ComposeProblemCode,
  type ComposeReadiness,
  type ComposeReadinessStatus,
  type ComposeTarget,
} from './composer'

export {
  ActionQueue,
  type ActionQueueOptions,
  type ActionSummary,
  type EnqueueInput,
} from './actions'

export { ProviderRegistry, type InteractionProvider, type ProviderContext } from './provider'

export {
  browserProfileIdFor,
  loginUrlFor,
  sessionHostsFor,
  type BrowserBridge,
  type BrowserProfileRef,
  type OpenSessionRequest,
  type SessionCheckRequest,
} from './bridge'
