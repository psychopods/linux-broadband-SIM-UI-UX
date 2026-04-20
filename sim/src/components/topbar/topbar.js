import { checkAppUpdate, checkRuntimePermissions, getAppMetadata, installAppUpdate } from "../../tauri-api.js";

let topbarInitialized = false;

function normalizeRadioTech(tech) {
  const allowed = new Set(["2G", "3G", "4G", "5G", "LTE", "UNKNOWN"]);
  const upper = (tech || "Unknown").toUpperCase();
  return allowed.has(upper) ? upper : "Unknown";
}

function setInternetLoadingState(linkStateEl, label, className) {
  if (!linkStateEl) {
    return;
  }

  linkStateEl.textContent = label;
  linkStateEl.classList.remove("pill-connected", "pill-disconnected", "pill-pending");
  linkStateEl.classList.add(className);
}

function setInternetStatus({ connected, radioTech }) {
  const linkStateEl = document.querySelector("#internet-link-state");
  const radioTechEl = document.querySelector("#internet-radio-tech");

  if (!linkStateEl || !radioTechEl) {
    return;
  }

  const isConnected = Boolean(connected);
  setInternetLoadingState(
    linkStateEl,
    isConnected ? "Connected" : "Disconnected",
    isConnected ? "pill-connected" : "pill-disconnected"
  );
  radioTechEl.textContent = normalizeRadioTech(radioTech);
}

function setNetworkProvider(providerName) {
  const providerEl = document.querySelector("#network-provider-name");

  if (!providerEl) {
    return;
  }

  const name = (providerName || "").trim();
  providerEl.textContent = name.length > 0 ? name : "No Network";
}

function normalizeDbm(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return Math.round(parsed);
}

function getSignalLevel(dbm) {
  if (dbm === null) {
    return { label: "Unknown" };
  }

  if (dbm >= -85) {
    return { label: "High" };
  }

  if (dbm >= -100) {
    return { label: "Mid" };
  }

  if (dbm >= -110) {
    return { label: "Low" };
  }

  return { label: "None" };
}

const SIGNAL_ICONS = {
  none: "/assets/icons/signal-none.png",
  low:  "/assets/icons/signal-low.png",
  mid:  "/assets/icons/signal-mid.png",
  high: "/assets/icons/signal-high.png",
};

function setNetworkSignal(dbm) {
  const signalDbEl = document.querySelector("#network-signal-db");
  const signalStrengthEl = document.querySelector("#network-signal-strength");
  const signalIconEl = document.querySelector("#network-signal-icon");

  if (!signalDbEl || !signalStrengthEl || !signalIconEl) {
    return;
  }

  const normalizedDbm = normalizeDbm(dbm);
  const signalLevel = getSignalLevel(normalizedDbm);

  signalDbEl.textContent = normalizedDbm === null ? "-- dBm" : `${normalizedDbm} dBm`;
  signalStrengthEl.textContent = signalLevel.label;
  signalIconEl.src = SIGNAL_ICONS[signalLevel.label.toLowerCase()] ?? SIGNAL_ICONS.none;
  signalIconEl.alt = `Signal: ${signalLevel.label}`;
}

function setSimInfo(simInfo) {
  const simInfoEl = document.querySelector("#sim-info-value");

  if (!simInfoEl) {
    return;
  }

  const normalized = (simInfo || "").trim();
  simInfoEl.textContent = normalized.length > 0 ? normalized : "Unavailable";
}

function setTopbarLoading() {
  const radioTechEl = document.querySelector("#internet-radio-tech");
  const providerEl = document.querySelector("#network-provider-name");

  setInternetLoadingState(
    document.querySelector("#internet-link-state"),
    "Loading",
    "pill-pending"
  );

  if (radioTechEl) {
    radioTechEl.textContent = "Unknown";
  }

  if (providerEl) {
    providerEl.textContent = "Loading...";
  }

  setNetworkSignal(null);
  setSimInfo("Loading...");
}

function setTopbarUnavailable() {
  const radioTechEl = document.querySelector("#internet-radio-tech");
  const providerEl = document.querySelector("#network-provider-name");

  setInternetLoadingState(
    document.querySelector("#internet-link-state"),
    "Unavailable",
    "pill-disconnected"
  );

  if (radioTechEl) {
    radioTechEl.textContent = "Unknown";
  }

  if (providerEl) {
    providerEl.textContent = "Unavailable";
  }

  setNetworkSignal(null);
  setSimInfo("Unavailable");
}

async function refreshSettingsMeta() {
  const metaEl = document.querySelector("#settings-meta");
  if (!metaEl) {
    return;
  }

  const update = await checkAppUpdate();
  if (update.update_available) {
    metaEl.textContent = `Update ${update.latest_version || "available"}`;
    return;
  }

  const metadata = await getAppMetadata();
  metaEl.textContent = metadata?.version ? `v${metadata.version}` : "About & updates";
}

async function handleSettingsClick() {
  const metadata = await getAppMetadata();
  const update = await checkAppUpdate();
  const permissions = await checkRuntimePermissions();

  const title = metadata?.product_name || "SIM Broadband Manager";
  const version = metadata?.version || update.current_version || "unknown";
  const description = metadata?.description || "No description available";
  const permissionHint = permissions.ready_for_appimage_modem_access
    ? "Modem permissions look ready for AppImage use."
    : permissions.recommendation || "Modem permissions may require dialout membership.";

  if (update.update_available) {
    const body = update.body ? `\n\nRelease notes:\n${update.body}` : "";
    const configuredHint = update.configured
      ? "Choose OK to download and install the update now."
      : "Updater is not fully configured in this build, so install is unavailable.";

    if (
      update.configured &&
      window.confirm(
        `${title}\nVersion: ${version}\nLatest: ${update.latest_version || "newer version"}\n\n${description}\n\n${permissionHint}${body}\n\n${configuredHint}`
      )
    ) {
      const button = document.querySelector("#settings-button");
      const metaEl = document.querySelector("#settings-meta");
      if (button) {
        button.disabled = true;
      }
      if (metaEl) {
        metaEl.textContent = "Installing update...";
      }

      try {
        await installAppUpdate();
      } catch (error) {
        window.alert(`Update failed: ${error}`);
        if (button) {
          button.disabled = false;
        }
        await refreshSettingsMeta();
      }
      return;
    }

    window.alert(
      `${title}\nVersion: ${version}\nLatest: ${update.latest_version || "newer version"}\n\n${description}\n\n${permissionHint}${body}\n\n${configuredHint}`
    );
    return;
  }

  const note = update.note ? `\n\nUpdate status: ${update.note}` : "";
  window.alert(`${title}\nVersion: ${version}\n\n${description}\n\n${permissionHint}${note}`);
}

function initTopbar() {
  if (topbarInitialized) {
    return;
  }

  topbarInitialized = true;

  const settingsButton = document.querySelector("#settings-button");
  settingsButton?.addEventListener("click", () => {
    void handleSettingsClick();
  });

  void refreshSettingsMeta();
}

export {
  initTopbar,
  setInternetStatus,
  setNetworkProvider,
  setNetworkSignal,
  setSimInfo,
  setTopbarLoading,
  setTopbarUnavailable,
};
