use std::collections::HashMap;

use serde::{Deserialize, Serialize};
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
const MM_MODEM_USSD_INTERFACE: &str = "org.freedesktop.ModemManager1.Modem.Modem3gpp.Ussd";
const MM_MODEM_MESSAGING_INTERFACE: &str = "org.freedesktop.ModemManager1.Modem.Messaging";
const MM_BEARER_INTERFACE: &str = "org.freedesktop.ModemManager1.Bearer";
const MM_SIM_INTERFACE: &str = "org.freedesktop.ModemManager1.Sim";
const MM_SMS_INTERFACE: &str = "org.freedesktop.ModemManager1.Sms";

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
pub struct UssdShortcut {
    pub label: String,
    pub code: String,
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

fn ussd_state_label(state: u32) -> &'static str {
    match state {
        0 => "Unknown",
        1 => "Idle",
        2 => "Active",
        3 => "User response required",
        _ => "Unknown",
    }
}

fn default_ussd_shortcuts() -> Vec<UssdShortcut> {
    vec![
        UssdShortcut {
            label: "Balance".to_string(),
            code: "*100#".to_string(),
        },
        UssdShortcut {
            label: "Data".to_string(),
            code: "*131#".to_string(),
        },
        UssdShortcut {
            label: "Airtime".to_string(),
            code: "*124#".to_string(),
        },
    ]
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

    Ok(ModemData {
        connected,
        radio_tech,
        signal_strength,
        operator_name,
        sim_info,
        sim_management,
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

pub fn get_ussd_shortcuts() -> Vec<UssdShortcut> {
    default_ussd_shortcuts()
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

    proxy
        .call::<_, _, ()>("Cancel", &())
        .await
        .map_err(|e| format!("Failed to cancel USSD session: {e}"))
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
