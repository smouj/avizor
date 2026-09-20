/**
 * Capacidades: qué puede hacer cada red **de verdad**, y cómo la sesión las
 * recorta.
 *
 * Dos reglas que no se negocian:
 *
 * 1. Todo empieza en `false`. Un adaptador declara lo que tiene probado; lo que
 *    no está probado, no se anuncia.
 * 2. Una sesión válida no basta para interactuar: hace falta que la prueba de
 *    salud haya confirmado que el camino de interacción sigue funcionando. Sin
 *    eso, la red se queda en lectura y la interfaz ofrece «abrir en la red».
 */

import type { ActionError, InteractionCapabilities, SessionState, SocialOperation } from "./types";

export const NO_INTERACTION: InteractionCapabilities = {
  read: false,
  like: false,
  reply: false,
  repost: false,
  publish: false,
  follow: false,
  media: false,
  quote: false,
  deleteOwnPost: false,
};

/** Solo lectura: lo que se ofrece cuando no hay adaptador de interacción. */
export function readOnlyCapabilities(): InteractionCapabilities {
  return { ...NO_INTERACTION, read: true };
}

/** Todas las capacidades: solo para pruebas y para adaptadores ya probados. */
export function fullCapabilities(): InteractionCapabilities {
  return {
    read: true,
    like: true,
    reply: true,
    repost: true,
    publish: true,
    follow: true,
    media: true,
    quote: true,
    deleteOwnPost: true,
  };
}

export function cloneCapabilities(caps: InteractionCapabilities): InteractionCapabilities {
  return { ...caps };
}

/** Las capacidades que dependen de tener el camino de interacción verificado. */
const INTERACTION_KEYS: readonly (keyof InteractionCapabilities)[] = [
  "like",
  "reply",
  "repost",
  "publish",
  "follow",
  "media",
  "quote",
  "deleteOwnPost",
];

/**
 * Capacidades efectivas: lo declarado por el adaptador, recortado por el estado
 * real de la sesión. `null` = fuente de solo lectura, sin sesión de por medio.
 */
export function effectiveCapabilities(
  declared: InteractionCapabilities,
  session: SessionState | null,
): InteractionCapabilities {
  if (!session) {
    const result = cloneCapabilities(declared);
    for (const key of INTERACTION_KEYS) result[key] = false;
    return result;
  }

  if (session.connection !== "CONNECTED") {
    return { ...NO_INTERACTION };
  }

  // Sesión válida: leer sí; escribir, solo si la prueba de salud lo confirma.
  const canInteract = session.health === "INTERACTION_AVAILABLE";
  const result = cloneCapabilities(declared);
  if (!canInteract) {
    for (const key of INTERACTION_KEYS) result[key] = false;
  }
  return result;
}

/** La clave de capacidad que corresponde a cada operación tipeada. */
export function capabilityForOperation(op: SocialOperation): keyof InteractionCapabilities {
  switch (op) {
    case "like":
      return "like";
    case "unlike":
      return "like";
    case "reply":
      return "reply";
    case "repost":
      return "repost";
    case "publish":
      return "publish";
    case "follow":
      return "follow";
    case "unfollow":
      return "follow";
    case "delete_own_post":
      return "deleteOwnPost";
  }
}

export function supports(caps: InteractionCapabilities, op: SocialOperation): boolean {
  return caps[capabilityForOperation(op)] === true;
}

export function unsupportedOperations(
  caps: InteractionCapabilities,
  ops: readonly SocialOperation[],
): SocialOperation[] {
  return ops.filter((op) => !supports(caps, op));
}

/**
 * Comprobación única antes de encolar una acción. Devuelve el error listo para
 * enseñar, o `null` si la operación está permitida.
 */
export function checkOperationAllowed(
  caps: InteractionCapabilities,
  op: SocialOperation,
): ActionError | null {
  if (supports(caps, op)) return null;
  return {
    code: "UNSUPPORTED",
    message: `Esta cuenta no puede hacer «${op}»: la red no ofrece esa capacidad o la sesión no la tiene confirmada.`,
  };
}

/** Qué le falta a una publicación para poder salir con imágenes o cita. */
export function contentCapabilitiesMissing(
  caps: InteractionCapabilities,
  content: { media?: unknown[]; quote?: unknown },
): (keyof InteractionCapabilities)[] {
  const missing: (keyof InteractionCapabilities)[] = [];
  if (content.media && content.media.length > 0 && !caps.media) missing.push("media");
  if (content.quote && !caps.quote) missing.push("quote");
  return missing;
}
