# Puente de navegador

Cómo Latido usa la web real de cada servicio sin claves API y sin esconder nada.

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
Latido UI
    ↓
Social Action            (cola de acciones, con confirmación del usuario)
    ↓
InteractionProvider      (adaptador de la red)
    ↓
BrowserBridge            (este contrato)
    ↓
perfil de navegador propio de Latido
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

## Qué falta por implementar

Este contrato está declarado y probado en su parte pura (hosts, URLs seguras,
perfiles, estados de sesión), pero **todavía no hay implementación en el
escritorio**. Lo que falta, en orden:

1. Comandos en el shell Tauri: abrir la ventana de una cuenta con su
   `data_directory`, comprobar sesión, leer identidad pública, olvidar perfil.
2. Adaptador real para una red (Nivel A) con sus selectores centralizados,
   prueba de salud y *fixtures* de DOM saneados.
3. Pantallas de cuentas y compositor en la interfaz.

Hasta que eso exista, la matriz de capacidades dice la verdad: no hay ninguna red
con interacción disponible y la interfaz ofrece abrir la publicación en su web.
