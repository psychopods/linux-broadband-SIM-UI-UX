use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use tokio::process::Command as AsyncCommand;
use zbus::{
    fdo::ObjectManagerProxy,
    zvariant::{OwnedObjectPath, OwnedValue},
    Connection, Proxy,
};

const MM_DESTINATION: &str = "org.freedesktop.ModemManager1";
const MM_MANAGER_PATH: &str = "/org/freedesktop/ModemManager1";
const MM_MODEM_INTERFACE: &str = "org.freedesktop.ModemManager1.Modem";
const MM_MODEM_SIMPLE_INTERFACE: &str = "org.freedesktop.ModemManager1.Modem.Simple";
const MM_MODEM_3GPP_INTERFACE: &str = "org.freedesktop.ModemManager1.Modem.Modem3gpp";
const MM_MODEM_VOICE_INTERFACE: &str = "org.freedesktop.ModemManager1.Modem.Voice";
const MM_MODEM_USSD_INTERFACE: &str = "org.freedesktop.ModemManager1.Modem.Modem3gpp.Ussd";
const MM_MODEM_MESSAGING_INTERFACE: &str = "org.freedesktop.ModemManager1.Modem.Messaging";
const MM_BEARER_INTERFACE: &str = "org.freedesktop.ModemManager1.Bearer";
const MM_SIM_INTERFACE: &str = "org.freedesktop.ModemManager1.Sim";
const MM_SMS_INTERFACE: &str = "org.freedesktop.ModemManager1.Sms";
const MM_CALL_INTERFACE: &str = "org.freedesktop.ModemManager1.Call";

const MM_MODEM_STATE_REGISTERED: i32 = 8;
const MM_MODEM_STATE_CONNECTING: i32 = 10;
const MM_MODEM_STATE_CONNECTED: i32 = 11;
const MM_SMS_STATE_RECEIVED: u32 = 3;
const MM_SMS_STATE_SENT: u32 = 5;

