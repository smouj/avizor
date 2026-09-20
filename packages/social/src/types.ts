/**
 * Modelo de la capa social de Latido.
 *
 * Latido tiene dos capas separadas a propósito:
 *
 *   Connector           → LEER    (packages/engine: conectores, temas, tendencias)
 *   InteractionProvider → PARTICIPAR (este paquete)
 *
 * Este paquete no lee redes ni habla HTTP por su cuenta: describe cuentas,
 * sesiones web, capacidades —declaradas por el adaptador, nunca supuestas—,
 * contenido y acciones con su cola. Una red nunca puede fingir una capacidad
 * que no esté realmente disponible.
 *
 * Regla que atraviesa todo el modelo: **cero claves API**. La autenticación es
 * siempre la del sitio, en su propia página, dentro de un perfil de navegador
 * de Latido; aquí nunca viaja una contraseña.
 */

/** Redes con las que la capa social sabe hablar: Nivel A, B y C del diseño. */
export type SocialSource =
  | "threads"
  | "bluesky"
  | "mastodon"
  | "reddit"
  | "x"
  | "instagram"
  | "facebook"
  | "youtube"
  | "tiktok"
  | "linkedin"
  | "pinterest"
  | "tumblr"
  | "lemmy";

/** Fuentes que solo se leen: no hay sesión que abrir ni acción que confirmar. */
export type FeedSource = "hackernews" | "rss" | "github";

/** Lo que aparece en la matriz de capacidades: redes sociales y fuentes. */
export type MatrixSource = SocialSource | FeedSource;

/** Nivel de prioridad del diseño (A: primero, C: al final, feed: solo lectura). */
export type SocialTier = "A" | "B" | "C" | "feed";

/**
 * Operaciones tipeadas. Es la única puerta por la que se escribe en una red:
 * la IA sugiere contenido, nunca elige el JavaScript que se ejecuta.
 */
export type SocialOperation =
  "like" | "unlike" | "reply" | "repost" | "publish" | "follow" | "unfollow" | "delete_own_post";

/** Qué sabe hacer una red, de verdad. Todo empieza en `false`. */
export interface InteractionCapabilities {
  read: boolean;
  like: boolean;
  reply: boolean;
  repost: boolean;
  publish: boolean;
  follow: boolean;
  media: boolean;
  quote: boolean;
  deleteOwnPost: boolean;
}

/**
 * Estado de la sesión de una cuenta, tal como lo ve la comprobación de salud.
 * Los nombres son los del diseño y son deliberadamente pocos: cada uno cambia
 * lo que la interfaz ofrece.
 */
export type HealthStatus =
  | "CONNECTED"
  | "SESSION_EXPIRED"
  | "INTERACTION_AVAILABLE"
  | "READ_ONLY"
  | "SELECTORS_OUTDATED"
  | "LOGIN_REQUIRED"
  | "UNAVAILABLE";

export type ConnectionStatus = "DISCONNECTED" | "CONNECTED";

export interface SessionState {
  connection: ConnectionStatus;
  health: HealthStatus;
  /** epoch ms de la última comprobación; `null` si no se ha comprobado nunca. */
  checkedAt: number | null;
  /** epoch ms desde cuándo se conoce la sesión (el momento del inicio de sesión). */
  since: number | null;
  /**
   * Motivo legible cuando el estado no es `CONNECTED`. Texto de la aplicación,
   * nunca generado por un modelo.
   */
  detail?: string;
}

/** Identidad pública de una cuenta: lo único que se lee del sitio tras entrar. */
export interface PublicIdentity {
  source: SocialSource;
  handle: string;
  displayName?: string;
  avatarUrl?: string;
  profileUrl?: string;
}

export interface SocialAccount {
  id: string;
  source: SocialSource;
  handle: string;
  displayName?: string;
  avatarUrl?: string;
  profileUrl?: string;
  /** Perfil de navegador de Latido que guarda esta sesión. Uno por cuenta. */
  browserProfileId: string;
  sessionState: SessionState;
  addedAt: number;
  lastCheckedAt?: number;
}

