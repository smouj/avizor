//! Persistencia de la sesión.
//!
//! Se guarda **un solo archivo JSON** con la sesión y la instantánea del motor:
//! preferencias, filtros, leídos, guardados, temas y publicaciones. Es lo que
//! hace que cerrar la app no cueste nada: al abrir, todo sigue donde estaba.
//!
//! Escritura atómica (temporal + `rename`) para que un corte de luz no deje el
//! estado a medias.

use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

const FILE_NAME: &str = "avizor-state.json";

fn state_path(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("no se pudo resolver el directorio de datos: {error}"))?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join(FILE_NAME))
}

/// Devuelve el estado guardado, o `None` en el primer arranque.
#[tauri::command]
pub fn state_load(app: AppHandle) -> Result<Option<String>, String> {
    let path = state_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(&path).map(Some).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn state_save(app: AppHandle, json: String) -> Result<(), String> {
    let path = state_path(&app)?;
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, json.as_bytes()).map_err(|error| error.to_string())?;
    fs::rename(&temporary, &path).map_err(|error| error.to_string())
}

/// Borra **todo** lo que la aplicación guarda en este equipo.
///
/// Antes solo se llevaba el JSON: las publicaciones del archivo SQLite, los
/// perfiles de las cuentas sociales y los secretos del llavero seguían ahí, así
/// que el botón prometía más de lo que hacía.
#[tauri::command]
pub fn state_clear(
    app: AppHandle,
    archive: tauri::State<'_, crate::archive::Archive>,
) -> Result<(), String> {
    let path = state_path(&app)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|error| error.to_string())?;
    }

    archive.wipe().map_err(|error| error.to_string())?;

    // Perfiles de navegador de las cuentas sociales (cookies y almacenamiento).
    if let Ok(directory) = app.path().app_local_data_dir() {
        let profiles = directory.join(crate::browser::PROFILES_DIR);
        if profiles.exists() {
            fs::remove_dir_all(&profiles).map_err(|error| error.to_string())?;
        }
    }

    // Secretos del llavero. Si alguno no se puede borrar (llavero sin sesión),
    // se sigue: el resto del borrado ya está hecho y el aviso lo dice.
    let mut failed = 0;
    for key in crate::secrets::KNOWN_KEYS {
        if crate::secrets::forget(key).is_err() {
            failed += 1;
        }
    }
    if failed > 0 {
        return Err(format!(
            "se borraron los datos, pero {failed} secretos del llavero no se pudieron eliminar"
        ));
    }
    Ok(())
}
