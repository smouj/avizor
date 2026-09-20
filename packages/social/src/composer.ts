/**
 * Compositor: qué se puede publicar en cada red y qué no.
 *
 * El mismo texto no se publica igual en todas partes, así que un compositor
 * multirred no puede ser «escribe aquí y a ver qué pasa». Antes de publicar,
 * cada cuenta recibe su veredicto: lista, bloqueada (con el motivo) o
 * desconocida (cuando la red no ha declarado sus límites y no queremos
 * inventarlos).
 *
 * Los números de `COMPOSE_CONSTRAINTS` son los que la red publica en su
 * documentación; `documented: false` marca los que son estimación y hay que
 * confirmar contra el propio contador del sitio al publicar.
 */

import { contentCapabilitiesMissing } from "./capabilities";
import type { InteractionCapabilities, SocialAccount, SocialContent, SocialSource } from "./types";

export interface ComposeConstraints {
  /** Caracteres permitidos, contados como grafemas. `null` = sin dato fiable. */
  maxLength: number | null;
  maxMedia: number;
  allowsMedia: boolean;
  allowsLinks: boolean;
  requiresCommunity: boolean;
  requiresTitle: boolean;
  supportsQuote: boolean;
  /** `true` si el límite está en la documentación pública de la red. */
  documented: boolean;
}

/** Lo que se asume cuando una red no ha declarado nada: no prometer nada. */
export const UNKNOWN_CONSTRAINTS: ComposeConstraints = {
  maxLength: null,
  maxMedia: 0,
  allowsMedia: false,
  allowsLinks: true,
  requiresCommunity: false,
  requiresTitle: false,
  supportsQuote: false,
  documented: false,
};

export const COMPOSE_CONSTRAINTS: Partial<Record<SocialSource, ComposeConstraints>> = {
  bluesky: {
    maxLength: 300,
    maxMedia: 4,
    allowsMedia: true,
    allowsLinks: true,
    requiresCommunity: false,
    requiresTitle: false,
    supportsQuote: true,
    documented: true,
  },
  x: {
    maxLength: 280,
    maxMedia: 4,
    allowsMedia: true,
    allowsLinks: true,
    requiresCommunity: false,
    requiresTitle: false,
    supportsQuote: true,
    documented: true,
  },
  threads: {
    maxLength: 500,
    maxMedia: 10,
    allowsMedia: true,
    allowsLinks: true,
    requiresCommunity: false,
    requiresTitle: false,
    supportsQuote: true,
    documented: true,
  },
  mastodon: {
    maxLength: 500,
    maxMedia: 4,
    allowsMedia: true,
    allowsLinks: true,
    requiresCommunity: false,
    requiresTitle: false,
    supportsQuote: false,
    // El límite lo fija cada instancia y puede ser mayor: se confirma al publicar.
    documented: false,
  },
  reddit: {
    maxLength: 40_000,
    maxMedia: 1,
    allowsMedia: true,
    allowsLinks: true,
    requiresCommunity: true,
    requiresTitle: true,
    supportsQuote: false,
    documented: false,
  },
  lemmy: {
    maxLength: null,
    maxMedia: 1,
    allowsMedia: true,
    allowsLinks: true,
    requiresCommunity: true,
    requiresTitle: true,
    supportsQuote: false,
    documented: false,
  },
};

export function constraintsFor(source: SocialSource): ComposeConstraints {
  return COMPOSE_CONSTRAINTS[source] ?? UNKNOWN_CONSTRAINTS;
}

/**
 * Cuenta grafemas, no unidades UTF-16: «👩‍💻» es una y Bluesky, por ejemplo,
 * cuenta así. Si el entorno no trae `Intl.Segmenter`, se cae a `Array.from`,
 * que al menos no parte los pares subrogados.
 */
export function countCharacters(text: string): number {
  const Segmenter = (
    Intl as {
      Segmenter?: new (
        locale?: string,
        options?: { granularity: string },
      ) => { segment(input: string): Iterable<unknown> };
    }
  ).Segmenter;
  if (typeof Segmenter === "function") {
    return [...new Segmenter("es", { granularity: "grapheme" }).segment(text)].length;
  }
  return [...text].length;
}

export type ComposeProblemCode =
  | "EMPTY"
  | "NO_CAPABILITY"
  | "TOO_LONG"
  | "TOO_MANY_MEDIA"
  | "MEDIA_UNSUPPORTED"
  | "QUOTE_UNSUPPORTED"
  | "COMMUNITY_REQUIRED"
  | "TITLE_REQUIRED"
  | "LIMIT_UNKNOWN";

