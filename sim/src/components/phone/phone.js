import {
  answerPhoneCall,
  getPhoneStatus,
  getSimContacts,
  hangupPhoneCall,
  sendPhoneDtmf,
  startPhoneCall,
} from "../../tauri-api.js";
import { setSidebarItemVisible } from "../sidebar/sidebar.js";

const RECENT_CALLS_STORAGE_KEY = "sim-phone-recent-calls-v1";
const FAVORITE_CONTACTS_STORAGE_KEY = "sim-phone-favorite-contacts-v1";
const MAX_RECENT_CALLS = 24;
const MAX_FAVORITES = 8;

const phoneState = {
  capabilities: null,
  status: null,
  loading: false,
  visible: false,
  pollTimer: null,
  contacts: [],
  recentCalls: loadStoredRecentCalls(),
  favoriteIds: loadStoredFavoriteIds(),
  activeCallSession: null,
};

let phoneTab;
let smsTab;
let ussdTab;
let networkTab;
let contactsTab;
let contentShell;
let numberInput;
let favoriteToggle;
let targetEyebrow;
let targetName;
let targetNumber;
let recentCallsList;
let recentCount;
let favoritesList;

function safeParseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function loadStoredRecentCalls() {
  const entries = safeParseJson(window.localStorage?.getItem(RECENT_CALLS_STORAGE_KEY), []);
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries.filter((entry) => !String(entry?.id || "").startsWith("mock-call-"));
}

function loadStoredFavoriteIds() {
  const ids = safeParseJson(window.localStorage?.getItem(FAVORITE_CONTACTS_STORAGE_KEY), []);
  return Array.isArray(ids) ? ids : [];
}

function persistRecentCalls() {
  try {
    window.localStorage?.setItem(RECENT_CALLS_STORAGE_KEY, JSON.stringify(phoneState.recentCalls));
  } catch {
    // Ignore storage failures.
  }
}

