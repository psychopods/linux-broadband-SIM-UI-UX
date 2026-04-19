import {
  answerPhoneCall,
  getPhoneStatus,
  hangupPhoneCall,
  sendPhoneDtmf,
  startPhoneCall,
} from "../../tauri-api.js";
import { setSidebarItemVisible } from "../sidebar/sidebar.js";

const phoneState = {
  capabilities: null,
  status: null,
  loading: false,
  visible: false,
  pollTimer: null,
};

let phoneTab;
let smsTab;
let ussdTab;
let networkTab;
let contentShell;
let numberInput;

function setText(selector, value, fallback = "--") {
  const element = document.querySelector(selector);
  if (!element) {
    return;
  }

  const normalized = typeof value === "string" ? value.trim() : value;
  element.textContent = normalized ? normalized : fallback;
}

function setFeedback(message, isError = false) {
  const feedbackEl = document.querySelector("#phone-feedback");
  if (!feedbackEl) {
    return;
  }

  feedbackEl.textContent = message;
  feedbackEl.classList.toggle("is-error", isError);
}

function setBusy(isBusy) {
  phoneState.loading = isBusy;
  document.querySelectorAll("#phone-dialpad button, .phone-btn").forEach((button) => {
    button.disabled = isBusy;
  });

  if (numberInput) {
    numberInput.disabled = isBusy;
  }
}

function renderStatusPill(text, mode = "") {
  const pill = document.querySelector("#phone-status-pill");
  if (!pill) {
    return;
  }

  pill.textContent = text;
  pill.classList.toggle("is-ready", mode === "ready");
  pill.classList.toggle("is-busy", mode === "busy");
  pill.classList.toggle("is-error", mode === "error");
}

function renderPhoneStatus(status) {
  const call = status?.current_call || null;
  const supported = Boolean(status?.capabilities?.supported);

  setText(
    "#phone-call-display",
    call
      ? `${call.number || "Unknown number"}\n${call.state}`
      : supported
        ? "No active call."
        : "Voice calling is not available on this modem.",
    "No active call."
  );
  setText("#phone-direction", call?.direction, "--");
  setText("#phone-reason", call?.state_reason, "--");
  setText("#phone-audio-port", call?.audio_port, "--");
  setText("#phone-audio-format", call?.audio_format, "--");
  setText("#phone-capability-reason", status?.capabilities?.reason, "Unavailable");

  if (!supported) {
    renderStatusPill("Unavailable", "error");
    setFeedback(status?.capabilities?.reason || "Voice calling unavailable");
    return;
  }

  if (!call) {
    renderStatusPill("Ready", "ready");
    setFeedback("Voice calling supported");
    return;
  }

  const pillMode = call.state === "Active" ? "busy" : "ready";
  renderStatusPill(call.state, pillMode);
  setFeedback(call.audio_port ? "Host audio route exposed" : "No host audio route exposed yet");
}

export function applyPhoneCapabilities(capabilities) {
  phoneState.capabilities = capabilities;
  const supported = Boolean(capabilities?.supported);
  setSidebarItemVisible("Phone", supported);

  if (!supported && phoneTab) {
    phoneTab.style.display = "none";
    phoneState.visible = false;
    stopPhonePolling();
    if (contentShell) {
      contentShell.classList.remove("phone-active");
    }
  }
}

export async function refreshPhoneStatus() {
  try {
    const status = await getPhoneStatus();
    if (!status) {
      return;
    }

    phoneState.status = status;
    applyPhoneCapabilities(status.capabilities);
    renderPhoneStatus(status);
  } catch (error) {
    console.error("Failed to refresh phone status:", error);
  }
}

function stopPhonePolling() {
  if (phoneState.pollTimer) {
    window.clearInterval(phoneState.pollTimer);
    phoneState.pollTimer = null;
  }
}

function startPhonePolling(intervalMs = 3000) {
  stopPhonePolling();
  phoneState.pollTimer = window.setInterval(() => {
    if (!phoneState.visible || phoneState.loading) {
      return;
    }

    void refreshPhoneStatus();
  }, intervalMs);
}