const MM_ACCESS_TECH_GSM: u32 = 1 << 1;
const MM_ACCESS_TECH_GSM_COMPACT: u32 = 1 << 2;
const MM_ACCESS_TECH_GPRS: u32 = 1 << 3;
const MM_ACCESS_TECH_EDGE: u32 = 1 << 4;
const MM_ACCESS_TECH_UMTS: u32 = 1 << 5;
const MM_ACCESS_TECH_HSDPA: u32 = 1 << 6;
const MM_ACCESS_TECH_HSUPA: u32 = 1 << 7;
const MM_ACCESS_TECH_HSPA: u32 = 1 << 8;
const MM_ACCESS_TECH_HSPA_PLUS: u32 = 1 << 9;
const MM_ACCESS_TECH_LTE: u32 = 1 << 14;
const MM_ACCESS_TECH_5GNR: u32 = 1 << 15;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModemData {
    pub connected: bool,
    pub radio_tech: String,
    pub signal_strength: Option<i32>,
    pub operator_name: String,
    pub sim_info: String,
    pub sim_management: SimManagement,
    pub phone_capabilities: PhoneCapabilities,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BearerDetails {
    pub path: String,
    pub connected: bool,
    pub interface: Option<String>,
    pub apn: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkControls {
    pub connected: bool,
    pub registration_state: String,
    pub roaming: bool,
    pub bearer: Option<BearerDetails>,
    pub sim_management: SimManagement,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimManagement {
    pub present: bool,
    pub iccid: Option<String>,
    pub imsi: Option<String>,
    pub pin_lock_state: String,
    pub unlock_required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmsThread {
    pub id: String,
    pub peer: String,
    pub message_count: usize,
    pub last_message: Option<SmsMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmsMessage {
    pub id: String,
    pub thread_id: String,
    pub path: String,
    pub peer: String,
    pub text: String,
    pub timestamp: Option<String>,
    pub state: String,
    pub incoming: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimContact {
    pub id: String,
    pub name: String,
    pub number: String,
    pub storage: String,
    pub index: u32,
    pub last_message: Option<SmsMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhoneCapabilities {
    pub supported: bool,
    pub emergency_only: bool,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhoneCall {
    pub path: String,
    pub number: Option<String>,
    pub state: String,
    pub state_reason: String,
    pub direction: String,
    pub multiparty: bool,
    pub audio_port: Option<String>,
    pub audio_format: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhoneStatus {
    pub capabilities: PhoneCapabilities,
    pub current_call: Option<PhoneCall>,
    pub call_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UssdSession {
    pub code: Option<String>,
    pub response: Option<String>,
    pub state: String,
    pub network_request: Option<String>,
    pub network_notification: Option<String>,
}

struct ModemContext {
    connection: Connection,
    modem_path: OwnedObjectPath,
    sim_path: Option<OwnedObjectPath>,
    voice_supported: bool,
}

/// Get radio technology (2G/3G/4G/5G) from ModemManager via D-Bus
pub async fn get_radio_tech() -> Result<String, String> {
    let context = connect_to_modem().await?;
    let modem_proxy = modem_proxy(&context).await?;
    let access_technologies: u32 = modem_proxy
        .get_property("AccessTechnologies")
        .await
        .map_err(|e| format!("Failed to read modem access technologies: {e}"))?;

    Ok(access_technology_label(access_technologies).to_string())
}

/// Get signal strength in dBm from ModemManager
pub async fn get_signal_strength() -> Result<i32, String> {
    let context = connect_to_modem().await?;
    let modem_proxy = modem_proxy(&context).await?;
    let (quality_percent, _recent): (u32, bool) =
        modem_proxy
            .get_property("SignalQuality")
            .await
            .map_err(|e| format!("Failed to read modem signal quality: {e}"))?;

    Ok(signal_percent_to_dbm(quality_percent))
}

/// Get mobile operator/carrier name
pub async fn get_operator_name() -> Result<String, String> {
    let context = connect_to_modem().await?;
    let proxy = modem_3gpp_proxy(&context).await?;
    let operator_name: String = proxy.get_property("OperatorName").await.unwrap_or_default();

    if !operator_name.trim().is_empty() {
        return Ok(operator_name);
    }

    let operator_code: String = proxy.get_property("OperatorCode").await.unwrap_or_default();

    if operator_code.trim().is_empty() {
        Ok("No Network".to_string())
    } else {
        Ok(operator_code)
    }
}

/// Get connection status (registered, roaming, etc.)
pub async fn get_connection_status() -> Result<bool, String> {
    let context = connect_to_modem().await?;
    let modem_proxy = modem_proxy(&context).await?;
    let state: i32 = modem_proxy
        .get_property("State")
        .await
        .map_err(|e| format!("Failed to read modem state: {e}"))?;

    Ok(matches!(
        state,
        MM_MODEM_STATE_REGISTERED | MM_MODEM_STATE_CONNECTING | MM_MODEM_STATE_CONNECTED
    ) || state > MM_MODEM_STATE_REGISTERED)
}

/// Get SIM card information
pub async fn get_sim_info() -> Result<String, String> {
    let sim_management = get_sim_management().await?;

    if let Some(iccid) = sim_management.iccid {
        return Ok(iccid);
    }

    if let Some(imsi) = sim_management.imsi {
        return Ok(imsi);
    }

    if sim_management.present {
        Err("SIM present but no identifier could be read".to_string())
    } else {
        Err("No SIM is present".to_string())
    }
}

pub async fn get_sim_management() -> Result<SimManagement, String> {
    let context = connect_to_modem().await?;
    let modem = modem_proxy(&context).await?;
    let unlock_required = get_unlock_required_from_proxy(&modem).await?;

    let Some(_) = context.sim_path.as_ref() else {
        return Ok(SimManagement {
            present: false,
            iccid: None,
            imsi: None,
            pin_lock_state: "Absent".to_string(),
            unlock_required: false,
        });
    };

    let sim = sim_proxy(&context).await?;
    let iccid = non_empty_string(
        sim.get_property::<String>("SimIdentifier")
            .await
            .unwrap_or_default(),
    );
    let imsi = non_empty_string(sim.get_property::<String>("Imsi").await.unwrap_or_default());

    Ok(SimManagement {
        present: true,
        iccid,
        imsi,
        pin_lock_state: modem_lock_label(unlock_required).to_string(),
        unlock_required: !matches!(unlock_required, 0 | 1),
    })
}

pub async fn unlock_sim_pin(pin: String) -> Result<(), String> {
    let trimmed_pin = pin.trim();
    if trimmed_pin.is_empty() {
        return Err("PIN cannot be empty".to_string());
    }

    let context = connect_to_modem().await?;
    let modem = modem_proxy(&context).await?;

    modem
        .call::<_, _, ()>("SendPin", &(trimmed_pin,))
        .await
        .map_err(|e| format!("Failed to unlock SIM with PIN: {e}"))
}

async fn connect_to_modem() -> Result<ModemContext, String> {
    let connection = Connection::system()
        .await
        .map_err(|e| format!("D-Bus connection failed: {}", e))?;

    let manager: ObjectManagerProxy<'_> = ObjectManagerProxy::builder(&connection)
        .destination(MM_DESTINATION)
        .map_err(|e| format!("Failed to set ModemManager destination: {e}"))?
        .path(MM_MANAGER_PATH)
        .map_err(|e| format!("Failed to set ModemManager path: {e}"))?
        .build()
        .await
        .map_err(|e| format!("Failed to build object manager proxy: {e}"))?;

    let managed_objects: zbus::fdo::ManagedObjects = manager
        .get_managed_objects()
        .await
        .map_err(|e| format!("Failed to enumerate modem objects: {e}"))?;

    let modem_path = managed_objects
        .iter()
        .find_map(|(path, interfaces)| {
            interfaces
                .keys()
                .any(|name| name.as_str() == MM_MODEM_INTERFACE)
                .then(|| path.clone())
        })
        .ok_or_else(|| {
            "No modem was found in ModemManager. Ensure the laptop exposes the modem to ModemManager."
                .to_string()
        })?;
    let voice_supported = managed_objects
        .get(&modem_path)
        .map(|interfaces| {
            interfaces
                .keys()
                .any(|name| name.as_str() == MM_MODEM_VOICE_INTERFACE)
        })
        .unwrap_or(false);

    let modem_proxy: Proxy<'_> = Proxy::new(
        &connection,
        MM_DESTINATION,
        modem_path.as_str(),
        MM_MODEM_INTERFACE,
    )
    .await
    .map_err(|e| format!("Failed to create modem proxy: {e}"))?;

    let sim_path: OwnedObjectPath = modem_proxy
        .get_property::<OwnedObjectPath>("Sim")
        .await
        .unwrap_or_else(|_| {
            OwnedObjectPath::try_from("/").expect("root object path must always be valid")
        });

    let sim_path = (sim_path.as_str() != "/").then_some(sim_path);

    Ok(ModemContext {
        connection,
        modem_path,
        sim_path,
        voice_supported,
    })
}

async fn modem_proxy(context: &ModemContext) -> Result<Proxy<'_>, String> {
    Proxy::new(
        &context.connection,
        MM_DESTINATION,
        context.modem_path.as_str(),
        MM_MODEM_INTERFACE,
    )
    .await
    .map_err(|e| format!("Failed to create modem proxy: {e}"))
}

async fn modem_command(
    context: &ModemContext,
    command: &str,
    timeout_seconds: u32,
) -> Result<String, String> {
    let proxy = modem_proxy(context).await?;

    proxy
        .call("Command", &(command, timeout_seconds))
        .await
        .map_err(|e| format!("Failed to run modem command '{command}': {e}"))
}

async fn modem_3gpp_proxy(context: &ModemContext) -> Result<Proxy<'_>, String> {
    Proxy::new(
        &context.connection,
        MM_DESTINATION,
        context.modem_path.as_str(),
        MM_MODEM_3GPP_INTERFACE,
    )
    .await
    .map_err(|e| format!("Failed to create 3GPP modem proxy: {e}"))
}

async fn modem_simple_proxy(context: &ModemContext) -> Result<Proxy<'_>, String> {
    Proxy::new(
        &context.connection,
        MM_DESTINATION,
        context.modem_path.as_str(),
        MM_MODEM_SIMPLE_INTERFACE,
    )
    .await
    .map_err(|e| format!("Failed to create simple modem proxy: {e}"))
}

async fn modem_ussd_proxy(context: &ModemContext) -> Result<Proxy<'_>, String> {
    Proxy::new(
        &context.connection,
        MM_DESTINATION,
        context.modem_path.as_str(),
        MM_MODEM_USSD_INTERFACE,
    )
    .await
    .map_err(|e| format!("Failed to create USSD proxy: {e}"))
}

async fn modem_voice_proxy(context: &ModemContext) -> Result<Proxy<'_>, String> {
    if !context.voice_supported {
        return Err("Voice calling is not exposed by this modem".to_string());
    }

    Proxy::new(
        &context.connection,
        MM_DESTINATION,
        context.modem_path.as_str(),
        MM_MODEM_VOICE_INTERFACE,
    )
    .await
    .map_err(|e| format!("Failed to create voice proxy: {e}"))
}

async fn modem_messaging_proxy(context: &ModemContext) -> Result<Proxy<'_>, String> {
    Proxy::new(
        &context.connection,
        MM_DESTINATION,
        context.modem_path.as_str(),
        MM_MODEM_MESSAGING_INTERFACE,
    )
    .await
    .map_err(|e| format!("Failed to create messaging proxy: {e}"))
}

async fn bearer_proxy<'a>(
    context: &'a ModemContext,
    bearer_path: &'a OwnedObjectPath,
) -> Result<Proxy<'a>, String> {
    Proxy::new(
        &context.connection,
        MM_DESTINATION,
        bearer_path.as_str(),
        MM_BEARER_INTERFACE,
    )
    .await
    .map_err(|e| format!("Failed to create bearer proxy: {e}"))
}

async fn sms_proxy<'a>(
    context: &'a ModemContext,
    sms_path: &'a OwnedObjectPath,
) -> Result<Proxy<'a>, String> {
    Proxy::new(
        &context.connection,
        MM_DESTINATION,
        sms_path.as_str(),
        MM_SMS_INTERFACE,
    )
    .await
    .map_err(|e| format!("Failed to create SMS proxy: {e}"))
}

async fn call_proxy<'a>(
    context: &'a ModemContext,
    call_path: &'a OwnedObjectPath,
) -> Result<Proxy<'a>, String> {
    Proxy::new(
        &context.connection,
        MM_DESTINATION,
        call_path.as_str(),
        MM_CALL_INTERFACE,
    )
    .await
    .map_err(|e| format!("Failed to create call proxy: {e}"))
}

