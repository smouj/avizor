# Interacciones

Avizor tiene dos capas separadas a propósito:

```text
Connector            → LEER        (packages/engine)
InteractionProvider  → PARTICIPAR  (packages/social)
```

Leer y participar son problemas distintos: lo primero se hace con interfaces
públicas y se puede probar sin sesión; lo segundo depende de la sesión del
usuario y de la interfaz de cada web, que cambia. Mezclarlos habría convertido
`Connector` en una interfaz monstruosa y habría contagiado el motor con
conocimiento de cada sitio.

## Cero claves API

Avizor no pide, no guarda y no usa claves de usuario:

- ni `client_id` / `client_secret`,
- ni tokens de desarrollador,
- ni `.env` con credenciales para que las redes funcionen,
- ni pasos del tipo «crea una aplicación en el portal de desarrolladores».

Cuando una red necesite autenticación, se abre **su** página de inicio de sesión
en una superficie visible con el perfil de Avizor de esa cuenta. La contraseña,
el 2FA y el CAPTCHA los resuelve el usuario en el sitio, nunca en un formulario
de Avizor. Aquí no hay ningún campo donde quepa una contraseña: el modelo de
datos no los tiene.

Lo que **no** se hace, ni se va a hacer: interceptar contraseñas, leer gestores
de contraseñas, copiar bases de datos de credenciales, resolver CAPTCHA, saltar
2FA, falsear huellas de dispositivo, usar servicios anti-CAPTCHA, evadir
mecanismos anti-bot o fingir ser un cliente oficial.

## Capacidades: la matriz no se inventa

`InteractionCapabilities` empieza entero en `false` y cada adaptador declara **lo
que tiene probado**:

```ts
{ read, like, reply, repost, publish, follow, media, quote, deleteOwnPost }
```

Dos recortes adicionales, en `packages/social/src/capabilities.ts`:

- **La sesión viva no basta.** Para escribir hace falta que la prueba de salud
  haya confirmado `INTERACTION_AVAILABLE`. Si solo está `CONNECTED`, la cuenta se
  queda en lectura y la interfaz ofrece «abrir en la red».
- **Lo declarado se recorta, no se amplía.** `effectiveCapabilities()` nunca
  enciende nada que el adaptador no haya declarado.

Estado real hoy: **ninguna red tiene adaptador de interacción**. La matriz del
catálogo (`packages/social/src/networks.ts`) lo dice con
`interactionAdapter: false` en todas, y hay una prueba
(`tests/capabilities.test.ts`) que falla el día que alguien marque un adaptador
sin actualizar la documentación. Es a propósito: obliga a tocar la matriz antes
de prometer soporte.

## Operaciones tipeadas

Una acción social es una de estas ocho, y solo una de estas ocho:

```text
LIKE  UNLIKE  REPLY  REPOST  PUBLISH  FOLLOW  UNFOLLOW  DELETE_OWN_POST
```

La IA (cuando exista, y será opcional) puede sugerir texto o elegir entre
operaciones permitidas; nunca recibe un `executeJavascript("...")`. El contrato
del navegador (`BrowserBridge`) acepta `TypedActionRequest`, no código.

## Cola de acciones

`ActionQueue` (`packages/social/src/actions.ts`) guarda qué se pidió y qué
contestó cada red:

```text
DRAFT → AWAITING_CONFIRMATION → RUNNING → SUCCESS | FAILED
                                      ↘ CANCELLED
```

Reglas que están en las pruebas:

- Nada sale a la red sin confirmación explícita del usuario
  (`DRAFT → AWAITING_CONFIRMATION` es el único camino).
- Una acción multirred **no es todo o nada**: cada destino tiene su resultado
  (`PENDING`/`RUNNING`/`SUCCESS`/`FAILED`/`SKIPPED`) y el resumen dice éxito
  parcial cuando unos salieron y otros no.
- Un `success` **sin verificar** se registra como `FAILED`: Avizor no puede
  afirmar que algo se publicó si no lo ha comprobado en la red.
- La cola no guarda contraseñas ni campos sensibles, porque el modelo no los
  tiene. Hay una prueba que serializa el historial y comprueba que no aparece
  nada parecido a `password`, `token` o `cookie`.

## Compositor

El mismo texto no se publica igual en todas partes. `validateCompose()`
(`packages/social/src/composer.ts`) da un veredicto por cuenta antes de publicar:

- `ready` — cabe, con los límites **documentados** de la red.
- `blocked` — no cabe, con el motivo y los números («512 de 500 caracteres»).
- `unknown` — no hay problema conocido, pero los límites de esa red no están
  confirmados (Mastodon, cuya longitud fija cada instancia; Reddit; Lemmy). No se
  da por bueno por accidente.

Después, cada destino se publica por separado y se registra por separado.

## Fallback honesto

Cuando el adaptador de una red deja de funcionar (cambio de interfaz, sesión
caducada, función retirada) no se hacen arreglos silenciosos:

```text
Threads ha cambiado su interfaz.

Avizor puede abrir esta publicación en Threads para que la completes allí.

[Abrir Threads]
```

La fiabilidad importa más que fingir soporte.

## Qué está implementado

| Pieza | Estado |
| --- | --- |
| Modelo de cuentas, sesiones y acciones (`@avizor/social`) | hecho, 70 pruebas |
| Capacidades efectivas y matriz por red | hecho |
| Cola de acciones con verificación obligatoria | hecho |
| Validación del compositor por cuenta | hecho |
| Aislamiento de dominios y URLs seguras | hecho |
| Contrato `BrowserBridge` | declarado y usado por el shell |
| Ventanas y perfiles por cuenta (escritorio, Rust) | hecho, 19 pruebas de la parte pura |
| Puente de la interfaz con el escritorio | hecho, 8 pruebas |
| Traducción de lo que ve el escritorio a estado de sesión | hecho, con pruebas |
| Prueba de extremo a extremo en un escritorio real | **pendiente** (hace falta WebView y una cuenta) |
| Primer adaptador real | **pendiente** |
| Pantallas de cuentas, compositor y oportunidades | **pendiente** |
