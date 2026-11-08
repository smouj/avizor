//! Puente de navegador: las cuentas sociales, en una ventana propia.
//!
//! Cada cuenta tiene un **perfil de navegador de Latido**: un directorio de datos
//! suyo, separado del navegador del usuario y del de las demás cuentas. Ahí vive
//! la sesión que el usuario abre en la web oficial del servicio, como la abriría
//! en su navegador.
//!
//! Lo que este módulo **no** hace, por diseño:
//!
//! - No pide credenciales: no hay ningún parámetro para usuario ni contraseña. El
//!   inicio de sesión ocurre en la página del propio servicio, en una ventana
//!   visible.
//! - No ejecuta JavaScript que venga de fuera: el único script que se evalúa es
//!   la constante `IDENTITY_SCRIPT`, que lee metadatos públicos (OpenGraph) y
//!   nada más.
//! - No devuelve valores de cookies a la interfaz: solo cuántas hay por dominio.
//!   Con eso se decide si la sesión sigue viva, sin exponer el contenido.
//! - No habla con un dominio que no esté en la lista blanca que le pasa la capa
//!   social (`@latido/social`), que es la misma que usa para sus comprobaciones.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};

/// Cuánto se espera a que la página conteste al leer su propia identidad.
const IDENTITY_TIMEOUT: Duration = Duration::from_secs(8);

/// Directorio, dentro de los datos locales de la aplicación, con los perfiles.
pub const PROFILES_DIR: &str = "profiles";

/// Prefijo de las etiquetas de ventana de una cuenta.
pub const WINDOW_PREFIX: &str = "social-";

/// Máximo de dominios que se comprueban de una vez.
const MAX_HOSTS: usize = 8;

/// Estado compartido: qué cuentas tienen ventana abierta ahora mismo.
#[derive(Default)]
pub struct BrowserProfiles {
    open: Mutex<HashMap<String, String>>,
}

impl BrowserProfiles {
    fn mark_open(&self, profile_id: &str, label: &str) {
        if let Ok(mut open) = self.open.lock() {
            open.insert(profile_id.to_string(), label.to_string());
        }
    }

    fn mark_closed(&self, profile_id: &str) {
        if let Ok(mut open) = self.open.lock() {
            open.remove(profile_id);
        }
    }

    fn is_open(&self, profile_id: &str) -> bool {
        self.open
            .lock()
            .map(|open| open.contains_key(profile_id))
            .unwrap_or(false)
    }

    fn list(&self) -> Vec<String> {
        self.open
            .lock()
            .map(|open| {
                let mut ids: Vec<String> = open.keys().cloned().collect();
                ids.sort();
                ids
            })
            .unwrap_or_default()
    }
}

// ---------------------------------------------------------------------------
// Comprobaciones puras: se prueban sin abrir ninguna ventana
// ---------------------------------------------------------------------------

/// Identificador de perfil: `red/cuenta`, sin barras de más ni comodines.
pub fn validate_profile_id(profile_id: &str) -> Result<(), String> {
    let mut parts = profile_id.split('/');
    let source = parts.next().unwrap_or_default();
    let handle = parts.next().unwrap_or_default();
    if parts.next().is_some() {
        return Err("el perfil debe tener la forma red/cuenta".to_string());
    }
    if !valid_source(source) {
        return Err("la red del perfil no es válida".to_string());
    }
    if !valid_handle(handle) {
        return Err("la cuenta del perfil no es válida".to_string());
    }
    Ok(())
}

fn valid_source(source: &str) -> bool {
    !source.is_empty()
        && source.len() <= 24
        && source.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
}

fn valid_handle(handle: &str) -> bool {
    let length = handle.chars().count();
    if !(1..=64).contains(&length) {
        return false;
    }
    // Un handle no empieza por punto ni por guion, y «.», «..» y «...» no son
    // cuentas: son intentos de salirse de la carpeta del perfil.
    let starts_ok = handle
        .chars()
        .next()
        .is_some_and(|c| c.is_ascii_alphanumeric() || c == '@');
    starts_ok
        && handle
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '@'))
}

/// Directorio del perfil, siempre dentro de la raíz que se le da.
pub fn profile_dir(root: &Path, profile_id: &str) -> Result<PathBuf, String> {
    validate_profile_id(profile_id)?;
    let (source, handle) = profile_id
        .split_once('/')
        .ok_or_else(|| "el perfil debe tener la forma red/cuenta".to_string())?;
    Ok(root.join(PROFILES_DIR).join(source).join(handle))
}

