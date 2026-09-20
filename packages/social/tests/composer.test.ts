/**
 * Compositor: el mismo texto no vale igual en todas partes.
 *
 * Se comprueba que las cuentas bloqueadas dicen **por qué**, que las redes sin
 * límites confirmados no se dan por buenas por accidente, y que contar
 * caracteres cuenta lo que la red cuenta (grafemas, no unidades UTF-16).
 */
import { describe, expect, it } from "vitest";

import { fullCapabilities, readOnlyCapabilities } from "../src/capabilities";
import {
  countCharacters,
  publishableAccounts,
  summarizeCompose,
  validateCompose,
  validateForAccount,
} from "../src/composer";
import { connectedSession, interactiveSession } from "../src/session";
import type { InteractionCapabilities, SocialAccount, SocialSource } from "../src/types";

const NOW = 1_760_000_000_000;

function account(source: SocialSource, handle = "smouj"): SocialAccount {
  return {
    id: `${source}:${handle}`,
    source,
    handle,
    browserProfileId: `${source}/${handle}`,
    sessionState: interactiveSession(connectedSession(NOW), NOW),
    addedAt: NOW,
  };
}

const WITH_SESSION: InteractionCapabilities = fullCapabilities();

describe("contar caracteres", () => {
  it("cuenta grafemas, no unidades UTF-16", () => {
    expect(countCharacters("hola")).toBe(4);
    expect(countCharacters("👩‍💻")).toBe(1);
    expect(countCharacters("café ☕️")).toBe(6);
  });
});

describe("validar una publicación por cuenta", () => {
  it("un texto corto cabe en Bluesky", () => {
    const readiness = validateForAccount(
      { text: "Hola desde Latido" },
      {
        account: account("bluesky"),
        capabilities: WITH_SESSION,
      },
    );
    expect(readiness.status).toBe("ready");
    expect(readiness.problems).toEqual([]);
    expect(readiness.length).toBe(17);
  });

  it("pasarse de largo se dice con números", () => {
    const readiness = validateForAccount(
      { text: "x".repeat(301) },
      {
        account: account("bluesky"),
        capabilities: WITH_SESSION,
      },
    );
    const problem = readiness.problems.find((item) => item.code === "TOO_LONG");
    expect(readiness.status).toBe("blocked");
    expect(problem?.params).toEqual({ length: 301, maxLength: 300 });
  });

  it("una cuenta que no puede publicar se bloquea antes de mirar el texto", () => {
    const readiness = validateForAccount(
      { text: "Hola" },
      {
        account: account("threads"),
        capabilities: readOnlyCapabilities(),
      },
    );
    expect(readiness.status).toBe("blocked");
    expect(readiness.problems.map((item) => item.code)).toContain("NO_CAPABILITY");
  });

  it("sin texto ni imágenes no hay nada que publicar", () => {
    const readiness = validateForAccount(
      { text: "   " },
      {
        account: account("bluesky"),
        capabilities: WITH_SESSION,
      },
    );
    expect(readiness.problems.map((item) => item.code)).toContain("EMPTY");
  });

  it("las imágenes necesitan capacidad y hueco", () => {
    const sinMedios: InteractionCapabilities = { ...fullCapabilities(), media: false };
    const conMedio = validateForAccount(
      { text: "Con foto", media: [{ path: "/tmp/foto.png" }] },
      { account: account("bluesky"), capabilities: sinMedios },
    );
    expect(conMedio.problems.map((item) => item.code)).toContain("MEDIA_UNSUPPORTED");

    const demasiadas = validateForAccount(
      {
        text: "Con fotos",
        media: [{ path: "1" }, { path: "2" }, { path: "3" }, { path: "4" }, { path: "5" }],
      },
      { account: account("bluesky"), capabilities: WITH_SESSION },
    );
    expect(demasiadas.problems.map((item) => item.code)).toContain("TOO_MANY_MEDIA");
  });

  it("Reddit exige comunidad y título, y lo dice a la vez", () => {
    const readiness = validateForAccount(
      { text: "Un texto" },
      {
        account: account("reddit"),
        capabilities: WITH_SESSION,
      },
    );
    expect(readiness.status).toBe("blocked");
    expect(readiness.problems.map((item) => item.code)).toEqual(
      expect.arrayContaining(["COMMUNITY_REQUIRED", "TITLE_REQUIRED"]),
    );

    const completa = validateForAccount(
      { text: "Un texto", title: "Un título", community: "programming" },
      { account: account("reddit"), capabilities: WITH_SESSION },
    );
    expect(completa.status).toBe("unknown");
    expect(completa.problems.map((item) => item.code)).toEqual(["LIMIT_UNKNOWN"]);
  });

  it("una red sin límites confirmados no se da por lista: se marca como desconocida", () => {
    const readiness = validateForAccount(
      { text: "Hola" },
      {
        account: account("mastodon"),
        capabilities: WITH_SESSION,
      },
    );
    expect(readiness.status).toBe("unknown");
    expect(readiness.constraints.documented).toBe(false);
  });

  it("una red que no ha declarado nada tampoco se inventa límites", () => {
    const readiness = validateForAccount(
      { text: "Hola" },
      {
        account: account("tumblr"),
        capabilities: WITH_SESSION,
      },
    );
    expect(readiness.constraints.maxLength).toBeNull();
    expect(readiness.status).toBe("unknown");
  });

  it("citar depende de la capacidad y de la red", () => {
    const readiness = validateForAccount(
      {
        text: "Mira esto",
        quote: { source: "bluesky", externalId: "1", url: "https://bsky.app/p/1" },
      },
      { account: account("mastodon"), capabilities: WITH_SESSION },
    );
    expect(readiness.problems.map((item) => item.code)).toContain("QUOTE_UNSUPPORTED");
  });
});

describe("resumen del compositor", () => {
  it("cuenta listas, bloqueadas y desconocidas, y deja fuera a las bloqueadas", () => {
    const readiness = validateCompose({ text: "Hola desde Latido" }, [
      { account: account("bluesky"), capabilities: WITH_SESSION },
      { account: account("reddit"), capabilities: WITH_SESSION },
      { account: account("mastodon"), capabilities: WITH_SESSION },
    ]);
    expect(summarizeCompose(readiness)).toEqual({ ready: 1, blocked: 1, unknown: 1 });
    expect(publishableAccounts(readiness)).toEqual(["bluesky:smouj", "mastodon:smouj"]);
  });

  it("el resumen vacío no miente", () => {
    expect(summarizeCompose([])).toEqual({ ready: 0, blocked: 0, unknown: 0 });
  });
});
