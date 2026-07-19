mod fsops;
mod http;
mod models;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            http::send_request,
            fsops::list_tree,
            fsops::read_text_file,
            fsops::write_text_file,
            fsops::create_directory,
            fsops::rename_path,
            fsops::delete_path,
            fsops::collection_vars,
        ])
        .run(tauri::generate_context!())
        .expect("error while running nimbus");
}
