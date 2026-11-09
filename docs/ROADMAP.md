# Hoja de ruta

Coherente con lo que hay en el repositorio hoy (**versión 0.3.5**) y con lo que
falta. Sin fechas: lo que marca el orden es que cada fase se pueda usar y
verificar sola.

### Estado real a 0.3.5

Hecho y comprobado: motor (normalización, agrupación, Trend Engine, avisos),
capa social con matriz de capacidades, ventanas de cuenta por red con perfiles
de navegador propios, importación de la sesión del navegador para las fuentes
que la necesitan, temas por sistema, columnas ajustables, interfaz con pruebas
y capturas regenerables, y cliente HTTP propio en el escritorio.

Pendiente de verdad: segundo adaptador social, hilos completos, resumen y
traducción con modelo local, conectores de Lemmy y YouTube, sincronización entre
dispositivos, empaquetado en Flatpak/AUR/Homebrew, actualizaciones firmadas y
firma de código.

## v0.1 — El pulso, en local (hecho)

**Motor** (`@avizor/engine`, TypeScript puro)

- Modelo canónico (`Item`, `Cluster`, `Trend`, `AlertRule`, `Entity`…) con
  superficie pública en `packages/engine/src/index.ts`.
- Normalización: URL canónica, idioma aproximado, entidades por diccionario,
  `simhash` de 64 bits propio, identificador estable `source:externalId`.
- Agrupación incremental con índice invertido doble, umbrales 0,45/0,62 y
  ventana activa de 6 h.
- Trend Engine: ventana de 30 min, cubos de 2 min, línea base de 6 h, score
  ponderado, estados y motivos estructurados.
- Avisos por reglas con enfriamiento por regla y tema.
- Almacén en memoria con instantánea JSON versionada.
- Conectores: Hacker News, Bluesky (búsqueda XRPC y flujo Jetstream),
  Reddit, Mastodon, RSS/Atom y GitHub, más un conector de ejemplo
  determinista.
- HTTP con identificación, reintentos y respeto de `Retry-After`.

**Aplicación** (`@avizor/app`)

- Pantallas: Inicio, Ahora mismo, Radar, Siguiendo, Explorar, Guardados,
  Buscar, Avisos, Listas, Fuentes, Ajustes y detalle de item, con paleta de
  comandos y atajos.
- Sistema de diseño propio (`@avizor/tokens`) con temas oscuro/claro y
  `prefers-reduced-motion`.
- Interfaz bilingüe (español e inglés) con las traducciones completas.
- Puente de plataforma único (`bridge.ts`): IndexedDB en el navegador, servicios
  del sistema en el escritorio.

**Escritorio** (`@avizor/desktop`, Tauri 2)

- Ventana única con instancia única, notificaciones del sistema, apertura de
  enlaces externos, secretos en el llavero y archivo SQLite con búsqueda FTS5
  mantenida por disparadores.

**Proyecto**

- CI (Node 20 y 22), comprobación de determinismo de `tokens/dist`, análisis
  CodeQL semanal, flujo de release por etiqueta con paquetes `.deb`/AppImage,
  instalador NSIS y `.dmg`, plantillas de issue y de PR, Dependabot agrupado.

## v0.2 — Leer conversaciones, no solo titulares (a medias)

- **Extracción de hilos.** "Ver conversación" ya usa `sampleIds` (los 8 items más
  recientes del tema); falta reconstruir la conversación completa: respuestas,
  autores que se repiten y orden temporal, usando los mismos conectores.
- **Resumen con modelo local opcional (Ollama).** Opt-in explícito, desactivado
  por defecto, contra el Ollama del propio equipo (`localhost`): nada de API
  remotas. Se resume un tema, nunca una fuente entera.
- ~~**Traducción.**~~ Hecho en 0.2.0: títulos y cuerpos al idioma que lees, con
  el original siempre a la vista, caché y proveedor a elegir.
- **Conectores propios para Lemmy y YouTube.** Hoy `lemmy` y `youtube` existen
  en el tipo `SourceKind` y apuntan al conector de ejemplo; hay que escribir sus
  conectores (comunidades federadas y RSS/API de canales) con sus límites de
  ritmo.
- ~~**Cobertura de pruebas de la interfaz.**~~ Hecho: actividades y puente social
  tienen pruebas; sigue pendiente cubrir componentes de React.
- ~~**Proxy de red en el escritorio.**~~ Hecho: `tauri-plugin-http` se registra
  en `lib.rs` (antes faltaba y la app caía al `fetch` del WebView, con CORS) y
  lleva `unsafe-headers` para poder mandar la cabecera `Cookie` de la sesión
  importada.

## v0.2.3 — Capa social: cimientos (hecho)

Sin claves API de ningún tipo: la autenticación es siempre la del sitio, en su
propia página, dentro de un perfil de navegador de Avizor.

- Paquete nuevo `@avizor/social`: modelo de cuentas, estados de sesión,
  capacidades efectivas, compositor por red, cola de acciones y contrato del
  puente de navegador. TypeScript puro y 61 pruebas.
- Separación explícita de las dos capas: `Connector` lee, `InteractionProvider`
  participa. El motor no se toca.
- La matriz de capacidades empieza entera en `false`, y una prueba falla el día
  que alguien marque un adaptador sin actualizarla.
- Documentación: [`INTERACTIONS.md`](INTERACTIONS.md),
  [`SOCIAL-ACCOUNTS.md`](SOCIAL-ACCOUNTS.md) y
  [`BROWSER-BRIDGE.md`](BROWSER-BRIDGE.md).