function persistFavoriteIds() {
  try {
    window.localStorage?.setItem(FAVORITE_CONTACTS_STORAGE_KEY, JSON.stringify(phoneState.favoriteIds));
  } catch {
    // Ignore storage failures.
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

function normalizeDigits(value) {
  return String(value ?? "").replace(/\D+/g, "");
}

function numbersLikelyMatch(left, right) {
  const normalizedLeft = normalizeDigits(left);
  const normalizedRight = normalizeDigits(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  return (
    normalizedLeft.length >= 7 &&
    normalizedRight.length >= 7 &&
    (normalizedLeft.endsWith(normalizedRight) || normalizedRight.endsWith(normalizedLeft))
  );
}

function buildUnavailableCapabilities(reason = "Voice calling unavailable") {
  return {
    supported: false,
    emergency_only: false,
    reason,
  };
}

function getFallbackStatus(reason = "Phone status unavailable") {
  const capabilities = phoneState.capabilities?.supported
    ? {
        supported: true,
        emergency_only: Boolean(phoneState.capabilities?.emergency_only),
        reason: phoneState.capabilities?.reason || reason,
      }
    : buildUnavailableCapabilities(reason);

  return {
    capabilities,
    current_call: null,
  };
}

function resolveContactByNumber(number) {
  return phoneState.contacts.find((contact) => numbersLikelyMatch(contact?.number, number)) || null;
}

function resolveContactById(contactId) {
  return phoneState.contacts.find((contact) => contact?.id === contactId) || null;
}

function getResolvedIdentity(number, fallbackName = "Unknown contact") {
  const contact = resolveContactByNumber(number);
  const rawNumber = String(number || contact?.number || "").trim();
  const name = String(contact?.name || "").trim() || fallbackName;

  return {
    contact,
    name,
    number: rawNumber || "No number stored",
  };
}

function formatDateTime(timestamp) {
  if (!timestamp) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function getCallBadge(entry) {
  const state = String(entry?.state || "");
  const direction = String(entry?.direction || "");
  const durationSeconds = Number(entry?.durationSeconds) || 0;

  if (direction === "Incoming" && durationSeconds === 0 && state !== "Active") {
    return { label: "Missed", className: "is-missed" };
  }

  if (state === "Active") {
    return { label: direction === "Incoming" ? "Incoming" : "Outgoing", className: "is-active" };
  }

  return { label: direction || "Call", className: "" };
}

function setBusy(isBusy) {
  phoneState.loading = isBusy;

  if (numberInput) {
    numberInput.disabled = isBusy;
  }

  document.querySelectorAll("#phone-dialpad button, .phone-btn").forEach((button) => {
    if (button === favoriteToggle) {
      button.disabled = isBusy || !resolveContactByNumber(numberInput?.value ?? "");
      return;
    }

    button.disabled = isBusy;
  });
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

function renderTargetIdentity() {
  const currentValue = String(numberInput?.value || "").trim();
  const { contact, name, number } = getResolvedIdentity(currentValue);

  if (!currentValue) {
    if (targetEyebrow) targetEyebrow.textContent = "Selected contact";
    if (targetName) targetName.textContent = "Unknown contact";
    if (targetNumber) targetNumber.textContent = "Type a number or pick a saved contact.";
    if (favoriteToggle) {
      favoriteToggle.disabled = true;
      favoriteToggle.textContent = "Add to favourites";
    }
    return;
  }

  if (targetEyebrow) {
    targetEyebrow.textContent = contact ? "Matched SIM contact" : "Manual number";
  }
  if (targetName) {
    targetName.textContent = name;
  }
  if (targetNumber) {
    targetNumber.textContent = number;
  }

  if (favoriteToggle) {
    const isFavorite = Boolean(contact && phoneState.favoriteIds.includes(contact.id));
    favoriteToggle.disabled = !contact || phoneState.loading;
    favoriteToggle.textContent = isFavorite ? "Remove favourite" : "Add to favourites";
  }
}

function addRecentCall(entry) {
  phoneState.recentCalls = [entry, ...phoneState.recentCalls].slice(0, MAX_RECENT_CALLS);
  persistRecentCalls();
  renderRecentCalls();
}

function finalizeActiveCallSession() {
  const session = phoneState.activeCallSession;
  if (!session) {
    return;
  }

  const identity = getResolvedIdentity(session.number, session.name || "Unknown contact");
  addRecentCall({
    id: `${session.startedAt}-${normalizeDigits(session.number) || "unknown"}`,
    contactId: identity.contact?.id || null,
    fallbackName: session.name || identity.name,
    number: session.number,
    direction: session.direction,
    state: session.state,
    stateReason: session.stateReason,
    startedAt: session.startedAt,
    endedAt: session.lastSeenAt,
    durationSeconds: session.answeredAt ? Math.max(0, Math.round((session.lastSeenAt - session.answeredAt) / 1000)) : 0,
  });
  phoneState.activeCallSession = null;
}

function syncCallSession(status) {
  const call = status?.current_call || null;

  if (!call) {
    finalizeActiveCallSession();
    return;
  }

  const now = Date.now();
  const number = String(call.number || "").trim();
  const resolved = getResolvedIdentity(number);
  const key = `${normalizeDigits(number) || "unknown"}|${call.direction || "Unknown"}`;

  if (!phoneState.activeCallSession || phoneState.activeCallSession.key !== key) {
    finalizeActiveCallSession();
    phoneState.activeCallSession = {
      key,
      name: resolved.name,
      number,
      direction: call.direction || "Unknown",
      state: call.state || "Unknown",
      stateReason: call.state_reason || "",
      startedAt: now,
      answeredAt: call.state === "Active" ? now : null,
      lastSeenAt: now,
    };
    return;
  }

  phoneState.activeCallSession.state = call.state || phoneState.activeCallSession.state;
  phoneState.activeCallSession.stateReason = call.state_reason || phoneState.activeCallSession.stateReason;
  phoneState.activeCallSession.lastSeenAt = now;
  if (call.state === "Active" && !phoneState.activeCallSession.answeredAt) {
    phoneState.activeCallSession.answeredAt = now;
  }
}

function renderRecentCalls() {
  if (!recentCallsList) {
    return;
  }

  const entries = phoneState.recentCalls;
  if (recentCount) {
    recentCount.textContent = entries.length > 0 ? String(entries.length) : "";
  }

  if (!entries.length) {
    recentCallsList.innerHTML = `
      <div class="phone-empty-state">
        <p>No recent calls yet</p>
        <small>Calls you place or receive while this app is running will appear here with name, date, time, and duration.</small>
      </div>
    `;
    return;
  }

  recentCallsList.innerHTML = entries
    .map((entry, index) => {
      const contact = entry.contactId ? resolveContactById(entry.contactId) : resolveContactByNumber(entry.number);
      const name = String(contact?.name || entry.fallbackName || "Unknown contact").trim() || "Unknown contact";
      const number = String(contact?.number || entry.number || "No number stored").trim() || "No number stored";
      const badge = getCallBadge(entry);
      return `
        <div class="phone-list-item">
          <button class="phone-list-item-main phone-btn phone-btn-ghost" type="button" data-recent-index="${index}">
            <div class="phone-list-item-copy">
              <p class="phone-list-item-title">${escapeHtml(name)}</p>
              <p class="phone-list-item-subtitle">${escapeHtml(number)}</p>
              <div class="phone-list-item-meta">
                <span>${escapeHtml(formatDateTime(entry.startedAt))}</span>
                <span>Duration ${escapeHtml(formatDuration(entry.durationSeconds))}</span>
                <span>${escapeHtml(entry.stateReason || entry.state || "Completed")}</span>
              </div>
            </div>
          </button>
          <div class="phone-list-item-actions">
            <span class="phone-call-badge ${badge.className}">${escapeHtml(badge.label)}</span>
            <button class="phone-btn phone-btn-secondary phone-icon-btn" type="button" data-recent-call="${index}">Call</button>
          </div>
        </div>
      `;
    })
    .join("");

  recentCallsList.querySelectorAll("[data-recent-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.getAttribute("data-recent-index"));
      const entry = phoneState.recentCalls[index];
      if (!entry || !numberInput) {
        return;
      }

      numberInput.value = entry.number || "";
      renderTargetIdentity();
      numberInput.focus();
    });
  });

  recentCallsList.querySelectorAll("[data-recent-call]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.getAttribute("data-recent-call"));
      const entry = phoneState.recentCalls[index];
      if (!entry) {
        return;
      }

      if (numberInput) {
        numberInput.value = entry.number || "";
        renderTargetIdentity();
      }
      void handleStartCall();
    });
  });
}