async fn sim_proxy(context: &ModemContext) -> Result<Proxy<'_>, String> {
    let sim_path = context
        .sim_path
        .as_ref()
        .ok_or_else(|| "No SIM object is exposed by the modem".to_string())?;

    Proxy::new(
        &context.connection,
        MM_DESTINATION,
        sim_path.as_str(),
        MM_SIM_INTERFACE,
    )
    .await
    .map_err(|e| format!("Failed to create SIM proxy: {e}"))
}

fn access_technology_label(access_technologies: u32) -> &'static str {
    if access_technologies & MM_ACCESS_TECH_5GNR != 0 {
        return "5G";
    }

    if access_technologies & MM_ACCESS_TECH_LTE != 0 {
        return "LTE";
    }

    if access_technologies
        & (MM_ACCESS_TECH_HSPA_PLUS
            | MM_ACCESS_TECH_HSPA
            | MM_ACCESS_TECH_HSUPA
            | MM_ACCESS_TECH_HSDPA
            | MM_ACCESS_TECH_UMTS)
        != 0
    {
        return "3G";
    }

    if access_technologies
        & (MM_ACCESS_TECH_EDGE
            | MM_ACCESS_TECH_GPRS
            | MM_ACCESS_TECH_GSM_COMPACT
            | MM_ACCESS_TECH_GSM)
        != 0
    {
        return "2G";
    }

    "Unknown"
}

fn signal_percent_to_dbm(quality_percent: u32) -> i32 {
    let clamped = quality_percent.min(100) as f32;
    let dbm = -113.0 + ((clamped / 100.0) * 62.0);
    dbm.round() as i32
}

