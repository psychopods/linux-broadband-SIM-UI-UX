use sim_broadband_gui::{ModemData, get_all_modem_data, get_radio_tech, get_signal_strength, get_operator_name, get_connection_status, get_sim_info};

// Tauri command to get all modem data
#[tauri::command]
async fn get_modem_data() -> Result<ModemData, String> {
    get_all_modem_data().await
}

// Individual commands for specific data
#[tauri::command]
async fn get_radio_technology() -> Result<String, String> {
    get_radio_tech().await
}

#[tauri::command]
async fn get_signal() -> Result<i32, String> {
    get_signal_strength().await
}

#[tauri::command]
async fn get_operator() -> Result<String, String> {
    get_operator_name().await
}

#[tauri::command]
async fn get_connection() -> Result<bool, String> {
    get_connection_status().await
}

#[tauri::command]
async fn get_sim() -> Result<String, String> {
    get_sim_info().await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_modem_data,
            get_radio_technology,
            get_signal,
            get_operator,
            get_connection,
            get_sim,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