function getSuggestedFavoriteContacts() {
  return [...phoneState.contacts]
    .filter((contact) => String(contact?.number || "").trim())
    .sort((left, right) => {
      const leftHasMessage = Boolean(left?.last_message?.timestamp || left?.last_message?.text);
      const rightHasMessage = Boolean(right?.last_message?.timestamp || right?.last_message?.text);
      if (leftHasMessage !== rightHasMessage) {
        return leftHasMessage ? -1 : 1;
      }

      return String(left?.name || left?.number || "").localeCompare(String(right?.name || right?.number || ""));
    })
    .slice(0, MAX_FAVORITES);
}

function getFavoriteContacts() {
  const explicitFavorites = phoneState.favoriteIds
    .map((contactId) => resolveContactById(contactId))
    .filter(Boolean);

  return explicitFavorites.length ? explicitFavorites : getSuggestedFavoriteContacts();
}

function toggleFavoriteContact(contactId) {
  if (!contactId) {
    return;
  }

  const exists = phoneState.favoriteIds.includes(contactId);
  phoneState.favoriteIds = exists
    ? phoneState.favoriteIds.filter((id) => id !== contactId)
    : [contactId, ...phoneState.favoriteIds].slice(0, MAX_FAVORITES);

  persistFavoriteIds();
  renderFavoriteContacts();
  renderTargetIdentity();
}