fn non_empty_string(value: String) -> Option<String> {
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

async fn is_modem_connected(modem_proxy: &Proxy<'_>) -> Result<bool, String> {
    let state: i32 = modem_proxy
        .get_property("State")
        .await
        .map_err(|e| format!("Failed to read modem state: {e}"))?;

    Ok(matches!(
        state,
        MM_MODEM_STATE_REGISTERED | MM_MODEM_STATE_CONNECTING | MM_MODEM_STATE_CONNECTED
    ) || state > MM_MODEM_STATE_REGISTERED)
}

async fn get_registration_state_from_proxy(proxy: &Proxy<'_>) -> Result<String, String> {
    let registration_state: u32 = proxy
        .get_property("RegistrationState")
        .await
        .map_err(|e| format!("Failed to read modem registration state: {e}"))?;

    Ok(registration_state_label(registration_state).to_string())
}

async fn is_roaming_from_proxy(proxy: &Proxy<'_>) -> Result<bool, String> {
    let registration_state: u32 = proxy
        .get_property("RegistrationState")
        .await
        .map_err(|e| format!("Failed to read modem roaming state: {e}"))?;

    Ok(matches!(registration_state, 5 | 7 | 10))
}

async fn get_unlock_required_from_proxy(proxy: &Proxy<'_>) -> Result<u32, String> {
    proxy
        .get_property("UnlockRequired")
        .await
        .map_err(|e| format!("Failed to read modem unlock state: {e}"))
}

async fn get_current_bearer_details_from_proxy(
    context: &ModemContext,
    modem_proxy: &Proxy<'_>,
) -> Result<Option<BearerDetails>, String> {
    let bearers: Vec<OwnedObjectPath> = modem_proxy
        .get_property("Bearers")
        .await
        .map_err(|e| format!("Failed to read modem bearers: {e}"))?;

    if bearers.is_empty() {
        return Ok(None);
    }

    let mut fallback: Option<BearerDetails> = None;

    for bearer_path in bearers {
        let proxy = bearer_proxy(context, &bearer_path).await?;
        let connected: bool = proxy.get_property("Connected").await.unwrap_or(false);
        let interface = proxy.get_property("Interface").await.ok();
        let properties: HashMap<String, OwnedValue> =
            proxy.get_property("Properties").await.unwrap_or_default();
        let details = BearerDetails {
            path: bearer_path.to_string(),
            connected,
            interface,
            apn: extract_bearer_apn(&properties),
        };

        if details.connected {
            return Ok(Some(details));
        }

        if fallback.is_none() {
            fallback = Some(details);
        }
    }

    Ok(fallback)
}

fn extract_bearer_apn(properties: &HashMap<String, OwnedValue>) -> Option<String> {
    properties.get("apn").and_then(owned_value_to_string)
}

fn owned_value_to_string(value: &OwnedValue) -> Option<String> {
    value
        .downcast_ref::<str>()
        .map(ToString::to_string)
        .or_else(|| String::try_from(value.clone()).ok())
}

fn owned_value_to_u32(value: &OwnedValue) -> Option<u32> {
    u32::try_from(value.clone()).ok().or_else(|| {
        i32::try_from(value.clone())
            .ok()
            .map(|value| value.max(0) as u32)
    })
}

fn root_object_path() -> OwnedObjectPath {
    OwnedObjectPath::try_from("/").expect("root object path must always be valid")
}

fn sms_thread_id(number: &str) -> String {
    let trimmed = number.trim();
    if trimmed.is_empty() {
        "unknown".to_string()
    } else {
        trimmed.to_string()
    }
}

fn contact_display_name(name: &str, number: &str) -> String {
    let trimmed_name = name.trim();
    if !trimmed_name.is_empty() {
        trimmed_name.to_string()
    } else {
        number.trim().to_string()
    }
}

fn normalize_phone_lookup(number: &str) -> String {
    let digits: String = number.chars().filter(|ch| ch.is_ascii_digit()).collect();
    if digits.is_empty() {
        number.trim().to_ascii_lowercase()
    } else {
        digits
    }
}

fn phone_numbers_match(left: &str, right: &str) -> bool {
    let left_normalized = normalize_phone_lookup(left);
    let right_normalized = normalize_phone_lookup(right);

    if left_normalized.is_empty() || right_normalized.is_empty() {
        return false;
    }

    if left_normalized == right_normalized {
        return true;
    }

    let (shorter, longer) = if left_normalized.len() <= right_normalized.len() {
        (left_normalized.as_str(), right_normalized.as_str())
    } else {
        (right_normalized.as_str(), left_normalized.as_str())
    };

    shorter.len() >= 7 && longer.ends_with(shorter)
}

fn decode_possible_ucs2(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.len() < 4
        || trimmed.len() % 4 != 0
        || !trimmed.chars().all(|ch| ch.is_ascii_hexdigit())
    {
        return trimmed.to_string();
    }

    let mut code_units = Vec::with_capacity(trimmed.len() / 4);
    for chunk in trimmed.as_bytes().chunks(4) {
        let Ok(chunk_str) = std::str::from_utf8(chunk) else {
            return trimmed.to_string();
        };
        let Ok(code_unit) = u16::from_str_radix(chunk_str, 16) else {
            return trimmed.to_string();
        };
        code_units.push(code_unit);
    }

    String::from_utf16(&code_units).unwrap_or_else(|_| trimmed.to_string())
}

fn extract_quoted_fields(input: &str) -> Vec<String> {
    let mut fields = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;

    for ch in input.chars() {
        match ch {
            '"' => {
                if in_quotes {
                    fields.push(current.clone());
                    current.clear();
                }
                in_quotes = !in_quotes;
            }
            _ if in_quotes => current.push(ch),
            _ => {}
        }
    }

    fields
}

fn parse_cpbs_usage(response: &str) -> Option<(u32, u32)> {
    response.lines().find_map(|line| {
        let trimmed = line.trim();
        if !trimmed.starts_with("+CPBS:") {
            return None;
        }

        let parts: Vec<_> = trimmed.split(',').map(str::trim).collect();
        if parts.len() < 3 {
            return None;
        }

        let used = parts.get(parts.len().saturating_sub(2))?.parse().ok()?;
        let total = parts.last()?.parse().ok()?;
        Some((used, total))
    })
}

fn parse_cpbr_range(response: &str) -> Option<(u32, u32)> {
    response.lines().find_map(|line| {
        let trimmed = line.trim();
        if !trimmed.starts_with("+CPBR:") {
            return None;
        }

        let start_paren = trimmed.find('(')?;
        let end_paren = trimmed[start_paren + 1..].find(')')? + start_paren + 1;
        let range = &trimmed[start_paren + 1..end_paren];
        let (start, end) = range.split_once('-')?;

        Some((start.trim().parse().ok()?, end.trim().parse().ok()?))
    })
}

fn parse_cpbr_entries(response: &str, storage: &str, messages: &[SmsMessage]) -> Vec<SimContact> {
    let mut contacts = Vec::new();

    for line in response.lines() {
        let trimmed = line.trim();
        if !trimmed.starts_with("+CPBR:") {
            continue;
        }

        let Some(payload) = trimmed.split_once(':').map(|(_, value)| value.trim()) else {
            continue;
        };
        let Some((index_part, _)) = payload.split_once(',') else {
            continue;
        };
        let Ok(index) = index_part.trim().parse::<u32>() else {
            continue;
        };

        let quoted_fields = extract_quoted_fields(payload);
        let number = quoted_fields
            .first()
            .cloned()
            .unwrap_or_default()
            .trim()
            .to_string();
        if number.is_empty() {
            continue;
        }

        let raw_name = quoted_fields.get(1).cloned().unwrap_or_default();
        let name = decode_possible_ucs2(&raw_name);
        let last_message = messages
            .iter()
            .filter(|message| phone_numbers_match(&message.peer, &number))
            .max_by(|left, right| {
                left.timestamp
                    .as_deref()
                    .unwrap_or("")
                    .cmp(right.timestamp.as_deref().unwrap_or(""))
                    .then_with(|| left.path.cmp(&right.path))
            })
            .cloned();

        contacts.push(SimContact {
            id: format!("{storage}:{index}"),
            name: contact_display_name(&name, &number),
            number,
            storage: storage.to_string(),
            index,
            last_message,
        });
    }

    contacts
}

async fn find_mbim_device(context: &ModemContext) -> Option<String> {
    let modem = modem_proxy(context).await.ok()?;

    // Ports is an array of (String, u32) where type 5 = MBIM
    let ports: Vec<(String, u32)> = modem.get_property("Ports").await.ok()?;
    for (port_name, port_type) in &ports {
        if *port_type == 5 {
            let device_path = format!("/dev/{port_name}");
            if tokio::fs::metadata(&device_path).await.is_ok() {
                return Some(device_path);
            }
        }
    }

    // Fallback: check common MBIM device paths
    for candidate in &["/dev/cdc-wdm0", "/dev/cdc-wdm1"] {
        if tokio::fs::metadata(candidate).await.is_ok() {
            return Some(candidate.to_string());
        }
    }

    None
}

fn parse_mbimcli_phonebook(output: &str, messages: &[SmsMessage]) -> Vec<SimContact> {
    let mut contacts = Vec::new();
    let mut current_index: Option<u32> = None;
    let mut current_number: Option<String> = None;

    for line in output.lines() {
        let trimmed = line.trim();

        if let Some(rest) = trimmed.strip_prefix("Entry index :") {
            // Flush previous entry
            if let (Some(index), Some(number)) = (current_index, current_number.take()) {
                contacts.push(SimContact {
                    id: format!("SM:{index}"),
                    name: contact_display_name("", &number),
                    number,
                    storage: "SM".to_string(),
                    index,
                    last_message: None,
                });
            }
            current_index = rest.trim().parse().ok();
            current_number = None;
        } else if let Some(rest) = trimmed.strip_prefix("Number:") {
            current_number = Some(rest.trim().to_string());
        } else if let Some(rest) = trimmed.strip_prefix("Name:") {
            let name = rest.trim().to_string();
            if let (Some(index), Some(number)) = (current_index.take(), current_number.take()) {
                if !number.is_empty() {
                    let last_message = messages
                        .iter()
                        .filter(|m| phone_numbers_match(&m.peer, &number))
                        .max_by(|left, right| {
                            left.timestamp
                                .as_deref()
                                .unwrap_or("")
                                .cmp(right.timestamp.as_deref().unwrap_or(""))
                                .then_with(|| left.path.cmp(&right.path))
                        })
                        .cloned();

                    contacts.push(SimContact {
                        id: format!("SM:{index}"),
                        name: contact_display_name(&name, &number),
                        number,
                        storage: "SM".to_string(),
                        index,
                        last_message,
                    });
                }
            }
        }
    }

    // Flush last entry if Name line was missing
    if let (Some(index), Some(number)) = (current_index, current_number) {
        if !number.is_empty() {
            contacts.push(SimContact {
                id: format!("SM:{index}"),
                name: contact_display_name("", &number),
                number,
                storage: "SM".to_string(),
                index,
                last_message: None,
            });
        }
    }

    contacts
}

async fn read_sim_contacts_mbim(
    context: &ModemContext,
    messages: &[SmsMessage],
) -> Result<Vec<SimContact>, String> {
    let device = find_mbim_device(context)
        .await
        .ok_or_else(|| "No MBIM device found for this modem".to_string())?;

    async fn run_mbimcli_via_app(
        device: &str,
        mbim_arg: &str,
    ) -> Result<(bool, String, String), String> {
        let plain = AsyncCommand::new("mbimcli")
            .arg("-d")
            .arg(device)
            .arg("-p")
            .arg(mbim_arg)
            .output()
            .await
            .map_err(|e| format!("Failed to run mbimcli: {e}"))?;

        if plain.status.success() {
            return Ok((
                true,
                String::from_utf8_lossy(&plain.stdout).into_owned(),
                String::new(),
            ));
        }

        // Non-interactive sudo fallback: never prompts in app.
        let sudo = AsyncCommand::new("sudo")
            .arg("-n")
            .arg("mbimcli")
            .arg("-d")
            .arg(device)
            .arg("-p")
            .arg(mbim_arg)
            .output()
            .await
            .map_err(|e| format!("Failed to run sudo mbimcli: {e}"))?;

        if sudo.status.success() {
            return Ok((
                true,
                String::from_utf8_lossy(&sudo.stdout).into_owned(),
                String::new(),
            ));
        }

        let combined_error = format!(
            "Plain mbimcli failed: {} {}\n\
             sudo -n mbimcli failed: {} {}",
            String::from_utf8_lossy(&plain.stderr),
            String::from_utf8_lossy(&plain.stdout),
            String::from_utf8_lossy(&sudo.stderr),
            String::from_utf8_lossy(&sudo.stdout)
        );

        Ok((false, String::new(), combined_error))
    }

    // Query configuration first; on several modems this initializes phonebook state.
    let _ = run_mbimcli_via_app(&device, "--phonebook-query-configuration").await?;

    let (ok_first, stdout_first, err_first) =
        run_mbimcli_via_app(&device, "--phonebook-read-all").await?;

    let contacts_output = if ok_first {
        stdout_first
    } else if err_first.to_ascii_lowercase().contains("notinitialized") {
        // Retry after explicit config query for drivers that lazily initialize phonebook.
        let _ = run_mbimcli_via_app(&device, "--phonebook-query-configuration").await?;
        let (ok_retry, stdout_retry, err_retry) =
            run_mbimcli_via_app(&device, "--phonebook-read-all").await?;

        if ok_retry {
            stdout_retry
        } else {
            return Err(format!(
                "Unable to read SIM contacts via MBIM after automatic retries.\n\
                 First read attempt:\n{err_first}\n\
                 Retry read attempt:\n{err_retry}\n\
                 This app never prompts for password.\n\
                 For fully automatic access, allow non-interactive sudo for mbimcli, e.g.:\n\
                 %plugdev ALL=(root) NOPASSWD: /usr/bin/mbimcli -d /dev/cdc-wdm* -p --phonebook-query-configuration\n\
                 %plugdev ALL=(root) NOPASSWD: /usr/bin/mbimcli -d /dev/cdc-wdm* -p --phonebook-read-all"
            ));
        }
    } else {
        return Err(format!(
            "Unable to read SIM contacts via MBIM.\n\
             {err_first}\n\
             This app never prompts for password.\n\
             For fully automatic access, allow non-interactive sudo for mbimcli, e.g.:\n\
             %plugdev ALL=(root) NOPASSWD: /usr/bin/mbimcli -d /dev/cdc-wdm* -p --phonebook-query-configuration\n\
             %plugdev ALL=(root) NOPASSWD: /usr/bin/mbimcli -d /dev/cdc-wdm* -p --phonebook-read-all"
        ));
    };

    Ok(parse_mbimcli_phonebook(&contacts_output, messages))
}

async fn read_sim_contacts(context: &ModemContext) -> Result<Vec<SimContact>, String> {
    if context.sim_path.is_none() {
        return Err("No SIM object is exposed by the modem".to_string());
    }

    let modem = modem_proxy(context).await?;
    let unlock_required = get_unlock_required_from_proxy(&modem).await.unwrap_or(0);
    // 0 = None, 1 = Unknown, 4 = SIM-PIN2 (not needed for contacts)
    // Only block on SIM-PIN (2) or SIM-PUK (3) which are real blockers
    if matches!(unlock_required, 2 | 3) {
        return Err("SIM must be unlocked before contacts can be read".to_string());
    }

    let messages = list_sms_messages(context).await.unwrap_or_default();

    // Try AT commands first (works on modems with an AT port)
    let at_result = read_sim_contacts_at(context, &messages).await;
    let mut contacts = match at_result {
        Ok(contacts) => contacts,
        Err(_) => {
            // Fall back to MBIM for modems that only expose an MBIM port
            read_sim_contacts_mbim(context, &messages).await?
        }
    };

    contacts.sort_by(|left, right| {
        left.name
            .to_ascii_lowercase()
            .cmp(&right.name.to_ascii_lowercase())
            .then_with(|| left.number.cmp(&right.number))
            .then_with(|| left.index.cmp(&right.index))
    });
    contacts.dedup_by(|left, right| {
        left.name.eq_ignore_ascii_case(&right.name)
            && phone_numbers_match(&left.number, &right.number)
    });

    Ok(contacts)
}

async fn read_sim_contacts_at(
    context: &ModemContext,
    messages: &[SmsMessage],
) -> Result<Vec<SimContact>, String> {
    let storage = "SM";

    modem_command(context, &format!("AT+CPBS=\"{storage}\""), 10)
        .await
        .map_err(|error| {
            format!(
                "Failed to select SIM phonebook storage '{storage}'. The modem may not expose SIM contacts via AT commands: {error}"
            )
        })?;

    let usage_response = modem_command(context, "AT+CPBS?", 10).await?;
    let (used, total) = parse_cpbs_usage(&usage_response).ok_or_else(|| {
        format!("Unable to parse SIM phonebook usage from modem reply: {usage_response}")
    })?;

    if used == 0 || total == 0 {
        return Ok(Vec::new());
    }

    let (range_start, range_end) = match modem_command(context, "AT+CPBR=?", 10).await {
        Ok(range_response) => parse_cpbr_range(&range_response).unwrap_or((1, total.max(used))),
        Err(_) => (1, total.max(used)),
    };

    let mut contacts = Vec::new();
    let mut current = range_start.max(1);
    while current <= range_end {
        let chunk_end = (current + 19).min(range_end);
        let chunk_command = if current == chunk_end {
            format!("AT+CPBR={current}")
        } else {
            format!("AT+CPBR={current},{chunk_end}")
        };

        match modem_command(context, &chunk_command, 20).await {
            Ok(reply) => contacts.extend(parse_cpbr_entries(&reply, storage, messages)),
            Err(_) if current != chunk_end => {
                for index in current..=chunk_end {
                    let single_command = format!("AT+CPBR={index}");
                    if let Ok(reply) = modem_command(context, &single_command, 10).await {
                        contacts.extend(parse_cpbr_entries(&reply, storage, messages));
                    }
                }
            }
            Err(_) => {}
        }

        current = chunk_end.saturating_add(1);
    }

    Ok(contacts)
}

fn sms_state_label(state: u32) -> &'static str {
    match state {
        0 => "Unknown",
        1 => "Stored",
        2 => "Receiving",
        3 => "Received",
        4 => "Sending",
        5 => "Sent",
        _ => "Unknown",
    }
}

