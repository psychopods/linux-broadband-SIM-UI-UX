// tauri-api.js - Wrapper for Tauri modem commands
// This project serves static files directly, so use the global Tauri bridge.

function getInvoke() {
  const invoke = window.__TAURI__?.core?.invoke;

  if (typeof invoke !== "function") {
    throw new Error("Tauri invoke API is unavailable");
  }

  return invoke;
}

/**
 * Get all modem data at once
 * @returns {Promise<{connected: boolean, radio_tech: string, signal_strength: number | null, operator_name: string, sim_info: string} | null>}
 */
export async function getModemData() {
  try {
    return await getInvoke()("get_modem_data");
  } catch (error) {
    console.error("Failed to get modem data:", error);
    return null;
  }
}

/**
 * Get radio technology (2G/3G/4G/5G)
 * @returns {Promise<string>}
 */
export async function getRadioTechnology() {
  try {
    return await getInvoke()("get_radio_technology");
  } catch (error) {
    console.error("Failed to get radio technology:", error);
    return "Unknown";
  }
}

/**
 * Get signal strength in dBm
 * @returns {Promise<number>}
 */
export async function getSignalStrength() {
  try {
    return await getInvoke()("get_signal");
  } catch (error) {
    console.error("Failed to get signal strength:", error);
    return -105;
  }
}

/**
 * Get operator/carrier name
 * @returns {Promise<string>}
 */
export async function getOperatorName() {
  try {
    return await getInvoke()("get_operator");
  } catch (error) {
    console.error("Failed to get operator name:", error);
    return "Unavailable";
  }
}

/**
 * Get connection status (connected or not)
 * @returns {Promise<boolean>}
 */
export async function getConnectionStatus() {
  try {
    return await getInvoke()("get_connection");
  } catch (error) {
    console.error("Failed to get connection status:", error);
    return false;
  }
}

/**
 * Get SIM information (ICCID or IMSI)
 * @returns {Promise<string>}
 */
export async function getSimInfo() {
  try {
    return await getInvoke()("get_sim");
  } catch (error) {
    console.error("Failed to get SIM info:", error);
    return "Unavailable";
  }
}

/**
 * Get network controls data
 * @returns {Promise<{connected: boolean, registration_state: string, roaming: boolean, bearer: {path: string, connected: boolean, interface: string | null, apn: string | null} | null} | null>}
 */
export async function getNetworkControls() {
  try {
    return await getInvoke()("get_network_status");
  } catch (error) {
    console.error("Failed to get network controls:", error);
    return null;
  }
}

export async function connectModem(apn) {
  return await getInvoke()("connect_modem", {
    apn: typeof apn === "string" && apn.trim().length > 0 ? apn.trim() : null,
  });
}

export async function disconnectModem() {
  return await getInvoke()("disconnect_modem");
}

/**
 * Fetch and update all topbar widgets with real data
 * This is the main entry point for hydrating the UI with backend data
 */
export async function updateAllModemData() {
  const { setInternetStatus, setNetworkProvider, setNetworkSignal, setSimInfo, setTopbarUnavailable } = await import(
    "./components/topbar/topbar.js"
  );
  const { renderNetworkControls, setNetworkPanelUnavailable } = await import(
    "./components/network/network.js"
  );

  try {
    const modemData = await getModemData();
    const networkControls = await getNetworkControls();

    if (!modemData) {
      setTopbarUnavailable();
      setNetworkPanelUnavailable();
      return;
    }

    setInternetStatus({
      connected: modemData.connected,
      radioTech: modemData.radio_tech,
    });

    setNetworkProvider(modemData.operator_name);
    setNetworkSignal(modemData.signal_strength);
    setSimInfo(modemData.sim_info);
    renderNetworkControls(networkControls);

    console.log("Updated UI with real modem data:", modemData, networkControls);
  } catch (error) {
    console.error("Failed to update modem data:", error);
    setTopbarUnavailable();
    setNetworkPanelUnavailable();
  }
}

/**
 * Poll modem data at regular intervals
 * @param {number} intervalMs - Polling interval in milliseconds (default: 5000)
 */
export function startModemPolling(intervalMs = 5000) {
  // Initial fetch
  updateAllModemData();

  // Set up polling
  const pollInterval = setInterval(() => {
    updateAllModemData();
  }, intervalMs);

  // Return cleanup function
  return () => clearInterval(pollInterval);
}
