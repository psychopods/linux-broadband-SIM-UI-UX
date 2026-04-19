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

export {
  setInternetStatus,
  setNetworkProvider,
  setNetworkSignal,
  setSimInfo,
  setTopbarLoading,
  setTopbarUnavailable,
};