fn sms_is_incoming(state: u32) -> bool {
    matches!(state, MM_SMS_STATE_RECEIVED)
}

fn phone_call_direction_label(direction: i32) -> &'static str {
    match direction {
        1 => "Incoming",
        2 => "Outgoing",
        _ => "Unknown",
    }
}

fn phone_call_state_label(state: i32) -> &'static str {
    match state {
        0 => "Unknown",
        1 => "Dialing",
        2 => "Ringing out",
        3 => "Ringing in",
        4 => "Active",
        5 => "Held",
        6 => "Waiting",
        7 => "Terminated",
        _ => "Unknown",
    }
}

fn phone_call_reason_label(reason: u32) -> &'static str {
    match reason {
        0 => "Unknown",
        1 => "Outgoing started",
        2 => "Incoming call",
        3 => "Accepted",
        4 => "Terminated",
        5 => "Busy or refused",
        6 => "Network error",
        7 => "Audio setup failed",
        8 => "Transferred",
        9 => "Deflected",
        _ => "Unknown",
    }
}

fn ussd_state_label(state: u32) -> &'static str {
    match state {
        0 => "Unknown",
        1 => "Idle",
        2 => "Active",
        3 => "User response required",
        _ => "Unknown",
    }
}

fn sanitize_ussd_code(code: &str) -> Result<String, String> {
    let trimmed = code.trim();
    if trimmed.is_empty() {
        return Err("USSD code cannot be empty".to_string());
    }

    if !trimmed
        .chars()
        .all(|ch| ch.is_ascii_digit() || matches!(ch, '*' | '#' | '+'))
    {
        return Err("USSD code contains unsupported characters".to_string());
    }

    Ok(trimmed.to_string())
}

