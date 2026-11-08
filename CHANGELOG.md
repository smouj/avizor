# Historial de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Versionado [semántico](https://semver.org/lang/es/).

## [0.3.4] - 2026-11-08

### Corregido

- La bienvenida y el favicon seguian mostrando el pulso antiguo: el componente BrandMark y apps/app/public/icon.svg eran dibujos aparte. Ahora el favicon lo genera make-icons.mjs y BrandMark dibuja el mismo ojo.

## [0.3.3] - 2026-11-08

### Cambiado

- Marca nueva: ojo abierto en ascua sobre losa de grafito, en lugar del pulso anterior.
- Iconos de escritorio, vector, PNG y logo de la interfaz regenerados desde scripts/make-icons.mjs.

## [0.3.2] - 2026-11-08

### Cambiado

- **El proyecto pasa a llamarse Avizor.** El nombre anterior estaba en uso. Cambian el nombre del producto, los seis paquetes (@avizor/*), el identificador del escritorio (app.avizor.desktop), el crate de Rust (avizor, avizor_lib) y el repositorio.
- Sin cambios de comportamiento: misma funcionalidad, mismos tests.

## [0.3.1] - 2026-11-08

### Corregido

- El escritorio declaraba la version en `tauri.conf.json` y `Cargo.toml`: los artefactos de la 0.3.0 salieron etiquetados como 0.2.2. Ahora las tres versiones suben juntas.

### Añadido

- Pase visual y modelo de scroll por panel (venian de la rama local), conservando los tiradores de columna y la pantalla de cuentas del hub social.

## [0.3.0] - 2026-11-08

### Añadido
- **Capa social: cimientos.** Paquete nuevo `@avizor/social` (TypeScript puro, 69
  pruebas) que separa *leer* de *participar*: el motor sigue siendo el lector y
  esta capa se encarga de cuentas, sesiones web, capacidades, compositor y
  acciones.
  - Matriz de capacidades por red que **empieza entera en `false`**; escribir
    exige que la prueba de salud confirme `INTERACTION_AVAILABLE`, no basta con
    tener sesión. Una prueba falla el día que alguien marque un adaptador sin
    actualizarla.
  - `ActionQueue` con confirmación obligatoria del usuario y verificación
    obligatoria del resultado: un `success` sin verificar se registra como
    `FAILED`. Multirred con resultado por destino, nunca «todo o nada».
  - Composición por cuenta (`ready` / `blocked` / `unknown`): los límites no
    documentados de una red se marcan como desconocidos en vez de inventarlos.
  - Aislamiento entre redes: lista blanca de dominios por cuenta y URLs solo
    `http`/`https`.
- **Ventanas de cuenta en el escritorio** (`browser.rs`): un perfil de navegador
  propio por cuenta (`data_directory` de Tauri; `data_store_identifier` en
  macOS), ventana visible para iniciar sesión en la web oficial, comprobación de
  sesión por recuento de cookies **sin devolver ningún valor**, lectura de la
  identidad pública desde los metadatos OpenGraph de la página y borrado
  completo del perfil con «olvidar sesión». 18 pruebas de Rust cubren las partes
  puras: validación del perfil, recorrido de rutas, etiquetas de ventana sin
  colisiones, navegación solo `http(s)`, aislamiento de dominios y lectura de
  identidad.
- **Puente en la interfaz** (`apps/app/src/platform/social.ts`): única frontera
  con el escritorio para las cuentas. En el navegador devuelve `null` en vez de
  fingir soporte, y `perform()` responde «sin soporte» mientras no exista ningún
  adaptador de interacción.
- **El pulso, siempre a la vista.** `buildActivity()` en el motor y
  `ActivityStrip` en la cabecera: ritmo real de entrada (último minuto, cinco
  minutos y hora), fuentes que responden ahora mismo, palabras que más se repiten
  con su recuento y temas destacados. Todo se **cuenta** sobre los items del
  almacén y se puede reproducir a mano; si no hay datos, el pulso lo dice en vez
  de latir de mentira. El motor devuelve códigos (no frases) y la interfaz los
  traduce en español y en inglés. 19 pruebas nuevas en el motor y 8 en la
  interfaz.
- Documentación: `docs/INTERACTIONS.md`, `docs/SOCIAL-ACCOUNTS.md` y
  `docs/BROWSER-BRIDGE.md`.
- `.prettierrc.json`: el estilo que el repositorio ya usaba (comillas simples,
  sin punto y coma, 100 columnas) queda declarado. Los ficheros nuevos lo
  cumplen; el resto del árbol converge cuando se toca.

### Notas
- **Ninguna red tiene todavía adaptador de interacción.** No se publica, no se
  da «me gusta» y no se responde desde Avizor: la interfaz sigue comportándose
  como un lector y la matriz de capacidades lo dice. Lo que hay probado es el
  contrato, la cola, la composición, el aislamiento y las ventanas de cuenta.
- **Cero claves API.** La autenticación es la del sitio, en su propia página,
  dentro de un perfil de Avizor. No hay ningún campo para contraseñas en el
  modelo de datos y los valores de cookies no salen del shell.
- Lo que se puede verificar en esta máquina es que **compila y pasa las
  pruebas**; el comportamiento real de la ventana de una cuenta (inicio de
  sesión, cookies del perfil, identidad leída) solo se puede comprobar en un
  escritorio con WebView, y queda pendiente de esa prueba.

## [0.2.2] — 2026-09-17

### Añadido
- **Sesión del navegador**: las fuentes que hoy responden 403 sin sesión pueden
  reutilizar la que ya tienes abierta en el navegador. En Ajustes hay una sección
  por fuente con «Usar mi sesión del navegador», el navegador y el perfil
  elegidos y los dominios afectados a la vista.
  - Crate propio `avizor-chrome-session` (Rust, lógica pura y probada): lee
    `Local State`, descifra la clave con **DPAPI** y los valores con
    **AES-256-GCM** (`v10`), empareja dominios como manda RFC 6265 y monta una
    sola cabecera `Cookie`. El acceso al sistema queda reducido a una llamada.
  - En el llavero del sistema se guarda **solo la cabecera montada**, nunca la
    base de datos de cookies, que se abre en solo lectura.
  - Los errores se cuentan en español y sin inventar datos: clave de otro
    perfil, base de datos bloqueada porque el navegador sigue abierto, esquema
    `v20` (Chrome 127+) que exige la identidad de la aplicación.
  - La cabecera sale **solo** hacia los dominios declarados por la fuente: la
    comprobación se hace en cada petición, no al construir la sesión.
- `docs/SESSION.md`: cómo funciona el descifrado, qué se guarda y qué no.
- 8 pruebas nuevas en el motor (dominios, cabecera ausente, cabecera que no
  viaja a otro dominio) y 16 en el crate de Rust.

### Corregido
- El rail lateral se desplaza en vez de aplastar sus secciones.

### Notas
- **Bluesky no se arregla con cookies**: su AppView (`public.api.bsky.app`)
  responde 403 a la búsqueda anónima y autentica con token `Bearer`, no con
  cookies. Comprobado: `getProfile` responde 200, `getTimeline` responde 401
  (pide token) y la misma búsqueda pasa a 200 desde otra red. La interfaz lo dice
  con todas las letras en lugar de prometer que la sesión lo resuelve.
- Reddit responde **403 sin sesión** (comprobado con `curl` con y sin
  `User-Agent` de navegador); con la sesión importada es la vía que se espera
  arreglada, pero no se ha podido verificar de extremo a extremo en esta máquina
  porque Chrome mantiene su base de cookies bloqueada en exclusiva.

## [0.2.0] — 2026-09-17

### Añadido
- **Tres temas oficiales, uno por sistema** (`windows`, `macos`, `linux`). Cada uno
  cambia lo que debe cambiar —radios, densidad de fila, familia tipográfica,
  elevación y temperatura del neutro— y deja intactas la marca y la escala
  tipográfica. Se eligen en Ajustes, con vista previa, y la app detecta el sistema
  la primera vez. Ver `docs/screenshots/tema-windows.png`, `tema-macos.png`,
  `tema-linux.png`.
- **Traducción automática del contenido al idioma que lees**, con proveedores
  LibreTranslate, DeepL y OpenAI (además de «sin traductor»), detección de idioma
  sin modelos, caché para no pagar dos veces por el mismo texto, cola con
  concurrencia y espaciado, y **botón para ver el original** en cada publicación.
  La clave del proveedor se guarda en el llavero del sistema, nunca en el archivo
  de estado.
- **Marca definitiva**: superelipse de esquina continua y avizor con pico y valle,
  generados por `scripts/make-icons.mjs` junto con el vector y el logo de la
  interfaz (una sola fuente de verdad). Ver `docs/brand/`.
- `scripts/install-desktop.sh`: instala binario, iconos, lanzador y acceso directo
  en Linux sin `root`.
- `scripts/verify.sh`: verificación completa (tipos, tests, compilación,
  determinismo de tokens y `cargo check`).

### Cambiado
- **La aplicación ya no arranca con datos de ejemplo.** Sondea las fuentes reales
  y, si no hay nada, lo dice. El generador de ejemplos queda para los tests.
- **Escalado y adaptación**: columnas fluidas (`clamp`) en vez de anchos fijos, la
  ventana no hace scroll —lo hacen las columnas—, `scrollbar-gutter` para que no
  salte el contenido al aparecer la barra, y el contexto lateral se retira antes
  de apretujar el contenido.
- **Rendimiento**: tarjetas memorizadas, lista por páginas de 60 y
  `content-visibility` en las filas largas.
- La cabecera indica el estado real de la conexión (en directo, sondeo o error)
  en lugar de un testigo decorativo.

### Corregido
- El clusterizador volvía a agrupar publicaciones ya archivadas y creaba temas
  duplicados en cada sondeo (llegó a haber más temas que publicaciones).
- El centroide del tema no se movía nunca (media ponderada sobre el hash previo).
- `bucketize` descartaba el item publicado en el instante actual.
- Los temas gemelos no se fusionaban: la consolidación no se ejecutaba por ciclo.
- La consulta por entidades comparaba el filtro consigo mismo.
- El flujo se quedaba en blanco por un bucle de actualización (selector de Zustand
  devolviendo una referencia nueva en cada render).
- Bluesky marcaba que no necesitaba proxy cuando su API de búsqueda **sí** lo
  necesita: el navegador la bloquea por CORS. El flujo en directo va en ambos.
- El escritorio no compilaba: la API de respaldo de `rusqlite` cambió.

### Notas
- La búsqueda de Bluesky, Reddit, Mastodon y RSS requieren la aplicación de
  escritorio: sus servidores no envían cabeceras CORS. Hacker News y GitHub
  funcionan también en el navegador, y el flujo de Bluesky en ambos.

## [0.1.0] — 2026-09-17

Primera versión con motor, interfaz y escritorio.

### Añadido
- Motor en TypeScript: conectores (Hacker News, Bluesky, GitHub, Reddit,
  Mastodon, RSS/Atom), normalización canónica, agrupación incremental y **Trend
  Engine** con velocidad, cobertura, novedad y motivo explicable.
- Reglas de aviso con enfriamiento persistente y avisos del sistema.
- Interfaz completa: Inicio, Ahora mismo, Radar, Siguiendo, Explorar, Buscar,
  Guardados, Avisos, Listas, Fuentes y Ajustes; tema oscuro y claro; español e
  inglés; paleta de comandos.
- Sistema de diseño tokenizado con generación determinista de CSS y JSON.
- Aplicación de escritorio Tauri 2: ventana, instancia única, avisos, apertura de
  enlaces, llavero del sistema y archivo SQLite con FTS5.
- CI, CodeQL, Dependabot, plantillas de incidencia y de PR, y licencia AGPL-3.0.