## v0.3 — Cuentas y primer adaptador (hecho)

- **Perfiles de navegador de Avizor.** Un directorio de datos por cuenta
  (`data_directory` de Tauri/wry), ventana visible para iniciar sesión y borrado
  completo con «Olvidar sesión».
- **Pantalla Cuentas.** Conectar, gestionar, comprobar estado, desconectar y
  olvidar; varias cuentas por red.
- **Primer adaptador real (Nivel A) completo**: iniciar sesión, sesión, identidad,
  leer, like, responder, repostar, publicar, salir y recuperarse, con selectores
  centralizados, prueba de salud y *fixtures* de DOM saneados.
- **Compositor** con el veredicto por cuenta ya implementado en `@avizor/social`.

## v0.3.1 — Segunda y tercera red

- Los siguientes adaptadores del Nivel A, reutilizando el mismo contrato: si el
  segundo adaptador necesita cambiar el núcleo, el primero está mal hecho.

## v0.3.2 — Oportunidades

- Bandeja que cruza el Trend Engine con las cuentas conectadas para proponer
  dónde merece la pena participar. Relevancia derivada de señales documentadas,
  nunca de un porcentaje inventado.

## v0.3.3 — Asistente local opcional

- `AssistantProvider` con modelos locales del equipo (por ejemplo Ollama en
  `localhost`): resumir, traducir, sugerir respuestas. Opcional y desactivable;
  el núcleo funciona sin él.

## v0.4 — Varios dispositivos, sin servidor

- **Sincronización opcional y cifrada.** Entre tus dispositivos y sin servidor
  del proyecto: exportar/importar un archivo cifrado, o apuntar a una carpeta
  que ya sincronizas (Syncthing, WebDAV). Cifrado en el cliente con una clave
  que no sale del dispositivo; desactivado por defecto.
- **Reglas de aviso más expresivas.** Combinar varias condiciones (crecimiento
  *y* cobertura *y* entidad) y agrupar reglas por lista.
- **Exportar e importar feeds (OPML)** para llevarse la lista de RSS de un lector
  a otro.
- **Ajuste fino de umbrales por el usuario.** Los números del agrupador y del
  Trend Engine están en constantes documentadas: exponerlos en Ajustes, con los
  valores por defecto a la vista.

## v0.5 — Distribución

- **Empaquetado en Flatpak, AUR y Homebrew**: además de `.deb`, AppImage, NSIS y
  `.dmg`, para que instalar en Linux sea un comando y no una descarga.
- **Actualizaciones firmadas** con el updater de Tauri y claves propias, con
  comprobación de firma en el arranque.
- **Firma de código en Windows y notarización en macOS**, si el coste se
  justifica.
- **Iconos y capturas definitivos** en el repositorio, generados desde el
  propio sistema de diseño (`scripts/make-icons.mjs` ya es la semilla).

## v1.0 — Estable

- **Esquema y migraciones congelados:** `SCHEMA_VERSION` con migraciones
  incrementales probadas (ida y vuelta), y compatibilidad de instantáneas
  garantizada entre versiones menores.
- **Sin cambios incompatibles** en el modelo de datos ni en el formato de las
  instantáneas dentro de la serie 1.x.
- **Accesibilidad auditada:** navegación completa con teclado, foco visible,
  contraste y lectores de pantalla, revisado con el sistema de diseño delante.
- **Rendimiento con archivo grande:** medido y documentado (cientos de miles de
  publicaciones, agrupación y radar en el ciclo).
- **Documentación cerrada:** `docs/` al día, incluido lo que este documento
  promete y no se haya hecho.
- **Un ciclo de release predecible:** etiqueta, CI en verde, paquetes firmados,
  notas de versión escritas por personas.

## Lo que no está en la hoja de ruta

- Servidor propio, cuentas del proyecto, perfiles públicos o cualquier forma de
  red social propia.
- Telemetría, analíticas de uso o informes de error automáticos.
- Claves API pedidas al usuario: ni `client_id`, ni `client_secret`, ni tokens,
  ni portales de desarrolladores.
- Automatización masiva: auto-seguir, auto-dar «me gusta», comentarios
  indiscriminados, mensajes masivos o publicación autónoma ilimitada. La
  interacción es manual o asistida, y **siempre la confirma el usuario**.
- CAPTCHA, 2FA, *fingerprint spoofing*, anti-CAPTCHA, evasión de anti-bot y
  cualquier forma de fingir ser un cliente oficial.
- Recomendaciones por caja negra: si Avizor ordena algo, se puede explicar con
  sus números (`docs/TREND-ENGINE.md`).

## Hecho en 0.1.x (ampliación)

- [x] **Tiempo real**: flujo Jetstream de Bluesky con reconexión exponencial,
      ingesta por tandas y recálculo espaciado.
- [x] **Sin contenido inventado**: la aplicación arranca pidiendo datos reales a
      las fuentes; el generador de ejemplos queda para tests y desarrollo.
- [x] **Rendimiento**: tarjetas memorizadas, lista por páginas de 60 y
      `content-visibility` en las filas largas.
- [x] **Instalación**: `scripts/install-desktop.sh` (binario, iconos, lanzador en
      el menú y acceso directo en el escritorio) e instaladores por release en CI.
- [x] **Capturas reales** en `docs/screenshots/`, tomadas de la app en marcha.