function renderFavoriteContacts() {
  if (!favoritesList) {
    return;
  }

  const favorites = getFavoriteContacts();
  if (!favorites.length) {
    favoritesList.innerHTML = `
      <div class="phone-empty-state">
        <p>No favourites available</p>
        <small>Matched contacts with names appear here. Star a matched number to pin it.</small>
      </div>
    `;
    return;
  }

  favoritesList.innerHTML = favorites
    .map((contact) => {
      const isFavorite = phoneState.favoriteIds.includes(contact.id);
      return `
        <div class="phone-favorite-card">
          <button class="phone-favorite-copy phone-btn phone-btn-ghost" type="button" data-favorite-contact="${escapeHtml(contact.id)}">
            <p class="phone-favorite-name">${escapeHtml(String(contact.name || "Unknown contact").trim() || "Unknown contact")}</p>
            <p class="phone-favorite-number">${escapeHtml(String(contact.number || "No number stored").trim() || "No number stored")}</p>
            <div class="phone-favorite-meta">
              <span>${isFavorite ? "Pinned favourite" : "Suggested from contacts"}</span>
            </div>
          </button>
          <div class="phone-list-item-actions">
            <button class="phone-btn phone-btn-secondary phone-icon-btn" type="button" data-favorite-toggle="${escapeHtml(contact.id)}">${isFavorite ? "Unstar" : "Star"}</button>
            <button class="phone-btn phone-btn-primary phone-icon-btn" type="button" data-favorite-call="${escapeHtml(contact.id)}">Call</button>
          </div>
        </div>
      `;
    })
    .join("");

  favoritesList.querySelectorAll("[data-favorite-contact]").forEach((button) => {
    button.addEventListener("click", () => {
      const contactId = button.getAttribute("data-favorite-contact") || "";
      const contact = resolveContactById(contactId);
      if (!contact || !numberInput) {
        return;
      }

      numberInput.value = String(contact.number || "");
      renderTargetIdentity();
      numberInput.focus();
    });
  });

  favoritesList.querySelectorAll("[data-favorite-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const contactId = button.getAttribute("data-favorite-toggle") || "";
      toggleFavoriteContact(contactId);
    });
  });

  favoritesList.querySelectorAll("[data-favorite-call]").forEach((button) => {
    button.addEventListener("click", () => {
      const contactId = button.getAttribute("data-favorite-call") || "";
      const contact = resolveContactById(contactId);
      if (!contact) {
        return;
      }

      if (numberInput) {
        numberInput.value = String(contact.number || "");
        renderTargetIdentity();
      }
      void handleStartCall();
    });
  });
}

function renderPhoneStatus(status) {
  syncCallSession(status);

  const call = status?.current_call || null;
  const supported = Boolean(status?.capabilities?.supported);
  const identity = getResolvedIdentity(call?.number || "");
  const currentDuration = phoneState.activeCallSession
    ? formatDuration(
        phoneState.activeCallSession.answeredAt
          ? Math.max(0, Math.round((Date.now() - phoneState.activeCallSession.answeredAt) / 1000))
          : 0
      )
    : "--";

  setText(
    "#phone-call-display",
    call
      ? `${identity.name}\n${identity.number}\n${call.state}`
      : supported
        ? "No active call. Choose a named contact, a favourite, or dial manually."
        : "Voice calling is not available on this modem.",
    "No active call."
  );
  setText("#phone-direction", call?.direction, "--");
  setText("#phone-reason", call?.state_reason, "--");
  setText("#phone-audio-port", call?.audio_port, "--");
  setText("#phone-audio-format", call?.audio_format, "--");
  setText("#phone-call-time", call ? currentDuration : "--", "--");
  setText("#phone-capability-reason", status?.capabilities?.reason, "Unavailable");
  setText("#phone-capability-copy", status?.capabilities?.reason, "Voice calling unavailable");

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

async function refreshPhoneContacts() {
  try {
    const contacts = await getSimContacts();
    phoneState.contacts = Array.isArray(contacts) ? contacts : [];
    renderTargetIdentity();
    renderRecentCalls();
    renderFavoriteContacts();
  } catch (error) {
    console.error("Failed to refresh phone contacts:", error);
  }
}

export function applyPhoneCapabilities(capabilities) {
  phoneState.capabilities = capabilities;
  const supported = Boolean(capabilities?.supported);
  setSidebarItemVisible("Phone", supported);

  if (!supported && phoneTab) {
    phoneTab.style.display = "none";
    phoneState.visible = false;
    stopPhonePolling();
    finalizeActiveCallSession();
    if (contentShell) {
      contentShell.classList.remove("phone-active");
    }
  }
}

export async function refreshPhoneStatus(statusOverride = null) {
  try {
    const status = statusOverride || await getPhoneStatus();
    if (!status) {
      const fallbackStatus = getFallbackStatus("Phone status unavailable");
      applyPhoneCapabilities(fallbackStatus.capabilities);
      renderPhoneStatus(fallbackStatus);
      return;
    }

    phoneState.status = status;
    applyPhoneCapabilities(status.capabilities);
    renderPhoneStatus(status);
  } catch (error) {
    console.error("Failed to refresh phone status:", error);
    const message = error instanceof Error ? error.message : String(error);
    const fallbackStatus = getFallbackStatus(message);
    applyPhoneCapabilities(fallbackStatus.capabilities);
    renderPhoneStatus(fallbackStatus);
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
    renderTargetIdentity();
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
    renderTargetIdentity();
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
    renderTargetIdentity();
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
      renderTargetIdentity();
    }
  } catch (error) {
    console.error("Failed to send DTMF:", error);
    setFeedback(String(error), true);
  } finally {
    setBusy(false);
  }
}

