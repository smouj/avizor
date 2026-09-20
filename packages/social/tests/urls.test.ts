/**
 * URLs y aislamiento: la sesión de una red no puede acabar en otra.
 *
 * Es la parte con consecuencias reales si está mal, así que se prueban los
 * bordes: subdominios legítimos, dominios parecidos que no lo son, esquemas
 * prohibidos y listas blancas vacías.
 */
import { describe, expect, it } from "vitest";

import {
  allowedHostsFor,
  checkHostAllowed,
  hostAllowed,
  hostMatchesDomain,
  isSafeExternalUrl,
  parseSafeUrl,
} from "../src/urls";

describe("URLs navegables", () => {
  it("acepta http y https", () => {
    expect(parseSafeUrl("https://bsky.app/profile/smouj.bsky.social")?.hostname).toBe("bsky.app");
    expect(parseSafeUrl("http://127.0.0.1:5173/")?.protocol).toBe("http:");
    expect(isSafeExternalUrl("https://www.reddit.com/r/programming")).toBe(true);
  });

  it("rechaza lo que no debe poder abrirse nunca desde una acción", () => {
    expect(parseSafeUrl("javascript:alert(1)")).toBeNull();
    expect(parseSafeUrl("file:///etc/passwd")).toBeNull();
    expect(parseSafeUrl("data:text/html,<h1>hola</h1>")).toBeNull();
    expect(parseSafeUrl("blob:https://x.com/1234")).toBeNull();
  });

  it("no lanza con basura: devuelve null", () => {
    expect(parseSafeUrl("")).toBeNull();
    expect(parseSafeUrl("   ")).toBeNull();
    expect(parseSafeUrl("no es una url")).toBeNull();
    expect(parseSafeUrl("https://")).toBeNull();
  });
});

describe("coincidencia de dominios", () => {
  it("el mismo host y sus subdominios coinciden", () => {
    expect(hostMatchesDomain("reddit.com", "reddit.com")).toBe(true);
    expect(hostMatchesDomain("www.reddit.com", "reddit.com")).toBe(true);
    expect(hostMatchesDomain("old.reddit.com", "reddit.com")).toBe(true);
  });

  it("un dominio parecido no coincide", () => {
    expect(hostMatchesDomain("evilreddit.com", "reddit.com")).toBe(false);
    expect(hostMatchesDomain("reddit.com.evil.example", "reddit.com")).toBe(false);
    expect(hostMatchesDomain("notreddit.com", "reddit.com")).toBe(false);
  });

  it("un dominio vacío no coincide con nada", () => {
    expect(hostMatchesDomain("reddit.com", "")).toBe(false);
  });
});

describe("listas blancas por cuenta", () => {
  it("una red trae sus dominios y una federada los recibe de la cuenta", () => {
    expect(allowedHostsFor("reddit")).toContain("www.reddit.com");
    expect(allowedHostsFor("mastodon")).toEqual([]);
    expect(allowedHostsFor("mastodon", ["mastodon.social"])).toEqual(["mastodon.social"]);
  });

  it("se aceptan instancias con URL completa y se descarta lo que no es un host", () => {
    expect(allowedHostsFor("mastodon", ["https://mastodon.social/@smouj"])).toEqual([
      "mastodon.social",
    ]);
    expect(allowedHostsFor("lemmy", ["localhost"])).toEqual([]);
    expect(allowedHostsFor("lemmy", ["  "])).toEqual([]);
    expect(allowedHostsFor("lemmy", ["dos palabras.com"])).toEqual([]);
  });

  it("la sesión de una red no vale para otra", () => {
    const threadsHosts = allowedHostsFor("threads");
    expect(hostAllowed("https://www.threads.net/@alguien", threadsHosts)).toBe(true);
    expect(hostAllowed("https://www.reddit.com/r/programming", threadsHosts)).toBe(false);
    expect(checkHostAllowed("https://www.reddit.com/r/programming", threadsHosts)?.code).toBe(
      "REJECTED",
    );
  });

  it("un enlace roto se explica, no se lanza", () => {
    expect(checkHostAllowed("javascript:alert(1)", allowedHostsFor("x"))?.message).toContain(
      "solo http y https",
    );
  });
});
