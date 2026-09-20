/**
 * Catálogo de redes y fuentes, con su nivel y sus dominios.
 *
 * Aquí no se promete nada: un descriptor dice si la red se puede **leer** hoy
 * (hay conector en el motor) y si tiene **adaptador de interacción** probado.
 * Todo lo demás sale de ahí, no de la ilusión de soporte.
 */

import type { InteractionCapabilities, MatrixSource, SocialSource, SocialTier } from "./types";

export interface NetworkDescriptor {
  source: MatrixSource;
  label: string;
  tier: SocialTier;
  /** Dominios a los que puede viajar la sesión de esta red. Nunca a otra. */
  defaultDomains: string[];
  /** Hay conector de lectura en `@latido/engine`. */
  readConnector: boolean;
  /**
   * Hay adaptador web de interacción. Empieza en `false` en todas: se enciende
   * cuando el adaptador existe, pasa su prueba de salud y está documentado.
   */
  interactionAdapter: boolean;
}

export const NETWORKS: readonly NetworkDescriptor[] = [
  // Nivel A — las primeras que se implementan de verdad.
  {
    source: "threads",
    label: "Threads",
    tier: "A",
    defaultDomains: ["www.threads.net", "threads.net"],
    readConnector: false,
    interactionAdapter: false,
  },
  {
    source: "bluesky",
    label: "Bluesky",
    tier: "A",
    defaultDomains: ["bsky.app", "public.api.bsky.app"],
    readConnector: true,
    interactionAdapter: false,
  },
  {
    source: "mastodon",
    label: "Mastodon",
    tier: "A",
    // Las instancias son de cada persona: el host de la cuenta se añade al
    // registrar la sesión, nunca antes.
    defaultDomains: [],
    readConnector: true,
    interactionAdapter: false,
  },
  {
    source: "reddit",
    label: "Reddit",
    tier: "A",
    defaultDomains: ["www.reddit.com", "reddit.com", "oauth.reddit.com"],
    readConnector: true,
    interactionAdapter: false,
  },
  // Nivel B.
  {
    source: "x",
    label: "X",
    tier: "B",
    defaultDomains: ["x.com", "www.x.com", "twitter.com"],
    readConnector: false,
    interactionAdapter: false,
  },
  {
    source: "instagram",
    label: "Instagram",
    tier: "B",
    defaultDomains: ["www.instagram.com", "instagram.com"],
    readConnector: false,
    interactionAdapter: false,
  },
  {
    source: "facebook",
    label: "Facebook",
    tier: "B",
    defaultDomains: ["www.facebook.com", "facebook.com"],
    readConnector: false,
    interactionAdapter: false,
  },
  {
    source: "youtube",
    label: "YouTube",
    tier: "B",
    defaultDomains: ["www.youtube.com", "youtube.com"],
    readConnector: false,
    interactionAdapter: false,
  },
  // Nivel C.
  {
    source: "tiktok",
    label: "TikTok",
    tier: "C",
    defaultDomains: ["www.tiktok.com", "tiktok.com"],
    readConnector: false,
    interactionAdapter: false,
  },
  {
    source: "linkedin",
    label: "LinkedIn",
    tier: "C",
    defaultDomains: ["www.linkedin.com", "linkedin.com"],
    readConnector: false,
    interactionAdapter: false,
  },
  {
    source: "pinterest",
    label: "Pinterest",
    tier: "C",
    defaultDomains: ["www.pinterest.com", "pinterest.com"],
    readConnector: false,
    interactionAdapter: false,
  },
  {
    source: "tumblr",
    label: "Tumblr",
    tier: "C",
    defaultDomains: ["www.tumblr.com", "tumblr.com"],
    readConnector: false,
    interactionAdapter: false,
  },
  {
    source: "lemmy",
    label: "Lemmy",
    tier: "C",
    // Federado: el host lo pone la cuenta del usuario.
    defaultDomains: [],
    readConnector: false,
    interactionAdapter: false,
  },
  // Fuentes de solo lectura que ya lee el motor.
  {
    source: "hackernews",
    label: "Hacker News",
    tier: "feed",
    defaultDomains: [],
    readConnector: true,
    interactionAdapter: false,
  },
  {
    source: "github",
    label: "GitHub",
    tier: "feed",
    defaultDomains: ["github.com", "api.github.com"],
    readConnector: true,
    interactionAdapter: false,
  },
  {
    source: "rss",
    label: "RSS / Atom",
    tier: "feed",
    defaultDomains: [],
    readConnector: true,
    interactionAdapter: false,
  },
];

const BY_SOURCE = new Map<MatrixSource, NetworkDescriptor>(
  NETWORKS.map((network) => [network.source, network]),
);

export function networkOf(source: MatrixSource): NetworkDescriptor | null {
  return BY_SOURCE.get(source) ?? null;
}

/** Redes que pueden tener sesión (todo lo que no es una fuente de solo lectura). */
export function isSocialSource(source: MatrixSource): source is SocialSource {
  return networkOf(source)?.tier !== "feed";
}

export function networksByTier(tier: SocialTier): NetworkDescriptor[] {
  return NETWORKS.filter((network) => network.tier === tier);
}

export function socialSourcesWithAdapter(): SocialSource[] {
  return NETWORKS.filter((network) => network.tier !== "feed" && network.interactionAdapter).map(
    (network) => network.source as SocialSource,
  );
}
