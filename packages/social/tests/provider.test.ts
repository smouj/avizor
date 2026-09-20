/**
 * Registro de adaptadores.
 *
 * Un adaptador no puede declarar lo que no hace: si dice que sabe seguir
 * cuentas, tiene que implementarlo; si dice que sabe leer, tiene que poder
 * verificar sus propias acciones. Y una fuente de solo lectura no tiene
 * adaptador de interacción, por definición.
 */
import { describe, expect, it } from "vitest";

import { ProviderRegistry, type InteractionProvider } from "../src/provider";
import { fullCapabilities, readOnlyCapabilities } from "../src/capabilities";
import { connectedSession } from "../src/session";
import type { SocialSource } from "../src/types";

const NOW = 1_760_000_000_000;

function fakeProvider(overrides: Partial<InteractionProvider> = {}): InteractionProvider {
  const base: InteractionProvider = {
    source: "bluesky",
    label: "Bluesky",
    capabilities: fullCapabilities(),
    async getSessionState() {
      return connectedSession(NOW);
    },
    async like() {
      return { source: "bluesky", operation: "like", outcome: "success", verified: true, at: NOW };
    },
    async unlike() {
      return {
        source: "bluesky",
        operation: "unlike",
        outcome: "success",
        verified: true,
        at: NOW,
      };
    },
    async reply() {
      return { source: "bluesky", operation: "reply", outcome: "success", verified: true, at: NOW };
    },
    async repost() {
      return {
        source: "bluesky",
        operation: "repost",
        outcome: "success",
        verified: true,
        at: NOW,
      };
    },
    async publish() {
      return {
        source: "bluesky",
        operation: "publish",
        outcome: "success",
        verified: true,
        at: NOW,
      };
    },
    async follow() {
      return {
        source: "bluesky",
        operation: "follow",
        outcome: "success",
        verified: true,
        at: NOW,
      };
    },
    async unfollow() {
      return {
        source: "bluesky",
        operation: "unfollow",
        outcome: "success",
        verified: true,
        at: NOW,
      };
    },
    async deleteOwnPost() {
      return {
        source: "bluesky",
        operation: "delete_own_post",
        outcome: "success",
        verified: true,
        at: NOW,
      };
    },
  };
  return { ...base, ...overrides };
}

describe("registro de adaptadores", () => {
  it("un adaptador válido se registra y se encuentra", () => {
    const registry = new ProviderRegistry();
    registry.register(fakeProvider());
    expect(registry.has("bluesky")).toBe(true);
    expect(registry.labelFor("bluesky")).toBe("Bluesky");
    expect(registry.list()).toHaveLength(1);
  });

  it("las fuentes de solo lectura no tienen adaptador de interacción", () => {
    const registry = new ProviderRegistry();
    expect(() =>
      registry.register(fakeProvider({ source: "rss" as unknown as SocialSource })),
    ).toThrow(/solo lectura/);
  });

  it("un adaptador que no sabe leer no puede verificar nada y se rechaza", () => {
    const registry = new ProviderRegistry();
    expect(() =>
      registry.register(fakeProvider({ capabilities: readOnlyCapabilities(), source: "threads" })),
    ).not.toThrow();

    expect(() =>
      registry.register(
        fakeProvider({ source: "reddit", capabilities: { ...fullCapabilities(), read: false } }),
      ),
    ).toThrow(/read: true/);
  });

  it("no se puede declarar una capacidad sin implementarla", () => {
    const registry = new ProviderRegistry();
    const sinSeguir = fakeProvider({ source: "threads" });
    delete (sinSeguir as { follow?: unknown }).follow;
    expect(() => registry.register(sinSeguir)).toThrow(/follow/);

    const sinBorrado = fakeProvider({ source: "reddit" });
    delete (sinBorrado as { deleteOwnPost?: unknown }).deleteOwnPost;
    expect(() => registry.register(sinBorrado)).toThrow(/deleteOwnPost/);

    const coherente = fakeProvider({
      source: "threads",
      capabilities: { ...fullCapabilities(), follow: false },
    });
    expect(() => registry.register(coherente)).not.toThrow();
  });

  it("lo que no está registrado no declara nada", () => {
    const registry = new ProviderRegistry();
    expect(registry.get("x")).toBeNull();
    expect(registry.capabilitiesFor("x").publish).toBe(false);
    expect(registry.implementedOperations("x")).toEqual([]);
    expect(() => registry.require("x")).toThrow(/No hay adaptador/);
  });

  it("las operaciones implementadas son las que existen, no las declaradas", () => {
    const registry = new ProviderRegistry();
    const provider = fakeProvider({
      source: "mastodon",
      label: "Mastodon",
      capabilities: { ...fullCapabilities(), follow: false, deleteOwnPost: false },
    });
    delete (provider as { follow?: unknown }).follow;
    delete (provider as { deleteOwnPost?: unknown }).deleteOwnPost;
    registry.register(provider);

    const ops = registry.implementedOperations("mastodon");
    expect(ops).toContain("publish");
    expect(ops).not.toContain("follow");
    expect(ops).not.toContain("delete_own_post");
  });

  it("las capacidades devueltas son una copia: nadie las toca por accidente", () => {
    const registry = new ProviderRegistry();
    registry.register(fakeProvider());
    const caps = registry.capabilitiesFor("bluesky");
    caps.publish = false;
    expect(registry.capabilitiesFor("bluesky").publish).toBe(true);
  });
});
