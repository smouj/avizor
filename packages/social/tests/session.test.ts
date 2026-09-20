/**
 * Sesiones: estados, transiciones y qué se puede hacer en cada uno.
 *
 * Ningún estado distinto de «conectado y con interacción probada» permite
 * escribir, y todos los estados que bloquean llevan su motivo.
 */
import { describe, expect, it } from "vitest";

import {
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
} from "../src/session";

const NOW = 1_760_000_000_000;
const LATER = NOW + 60_000;

describe("estados de sesión", () => {
  it("una cuenta sin conectar no es una sesión viva", () => {
    const state = disconnectedSession();
    expect(isSessionLive(state)).toBe(false);
    expect(canInteract(state)).toBe(false);
    expect(sessionMessageKey(state)).toBe("session.notConnected");
  });

  it("tras iniciar sesión la sesión está viva pero la interacción aún no está probada", () => {
    const state = connectedSession(NOW);
    expect(isSessionLive(state)).toBe(true);
    expect(canInteract(state)).toBe(false);
    expect(sessionBlocksInteraction(state)?.code).toBe("UNSUPPORTED");
  });

  it("la prueba de salud abre la interacción", () => {
    const state = interactiveSession(connectedSession(NOW), LATER);
    expect(canInteract(state)).toBe(true);
    expect(sessionBlocksInteraction(state)).toBeNull();
    expect(state.since).toBe(NOW);
    expect(state.checkedAt).toBe(LATER);
  });

  it("una sesión caducada conserva desde cuándo existía y explica el bloqueo", () => {
    const state = expiredSession(connectedSession(NOW), LATER, "Cookie caducada");
    expect(isSessionLive(state)).toBe(false);
    expect(state.since).toBe(NOW);
    expect(sessionBlocksInteraction(state)?.code).toBe("SESSION_EXPIRED");
    expect(sessionMessageKey(state)).toBe("session.expired");
    expect(state.detail).toBe("Cookie caducada");
  });

  it("si la interfaz del sitio cambia, la red queda en solo lectura y se dice", () => {
    const state = selectorsOutdated(
      connectedSession(NOW),
      LATER,
      "El botón de responder ya no está",
    );
    expect(isSessionLive(state)).toBe(true);
    expect(canInteract(state)).toBe(false);
    expect(sessionBlocksInteraction(state)?.code).toBe("SELECTORS_OUTDATED");
    expect(sessionMessageKey(state)).toBe("session.selectorsOutdated");
  });

  it("solo lectura mantiene la lectura y bloquea la escritura", () => {
    const state = readOnlySession(connectedSession(NOW), LATER, "Límite temporal de la red");
    expect(isSessionLive(state)).toBe(true);
    expect(canInteract(state)).toBe(false);
    expect(sessionMessageKey(state)).toBe("session.readOnly");
  });

  it("una red caída no se confunde con una sesión caducada", () => {
    const state = unavailableSession(LATER, "Sin respuesta");
    expect(sessionMessageKey(state)).toBe("session.unavailable");
    expect(sessionBlocksInteraction(state)?.code).toBe("UNAVAILABLE");
  });

  it("pedir inicio de sesión distingue «nunca conectada» de «hay que volver a entrar»", () => {
    expect(sessionMessageKey(loginRequired(NOW))).toBe("session.loginRequired");
    expect(sessionMessageKey(disconnectedSession())).toBe("session.notConnected");
  });
});
