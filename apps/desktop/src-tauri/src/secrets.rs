//! Secretos: tokens de API de las fuentes.
//!
//! Nunca se guardan en el archivo de estado ni en SQLite. Van al llavero del
//! sistema (Secret Service en Linux, Credential Manager en Windows, Keychain en
//! macOS), que es donde el sistema operativo ya protege credenciales.
//!
//! Si no hay llavero disponible, estas funciones devuelven un error y la app
//! sigue funcionando: las fuentes que no necesitan token no se ven afectadas.

use keyring::Entry;

const SERVICE: &str = "app.avizor.desktop";

fn entry(key: &str) -> Result<Entry, String> {
    if key.trim().is_empty() || key.len() > 128 {
        return Err("nombre de credencial inválido".to_string());
    }
    Entry::new(SERVICE, key).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn secret_set(key: String, value: String) -> Result<(), String> {
    entry(&key)?.set_password(&value).map_err(|error| error.to_string())
}

/// Devuelve el secreto si existe. `None` significa "no hay nada guardado", no
/// "algo fue mal": la interfaz no debe asustar al usuario por eso.
#[tauri::command]
pub fn secret_get(key: String) -> Result<Option<String>, String> {
    match entry(&key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

/// Borra un secreto sin fallar si no existía. Uso interno (borrado completo).
pub fn forget(key: &str) -> Result<(), String> {
    match entry(key)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

/// Claves que la aplicación puede haber guardado en el llavero.
///
/// El llavero no se puede enumerar, así que el borrado completo recorre esta
/// lista: la clave de traducción y la sesión de cada fuente.
pub const KNOWN_KEYS: [&str; 10] = [
    "translate.apiKey",
    "session.cookie.bluesky",
    "session.cookie.reddit",
    "session.cookie.hackernews",
    "session.cookie.rss",
    "session.cookie.github",
    "session.cookie.mastodon",
    "session.cookie.youtube",
    "session.cookie.lemmy",
    "session.cookie.demo",
];

#[tauri::command]
pub fn secret_delete(key: String) -> Result<(), String> {
    match entry(&key)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}
