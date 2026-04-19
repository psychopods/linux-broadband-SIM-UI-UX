use serde::{Deserialize, Serialize};
use zbus::{fdo::ObjectManagerProxy, zvariant::OwnedObjectPath, Connection, Proxy};

const MM_DESTINATION: &str = "org.freedesktop.ModemManager1";
const MM_MANAGER_PATH: &str = "/org/freedesktop/ModemManager1";
const MM_MODEM_INTERFACE: &str = "org.freedesktop.ModemManager1.Modem";
const MM_MODEM_3GPP_INTERFACE: &str = "org.freedesktop.ModemManager1.Modem.Modem3gpp";
const MM_SIM_INTERFACE: &str = "org.freedesktop.ModemManager1.Sim";

const MM_MODEM_STATE_REGISTERED: i32 = 8;
const MM_MODEM_STATE_CONNECTING: i32 = 10;
const MM_MODEM_STATE_CONNECTED: i32 = 11;

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
    let (quality_percent, _recent): (u32, bool) = modem_proxy
        .get_property("SignalQuality")
        .await
        .map_err(|e| format!("Failed to read modem signal quality: {e}"))?;

    Ok(signal_percent_to_dbm(quality_percent))
}

/// Get mobile operator/carrier name
pub async fn get_operator_name() -> Result<String, String> {
    let context = connect_to_modem().await?;
    let proxy = modem_3gpp_proxy(&context).await?;
    let operator_name: String = proxy
        .get_property("OperatorName")
        .await
        .unwrap_or_default();

    if !operator_name.trim().is_empty() {
        return Ok(operator_name);
    }

    let operator_code: String = proxy
        .get_property("OperatorCode")
        .await
        .unwrap_or_default();

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
    let context = connect_to_modem().await?;
    let proxy = sim_proxy(&context).await?;

    let sim_identifier: String = proxy
        .get_property("SimIdentifier")
        .await
        .unwrap_or_default();

    if !sim_identifier.trim().is_empty() {
        return Ok(sim_identifier);
    }

    let imsi: String = proxy.get_property("Imsi").await.unwrap_or_default();

    if imsi.trim().is_empty() {
        Err("SIM present but no identifier could be read".to_string())
    } else {
        Ok(imsi)
    }
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
    let sim_info = get_sim_info()
        .await
        .unwrap_or_else(|_| "Unavailable".to_string());

    Ok(ModemData {
        connected,
        radio_tech,
        signal_strength,
        operator_name,
        sim_info,
    })
}

//TODO:
// Add connect/disconnect, registration state, roaming state, and current bearer/APN details.
// SIM management
// Show SIM present/absent, ICCID/IMSI, PIN lock state, and PIN unlock flow.
// SMS real data
// Read messages from ModemManager or the modem messaging interface, list threads, open a conversation, and send SMS for real.
// USSD
// Add a dialpad and execute USSD requests like balance checks.
// Operator and scan tools
// Show current operator code/name, network scan results, and manual operator selection if your modem supports it.
// Diagnostics
// Expose modem path, IMEI, access technology bitmask, signal quality percent, and raw errors so debugging hardware issues is easier.
// Recommended build order

// Finish topbar realism
// Build a Network panel
// Build SIM details and PIN handling
// Replace SMS mock data
// Add USSD
// Why that order

// Topbar gives instant trust.
// Network and SIM controls are the core of a “SIM control” app.
// SMS and USSD are valuable, but they depend more on device capability and more D-Bus surface area.

