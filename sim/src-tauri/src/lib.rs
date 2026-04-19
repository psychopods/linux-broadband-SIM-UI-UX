use sim_broadband_gui::{
    connect_network, disconnect_network, get_all_modem_data, get_connection_status,
    get_current_bearer_details, get_network_controls, get_operator_name, get_radio_tech,
    get_registration_state, get_roaming_state, get_signal_strength, get_sim_info,
    get_sim_management, unlock_sim_pin, BearerDetails, ModemData, NetworkControls,
    SimManagement,
};

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

#[tauri::command]
async fn get_sim_management_state() -> Result<SimManagement, String> {
    get_sim_management().await
}

#[tauri::command]
async fn unlock_sim(pin: String) -> Result<(), String> {
    unlock_sim_pin(pin).await
}

#[tauri::command]
async fn get_network_status() -> Result<NetworkControls, String> {
    get_network_controls().await
}

#[tauri::command]
async fn connect_modem(apn: Option<String>) -> Result<String, String> {
    connect_network(apn).await
}

#[tauri::command]
async fn disconnect_modem() -> Result<(), String> {
    disconnect_network().await
}

#[tauri::command]
async fn get_registration() -> Result<String, String> {
    get_registration_state().await
}

#[tauri::command]
async fn get_roaming() -> Result<bool, String> {
    get_roaming_state().await
}

#[tauri::command]
async fn get_current_bearer() -> Result<Option<BearerDetails>, String> {
    get_current_bearer_details().await
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
            get_sim_management_state,
            get_network_status,
            connect_modem,
            disconnect_modem,
            unlock_sim,
            get_registration,
            get_roaming,
            get_current_bearer,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