function showPhoneTab() {
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
  if (contactsTab) {
    contactsTab.style.display = "none";
  }

  if (contentShell) {
    contentShell.style.overflow = "auto";
    contentShell.classList.add("phone-active");
    contentShell.classList.remove("sms-active");
    contentShell.classList.remove("ussd-active");
    contentShell.classList.remove("network-active");
  }

  void refreshPhoneContacts();
  startPhonePolling();
  void refreshPhoneStatus();
}

export function initPhone() {
  phoneTab = document.querySelector("#phone-tab");
  smsTab = document.querySelector("#sms-tab");
  ussdTab = document.querySelector("#ussd-tab");
  networkTab = document.querySelector("#network-tab");
  contactsTab = document.querySelector("#contacts-tab");
  contentShell = document.querySelector(".content-shell");
  numberInput = document.querySelector("#phone-number-input");
  favoriteToggle = document.querySelector("#phone-favorite-toggle");
  targetEyebrow = document.querySelector("#phone-target-eyebrow");
  targetName = document.querySelector("#phone-target-name");
  targetNumber = document.querySelector("#phone-target-number");
  recentCallsList = document.querySelector("#phone-recent-calls-list");
  recentCount = document.querySelector("#phone-recent-count");
  favoritesList = document.querySelector("#phone-favorites-list");

  document.querySelectorAll("#phone-dialpad button").forEach((button) => {
    button.addEventListener("click", () => {
      if (numberInput) {
        numberInput.value += button.dataset.value || "";
        renderTargetIdentity();
        numberInput.focus();
      }
    });
  });

  numberInput?.addEventListener("input", () => {
    renderTargetIdentity();
  });

  favoriteToggle?.addEventListener("click", () => {
    const contact = resolveContactByNumber(numberInput?.value ?? "");
    if (!contact) {
      return;
    }

    toggleFavoriteContact(contact.id);
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
    renderTargetIdentity();
    numberInput.focus();
  });

  window.addEventListener("sidebar-item-click", (e) => {
    if (e.detail.label === "Phone") {
      if (!phoneState.capabilities?.supported) {
        return;
      }

      showPhoneTab();
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
  renderTargetIdentity();
  renderRecentCalls();
  renderFavoriteContacts();
  setFeedback("Waiting for voice capability check");

  // Tab switching
  document.querySelectorAll(".phone-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;
      document.querySelectorAll(".phone-tab-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === target));
      document.querySelectorAll(".phone-tab-pane").forEach((p) => p.classList.toggle("is-active", p.dataset.pane === target));
    });
  });
}
