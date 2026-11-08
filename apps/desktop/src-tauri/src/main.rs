// Sin consola en Windows en release, y punto de entrada mínimo: la lógica vive
// en `avizor_lib` para poder probarla y reutilizarla.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    avizor_lib::run()
}