/// Etiqueta de ventana: legible y sin colisiones (lleva una huella del perfil).
pub fn window_label(profile_id: &str) -> String {
    let mut readable = String::new();
    for character in profile_id.chars() {
        if character.is_ascii_alphanumeric() {
            readable.push(character.to_ascii_lowercase());
        } else {
            readable.push('-');
        }
    }
    format!("{WINDOW_PREFIX}{readable}-{:08x}", fnv1a32(profile_id))
}

/// FNV-1a de 32 bits: la misma huella que usa el motor en TypeScript.
pub fn fnv1a32(value: &str) -> u32 {
    let mut hash: u32 = 0x811c_9dc5;
    for byte in value.as_bytes() {
        hash ^= u32::from(*byte);
        hash = hash.wrapping_mul(0x0100_0193);
    }
    hash
}

/// Identificador estable de almacén de datos para macOS (WKWebView no admite
/// `data_directory`; este es su equivalente).
pub fn data_store_id(profile_id: &str) -> [u8; 16] {
    let mut id = [0u8; 16];
    let seed = fnv1a32(profile_id);
    let seed_b = fnv1a32(&format!("latido:{profile_id}"));
    id[..4].copy_from_slice(&seed.to_le_bytes());
    id[4..8].copy_from_slice(&seed_b.to_le_bytes());
    id[8..12].copy_from_slice(&(seed ^ 0x5bf0_3635).to_le_bytes());
    id[12..].copy_from_slice(&(seed_b ^ 0x9e37_79b9).to_le_bytes());
    id
}

/// Solo se navega a la web: nada de `file:`, `javascript:` ni esquemas que
/// lancen aplicaciones ajenas.
pub fn is_safe_navigation(url: &str) -> bool {
    match Url::parse(url) {
        Ok(parsed) => matches!(parsed.scheme(), "http" | "https"),
        Err(_) => false,
    }
}

/// `host` coincide con `domain` si es el mismo o un subdominio suyo.
pub fn host_matches_domain(host: &str, domain: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    let domain = domain.trim_end_matches('.').to_ascii_lowercase();
    if domain.is_empty() {
        return false;
    }
    host == domain || host.ends_with(&format!(".{domain}"))
}

/// ¿La URL pertenece a la lista blanca de esta cuenta?
pub fn host_allowed(url: &str, hosts: &[String]) -> bool {
    match Url::parse(url) {
        Ok(parsed) => match parsed.host_str() {
            Some(host) => hosts.iter().any(|domain| host_matches_domain(host, domain)),
            None => false,
        },
        Err(_) => false,
    }
}

/// Un dominio comprobable: con punto y sin espacios.
pub fn valid_host(host: &str) -> bool {
    let clean = host.trim();
    !clean.is_empty() && clean.len() <= 253 && clean.contains('.') && !clean.contains(char::is_whitespace)
}

/// Identidad pública de una cuenta: lo único que se lee de la página.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicIdentity {
    pub handle: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub profile_url: Option<String>,
}

/// Script de identidad: **el único** que se evalúa. Lee los metadatos públicos
/// que la propia página publica (OpenGraph + `rel=canonical`), sin selectores
/// propios de cada sitio, que son lo primero que rompe un rediseño.
pub const IDENTITY_SCRIPT: &str = r#"
(() => {
  const meta = (name) => {
    const element = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
    return element && element.content ? element.content : null;
  };
  const canonical = document.querySelector('link[rel="canonical"]');
  return JSON.stringify({
    title: meta('og:title'),
    url: meta('og:url') || (canonical ? canonical.href : null) || location.href,
    image: meta('og:image'),
    site: meta('og:site_name')
  });
})()
"#;

/// Interpreta lo que devuelve `IDENTITY_SCRIPT`. Nunca lanza: si no hay datos
/// utilizables, devuelve `None` y quien llama lo cuenta como «no se pudo leer».
pub fn parse_identity_payload(raw: &str) -> Option<PublicIdentity> {
    let value: serde_json::Value = serde_json::from_str(raw).ok()?;
    // El puente puede entregar el JSON como cadena dentro de otra cadena.
    let value = match value {
        serde_json::Value::String(inner) => serde_json::from_str(&inner).ok()?,
        other => other,
    };
    let title = value.get("title").and_then(|item| item.as_str());
    let url = value.get("url").and_then(|item| item.as_str());
    let image = value.get("image").and_then(|item| item.as_str());

    let handle = handle_from(title, url)?;
    Some(PublicIdentity {
        handle,
        display_name: title.and_then(display_name_from_title),
        avatar_url: image.filter(|value| is_safe_navigation(value)).map(str::to_string),
        profile_url: url
            .filter(|value| is_safe_navigation(value))
            .map(str::to_string),
    })
}

