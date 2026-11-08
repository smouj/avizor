# Puente de navegador

Cómo Avizor usa la web real de cada servicio sin claves API y sin esconder nada.

## El contrato

`packages/social/src/bridge.ts` declara qué se le puede pedir al navegador:

```ts
interface BrowserBridge {
  openSession(request: OpenSessionRequest): Promise<void>
  checkSession(request: SessionCheckRequest): Promise<SessionState>
  readIdentity(profile: BrowserProfileRef): Promise<PublicIdentity | null>
  perform(request: TypedActionRequest): Promise<ActionResult>
  forgetSession(profile: BrowserProfileRef): Promise<void>
  openUrl(url: string): Promise<void>
}
```

El flujo completo:

```text
Avizor UI
    ↓
Social Action            (cola de acciones, con confirmación del usuario)
    ↓
InteractionProvider      (adaptador de la red)
    ↓
BrowserBridge            (este contrato)
    ↓
perfil de navegador propio de Avizor
    ↓
sitio oficial
```

Lo que el contrato prohíbe por diseño: pedir credenciales (no hay campo),
ejecutar JavaScript arbitrario (solo `TypedActionRequest`) y usar el perfil de
una red para hablar con otra (cada operación lleva sus hosts).

## Ventana visible, siempre

La interacción ocurre en una ventana visible, con el perfil de esa cuenta. No hay
interacción escondida en segundo plano para simular actividad humana, ni
peticiones fabricadas para parecer un cliente oficial.

## Base técnica (comprobada en las dependencias del proyecto)

El escritorio es Tauri 2.11.5. Lo que se puede usar para los perfiles, verificado
en las fuentes de las dependencias que ya están instaladas:

- `WebviewBuilder::data_directory(path)` existe (`tauri-2.11.5/src/webview/mod.rs`):
  un directorio de datos por webview, que es exactamente «un perfil por cuenta».
- En Linux, wry lo lleva al `base_data_directory` de WebKitGTK
  (`wry-0.55.1/src/webkitgtk/web_context.rs`).
- En macOS, WKWebView no admite `data_directory`; el equivalente es
  `data_store_identifier([u8; 16])` (macOS ≥ 14), que Tauri también expone.
- En Windows, WebView2 exige que dos webviews con opciones distintas usen
  directorios distintos: encaja con «un perfil por cuenta» y no con compartir uno.

Consecuencia de diseño: **un perfil por cuenta**, no un perfil compartido por
red ni, mucho menos, el perfil del navegador del usuario.

## Qué está implementado

**En el shell de escritorio** (`apps/desktop/src-tauri/src/browser.rs`):

| Comando | Qué hace |
| --- | --- |
| `social_open_session` | Abre la web oficial en una ventana visible con el perfil de esa cuenta (o enfoca la que ya está abierta). Comprueba que la dirección sea `http(s)` y que pertenezca a los dominios de la cuenta. |
| `social_check_session` | Recuento de cookies por dominio declarado. **Nunca devuelve valores.** |
| `social_read_identity` | Identidad pública desde los metadatos OpenGraph de la propia página. Es el **único** script que se evalúa. |
| `social_forget_session` | Cierra la ventana y borra el perfil entero de esa cuenta. |
| `social_open_profiles` / `social_is_open` | Qué cuentas tienen ventana abierta. |

**En la interfaz** (`apps/app/src/platform/social.ts`): la única frontera con el
escritorio para las cuentas. En el navegador devuelve `null` en vez de fingir
soporte.

**En la capa social** (`@avizor/social`): `sessionFromProbe()` traduce lo que vio
el escritorio a estado de sesión, con sus pruebas. Es deliberado que el shell
devuelva hechos (ventana abierta, recuentos, fecha) y que la política viva aquí.

## Qué falta

1. **Ningún adaptador de interacción.** El contrato existe y `perform()` responde
   «sin soporte»: no se publica, no se da «me gusta» y no se responde todavía.
2. **Pantalla de Cuentas** para conectar, ver el estado y olvidar sesiones.
3. **Prueba de extremo a extremo en un escritorio real.** Aquí se ha comprobado
   que compila y que sus partes puras pasan 19 pruebas; el comportamiento de la
   ventana (inicio de sesión, cookies del perfil, identidad leída) necesita un
   escritorio con WebView y una cuenta de verdad.

## Detalles que no se cambian sin pensar

- **Un perfil por cuenta**, no uno por red ni mucho menos el perfil del navegador
  del usuario. El aislamiento es la razón de que existan las ventanas propias.
- **Solo se navega a `http(s)`**: `file:`, `javascript:`, `data:` y los esquemas
  que lanzan aplicaciones ajenas se rechazan en la propia ventana.
- **Las cookies no salen del shell**: a la interfaz solo llega cuántas hay.
- **El script de identidad es una constante**: no se acepta JavaScript que venga
  de la interfaz ni, por supuesto, de un modelo.
- **Las ventanas de cuenta no tienen permisos de Tauri**: la capacidad `default`
  solo se aplica a la ventana `main`, así que el contenido remoto no puede llamar
  a los comandos de la aplicación.