/** Una publicación concreta de una red: el objetivo de una acción. */
export interface SocialTarget {
  source: SocialSource;
  /** Identificador dentro de su red (el `externalId` del motor). */
  externalId: string;
  /** URL canónica. Obligatoria: es el fallback cuando la acción no se puede hacer aquí. */
  url: string;
  authorHandle?: string;
}

/** Una cuenta o persona de una red: el objetivo de seguir/dejar de seguir. */
export interface SocialActor {
  source: SocialSource;
  handle: string;
  url?: string;
}

export interface SocialMediaRef {
  /** Ruta local del archivo, si la imagen vive en el equipo. */
  path?: string;
  /** URL remota, cuando ya está publicada. */
  url?: string;
  alt?: string;
  mimeType?: string;
}

export interface SocialContent {
  text: string;
  /** Título: solo lo piden las redes que lo exigen (Reddit). */
  title?: string;
  /** Comunidad, subreddit o equivalente; lo exigen las redes con espacios. */
  community?: string;
  media?: SocialMediaRef[];
  /** Publicación citada. */
  quote?: SocialTarget;
  /** Publicación a la que se responde. */
  replyTo?: SocialTarget;
  lang?: string;
}

export type ActionOutcome = "success" | "failed" | "cancelled" | "unsupported";

export type ActionErrorCode =
  | "SESSION_EXPIRED"
  | "LOGIN_REQUIRED"
  | "SELECTORS_OUTDATED"
  | "UNAVAILABLE"
  | "UNSUPPORTED"
  | "RATE_LIMITED"
  | "REJECTED"
  | "NETWORK"
  | "UNKNOWN";

export interface ActionError {
  code: ActionErrorCode;
  message: string;
  /** A dónde puede ir el usuario para terminar la acción a mano (ver `fallback.ts`). */
  fallbackUrl?: string;
}

export interface ActionResult {
  source: SocialSource;
  accountId?: string;
  operation: SocialOperation;
  outcome: ActionOutcome;
  /**
   * `true` solo si se comprobó **en la red** que la acción ocurrió. Sin esto,
   * Latido no puede decir que algo se publicó.
   */
  verified: boolean;
  /** URL del resultado: la publicación nueva o la propia publicación. */
  resultUrl?: string;
  externalId?: string;
  error?: ActionError;
  at: number;
}

/** Estados de una acción en la cola local. */
export type ActionStatus =
  "DRAFT" | "AWAITING_CONFIRMATION" | "RUNNING" | "SUCCESS" | "FAILED" | "CANCELLED";

/** Estado de un destino concreto dentro de una acción (una red nunca es todo o nada). */
export type TargetStatus = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "SKIPPED";

export interface ActionTarget {
  accountId: string;
  source: SocialSource;
  status: TargetStatus;
  result?: ActionResult;
  error?: ActionError;
}

export interface SocialAction {
  id: string;
  operation: SocialOperation;
  content: SocialContent;
  /** Un destino por cuenta y red: publicar en tres redes son tres resultados. */
  targets: ActionTarget[];
  status: ActionStatus;
  createdAt: number;
  confirmedAt?: number;
  startedAt?: number;
  finishedAt?: number;
  /** Quién la pidió: el usuario a mano o un asistente. Nunca decide por su cuenta. */
  origin: "user" | "assistant";
}

/** Escritura tipada que se le pide al navegador. Nunca JavaScript libre. */
export interface TypedActionRequest {
  source: SocialSource;
  browserProfileId: string;
  operation: SocialOperation;
  target?: SocialTarget;
  actor?: SocialActor;
  content?: SocialContent;
  /** Versión de los selectores con la que se construyó la petición. */
  selectorsVersion?: number;
}