/// El handle sale del título (`Nombre (@cuenta)`) o, si no está, de la URL.
fn handle_from(title: Option<&str>, url: Option<&str>) -> Option<String> {
    if let Some(title) = title {
        if let Some(handle) = handle_in_parentheses(title) {
            return Some(handle);
        }
    }
    let url = url?;
    let parsed = Url::parse(url).ok()?;
    let segment = parsed
        .path_segments()?
        .filter(|part| !part.is_empty())
        .last()?
        .to_string();
    let handle = segment.trim_start_matches('@').to_string();
    if handle.is_empty() {
        None
    } else {
        Some(handle)
    }
}

fn handle_in_parentheses(title: &str) -> Option<String> {
    let start = title.find('(')?;
    let end = title[start..].find(')')? + start;
    let inner = title[start + 1..end].trim();
    let handle = inner.trim_start_matches('@');
    if handle.is_empty() || handle.contains(char::is_whitespace) {
        None
    } else {
        Some(handle.to_string())
    }
}

/// El nombre visible es el título sin el handle entre paréntesis.
fn display_name_from_title(title: &str) -> Option<String> {
    let cut = match title.find('(') {
        Some(index) => title[..index].trim(),
        None => title.trim(),
    };
    let cut = cut.trim_end_matches(['-', '—', '·', ',']).trim();
    if cut.is_empty() {
        None
    } else {
        Some(cut.to_string())
    }
}

/// Cookies encontradas en un dominio: **solo el recuento**.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostProbe {
    pub host: String,
    pub cookies: usize,
}

impl HostProbe {
    pub fn new(host: impl Into<String>, cookies: usize) -> Self {
        Self {
            host: host.into(),
            cookies,
        }
    }
}

/// Lo que se sabe de una sesión después de mirarla. Nunca lleva valores de
/// cookies: la interfaz no los necesita para nada.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionProbe {
    pub profile_id: String,
    pub checked_at: u64,
    pub window_open: bool,
    pub hosts: Vec<HostProbe>,
    pub has_session: bool,
    pub detail: Option<String>,
}

impl SessionProbe {
    /// Junta los recuentos por dominio en el resumen que consume la interfaz.
    pub fn from_hosts(profile_id: &str, window_open: bool, hosts: Vec<HostProbe>, detail: Option<String>) -> Self {
        let has_session = window_open && hosts.iter().any(|probe| probe.cookies > 0);
        Self {
            profile_id: profile_id.to_string(),
            checked_at: now_ms(),
            window_open,
            hosts,
            has_session,
            detail,
        }
    }
}

/// Lo que se borró al olvidar una sesión.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForgetReport {
    pub profile_id: String,
    pub window_closed: bool,
    pub directory_removed: bool,
    pub detail: Option<String>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
}

fn profiles_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map_err(|error| format!("no se pudo localizar la carpeta de datos: {error}"))
}

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------

/// Abre la web oficial de una red en una ventana visible con el perfil de esa
/// cuenta. Es el único camino para iniciar sesión: la contraseña se escribe en
/// la página del servicio, no en Latido.
#[tauri::command]
pub async fn social_open_session(
    app: AppHandle,
    profiles: tauri::State<'_, BrowserProfiles>,
    profile_id: String,
    login_url: String,
    hosts: Vec<String>,
) -> Result<(), String> {
    validate_profile_id(&profile_id)?;

    let parsed = Url::parse(&login_url).map_err(|_| "la dirección de inicio de sesión no es válida".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("solo se abren direcciones http o https".to_string());
    }
    if !hosts.is_empty() && !host_allowed(&login_url, &hosts) {
        return Err("esa dirección no pertenece a esta cuenta".to_string());
    }

    let label = window_label(&profile_id);
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.set_focus();
        profiles.mark_open(&profile_id, &label);
        return Ok(());
    }

    let directory = profile_dir(&profiles_root(&app)?, &profile_id)?;
    std::fs::create_dir_all(&directory)
        .map_err(|error| format!("no se pudo preparar el perfil de la cuenta: {error}"))?;

    let title = format!("Latido · {profile_id}");
    let builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed))
        .title(title)
        .inner_size(1080.0, 820.0)
        .min_inner_size(720.0, 560.0)
        .visible(true)
        // Solo se navega a la web; los esquemas que lanzan aplicaciones ajenas
        // quedan fuera.
        .on_navigation(|url| is_safe_navigation(url.as_str()));

    // WKWebView (macOS) no admite `data_directory`: su equivalente es un almacén
    // de datos con identificador propio, disponible desde macOS 14.
    #[cfg(target_os = "macos")]
    let builder = builder.data_store_identifier(data_store_id(&profile_id));
    #[cfg(not(target_os = "macos"))]
    let builder = builder.data_directory(directory.clone());

    builder
        .build()
        .map_err(|error| format!("no se pudo abrir la ventana de la cuenta: {error}"))?;

    profiles.mark_open(&profile_id, &label);
    Ok(())
}

