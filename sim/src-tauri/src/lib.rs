use sim_broadband_gui::{
    cancel_ussd, connect_network, disconnect_network, get_all_modem_data, get_connection_status,
    get_current_bearer_details, get_network_controls, get_operator_name, get_radio_tech,
    get_registration_state, get_roaming_state, get_signal_strength, get_sim_info,
    get_sim_management, get_sms_conversation as fetch_sms_conversation,
    get_sms_threads as fetch_sms_threads, get_ussd_status as fetch_ussd_status,
    initiate_ussd as send_ussd_request, respond_to_ussd as send_ussd_response,
    send_sms as send_modem_sms, unlock_sim_pin, BearerDetails, ModemData,
    NetworkControls, SimManagement, SmsMessage, SmsThread, UssdSession,
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

#[tauri::command]
async fn get_sms_threads() -> Result<Vec<SmsThread>, String> {
    fetch_sms_threads().await
}

#[tauri::command]
async fn get_sms_conversation(thread_id: String) -> Result<Vec<SmsMessage>, String> {
    fetch_sms_conversation(thread_id).await
}

#[tauri::command]
async fn send_sms(number: String, text: String) -> Result<SmsMessage, String> {
    send_modem_sms(number, text).await
}

#[tauri::command]
async fn get_ussd_status() -> Result<UssdSession, String> {
    fetch_ussd_status().await
}

#[tauri::command]
async fn execute_ussd(code: String) -> Result<UssdSession, String> {
    send_ussd_request(code).await
}

#[tauri::command]
async fn respond_ussd(response: String) -> Result<UssdSession, String> {
    send_ussd_response(response).await
}

#[tauri::command]
async fn cancel_ussd_session() -> Result<(), String> {
    cancel_ussd().await
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
            get_sms_threads,
            get_sms_conversation,
            send_sms,
            get_ussd_status,
            execute_ussd,
            respond_ussd,
            cancel_ussd_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