fn sanitize_phone_number(number: &str) -> Result<String, String> {
    let trimmed = number.trim();
    if trimmed.is_empty() {
        return Err("Phone number cannot be empty".to_string());
    }

    if trimmed.chars().any(|ch| {
        ch.is_control()
            || !(ch.is_ascii_digit() || matches!(ch, '+' | '*' | '#' | ' ' | '-' | '(' | ')'))
    }) {
        return Err("Phone number contains unsupported characters".to_string());
    }

    Ok(trimmed.to_string())
}

fn sanitize_dtmf_tones(tones: &str) -> Result<String, String> {
    let trimmed = tones.trim().to_ascii_uppercase();
    if trimmed.is_empty() {
        return Err("DTMF tones cannot be empty".to_string());
    }

    if !trimmed
        .chars()
        .all(|ch| ch.is_ascii_digit() || matches!(ch, 'A' | 'B' | 'C' | 'D' | '*' | '#'))
    {
        return Err("DTMF tones must use 0-9, A-D, * or #".to_string());
    }

    Ok(trimmed)
}

async fn build_ussd_session(
    proxy: &Proxy<'_>,
    code: Option<String>,
    response: Option<String>,
) -> UssdSession {
    let state: u32 = proxy.get_property("State").await.unwrap_or_default();
    let network_request = non_empty_string(
        proxy
            .get_property::<String>("NetworkRequest")
            .await
            .unwrap_or_default(),
    );
    let network_notification = non_empty_string(
        proxy
            .get_property::<String>("NetworkNotification")
            .await
            .unwrap_or_default(),
    );

    UssdSession {
        code,
        response: response.or_else(|| network_request.clone()),
        state: ussd_state_label(state).to_string(),
        network_request,
        network_notification,
    }
}

async fn list_sms_messages(context: &ModemContext) -> Result<Vec<SmsMessage>, String> {
    let messaging = modem_messaging_proxy(context).await?;
    let sms_paths: Vec<OwnedObjectPath> = messaging
        .get_property("Messages")
        .await
        .map_err(|e| format!("Failed to read modem messages: {e}"))?;
    let mut messages = Vec::with_capacity(sms_paths.len());

    for sms_path in sms_paths {
        let proxy = sms_proxy(context, &sms_path).await?;
        let peer = non_empty_string(
            proxy
                .get_property::<String>("Number")
                .await
                .unwrap_or_default(),
        )
        .unwrap_or_else(|| "Unknown".to_string());
        let text = proxy
            .get_property::<String>("Text")
            .await
            .unwrap_or_default();
        let timestamp = non_empty_string(
            proxy
                .get_property::<String>("Timestamp")
                .await
                .unwrap_or_default(),
        );
        let state: u32 = proxy.get_property("State").await.unwrap_or_default();
        let thread_id = sms_thread_id(&peer);

        messages.push(SmsMessage {
            id: sms_path.to_string(),
            thread_id,
            path: sms_path.to_string(),
            peer,
            text,
            timestamp,
            state: sms_state_label(state).to_string(),
            incoming: sms_is_incoming(state),
        });
    }

    messages.sort_by(|left, right| {
        left.timestamp
            .as_deref()
            .unwrap_or("")
            .cmp(right.timestamp.as_deref().unwrap_or(""))
            .then_with(|| left.path.cmp(&right.path))
    });

    Ok(messages)
}

fn modem_lock_label(lock: u32) -> &'static str {
    match lock {
        0 => "Unknown",
        1 => "Unlocked",
        2 => "PIN required",
        3 => "PIN2 required",
        4 => "PUK required",
        5 => "PUK2 required",
        6 => "Service provider PIN required",
        7 => "Service provider PUK required",
        8 => "Network PIN required",
        9 => "Network PUK required",
        10 => "Corporate PIN required",
        11 => "Corporate PUK required",
        12 => "PH-SIM PIN required",
        13 => "PH-FSIM PIN required",
        14 => "PH-FSIM PUK required",
        15 => "SIM PIN required",
        16 => "PH-NETSUB PIN required",
        17 => "PH-NETSUB PUK required",
        18 => "PH-SP PIN required",
        19 => "PH-SP PUK required",
        20 => "PH-CORP PIN required",
        21 => "PH-CORP PUK required",
        _ => "Unknown",
    }
}

async fn get_phone_capabilities_from_context(context: &ModemContext) -> PhoneCapabilities {
    if !context.voice_supported {
        return PhoneCapabilities {
            supported: false,
            emergency_only: false,
            reason: "Voice calling is not exposed by this modem".to_string(),
        };
    }

    let emergency_only = if let Ok(proxy) = modem_voice_proxy(context).await {
        proxy.get_property("EmergencyOnly").await.unwrap_or(false)
    } else {
        false
    };

    PhoneCapabilities {
        supported: true,
        emergency_only,
        reason: if emergency_only {
            "Voice calling exposed, emergency-only mode".to_string()
        } else {
            "Voice calling exposed by modem".to_string()
        },
    }
}

fn summarize_audio_format(properties: &HashMap<String, OwnedValue>) -> Option<String> {
    let encoding = properties.get("encoding").and_then(owned_value_to_string);
    let resolution = properties.get("resolution").and_then(owned_value_to_string);
    let rate = properties
        .get("rate")
        .and_then(owned_value_to_u32)
        .map(|value| format!("{value} Hz"));

    let mut parts = Vec::new();
    if let Some(encoding) = encoding {
        parts.push(encoding);
    }
    if let Some(resolution) = resolution {
        parts.push(resolution);
    }
    if let Some(rate) = rate {
        parts.push(rate);
    }

    (!parts.is_empty()).then(|| parts.join(" / "))
}

async fn get_phone_call_from_path(
    context: &ModemContext,
    call_path: &OwnedObjectPath,
) -> Result<PhoneCall, String> {
    let proxy = call_proxy(context, call_path).await?;
    let number = non_empty_string(
        proxy
            .get_property::<String>("Number")
            .await
            .unwrap_or_default(),
    );
    let state: i32 = proxy.get_property("State").await.unwrap_or_default();
    let state_reason: u32 = proxy.get_property("StateReason").await.unwrap_or_default();
    let direction: i32 = proxy.get_property("Direction").await.unwrap_or_default();
    let multiparty: bool = proxy.get_property("Multiparty").await.unwrap_or(false);
    let audio_port = non_empty_string(
        proxy
            .get_property::<String>("AudioPort")
            .await
            .unwrap_or_default(),
    );
    let audio_format: HashMap<String, OwnedValue> =
        proxy.get_property("AudioFormat").await.unwrap_or_default();

    Ok(PhoneCall {
        path: call_path.to_string(),
        number,
        state: phone_call_state_label(state).to_string(),
        state_reason: phone_call_reason_label(state_reason).to_string(),
        direction: phone_call_direction_label(direction).to_string(),
        multiparty,
        audio_port,
        audio_format: summarize_audio_format(&audio_format),
    })
}

fn phone_call_rank(call: &PhoneCall) -> u8 {
    match call.state.as_str() {
        "Active" => 0,
        "Ringing in" => 1,
        "Waiting" => 2,
        "Dialing" => 3,
        "Ringing out" => 4,
        "Held" => 5,
        "Terminated" => 7,
        _ => 6,
    }
}