export interface ComposeProblem {
  code: ComposeProblemCode;
  /** Motivo legible; la interfaz lo enseña tal cual. */
  message: string;
  /** Números implicados, para pintar «512 / 500». */
  params?: Record<string, number | string>;
}

export type ComposeReadinessStatus = "ready" | "blocked" | "unknown";

export interface ComposeReadiness {
  accountId: string;
  source: SocialSource;
  status: ComposeReadinessStatus;
  problems: ComposeProblem[];
  /** Longitud contada en grafemas, para el contador del compositor. */
  length: number;
  constraints: ComposeConstraints;
}

export interface ComposeTarget {
  account: SocialAccount;
  /** Capacidades **efectivas** de esa cuenta (ya recortadas por su sesión). */
  capabilities: InteractionCapabilities;
}

/** Comprueba el contenido contra una cuenta. Función pura: no toca red ni disco. */
export function validateForAccount(
  content: SocialContent,
  target: ComposeTarget,
): ComposeReadiness {
  const { account, capabilities } = target;
  const constraints = constraintsFor(account.source);
  const length = countCharacters(content.text);
  const problems: ComposeProblem[] = [];

  if (!capabilities.publish) {
    problems.push({
      code: "NO_CAPABILITY",
      message: "Esta cuenta no puede publicar ahora mismo (sin adaptador o sin sesión confirmada).",
    });
  }

  const hasMedia = (content.media?.length ?? 0) > 0;
  if (content.text.trim() === "" && !hasMedia) {
    problems.push({ code: "EMPTY", message: "No hay nada que publicar." });
  }

  if (constraints.maxLength !== null && length > constraints.maxLength) {
    problems.push({
      code: "TOO_LONG",
      message: `Demasiado largo: ${length} de ${constraints.maxLength} caracteres.`,
      params: { length, maxLength: constraints.maxLength },
    });
  }

  const missing = contentCapabilitiesMissing(capabilities, content);
  if (missing.includes("media")) {
    problems.push({
      code: "MEDIA_UNSUPPORTED",
      message: "Esta cuenta no puede publicar imágenes.",
    });
  } else if (hasMedia) {
    if (!constraints.allowsMedia) {
      problems.push({ code: "MEDIA_UNSUPPORTED", message: "Esta red no admite imágenes." });
    } else if (content.media && content.media.length > constraints.maxMedia) {
      problems.push({
        code: "TOO_MANY_MEDIA",
        message: `Demasiadas imágenes: ${content.media.length} de ${constraints.maxMedia}.`,
        params: { count: content.media.length, maxMedia: constraints.maxMedia },
      });
    }
  }

  if (content.quote && (missing.includes("quote") || !constraints.supportsQuote)) {
    problems.push({
      code: "QUOTE_UNSUPPORTED",
      message: "Esta red no admite citar una publicación.",
    });
  }

  if (constraints.requiresCommunity && !content.community?.trim()) {
    problems.push({
      code: "COMMUNITY_REQUIRED",
      message: "Esta red necesita una comunidad de destino.",
    });
  }

  if (constraints.requiresTitle && !content.title?.trim()) {
    problems.push({ code: "TITLE_REQUIRED", message: "Esta red necesita un título." });
  }

  const blocking = problems.some((problem) => problem.code !== "LIMIT_UNKNOWN");
  if (!blocking && !constraints.documented) {
    // Ni límite conocido ni problema: se dice que el límite no está confirmado
    // en vez de dar por hecho que cabe.
    problems.push({
      code: "LIMIT_UNKNOWN",
      message: "Los límites de esta red no están confirmados: se comprobarán al publicar.",
    });
  }

  const status: ComposeReadinessStatus = blocking
    ? "blocked"
    : constraints.documented
      ? "ready"
      : "unknown";

  return { accountId: account.id, source: account.source, status, problems, length, constraints };
}

export function validateCompose(
  content: SocialContent,
  targets: readonly ComposeTarget[],
): ComposeReadiness[] {
  return targets.map((target) => validateForAccount(content, target));
}

/** Recuento para el resumen del compositor: «2 listas, 1 bloqueada». */
export function summarizeCompose(readiness: readonly ComposeReadiness[]): {
  ready: number;
  blocked: number;
  unknown: number;
} {
  let ready = 0;
  let blocked = 0;
  let unknown = 0;
  for (const item of readiness) {
    if (item.status === "ready") ready += 1;
    else if (item.status === "blocked") blocked += 1;
    else unknown += 1;
  }
  return { ready, blocked, unknown };
}

/** Solo las cuentas que pueden recibir el contenido tal cual está. */
export function publishableAccounts(readiness: readonly ComposeReadiness[]): string[] {
  return readiness.filter((item) => item.status !== "blocked").map((item) => item.accountId);
}