/// ¿Sigue viva la sesión de esa cuenta? Devuelve recuentos por dominio, nunca
/// valores de cookies.
#[tauri::command]
pub async fn social_check_session(
    app: AppHandle,
    profile_id: String,
    hosts: Vec<String>,
) -> Result<SessionProbe, String> {
    validate_profile_id(&profile_id)?;

    let label = window_label(&profile_id);
    let Some(window) = app.get_webview_window(&label) else {
        return Ok(SessionProbe::from_hosts(
            &profile_id,
            false,
            Vec::new(),
            Some("la ventana de esta cuenta no está abierta; ábrela para iniciar sesión".to_string()),
        ));
    };

    let mut probes: Vec<HostProbe> = Vec::new();
    let mut detail: Option<String> = None;

    for host in hosts.iter().filter(|host| valid_host(host)).take(MAX_HOSTS) {
        let target = match Url::parse(&format!("https://{}/", host.trim())) {
            Ok(url) => url,
            Err(_) => continue,
        };
        match window.cookies_for_url(target) {
            Ok(cookies) => probes.push(HostProbe::new(host.trim(), cookies.len())),
            Err(error) => {
                detail = Some(format!(
                    "no se pudieron leer las cookies de {}: {error}",
                    host.trim()
                ));
            }
        }
    }

    if probes.is_empty() && detail.is_none() {
        detail = Some("esta cuenta no tiene dominios declarados que comprobar".to_string());
    }

    Ok(SessionProbe::from_hosts(&profile_id, true, probes, detail))
}

/// Identidad pública de la cuenta: avatar, nombre, handle y URL. Se lee de los
/// metadatos que la propia página publica.
#[tauri::command]
pub async fn social_read_identity(
    app: AppHandle,
    profile_id: String,
) -> Result<Option<PublicIdentity>, String> {
    validate_profile_id(&profile_id)?;

    let label = window_label(&profile_id);
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| "la ventana de esta cuenta no está abierta".to_string())?;

    let (sender, mut receiver) = tauri::async_runtime::channel(1);
    window
        .eval_with_callback(IDENTITY_SCRIPT, move |value| {
            // Si nadie escucha, da igual: la identidad es un extra, no un requisito.
            let _ = sender.blocking_send(value);
        })
        .map_err(|error| format!("no se pudo leer la página: {error}"))?;

    let raw = tokio::time::timeout(IDENTITY_TIMEOUT, receiver.recv()).await;

    match raw {
        Ok(Some(value)) => Ok(parse_identity_payload(&value)),
        Ok(None) => Ok(None),
        Err(_) => Err("la página no contestó a tiempo".to_string()),
    }
}

/// Olvida la sesión de una cuenta: cierra su ventana y borra su perfil entero.
#[tauri::command]
pub async fn social_forget_session(
    app: AppHandle,
    profiles: tauri::State<'_, BrowserProfiles>,
    profile_id: String,
) -> Result<ForgetReport, String> {
    validate_profile_id(&profile_id)?;

    let label = window_label(&profile_id);
    let mut window_closed = false;
    if let Some(window) = app.get_webview_window(&label) {
        window
            .close()
            .map_err(|error| format!("no se pudo cerrar la ventana de la cuenta: {error}"))?;
        window_closed = true;
    }
    profiles.mark_closed(&profile_id);

    let directory = profile_dir(&profiles_root(&app)?, &profile_id)?;
    let mut detail = None;
    let directory_removed = if directory.exists() {
        match std::fs::remove_dir_all(&directory) {
            Ok(()) => true,
            Err(error) => {
                detail = Some(format!("no se pudo borrar el perfil: {error}"));
                false
            }
        }
    } else {
        false
    };

    Ok(ForgetReport {
        profile_id,
        window_closed,
        directory_removed,
        detail,
    })
}

