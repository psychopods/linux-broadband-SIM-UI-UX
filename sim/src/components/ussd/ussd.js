import {
  cancelUssdSession,
  executeUssd,
  getUssdShortcuts,
  getUssdStatus,
  respondUssd,
} from "../../tauri-api.js";

const ussdState = {
  shortcuts: [],
  loading: false,
  session: null,
  visible: false,
  pollTimer: null,
};

let ussdTab;
let smsTab;
let networkTab;
let contentShell;
let codeInput;
let responseInput;

function setText(selector, value, fallback = "--") {
  const element = document.querySelector(selector);
  if (!element) {
    return;
  }

  const normalized = typeof value === "string" ? value.trim() : value;
  element.textContent = normalized ? normalized : fallback;
}

function setFeedback(message, isError = false) {
  const element = document.querySelector("#ussd-feedback");
  if (!element) {
    return;
  }

  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

function setBusy(isBusy) {
  ussdState.loading = isBusy;
  document.querySelectorAll("#ussd-dialpad button, .ussd-shortcut-btn, .ussd-btn").forEach((button) => {
    button.disabled = isBusy;
  });

  if (codeInput) {
    codeInput.disabled = isBusy;
  }

  if (responseInput) {
    responseInput.disabled = isBusy;
  }
}

function renderShortcuts() {
  const container = document.querySelector("#ussd-shortcuts");
  if (!container) {
    return;
  }

  container.innerHTML = ussdState.shortcuts
    .map(
      (shortcut) =>
        `<button class="ussd-shortcut-btn" type="button" data-code="${shortcut.code}">${shortcut.label} ${shortcut.code}</button>`
    )
    .join("");

  container.querySelectorAll(".ussd-shortcut-btn").forEach((button) => {
    button.addEventListener("click", () => {
      if (codeInput) {
        codeInput.value = button.dataset.code || "";
        codeInput.focus();
      }
    });
  });
}

function renderSession(session) {
  setText("#ussd-session-state", session?.state, "Idle");
  setText("#ussd-network-request", session?.network_request, "--");
  setText("#ussd-network-notification", session?.network_notification, "--");
  setText(
    "#ussd-response-output",
    session?.response || session?.network_request || session?.network_notification,
    "No active USSD response."
  );
}

function hasVisibleSessionContent(session) {
  return Boolean(
    session?.response?.trim() ||
      session?.network_request?.trim() ||
      session?.network_notification?.trim()
  );
}

function isReplyRequired(session = ussdState.session) {
  return session?.state === "User response required";
}

function normalizeSession(session) {
  if (!session) {
    return ussdState.session;
  }

  const incomingHasContent = hasVisibleSessionContent(session);
  const currentHasContent = hasVisibleSessionContent(ussdState.session);

  if (incomingHasContent) {
    return session;
  }

  if (
    currentHasContent &&
    session?.state &&
    ["Idle", "Unknown"].includes(session.state)
  ) {
    return {
      ...session,
      response: ussdState.session?.response,
      network_request: ussdState.session?.network_request,
      network_notification: ussdState.session?.network_notification,
    };
  }

  return session;
}

function shouldApplyIncomingSession(session, options = {}) {
  if (!session) {
    return false;
  }

  if (options.force) {
    return true;
  }

  if (isReplyRequired() && !hasVisibleSessionContent(session)) {
    return false;
  }

  return true;
}

async function loadShortcuts() {
  ussdState.shortcuts = await getUssdShortcuts();
  renderShortcuts();
}

export async function refreshUSSD(options = {}) {
  try {
    const nextSession = await getUssdStatus();
    if (!shouldApplyIncomingSession(nextSession, options)) {
      return;
    }

    const session = normalizeSession(nextSession);
    ussdState.session = session;
    renderSession(session);
  } catch (error) {
    console.error("Failed to refresh USSD state:", error);
  }
}

function stopUssdPolling() {
  if (ussdState.pollTimer) {
    window.clearInterval(ussdState.pollTimer);
    ussdState.pollTimer = null;
  }
}

function startUssdPolling(intervalMs = 3000) {
  stopUssdPolling();
  ussdState.pollTimer = window.setInterval(() => {
    if (!ussdState.visible || ussdState.loading || isReplyRequired()) {
      return;
    }

    void refreshUSSD();
  }, intervalMs);
}

async function handleExecute() {
  try {
    setBusy(true);
    setFeedback("Sending USSD request...");
    const session = await executeUssd(codeInput?.value ?? "");
    ussdState.session = session;
    renderSession(session);
    setFeedback("USSD request sent");
  } catch (error) {
    console.error("Failed to execute USSD:", error);
    setFeedback(String(error), true);
  } finally {
    setBusy(false);
  }
}

async function handleRespond() {
  try {
    setBusy(true);
    setFeedback("Sending USSD reply...");
    const session = await respondUssd(responseInput?.value ?? "");
    ussdState.session = session;
    renderSession(session);
    responseInput.value = "";
    setFeedback("USSD reply sent");
  } catch (error) {
    console.error("Failed to reply to USSD:", error);
    setFeedback(String(error), true);
  } finally {
    setBusy(false);
  }
}

async function handleCancel() {
  try {
    setBusy(true);
    setFeedback("Cancelling USSD session...");
    await cancelUssdSession();
    ussdState.session = null;
    responseInput.value = "";
    await refreshUSSD({ force: true });
    setFeedback("USSD session cancelled");
  } catch (error) {
    console.error("Failed to cancel USSD:", error);
    setFeedback(String(error), true);
  } finally {
    setBusy(false);
  }
}

export function initUSSD() {
  ussdTab = document.querySelector("#ussd-tab");
  smsTab = document.querySelector("#sms-tab");
  networkTab = document.querySelector("#network-tab");
  contentShell = document.querySelector(".content-shell");
  codeInput = document.querySelector("#ussd-code-input");
  responseInput = document.querySelector("#ussd-response-input");

  document.querySelectorAll("#ussd-dialpad button").forEach((button) => {
    button.addEventListener("click", () => {
      if (codeInput) {
        codeInput.value += button.dataset.value || "";
        codeInput.focus();
      }
    });
  });

  document.querySelector("#ussd-call-btn")?.addEventListener("click", () => {
    void handleExecute();
  });

  document.querySelector("#ussd-respond-btn")?.addEventListener("click", () => {
    void handleRespond();
  });

  document.querySelector("#ussd-cancel-btn")?.addEventListener("click", () => {
    void handleCancel();
  });

  document.querySelector("#ussd-backspace-btn")?.addEventListener("click", () => {
    if (codeInput) {
      codeInput.value = codeInput.value.slice(0, -1);
      codeInput.focus();
    }
  });

  window.addEventListener("sidebar-item-click", (e) => {
    if (e.detail.label === "USSD dialpad") {
      ussdState.visible = true;
      if (ussdTab) {
        ussdTab.style.display = "flex";
      }

      if (smsTab) {
        smsTab.style.display = "none";
      }

      if (networkTab) {
        networkTab.style.display = "none";
      }

      if (contentShell) {
        contentShell.style.overflow = "auto";
        contentShell.classList.add("ussd-active");
        contentShell.classList.remove("sms-active");
        contentShell.classList.remove("network-active");
      }

      startUssdPolling();
      void refreshUSSD({ force: true });
    } else if (ussdTab) {
      ussdState.visible = false;
      ussdTab.style.display = "none";
      stopUssdPolling();

      if (contentShell) {
        contentShell.classList.remove("ussd-active");
      }
    }
  });

  void loadShortcuts();
  void refreshUSSD({ force: true });
}
