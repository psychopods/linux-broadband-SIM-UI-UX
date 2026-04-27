use serde::Serialize;
use sim_broadband_gui::{
    answer_phone_call as answer_modem_phone_call, cancel_ussd, connect_network, disconnect_network,
    get_all_modem_data, get_connection_status, get_current_bearer_details, get_network_controls,
    get_operator_name, get_phone_status as fetch_phone_status, get_radio_tech,
    get_registration_state, get_roaming_state, get_signal_strength,
    get_sim_contacts as fetch_sim_contacts, get_sim_info, get_sim_management,
    get_sms_conversation as fetch_sms_conversation, get_sms_threads as fetch_sms_threads,
    get_ussd_status as fetch_ussd_status, hangup_phone_call as hangup_modem_phone_call,
    initiate_ussd as send_ussd_request, respond_to_ussd as send_ussd_response,
    send_phone_dtmf as send_modem_dtmf, send_sms as send_modem_sms,
    start_phone_call as start_modem_phone_call, unlock_sim_pin, BearerDetails, ModemData,
    NetworkControls, PhoneStatus, SimContact, SimManagement, SmsMessage, SmsThread, UssdSession,
};
use std::process::Command;
use tauri_plugin_updater::UpdaterExt;
use url::Url;

const UPDATER_ENDPOINT: &str =
    "https://github.com/psychopods/linux-broadband-SIM-UI-UX/releases/latest/download/latest.json";

#[derive(Debug, Serialize)]
struct AppMetadata {
    product_name: String,
    version: String,
    description: String,
}

#[derive(Debug, Serialize)]
struct AppUpdateStatus {
    current_version: String,
    latest_version: Option<String>,
    update_available: bool,
    release_url: Option<String>,
    body: Option<String>,
    configured: bool,
    note: Option<String>,
}

#[derive(Debug, Serialize)]
struct RuntimePermissionStatus {
    dialout_member: bool,
    plugdev_member: bool,
    groups: Vec<String>,
    dbus_modemmanager_access: bool,
    ready_for_appimage_modem_access: bool,
    recommendation: Option<String>,
}

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
async fn get_sim_contacts() -> Result<Vec<SimContact>, String> {
    fetch_sim_contacts().await
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

#[tauri::command]
async fn get_phone_status() -> Result<PhoneStatus, String> {
    fetch_phone_status().await
}

#[tauri::command]
async fn start_phone_call(number: String) -> Result<PhoneStatus, String> {
    start_modem_phone_call(number).await
}

#[tauri::command]
async fn answer_phone_call() -> Result<PhoneStatus, String> {
    answer_modem_phone_call().await
}

#[tauri::command]
async fn hangup_phone_call() -> Result<PhoneStatus, String> {
    hangup_modem_phone_call().await
}

#[tauri::command]
async fn send_phone_dtmf(tones: String) -> Result<PhoneStatus, String> {
    send_modem_dtmf(tones).await
}

#[tauri::command]
async fn get_app_metadata() -> Result<AppMetadata, String> {
    Ok(AppMetadata {
        product_name: env!("CARGO_PKG_NAME").to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        description: env!("CARGO_PKG_DESCRIPTION").to_string(),
    })
}

#[tauri::command]
async fn check_app_update(app: tauri::AppHandle) -> Result<AppUpdateStatus, String> {
    fn updater_public_key() -> Option<String> {
        option_env!("TAURI_UPDATER_PUBLIC_KEY")
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string)
    }

    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let endpoint = Url::parse(UPDATER_ENDPOINT)
        .map_err(|error| format!("Invalid updater endpoint URL: {error}"))?;

    let mut updater_builder = app
        .updater_builder()
        .endpoints(vec![endpoint])
        .map_err(|error| format!("Failed to configure updater endpoints: {error}"))?;

    if let Some(pubkey) = updater_public_key() {
        updater_builder = updater_builder.pubkey(pubkey);
    }

    let updater = match updater_builder.build() {
        Ok(updater) => updater,
        Err(error) => {
            return Ok(AppUpdateStatus {
                current_version,
                latest_version: None,
                update_available: false,
                release_url: None,
                body: None,
                configured: false,
                note: Some(format!("Failed to build updater: {error}")),
            });
        }
    };

    let configured = true;

    match updater.check().await {
        Ok(Some(update)) => Ok(AppUpdateStatus {
            current_version,
            latest_version: Some(update.version),
            update_available: true,
            release_url: Some(update.download_url.to_string()),
            body: update.body,
            configured,
            note: if configured {
                None
            } else {
                Some("Update is available, but this build has no embedded updater public key. Release builds should set TAURI_UPDATER_PUBLIC_KEY.".to_string())
            },
        }),
        Ok(None) => Ok(AppUpdateStatus {
            current_version,
            latest_version: None,
            update_available: false,
            release_url: None,
            body: None,
            configured,
            note: if configured {
                None
            } else {
                Some("Updater is not fully configured in this build. Release builds should set TAURI_UPDATER_PUBLIC_KEY.".to_string())
            },
        }),
        Err(error) => Ok(AppUpdateStatus {
            current_version,
            latest_version: None,
            update_available: false,
            release_url: None,
            body: None,
            configured,
            note: Some(format!("Failed to check updates: {error}")),
        }),
    }
}