/// Qué cuentas tienen la ventana abierta ahora mismo. La interfaz lo usa para no
/// ofrecer «iniciar sesión» cuando ya está abierta.
#[tauri::command]
pub fn social_open_profiles(profiles: tauri::State<'_, BrowserProfiles>) -> Vec<String> {
    profiles.list()
}

/// ¿Está abierta la ventana de esta cuenta?
#[tauri::command]
pub fn social_is_open(
    profiles: tauri::State<'_, BrowserProfiles>,
    profile_id: String,
) -> Result<bool, String> {
    validate_profile_id(&profile_id)?;
    Ok(profiles.is_open(&profile_id))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn acepta_identificadores_de_perfil_validos() {
        assert!(validate_profile_id("threads/smouj").is_ok());
        assert!(validate_profile_id("bluesky/smouj.bsky.social").is_ok());
        assert!(validate_profile_id("mastodon/@smouj@mastodon.social").is_ok());
        assert!(validate_profile_id("x/smouj013").is_ok());
    }

    #[test]
    fn rechaza_lo_que_no_es_un_perfil() {
        for candidate in [
            "",
            "/",
            "threads",
            "threads/",
            "/smouj",
            "a/b/c",
            "Threads/smouj",
            "threads/..",
            "threads/../etc",
            "threads/.oculto",
            "threads/-guion",
            "threads/smouj/../..",
            "threads%d/smouj",
        ] {
            assert!(
                validate_profile_id(candidate).is_err(),
                "«{candidate}» no debería ser un perfil válido"
            );
        }
    }

    #[test]
    fn rechaza_handles_imposibles() {
        assert!(validate_profile_id(&format!("threads/{}", "a".repeat(65))).is_err());
        assert!(validate_profile_id("threads/con espacio").is_err());
        assert!(validate_profile_id("threads/con/barras").is_err());
    }

    #[test]
    fn el_directorio_del_perfil_no_se_sale_de_su_raiz() {
        let root = Path::new("/datos/latido");
        let directory = profile_dir(root, "threads/smouj").expect("perfil válido");
        assert_eq!(directory, root.join("profiles").join("threads").join("smouj"));
        assert!(directory.starts_with(root));
        assert!(profile_dir(root, "threads/..").is_err());
        assert!(profile_dir(root, "../fuera").is_err());
    }

    #[test]
    fn las_etiquetas_de_ventana_no_colisionan_entre_perfiles_parecidos() {
        let a = window_label("threads/smouj.x");
        let b = window_label("threads/smouj-x");
        assert_ne!(a, b);
        assert_eq!(a, window_label("threads/smouj.x"));
        assert!(a.starts_with(WINDOW_PREFIX));
    }

    #[test]
    fn la_huella_es_estable_y_del_mismo_tamano() {
        assert_eq!(fnv1a32("threads/smouj"), fnv1a32("threads/smouj"));
        let id = data_store_id("threads/smouj");
        assert_eq!(id.len(), 16);
        assert_ne!(id, data_store_id("threads/otro"));
        assert_eq!(id, data_store_id("threads/smouj"));
    }

    #[test]
    fn solo_se_navega_a_la_web() {
        assert!(is_safe_navigation("https://www.threads.net/login"));
        assert!(is_safe_navigation("http://localhost:5173/"));
        for blocked in ["file:///etc/passwd", "javascript:alert(1)", "data:text/html,x", "mailto:a@b.c", "latido://cualquiera"] {
            assert!(!is_safe_navigation(blocked), "«{blocked}» no debería navegarse");
        }
    }

    #[test]
    fn el_aislamiento_entre_redes_es_el_mismo_que_en_la_interfaz() {
        let threads = vec!["threads.net".to_string(), "www.threads.net".to_string()];
        assert!(host_allowed("https://www.threads.net/@alguien", &threads));
        assert!(!host_allowed("https://www.reddit.com/r/programming", &threads));
        assert!(!host_allowed("https://evilthreads.net/x", &threads));
        assert!(host_matches_domain("old.reddit.com", "reddit.com"));
        assert!(!host_matches_domain("evilreddit.com", "reddit.com"));
    }

    #[test]
    fn los_dominios_se_comprueban_antes_de_tocarlos() {
        assert!(valid_host("www.reddit.com"));
        assert!(valid_host("mastodon.social"));
        assert!(!valid_host("localhost"));
        assert!(!valid_host(""));
        assert!(!valid_host("dos palabras.com"));
    }

    #[test]
    fn lee_la_identidad_del_titulo_publico() {
        let raw = r#"{"title":"Smouj (@smouj) • Threads","url":"https://www.threads.net/@smouj","image":"https://scontent.example/avatar.jpg","site":"Threads"}"#;
        let identity = parse_identity_payload(raw).expect("debería leer la identidad");
        assert_eq!(identity.handle, "smouj");
        assert_eq!(identity.display_name.as_deref(), Some("Smouj"));
        assert_eq!(identity.avatar_url.as_deref(), Some("https://scontent.example/avatar.jpg"));
        assert_eq!(identity.profile_url.as_deref(), Some("https://www.threads.net/@smouj"));
    }

    #[test]
    fn el_puente_puede_entregar_el_json_dentro_de_una_cadena() {
        let inner = r#"{"title":"Alguien (@alguien@mastodon.social)","url":"https://mastodon.social/@alguien"}"#;
        let raw = serde_json::to_string(inner).expect("cadena serializable");
        let identity = parse_identity_payload(&raw).expect("debería leer la identidad");
        assert_eq!(identity.handle, "alguien@mastodon.social");
    }

    #[test]
    fn sin_metadatos_no_se_inventa_una_identidad() {
        for raw in [
            "",
            "null",
            "no es json",
            r#"{"title":null,"url":null}"#,
            r#"{"title":"","url":""}"#,
        ] {
            assert!(
                parse_identity_payload(raw).is_none(),
                "«{raw}» no debería dar identidad"
            );
        }
    }

    #[test]
    fn una_imagen_con_esquema_prohibido_se_descarta() {
        let raw = r#"{"title":"Smouj (@smouj)","url":"https://www.threads.net/@smouj","image":"javascript:alert(1)"}"#;
        let identity = parse_identity_payload(raw).expect("debería leer la identidad");
        assert_eq!(identity.avatar_url, None);
    }

    #[test]
    fn el_handle_tambien_sale_de_la_url_cuando_el_titulo_no_lo_trae() {
        let raw = r#"{"title":"Smouj","url":"https://bsky.app/profile/smouj.bsky.social"}"#;
        let identity = parse_identity_payload(raw).expect("debería leer la identidad");
        assert_eq!(identity.handle, "smouj.bsky.social");
        assert_eq!(identity.display_name.as_deref(), Some("Smouj"));
    }

    #[test]
    fn el_resumen_de_sesion_solo_lleva_recuentos() {
        let probe = SessionProbe::from_hosts(
            "reddit/smouj",
            true,
            vec![HostProbe::new("www.reddit.com", 3), HostProbe::new("oauth.reddit.com", 0)],
            None,
        );
        let json = serde_json::to_string(&probe).expect("serializable");
        assert!(json.contains("\"cookies\":3"));
        assert!(json.contains("\"hasSession\":true"));
        assert!(!json.contains("value"), "no puede salir ningún valor de cookie");
        assert!(!json.contains("reddit_session"));
    }

    #[test]
    fn sin_cookies_no_hay_sesion_y_se_explica() {
        let probe = SessionProbe::from_hosts("threads/smouj", true, vec![HostProbe::new("www.threads.net", 0)], None);
        assert!(!probe.has_session);
        let cerrada = SessionProbe::from_hosts("threads/smouj", false, Vec::new(), Some("no está abierta".into()));
        assert!(!cerrada.has_session);
        assert!(cerrada.detail.is_some());
    }

    #[test]
    fn el_estado_de_ventanas_abiertas_se_lleva_aparte() {
        let profiles = BrowserProfiles::default();
        assert!(!profiles.is_open("threads/smouj"));
        profiles.mark_open("threads/smouj", "social-threads-smouj-1234");
        assert!(profiles.is_open("threads/smouj"));
        assert_eq!(profiles.list(), vec!["threads/smouj".to_string()]);
        profiles.mark_closed("threads/smouj");
        assert!(!profiles.is_open("threads/smouj"));
    }
}