async fn get_phone_status_from_context(context: &ModemContext) -> Result<PhoneStatus, String> {
    let capabilities = get_phone_capabilities_from_context(context).await;
    if !capabilities.supported {
        return Ok(PhoneStatus {
            capabilities,
            current_call: None,
            call_count: 0,
        });
    }

    let voice = modem_voice_proxy(context).await?;
    let call_paths: Vec<OwnedObjectPath> = voice.get_property("Calls").await.unwrap_or_default();
    let mut calls = Vec::with_capacity(call_paths.len());

    for call_path in call_paths {
        if let Ok(call) = get_phone_call_from_path(context, &call_path).await {
            calls.push(call);
        }
    }

    let call_count = calls.len();
    calls.sort_by_key(phone_call_rank);
    let current_call = calls.into_iter().next();

    Ok(PhoneStatus {
        capabilities,
        current_call,
        call_count,
    })
}

async fn get_primary_call_path(
    context: &ModemContext,
    allowed_states: &[&str],
) -> Result<OwnedObjectPath, String> {
    let voice = modem_voice_proxy(context).await?;
    let call_paths: Vec<OwnedObjectPath> = voice.get_property("Calls").await.unwrap_or_default();

    for call_path in call_paths {
        let call = get_phone_call_from_path(context, &call_path).await?;
        if allowed_states.contains(&call.state.as_str()) {
            return Ok(call_path);
        }
    }

    Err("No matching call is available".to_string())
}

fn registration_state_label(state: u32) -> &'static str {
    match state {
        0 => "Idle",
        1 => "Home",
        2 => "Searching",
        3 => "Denied",
        4 => "Unknown",
        5 => "Roaming",
        6 => "Home SMS only",
        7 => "Roaming SMS only",
        8 => "Emergency only",
        9 => "Home CSFB not preferred",
        10 => "Roaming CSFB not preferred",
        _ => "Unknown",
    }
}

/// Get all modem data at once
pub async fn get_all_modem_data() -> Result<ModemData, String> {
    let connected = get_connection_status().await.unwrap_or(false);
    let radio_tech = get_radio_tech()
        .await
        .unwrap_or_else(|_| "Unknown".to_string());
    let signal_strength = get_signal_strength().await.ok();
    let operator_name = get_operator_name()
        .await
        .unwrap_or_else(|_| "Unavailable".to_string());
    let sim_management = get_sim_management().await.unwrap_or(SimManagement {
        present: false,
        iccid: None,
        imsi: None,
        pin_lock_state: "Unavailable".to_string(),
        unlock_required: false,
    });
    let sim_info = get_sim_info()
        .await
        .unwrap_or_else(|_| "Unavailable".to_string());
    let phone_capabilities = if let Ok(context) = connect_to_modem().await {
        get_phone_capabilities_from_context(&context).await
    } else {
        PhoneCapabilities {
            supported: false,
            emergency_only: false,
            reason: "Voice calling unavailable".to_string(),
        }
    };

    Ok(ModemData {
        connected,
        radio_tech,
        signal_strength,
        operator_name,
        sim_info,
        sim_management,
        phone_capabilities,
    })
}

pub async fn get_network_controls() -> Result<NetworkControls, String> {
    let context = connect_to_modem().await?;
    let modem = modem_proxy(&context).await?;
    let modem_3gpp = modem_3gpp_proxy(&context).await?;
    let unlock_required = get_unlock_required_from_proxy(&modem).await.unwrap_or(0);
    let sim_management = if context.sim_path.is_some() {
        let sim = sim_proxy(&context).await?;
        SimManagement {
            present: true,
            iccid: non_empty_string(
                sim.get_property::<String>("SimIdentifier")
                    .await
                    .unwrap_or_default(),
            ),
            imsi: non_empty_string(sim.get_property::<String>("Imsi").await.unwrap_or_default()),
            pin_lock_state: modem_lock_label(unlock_required).to_string(),
            unlock_required: !matches!(unlock_required, 0 | 1),
        }
    } else {
        SimManagement {
            present: false,
            iccid: None,
            imsi: None,
            pin_lock_state: "Absent".to_string(),
            unlock_required: false,
        }
    };

    let connected = is_modem_connected(&modem).await?;
    let registration_state = get_registration_state_from_proxy(&modem_3gpp).await?;
    let roaming = is_roaming_from_proxy(&modem_3gpp).await?;
    let bearer = get_current_bearer_details_from_proxy(&context, &modem).await?;

    Ok(NetworkControls {
        connected,
        registration_state,
        roaming,
        bearer,
        sim_management,
    })
}

pub async fn connect_network(apn: Option<String>) -> Result<String, String> {
    let context = connect_to_modem().await?;
    let proxy = modem_simple_proxy(&context).await?;
    let mut settings: HashMap<String, OwnedValue> = HashMap::new();

    if let Some(apn) = apn.filter(|value| !value.trim().is_empty()) {
        settings.insert(
            "apn".to_string(),
            OwnedValue::from(zbus::zvariant::Value::from(apn.as_str())),
        );
    }

    let bearer_path: OwnedObjectPath = proxy
        .call("Connect", &(settings,))
        .await
        .map_err(|e| format!("Failed to connect modem bearer: {e}"))?;

    Ok(bearer_path.to_string())
}

pub async fn disconnect_network() -> Result<(), String> {
    let context = connect_to_modem().await?;
    let proxy = modem_simple_proxy(&context).await?;
    let all_bearers_path = root_object_path();

    proxy
        .call::<_, _, ()>("Disconnect", &(all_bearers_path,))
        .await
        .map_err(|e| format!("Failed to disconnect modem bearer: {e}"))
}

pub async fn get_registration_state() -> Result<String, String> {
    let context = connect_to_modem().await?;
    let proxy = modem_3gpp_proxy(&context).await?;

    get_registration_state_from_proxy(&proxy).await
}

pub async fn get_roaming_state() -> Result<bool, String> {
    let context = connect_to_modem().await?;
    let proxy = modem_3gpp_proxy(&context).await?;

    is_roaming_from_proxy(&proxy).await
}

pub async fn get_current_bearer_details() -> Result<Option<BearerDetails>, String> {
    let context = connect_to_modem().await?;
    let proxy = modem_proxy(&context).await?;

    get_current_bearer_details_from_proxy(&context, &proxy).await
}

pub async fn get_phone_status() -> Result<PhoneStatus, String> {
    let context = connect_to_modem().await?;
    get_phone_status_from_context(&context).await
}

pub async fn start_phone_call(number: String) -> Result<PhoneStatus, String> {
    let number = sanitize_phone_number(&number)?;
    let context = connect_to_modem().await?;
    let voice = modem_voice_proxy(&context).await?;
    let mut properties: HashMap<String, OwnedValue> = HashMap::new();
    properties.insert(
        "number".to_string(),
        OwnedValue::from(zbus::zvariant::Value::from(number.as_str())),
    );

    let call_path: OwnedObjectPath = voice
        .call("CreateCall", &(properties,))
        .await
        .map_err(|e| format!("Failed to create voice call: {e}"))?;
    let call = call_proxy(&context, &call_path).await?;
    call.call::<_, _, ()>("Start", &())
        .await
        .map_err(|e| format!("Failed to start voice call: {e}"))?;

    get_phone_status_from_context(&context).await
}

pub async fn answer_phone_call() -> Result<PhoneStatus, String> {
    let context = connect_to_modem().await?;
    let call_path = get_primary_call_path(&context, &["Ringing in", "Waiting"]).await?;
    let call = call_proxy(&context, &call_path).await?;
    call.call::<_, _, ()>("Accept", &())
        .await
        .map_err(|e| format!("Failed to answer call: {e}"))?;

    get_phone_status_from_context(&context).await
}

