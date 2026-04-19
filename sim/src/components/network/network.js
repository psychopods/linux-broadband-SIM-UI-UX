import { connectModem, disconnectModem, unlockSim } from "../../tauri-api.js";

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

function setSimFeedback(message, isError = false) {
  const feedbackEl = document.querySelector("#network-sim-feedback");

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

function setSimBusy(isBusy) {
  const pinInput = document.querySelector("#network-sim-pin-input");
  const unlockBtn = document.querySelector("#network-sim-unlock-btn");

  if (pinInput) {
    pinInput.disabled = isBusy;
  }

  if (unlockBtn) {
    unlockBtn.disabled = isBusy;
  }
}

function renderSimManagement(simManagement) {
  const unlockPanel = document.querySelector("#network-sim-unlock-panel");
  const pinInput = document.querySelector("#network-sim-pin-input");
  const present = Boolean(simManagement?.present);
  const unlockRequired = Boolean(simManagement?.unlock_required);

  setText("#network-sim-presence", present ? "Present" : "Absent", "Unknown");
  setText("#network-sim-iccid", simManagement?.iccid, "--");
  setText("#network-sim-imsi", simManagement?.imsi, "--");
  setText("#network-sim-pin-state", simManagement?.pin_lock_state, "Unknown");

  if (unlockPanel) {
    unlockPanel.hidden = !present || !unlockRequired;
  }

  if (pinInput && !unlockRequired) {
    pinInput.value = "";
  }

  setSimFeedback(
    !present ? "No SIM detected" : unlockRequired ? "SIM unlock required" : "SIM ready",
    false
  );
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
  renderSimManagement(networkControls.sim_management);

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
  setText("#network-sim-presence", "Unavailable");
  setText("#network-sim-iccid", "--");
  setText("#network-sim-imsi", "--");
  setText("#network-sim-pin-state", "Unavailable");
  const unlockPanel = document.querySelector("#network-sim-unlock-panel");

  if (unlockPanel) {
    unlockPanel.hidden = true;
  }

  setSimFeedback("SIM data unavailable", true);
  setFeedback("Modem data unavailable", true);
}

export function initNetworkPanel() {
  const networkTab = document.querySelector("#network-tab");
  const smsTab = document.querySelector("#sms-tab");
  const ussdTab = document.querySelector("#ussd-tab");
  const contentShell = document.querySelector(".content-shell");
  const connectBtn = document.querySelector("#network-connect-btn");
  const disconnectBtn = document.querySelector("#network-disconnect-btn");
  const apnInput = document.querySelector("#network-apn-input");
  const pinInput = document.querySelector("#network-sim-pin-input");
  const unlockBtn = document.querySelector("#network-sim-unlock-btn");

  window.addEventListener("sidebar-item-click", (e) => {
    if (e.detail.label === "Network") {
      if (networkTab) {
        networkTab.style.display = "block";
      }

      if (smsTab) {
        smsTab.style.display = "none";
      }

      if (ussdTab) {
        ussdTab.style.display = "none";
      }

      if (contentShell) {
        contentShell.style.overflow = "auto";
        contentShell.classList.add("network-active");
        contentShell.classList.remove("sms-active");
        contentShell.classList.remove("ussd-active");
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

  unlockBtn?.addEventListener("click", async () => {
    try {
      setSimBusy(true);
      setSimFeedback("Unlocking SIM...");
      await unlockSim(pinInput?.value ?? "");
      const { updateAllModemData } = await import("../../tauri-api.js");
      await updateAllModemData();
      setSimFeedback("SIM unlock request sent");
    } catch (error) {
      console.error("Failed to unlock SIM:", error);
      setSimFeedback(String(error), true);
    } finally {
      setSimBusy(false);
    }
  });
}
