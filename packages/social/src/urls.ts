/**
 * URLs y aislamiento entre redes.
 *
 * Dos cosas que pueden hacer daño si están mal:
 *
 * - Las cookies de una red **nunca** pueden viajar a otra. Aquí se comprueba el
 *   host antes de cada operación, contra la lista blanca de esa cuenta.
 * - Las navegaciones solo admiten `http` y `https`. `file:`, `javascript:` y
 *   `data:` quedan fuera salvo que alguien lo pida por escrito y lo justifique.
 */

import { networkOf } from "./networks";
import type { ActionError, MatrixSource } from "./types";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/** Dominios explícitamente bloqueados como destino de navegación. */
const BLOCKED_PROTOCOLS = new Set(["file:", "javascript:", "data:", "blob:", "about:"]);

/**
 * Devuelve la `URL` si es navegable (http/https) y `null` si no lo es. No lanza:
 * un enlace roto de una red no puede tumbar la interfaz.
 */
export function parseSafeUrl(value: string): URL | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (BLOCKED_PROTOCOLS.has(url.protocol)) return null;
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return null;
  return url;
}

export function isSafeExternalUrl(value: string): boolean {
  return parseSafeUrl(value) !== null;
}

/**
 * `host` coincide con `domain` si es el mismo o un subdominio suyo.
 * `www.reddit.com` coincide con `reddit.com`; `evilreddit.com` no.
 */
export function hostMatchesDomain(host: string, domain: string): boolean {
  const cleanHost = host.toLowerCase().replace(/\.$/, "");
  const cleanDomain = domain.toLowerCase().replace(/\.$/, "");
  if (cleanDomain === "") return false;
  return cleanHost === cleanDomain || cleanHost.endsWith(`.${cleanDomain}`);
}

/**
 * Lista blanca de hosts para una cuenta: los dominios de la red más lo que
 * aporte la propia cuenta (la instancia de Mastodon, el host de Lemmy).
 * Un host sin punto, o con espacios, se descarta.
 */
export function allowedHostsFor(source: MatrixSource, extra: readonly string[] = []): string[] {
  const base = networkOf(source)?.defaultDomains ?? [];
  const hosts = new Set<string>();
  for (const domain of [...base, ...extra]) {
    const clean = domain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");
    if (clean === "" || !clean.includes(".") || /\s/.test(clean)) continue;
    hosts.add(clean);
  }
  return [...hosts];
}

/**
 * Comprueba que una URL pertenece a la lista blanca de la cuenta. Es lo que
 * impide que una sesión de `threads.net` acabe en `reddit.com`.
 */
export function hostAllowed(url: string, hosts: readonly string[]): boolean {
  const parsed = parseSafeUrl(url);
  if (!parsed) return false;
  return hosts.some((domain) => hostMatchesDomain(parsed.hostname, domain));
}

/** Error listo para enseñar cuando una URL no pasa el aislamiento. */
export function checkHostAllowed(url: string, hosts: readonly string[]): ActionError | null {
  const parsed = parseSafeUrl(url);
  if (!parsed) {
    return {
      code: "REJECTED",
      message: "El enlace no es una dirección web válida (solo http y https).",
    };
  }
  if (!hostAllowed(url, hosts)) {
    return {
      code: "REJECTED",
      message: `El dominio ${parsed.hostname} no pertenece a esta cuenta. La sesión de una red no viaja a otra.`,
    };
  }
  return null;
}