pub async fn hangup_phone_call() -> Result<PhoneStatus, String> {
    let context = connect_to_modem().await?;
    let voice = modem_voice_proxy(&context).await?;
    voice
        .call::<_, _, ()>("HangupAll", &())
        .await
        .map_err(|e| format!("Failed to hang up call: {e}"))?;

    get_phone_status_from_context(&context).await
}

pub async fn send_phone_dtmf(tones: String) -> Result<PhoneStatus, String> {
    let tones = sanitize_dtmf_tones(&tones)?;
    let context = connect_to_modem().await?;
    let call_path = get_primary_call_path(&context, &["Active"]).await?;
    let call = call_proxy(&context, &call_path).await?;
    call.call::<_, _, ()>("SendDtmf", &(tones.as_str(),))
        .await
        .map_err(|e| format!("Failed to send DTMF tones: {e}"))?;

    get_phone_status_from_context(&context).await
}

pub async fn get_sms_threads() -> Result<Vec<SmsThread>, String> {
    let context = connect_to_modem().await?;
    let messages = list_sms_messages(&context).await?;
    let mut threads: HashMap<String, SmsThread> = HashMap::new();

    for message in messages {
        let entry = threads
            .entry(message.thread_id.clone())
            .or_insert_with(|| SmsThread {
                id: message.thread_id.clone(),
                peer: message.peer.clone(),
                message_count: 0,
                last_message: None,
            });

        entry.message_count += 1;
        if entry
            .last_message
            .as_ref()
            .and_then(|current| current.timestamp.as_deref())
            <= message.timestamp.as_deref()
        {
            entry.last_message = Some(message);
        }
    }

    let mut threads: Vec<SmsThread> = threads.into_values().collect();
    threads.sort_by(|left, right| {
        right
            .last_message
            .as_ref()
            .and_then(|message| message.timestamp.as_deref())
            .unwrap_or("")
            .cmp(
                &left
                    .last_message
                    .as_ref()
                    .and_then(|message| message.timestamp.as_deref())
                    .unwrap_or(""),
            )
            .then_with(|| left.peer.cmp(&right.peer))
    });

    Ok(threads)
}

pub async fn get_sim_contacts() -> Result<Vec<SimContact>, String> {
    let context = connect_to_modem().await?;
    read_sim_contacts(&context).await
}

pub async fn get_sms_conversation(thread_id: String) -> Result<Vec<SmsMessage>, String> {
    let context = connect_to_modem().await?;
    let thread_id = sms_thread_id(&thread_id);
    let messages = list_sms_messages(&context).await?;

    Ok(messages
        .into_iter()
        .filter(|message| message.thread_id == thread_id)
        .collect())
}

pub async fn send_sms(number: String, text: String) -> Result<SmsMessage, String> {
    let number = number.trim().to_string();
    let text = text.trim().to_string();
    if number.is_empty() {
        return Err("SMS number cannot be empty".to_string());
    }
    if text.is_empty() {
        return Err("SMS text cannot be empty".to_string());
    }

    let context = connect_to_modem().await?;
    let messaging = modem_messaging_proxy(&context).await?;
    let mut properties: HashMap<String, OwnedValue> = HashMap::new();
    properties.insert(
        "number".to_string(),
        OwnedValue::from(zbus::zvariant::Value::from(number.as_str())),
    );
    properties.insert(
        "text".to_string(),
        OwnedValue::from(zbus::zvariant::Value::from(text.as_str())),
    );

    let sms_path: OwnedObjectPath = messaging
        .call("Create", &(properties,))
        .await
        .map_err(|e| format!("Failed to create SMS: {e}"))?;
    let sms = sms_proxy(&context, &sms_path).await?;
    sms.call::<_, _, ()>("Send", &())
        .await
        .map_err(|e| format!("Failed to send SMS: {e}"))?;

    let timestamp = non_empty_string(
        sms.get_property::<String>("Timestamp")
            .await
            .unwrap_or_default(),
    );
    let state: u32 = sms.get_property("State").await.unwrap_or(MM_SMS_STATE_SENT);

    Ok(SmsMessage {
        id: sms_path.to_string(),
        thread_id: sms_thread_id(&number),
        path: sms_path.to_string(),
        peer: number,
        text,
        timestamp,
        state: sms_state_label(state).to_string(),
        incoming: sms_is_incoming(state),
    })
}

pub async fn get_ussd_status() -> Result<UssdSession, String> {
    let context = connect_to_modem().await?;
    let proxy = modem_ussd_proxy(&context).await?;

    Ok(build_ussd_session(&proxy, None, None).await)
}

pub async fn initiate_ussd(code: String) -> Result<UssdSession, String> {
    let code = sanitize_ussd_code(&code)?;
    let context = connect_to_modem().await?;
    let proxy = modem_ussd_proxy(&context).await?;

    // Cancel any existing active session before initiating a new one
    let state: u32 = proxy.get_property("State").await.unwrap_or_default();
    if state != 0 && state != 1 {
        let _ = proxy.call::<_, _, ()>("Cancel", &()).await;
    }

    let response: String = proxy
        .call("Initiate", &(code.as_str(),))
        .await
        .map_err(|e| format!("Failed to execute USSD request: {e}"))?;

    Ok(build_ussd_session(&proxy, Some(code), non_empty_string(response)).await)
}

pub async fn respond_to_ussd(response: String) -> Result<UssdSession, String> {
    let response = sanitize_ussd_code(&response)?;
    let context = connect_to_modem().await?;
    let proxy = modem_ussd_proxy(&context).await?;
    let reply: String = proxy
        .call("Respond", &(response.as_str(),))
        .await
        .map_err(|e| format!("Failed to send USSD response: {e}"))?;

    Ok(build_ussd_session(&proxy, None, non_empty_string(reply)).await)
}

pub async fn cancel_ussd() -> Result<(), String> {
    let context = connect_to_modem().await?;
    let proxy = modem_ussd_proxy(&context).await?;

    let state: u32 = proxy.get_property("State").await.unwrap_or_default();
    // MMModem3gppUssdSessionState: Unknown(0), Idle(1), Active(2), UserResponse(3)
    // If already idle/unknown, cancellation is effectively complete.
    if state <= 1 {
        return Ok(());
    }

    match proxy.call::<_, _, ()>("Cancel", &()).await {
        Ok(()) => Ok(()),
        Err(error) => {
            let message = error.to_string();
            if is_benign_ussd_cancel_error(&message) {
                Ok(())
            } else {
                Err(format!("Failed to cancel USSD session: {message}"))
            }
        }
    }
}

fn is_benign_ussd_cancel_error(message: &str) -> bool {
    let normalized = message.to_lowercase();

    normalized.contains("phonefailure")
        || normalized.contains("mbim status error: failure")
        || normalized.contains("no active")
        || normalized.contains("unknown session")
        || normalized.contains("not active")
}

// TODO: Add operator and scan tools: current operator code/name, network scan
// results, and manual operator selection when supported.
// TODO: Add diagnostics: modem path, IMEI, access technology bitmask, signal
// quality percent, and raw errors for hardware debugging.
// TODO: Recommended build order:
// 1. Finish topbar realism.
// 2. Build a Network panel.
// 3. Build SIM details and PIN handling.
// 4. Replace SMS mock data.
// 5. Add USSD.
// TODO: Rationale: the topbar improves trust immediately, Network and SIM
// controls are core to the app, and SMS/USSD depend on broader device capability
// and more D-Bus surface area.
