/**
 * Capacidades: que ninguna red finja lo que no puede hacer.
 *
 * Lo que se comprueba aquí es la regla del diseño: una sesión válida no basta
 * para interactuar, y un adaptador que no ha declarado una capacidad no la
 * ofrece ni aunque la sesión esté perfecta.
 */
import { describe, expect, it } from "vitest";

import {
  NO_INTERACTION,
  checkOperationAllowed,
  effectiveCapabilities,
  fullCapabilities,
  readOnlyCapabilities,
  supports,
  unsupportedOperations,
} from "../src/capabilities";
import { NETWORKS, networkOf, networksByTier, socialSourcesWithAdapter } from "../src/networks";
import { connectedSession, interactiveSession, loginRequired } from "../src/session";

const NOW = 1_760_000_000_000;

describe("capacidades declaradas", () => {
  it("el punto de partida no promete nada", () => {
    expect(NO_INTERACTION.read).toBe(false);
    expect(supports(NO_INTERACTION, "like")).toBe(false);
    expect(checkOperationAllowed(NO_INTERACTION, "publish")?.code).toBe("UNSUPPORTED");
  });

  it("solo lectura no permite escribir aunque la sesión sea perfecta", () => {
    const caps = effectiveCapabilities(
      readOnlyCapabilities(),
      interactiveSession(connectedSession(NOW), NOW),
    );
    const ops = unsupportedOperations(caps, ["like", "reply", "repost", "publish", "follow"]);
    expect(caps.read).toBe(true);
    expect(ops).toEqual(["like", "reply", "repost", "publish", "follow"]);
  });

  it("sin sesión no hay interacción, ni siquiera declarada", () => {
    const caps = effectiveCapabilities(fullCapabilities(), null);
    expect(caps.read).toBe(true);
    expect(caps.publish).toBe(false);
    expect(caps.like).toBe(false);
  });

  it("con sesión viva pero sin prueba de interacción, la red queda en lectura", () => {
    const caps = effectiveCapabilities(fullCapabilities(), connectedSession(NOW));
    expect(caps.read).toBe(true);
    expect(caps.like).toBe(false);
    expect(caps.publish).toBe(false);
  });

  it("con la prueba de interacción confirmada se abren las capacidades declaradas", () => {
    const caps = effectiveCapabilities(
      fullCapabilities(),
      interactiveSession(connectedSession(NOW), NOW),
    );
    expect(caps.like).toBe(true);
    expect(caps.publish).toBe(true);
    expect(checkOperationAllowed(caps, "reply")).toBeNull();
  });

  it("sin iniciar sesión no se puede leer por esta vía", () => {
    const caps = effectiveCapabilities(fullCapabilities(), loginRequired(NOW));
    expect(caps.read).toBe(false);
    expect(supports(caps, "like")).toBe(false);
  });

  it("«unlike» depende de la misma capacidad que «like» y «unfollow» de la de seguir", () => {
    const caps = { ...NO_INTERACTION, read: true, like: true, follow: false };
    expect(supports(caps, "unlike")).toBe(true);
    expect(supports(caps, "unfollow")).toBe(false);
  });
});

describe("catálogo de redes", () => {
  it("el nivel A es el que el diseño pide", () => {
    expect(networksByTier("A").map((network) => network.source)).toEqual([
      "threads",
      "bluesky",
      "mastodon",
      "reddit",
    ]);
  });

  it("ninguna red se anuncia con adaptador mientras no exista (de momento ninguna)", () => {
    // Cuando llegue el primer adaptador de verdad, esta prueba cambia **a
    // propósito**: obliga a tocar la matriz en vez de prometer de más.
    expect(socialSourcesWithAdapter()).toEqual([]);
    expect(NETWORKS.filter((network) => network.interactionAdapter)).toHaveLength(0);
  });

  it("cada red sabe a qué dominios puede viajar su sesión", () => {
    expect(networkOf("reddit")?.defaultDomains).toContain("www.reddit.com");
    // Las federadas no llevan lista fija: la aporta la cuenta.
    expect(networkOf("mastodon")?.defaultDomains).toEqual([]);
    expect(networkOf("lemmy")?.defaultDomains).toEqual([]);
  });

  it("lo que el motor ya lee lo dice el catálogo, y no al revés", () => {
    expect(networkOf("bluesky")?.readConnector).toBe(true);
    expect(networkOf("threads")?.readConnector).toBe(false);
    expect(networkOf("hackernews")?.tier).toBe("feed");
  });
});
