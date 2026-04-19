import { connectModem, disconnectModem } from "../../tauri-api.js";

function setText(selector, value, fallback = "--") {
  const element = document.querySelector(selector);

  if (!element) {
    return;
  }

  const normalized = typeof value === "string" ? value.trim() : value;
  element.textContent = normalized ? normalized : fallback;
}

function setFeedback(message, isError = false) {
  const feedbackEl = document.querySelector("#network-action-feedback");

  if (!feedbackEl) {
    return;
  }

  feedbackEl.textContent = message;
  feedbackEl.classList.toggle("is-error", isError);
}

function setBusy(isBusy) {
  const connectBtn = document.querySelector("#network-connect-btn");
  const disconnectBtn = document.querySelector("#network-disconnect-btn");
  const apnInput = document.querySelector("#network-apn-input");

  if (connectBtn) {
    connectBtn.disabled = isBusy;
  }

  if (disconnectBtn) {
    disconnectBtn.disabled = isBusy;
  }

  if (apnInput) {
    apnInput.disabled = isBusy;
  }
}

export function renderNetworkControls(networkControls) {
  if (!networkControls) {
    setNetworkPanelUnavailable();
    return;
  }

  const pill = document.querySelector("#network-connected-pill");
  const connected = Boolean(networkControls.connected);
  const bearer = networkControls.bearer;

  if (pill) {
    pill.textContent = connected ? "Connected" : "Disconnected";
    pill.classList.toggle("is-connected", connected);
    pill.classList.toggle("is-disconnected", !connected);
  }

  setText("#network-registration-state", networkControls.registration_state, "Unknown");
  setText("#network-roaming-state", networkControls.roaming ? "Yes" : "No", "Unknown");
  setText("#network-bearer-state", bearer?.connected ? "Active" : bearer ? "Inactive" : "None");
  setText("#network-bearer-interface", bearer?.interface, "--");
  setText("#network-bearer-apn", bearer?.apn, "--");
  setText("#network-bearer-path", bearer?.path, "--");

  const connectBtn = document.querySelector("#network-connect-btn");
  const disconnectBtn = document.querySelector("#network-disconnect-btn");

  if (connectBtn) {
    connectBtn.disabled = connected;
  }

  if (disconnectBtn) {
    disconnectBtn.disabled = !connected;
  }

  setFeedback(connected ? "Bearer active" : "Ready");
}

export function setNetworkPanelUnavailable() {
  const pill = document.querySelector("#network-connected-pill");

  if (pill) {
    pill.textContent = "Unavailable";
    pill.classList.remove("is-connected");
    pill.classList.add("is-disconnected");
  }

  setText("#network-registration-state", "Unavailable");
  setText("#network-roaming-state", "Unavailable");
  setText("#network-bearer-state", "Unavailable");
  setText("#network-bearer-interface", "--");
  setText("#network-bearer-apn", "--");
  setText("#network-bearer-path", "--");
  setFeedback("Modem data unavailable", true);
}

export function initNetworkPanel() {
  const networkTab = document.querySelector("#network-tab");
  const smsTab = document.querySelector("#sms-tab");
  const contentShell = document.querySelector(".content-shell");
  const connectBtn = document.querySelector("#network-connect-btn");
  const disconnectBtn = document.querySelector("#network-disconnect-btn");
  const apnInput = document.querySelector("#network-apn-input");

  window.addEventListener("sidebar-item-click", (e) => {
    if (e.detail.label === "Network") {
      if (networkTab) {
        networkTab.style.display = "block";
      }

      if (smsTab) {
        smsTab.style.display = "none";
      }

      if (contentShell) {
        contentShell.style.overflow = "auto";
        contentShell.classList.add("network-active");
        contentShell.classList.remove("sms-active");
      }
    } else if (networkTab) {
      networkTab.style.display = "none";

      if (contentShell) {
        contentShell.classList.remove("network-active");
      }
    }
  });

  connectBtn?.addEventListener("click", async () => {
    try {
      setBusy(true);
      setFeedback("Connecting...");
      await connectModem(apnInput?.value ?? "");
      const { updateAllModemData } = await import("../../tauri-api.js");
      await updateAllModemData();
      setFeedback("Connect request sent");
    } catch (error) {
      console.error("Failed to connect modem:", error);
      setFeedback(String(error), true);
    } finally {
      setBusy(false);
    }
  });

  disconnectBtn?.addEventListener("click", async () => {
    try {
      setBusy(true);
      setFeedback("Disconnecting...");
      await disconnectModem();
      const { updateAllModemData } = await import("../../tauri-api.js");
      await updateAllModemData();
      setFeedback("Disconnect request sent");
    } catch (error) {
      console.error("Failed to disconnect modem:", error);
      setFeedback(String(error), true);
    } finally {
      setBusy(false);
    }
  });
}