async function handleStartCall() {
  try {
    setBusy(true);
    setFeedback("Dialing...");
    const status = await startPhoneCall(numberInput?.value ?? "");
    phoneState.status = status;
    renderPhoneStatus(status);
  } catch (error) {
    console.error("Failed to start phone call:", error);
    setFeedback(String(error), true);
  } finally {
    setBusy(false);
  }
}

async function handleAnswerCall() {
  try {
    setBusy(true);
    setFeedback("Answering call...");
    const status = await answerPhoneCall();
    phoneState.status = status;
    renderPhoneStatus(status);
  } catch (error) {
    console.error("Failed to answer phone call:", error);
    setFeedback(String(error), true);
  } finally {
    setBusy(false);
  }
}

async function handleHangupCall() {
  try {
    setBusy(true);
    setFeedback("Hanging up...");
    const status = await hangupPhoneCall();
    phoneState.status = status;
    renderPhoneStatus(status);
  } catch (error) {
    console.error("Failed to hang up phone call:", error);
    setFeedback(String(error), true);
  } finally {
    setBusy(false);
  }
}

async function handleSendDtmf() {
  try {
    setBusy(true);
    setFeedback("Sending tones...");
    const status = await sendPhoneDtmf(numberInput?.value ?? "");
    phoneState.status = status;
    renderPhoneStatus(status);
    if (numberInput) {
      numberInput.value = "";
    }
  } catch (error) {
    console.error("Failed to send DTMF:", error);
    setFeedback(String(error), true);
  } finally {
    setBusy(false);
  }
}

export function initPhone() {
  phoneTab = document.querySelector("#phone-tab");
  smsTab = document.querySelector("#sms-tab");
  ussdTab = document.querySelector("#ussd-tab");
  networkTab = document.querySelector("#network-tab");
  contentShell = document.querySelector(".content-shell");
  numberInput = document.querySelector("#phone-number-input");

  document.querySelectorAll("#phone-dialpad button").forEach((button) => {
    button.addEventListener("click", () => {
      if (numberInput) {
        numberInput.value += button.dataset.value || "";
        numberInput.focus();
      }
    });
  });

  document.querySelector("#phone-call-btn")?.addEventListener("click", () => {
    void handleStartCall();
  });
  document.querySelector("#phone-answer-btn")?.addEventListener("click", () => {
    void handleAnswerCall();
  });
  document.querySelector("#phone-tone-btn")?.addEventListener("click", () => {
    void handleSendDtmf();
  });
  document.querySelector("#phone-hangup-btn")?.addEventListener("click", () => {
    void handleHangupCall();
  });
  document.querySelector("#phone-backspace-btn")?.addEventListener("click", () => {
    if (!numberInput) {
      return;
    }

    numberInput.value = numberInput.value.slice(0, -1);
    numberInput.focus();
  });

  window.addEventListener("sidebar-item-click", (e) => {
    if (e.detail.label === "Phone") {
      if (!phoneState.capabilities?.supported) {
        return;
      }

      phoneState.visible = true;
      if (phoneTab) {
        phoneTab.style.display = "block";
      }
      if (smsTab) {
        smsTab.style.display = "none";
      }
      if (ussdTab) {
        ussdTab.style.display = "none";
      }
      if (networkTab) {
        networkTab.style.display = "none";
      }

      if (contentShell) {
        contentShell.style.overflow = "auto";
        contentShell.classList.add("phone-active");
        contentShell.classList.remove("sms-active");
        contentShell.classList.remove("ussd-active");
        contentShell.classList.remove("network-active");
      }

      startPhonePolling();
      void refreshPhoneStatus();
    } else if (phoneTab) {
      phoneState.visible = false;
      phoneTab.style.display = "none";
      stopPhonePolling();

      if (contentShell) {
        contentShell.classList.remove("phone-active");
      }
    }
  });

  renderStatusPill("Unavailable", "error");
  setFeedback("Waiting for voice capability check");
}
