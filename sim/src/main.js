function normalizeRadioTech(tech) {
  const allowed = new Set(["2G", "3G", "4G", "5G", "LTE"]);
  const upper = (tech || "LTE").toUpperCase();
  return allowed.has(upper) ? upper : "LTE";
}

function setInternetStatus({ connected, radioTech }) {
  const linkStateEl = document.querySelector("#internet-link-state");
  const radioTechEl = document.querySelector("#internet-radio-tech");

  if (!linkStateEl || !radioTechEl) {
    return;
  }

  const isConnected = Boolean(connected);
  linkStateEl.textContent = isConnected ? "Connected" : "Disconnected";
  linkStateEl.classList.toggle("pill-connected", isConnected);
  linkStateEl.classList.toggle("pill-disconnected", !isConnected);

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
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return -105;
  }

  return Math.round(parsed);
}

function getSignalLevel(dbm) {
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

  signalDbEl.textContent = `${normalizedDbm} dBm`;
  signalStrengthEl.textContent = signalLevel.label;
  signalIconEl.src = SIGNAL_ICONS[signalLevel.label.toLowerCase()] ?? SIGNAL_ICONS.none;
  signalIconEl.alt = `Signal: ${signalLevel.label}`;
}

window.addEventListener("DOMContentLoaded", () => {
  // Placeholder values until status is fetched from modem/SIM backend.
  setInternetStatus({ connected: false, radioTech: "LTE" });
  setNetworkProvider("No Network");
  setNetworkSignal(-105);
});
