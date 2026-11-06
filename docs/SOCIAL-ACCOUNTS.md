# Cuentas sociales

De dónde salen las cuentas, dónde vive su sesión y qué se guarda de cada una.

## El modelo

```ts
interface SocialAccount {
  id: string
  source: SocialSource
  handle: string
  displayName?: string
  avatarUrl?: string
  profileUrl?: string
  browserProfileId: string
  sessionState: SessionState
  addedAt: number
  lastCheckedAt?: number
}
```

Se pueden tener varias cuentas de la misma red (dos de Threads, dos de Bluesky).
Cada acción dice **desde qué cuenta** se hace: nunca se publica desde otra por
descuido.

## Flujo para conectar una cuenta

```text
Conectar
   ↓
se abre la página oficial de inicio de sesión, con el perfil de Latido de esa cuenta
   ↓
el usuario entra como entra siempre (contraseña y 2FA allí, en el sitio)
   ↓
Latido comprueba que hay sesión válida
   ↓
cierra u oculta la ventana de autenticación
   ↓
lee solo la identidad pública: avatar, nombre, handle, URL
   ↓
cuenta conectada
```

Latido nunca pide usuario y contraseña en un formulario propio. Las páginas de
inicio de sesión están en `packages/social/src/bridge.ts` (`loginUrlFor`), y en
las redes federadas (Mastodon, Lemmy) el host lo aporta la cuenta.

## Estados de sesión

Una sesión no es un booleano. `SessionState` tiene dos campos:

- `connection`: `CONNECTED` | `DISCONNECTED`
- `health`: `CONNECTED` | `INTERACTION_AVAILABLE` | `READ_ONLY` | `SESSION_EXPIRED` |
  `SELECTORS_OUTDATED` | `LOGIN_REQUIRED` | `UNAVAILABLE`

Lo que habilita cada uno:

| Estado | Leer | Escribir | Qué se enseña |
| --- | --- | --- | --- |
| `INTERACTION_AVAILABLE` | sí | sí | sesión conectada, todo disponible |
| `CONNECTED` | sí | no | conectada, interacción sin confirmar |
| `READ_ONLY` | sí | no | «solo lectura ahora mismo» + motivo |
| `SELECTORS_OUTDATED` | sí | no | la red cambió su interfaz + abrir en la red |
| `SESSION_EXPIRED` | no | no | hay que volver a iniciar sesión |
| `LOGIN_REQUIRED` | no | no | sin conectar / hay que entrar |
| `UNAVAILABLE` | no | no | la red no responde |

Ningún estado distinto de `INTERACTION_AVAILABLE` permite escribir, y todos los
que bloquean llevan su motivo (`detail`) para que la interfaz lo diga. No hay
fallos silenciosos.

## Perfiles de navegador

Un perfil de Latido por cuenta (`browserProfileIdFor()`: `threads/smouj`,
`bluesky/smouj.bsky.social`). Son perfiles **propios de Latido**: no se usa el
perfil principal del navegador del usuario mientras este lo tiene abierto.

De cada perfil se conserva lo necesario para que la sesión siga viva (cookies y
el almacenamiento que el propio sitio necesita) y nada más:

- no se copian contraseñas,
- no se lee el gestor de contraseñas,
- no se toca el historial general, los marcadores ni datos de otras webs,
- «Olvidar sesión» borra el perfil entero.

## Aislamiento entre redes

La sesión de una red no puede viajar a otra. `allowedHostsFor()` da la lista
blanca de una cuenta (los dominios de su red, más la instancia si es federada) y
`checkHostAllowed()` la comprueba antes de cada operación. Las cookies de
`threads.net` no salen hacia `reddit.com`: no es una recomendación, es una
comprobación con pruebas en `packages/social/tests/urls.test.ts`.

## Sesión del navegador del sistema (lo que ya existía)

Aparte de los perfiles propios, Latido ya sabía reutilizar la sesión de Chromium
en Windows para leer fuentes que responden 403 (Reddit). Eso sigue igual y está
documentado en [`SESSION.md`](SESSION.md): es una lectura de cookies, solo
lectura, cifrada con DPAPI del usuario y guardada en el llavero del sistema.

Las dos cosas son distintas y conviene no confundirlas:

| | Sesión del sistema (`SESSION.md`) | Perfiles de Latido (`SOCIAL-ACCOUNTS.md`) |
| --- | --- | --- |
| Para qué | que las fuentes de lectura respondan | iniciar sesión y publicar |
| Dónde vive | llavero del sistema, una cabecera | perfil de navegador propio de Latido |
| Quién la usa | conectores del motor | adaptadores de interacción |