#[tauri::command]
async fn install_app_update(app: tauri::AppHandle) -> Result<(), String> {
    let endpoint = Url::parse(UPDATER_ENDPOINT)
        .map_err(|error| format!("Invalid updater endpoint URL: {error}"))?;

    let mut updater_builder = app
        .updater_builder()
        .endpoints(vec![endpoint])
        .map_err(|error| format!("Failed to configure updater endpoints: {error}"))?;

    if let Some(pubkey) = option_env!("TAURI_UPDATER_PUBLIC_KEY")
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
    {
        updater_builder = updater_builder.pubkey(pubkey);
    }

    let updater = updater_builder
        .build()
        .map_err(|error| format!("Failed to build updater: {error}"))?;

    let Some(update) = updater
        .check()
        .await
        .map_err(|error| format!("Failed to check updates: {error}"))?
    else {
        return Err("No update is currently available.".to_string());
    };

    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|error| format!("Failed to download/install update: {error}"))?;

    app.restart();
}

#[tauri::command]
async fn check_runtime_permissions() -> Result<RuntimePermissionStatus, String> {
    let groups = Command::new("id")
        .arg("-nG")
        .output()
        .ok()
        .and_then(|output| {
            if output.status.success() {
                Some(
                    String::from_utf8_lossy(&output.stdout)
                        .split_whitespace()
                        .map(|item| item.to_string())
                        .collect::<Vec<_>>(),
                )
            } else {
                None
            }
        })
        .unwrap_or_default();

    let dialout_member = groups.iter().any(|group| group == "dialout");
    let plugdev_member = groups.iter().any(|group| group == "plugdev");

    // We treat "No modem found" as service-reachable for permission purposes.
    let dbus_modemmanager_access = match get_connection_status().await {
        Ok(_) => true,
        Err(error) => {
            let lower = error.to_ascii_lowercase();
            lower.contains("no modem was found")
                || lower.contains("no modem")
                || lower.contains("modemmanager")
                    && !lower.contains("permission denied")
                    && !lower.contains("unauthorized")
        }
    };

    let ready_for_appimage_modem_access =
        dbus_modemmanager_access && (dialout_member || plugdev_member);

    let recommendation = if ready_for_appimage_modem_access {
        None
    } else {
        Some(
            "For AppImage modem access via D-Bus/ModemManager, ensure your user is in the dialout group (or plugdev on some systems), then re-login: sudo usermod -aG dialout $USER".to_string(),
        )
    };

    Ok(RuntimePermissionStatus {
        dialout_member,
        plugdev_member,
        groups,
        dbus_modemmanager_access,
        ready_for_appimage_modem_access,
        recommendation,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let updater_plugin = if let Some(pubkey) = option_env!("TAURI_UPDATER_PUBLIC_KEY")
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        tauri_plugin_updater::Builder::new().pubkey(pubkey).build()
    } else {
        tauri_plugin_updater::Builder::new().build()
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(updater_plugin)
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
            get_sim_contacts,
            get_sms_conversation,
            send_sms,
            get_ussd_status,
            execute_ussd,
            respond_ussd,
            cancel_ussd_session,
            get_phone_status,
            start_phone_call,
            answer_phone_call,
            hangup_phone_call,
            send_phone_dtmf,
            get_app_metadata,
            check_app_update,
            install_app_update,
            check_runtime_permissions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
