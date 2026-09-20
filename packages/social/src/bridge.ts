/**
 * Puente de navegador: el contrato, no la implementación.
 *
 * Aquí se declara qué puede pedirle Latido al navegador y qué no. La
 * implementación vive en el escritorio (Tauri): un perfil propio por cuenta,
 * ventana visible, sesión persistente y operaciones tipeadas.
 *
 * Lo que este contrato prohíbe por diseño:
 *
 * - Pedir credenciales: no hay ningún campo donde quepan. El usuario entra en
 *   la página real de la red, dentro del perfil de Latido.
 * - Ejecutar JavaScript arbitrario: solo llegan `TypedActionRequest`.
 * - Hablar con una red desde el perfil de otra: cada operación lleva sus hosts.
 */

import { allowedHostsFor } from "./urls";
import type {
  ActionResult,
  PublicIdentity,
  SessionState,
  SocialSource,
  TypedActionRequest,
} from "./types";

export interface BrowserProfileRef {
  /** Identificador del perfil de Latido para esa cuenta (`threads/smouj`). */
  id: string;
  source: SocialSource;
}

export interface OpenSessionRequest extends BrowserProfileRef {
  /** Página real de inicio de sesión de la red. Se abre tal cual. */
  loginUrl: string;
}

export interface SessionCheckRequest extends BrowserProfileRef {
  /** Hosts contra los que se comprueba la sesión. Nunca otros. */
  hosts: string[];
}

export interface BrowserBridge {
  /** Abre la web oficial en una ventana visible, con el perfil de esa cuenta. */
  openSession(request: OpenSessionRequest): Promise<void>;
  /** ¿Sigue viva la sesión? Devuelve el estado, nunca un booleano suelto. */
  checkSession(request: SessionCheckRequest): Promise<SessionState>;
  /** Identidad pública de la cuenta: avatar, nombre, handle y URL. Nada más. */
  readIdentity(profile: BrowserProfileRef): Promise<PublicIdentity | null>;
  /** Ejecuta una operación tipeada. Nunca JavaScript libre. */
  perform(request: TypedActionRequest): Promise<ActionResult>;
  /** Borra el perfil entero de esa cuenta: cookies, almacenamiento y sesión. */
  forgetSession(profile: BrowserProfileRef): Promise<void>;
  /** Abre una URL en el navegador del sistema (el fallback honesto). */
  openUrl(url: string): Promise<void>;
}

/**
 * Páginas oficiales de inicio de sesión. Son las del propio sitio; Latido no
 * dibuja ningún formulario propio.
 */
const LOGIN_URLS: Record<SocialSource, string> = {
  threads: "https://www.threads.net/login",
  bluesky: "https://bsky.app/",
  reddit: "https://www.reddit.com/login/",
  x: "https://x.com/i/flow/login",
  instagram: "https://www.instagram.com/accounts/login/",
  facebook: "https://www.facebook.com/login",
  youtube: "https://accounts.google.com/ServiceLogin",
  tiktok: "https://www.tiktok.com/login",
  linkedin: "https://www.linkedin.com/login",
  pinterest: "https://www.pinterest.com/login/",
  tumblr: "https://www.tumblr.com/login",
  // Mastodon y Lemmy son federados: el host lo pone la cuenta.
  mastodon: "",
  lemmy: "",
};

/**
 * URL de inicio de sesión de una red. En las federadas hace falta el host de la
 * instancia, que sale de la propia cuenta.
 */
export function loginUrlFor(source: SocialSource, instanceHost?: string): string | null {
  const base = LOGIN_URLS[source];
  if (base) return base;
  if (!instanceHost) return null;
  const clean = instanceHost
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!clean.includes(".") || /\s/.test(clean)) return null;
  return source === "mastodon" ? `https://${clean}/auth/sign_in` : `https://${clean}/login`;
}

/** Hosts contra los que se comprueba la sesión de una cuenta. */
export function sessionHostsFor(source: SocialSource, instanceHost?: string): string[] {
  return allowedHostsFor(source, instanceHost ? [instanceHost] : []);
}

/** Ruta del perfil de Latido para una cuenta: un directorio por red y cuenta. */
export function browserProfileIdFor(source: SocialSource, handle: string): string {
  const clean = handle
    .trim()
    .replace(/^@/, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_");
  return `${source}/${clean}`;
}
