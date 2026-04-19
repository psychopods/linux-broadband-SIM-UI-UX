let smsTab;
let networkTab;
let contentShell;
let contactsList;
let messagesArea;
let chatTitle;
let messageInput;
let sendBtn;

const smsState = {
  threads: [],
  selectedThreadId: null,
  selectedPeer: "",
  loadingThreads: false,
  loadingConversation: false,
  sending: false,
};

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return "";
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return timestamp;
  }

  return parsed.toLocaleString([], {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
}

function getAvatarLabel(peer) {
  const trimmed = (peer || "").trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}

function setComposerEnabled(enabled) {
  if (messageInput) {
    messageInput.disabled = !enabled;
  }

  if (sendBtn) {
    sendBtn.disabled = !enabled || smsState.sending;
  }
}

function renderContacts() {
  if (!contactsList) {
    return;
  }

  if (smsState.loadingThreads && smsState.threads.length === 0) {
    contactsList.innerHTML = '<div class="sms-placeholder">Loading messages...</div>';
    return;
  }

  if (smsState.threads.length === 0) {
    contactsList.innerHTML = '<div class="sms-placeholder">No modem messages found</div>';
    return;
  }

  contactsList.innerHTML = smsState.threads
    .map((thread) => {
      const preview = thread.last_message?.text?.trim() || "No messages yet";
      const activeClass = thread.id === smsState.selectedThreadId ? " active" : "";
      const countLabel = thread.message_count > 0 ? ` · ${thread.message_count}` : "";

      return `
        <div class="sms-contact-item${activeClass}" data-thread-id="${escapeHtml(thread.id)}" data-peer="${escapeHtml(thread.peer)}">
          <div class="sms-contact-avatar">${escapeHtml(getAvatarLabel(thread.peer))}</div>
          <div class="sms-contact-info">
            <div class="sms-contact-name">${escapeHtml(thread.peer)}${countLabel}</div>
            <div class="sms-contact-preview">${escapeHtml(preview)}</div>
          </div>
        </div>
      `;
    })
    .join("");

  contactsList.querySelectorAll(".sms-contact-item").forEach((item) => {
    item.addEventListener("click", () => {
      const threadId = item.getAttribute("data-thread-id") || "";
      const peer = item.getAttribute("data-peer") || "";
      void selectThread(threadId, peer);
    });
  });
}

function renderMessages(messages, placeholder) {
  if (!messagesArea) {
    return;
  }

  if (!messages || messages.length === 0) {
    messagesArea.innerHTML = `<div class="sms-placeholder">${escapeHtml(placeholder)}</div>`;
    return;
  }

  messagesArea.innerHTML = messages
    .map((message) => {
      const directionClass = message.incoming ? "received" : "sent";
      const timestamp = formatTimestamp(message.timestamp);
      const meta = timestamp || message.state || "";

      return `
        <div class="sms-message ${directionClass}">
          <div>
            <div class="sms-message-bubble">${escapeHtml(message.text || "")}</div>
            <div class="sms-message-time">${escapeHtml(meta)}</div>
          </div>
        </div>
      `;
    })
    .join("");

  messagesArea.scrollTop = messagesArea.scrollHeight;
}

function setActiveThread(threadId, peer) {
  smsState.selectedThreadId = threadId;
  smsState.selectedPeer = peer;

  if (chatTitle) {
    chatTitle.textContent = peer || "Select a conversation";
  }

  setComposerEnabled(Boolean(threadId));
  renderContacts();
}

async function loadConversation(threadId) {
  const { getSmsConversation } = await import("../../tauri-api.js");

  smsState.loadingConversation = true;
  renderMessages([], "Loading conversation...");

  try {
    const messages = await getSmsConversation(threadId);
    renderMessages(messages, "No messages yet");
  } catch (error) {
    console.error("Failed to load SMS conversation:", error);
    renderMessages([], "Unable to load conversation");
  } finally {
    smsState.loadingConversation = false;
  }
}

async function selectThread(threadId, peer) {
  if (!threadId) {
    setActiveThread(null, "");
    renderMessages([], "Select a conversation to view messages");
    return;
  }

  setActiveThread(threadId, peer);
  await loadConversation(threadId);
}

export async function refreshSMS() {
  if (!contactsList || smsState.loadingThreads) {
    return;
  }

  const { getSmsThreads } = await import("../../tauri-api.js");
  smsState.loadingThreads = true;

  try {
    const threads = await getSmsThreads();
    smsState.threads = Array.isArray(threads) ? threads : [];

    if (smsState.threads.length === 0) {
      smsState.selectedThreadId = null;
      smsState.selectedPeer = "";
      if (chatTitle) {
        chatTitle.textContent = "No conversations";
      }
      setComposerEnabled(false);
      renderContacts();
      renderMessages([], "No modem messages found");
      return;
    }

    const selectedThread =
      smsState.threads.find((thread) => thread.id === smsState.selectedThreadId) || smsState.threads[0];

    renderContacts();

    if (selectedThread && !smsState.loadingConversation && !smsState.sending) {
      await selectThread(selectedThread.id, selectedThread.peer);
    } else if (selectedThread) {
      setActiveThread(selectedThread.id, selectedThread.peer);
    }
  } catch (error) {
    console.error("Failed to refresh SMS threads:", error);
    smsState.threads = [];
    smsState.selectedThreadId = null;
    smsState.selectedPeer = "";
    renderContacts();
    renderMessages([], "Unable to load modem messages");
    if (chatTitle) {
      chatTitle.textContent = "Messages unavailable";
    }
    setComposerEnabled(false);
  } finally {
    smsState.loadingThreads = false;
  }
}

async function handleSendMessage() {
  const text = messageInput?.value.trim() || "";
  const threadId = smsState.selectedThreadId;
  const number = smsState.selectedPeer;

  if (!text || !threadId || !number || smsState.sending) {
    return;
  }

  const { sendSms } = await import("../../tauri-api.js");
  smsState.sending = true;
  setComposerEnabled(true);

  try {
    await sendSms(number, text);
    messageInput.value = "";
    await refreshSMS();
    await loadConversation(threadId);
  } catch (error) {
    console.error("Failed to send SMS:", error);
    renderMessages([], `Send failed: ${String(error)}`);
    await loadConversation(threadId);
  } finally {
    smsState.sending = false;
    setComposerEnabled(Boolean(smsState.selectedThreadId));
  }
}

export function initSMS() {
  smsTab = document.querySelector("#sms-tab");
  networkTab = document.querySelector("#network-tab");
  contentShell = document.querySelector(".content-shell");
  contactsList = document.querySelector("#sms-contacts-list");
  messagesArea = document.querySelector("#sms-messages-area");
  chatTitle = document.querySelector("#sms-chat-title");
  messageInput = document.querySelector("#sms-input");
  sendBtn = document.querySelector("#sms-send-btn");

  window.addEventListener("sidebar-item-click", (e) => {
    if (e.detail.label === "SMS") {
      if (smsTab) {
        smsTab.style.display = "flex";
      }

      if (networkTab) {
        networkTab.style.display = "none";
      }

      if (contentShell) {
        contentShell.style.overflow = "hidden";
        contentShell.classList.add("sms-active");
        contentShell.classList.remove("network-active");
      }

      void refreshSMS();
    } else if (smsTab) {
      smsTab.style.display = "none";

      if (contentShell) {
        contentShell.classList.remove("sms-active");
        if (!contentShell.classList.contains("network-active")) {
          contentShell.style.overflow = "auto";
        }
      }
    }
  });

  setComposerEnabled(false);
  renderContacts();
  renderMessages([], "Select a conversation to view messages");

  sendBtn?.addEventListener("click", () => {
    void handleSendMessage();
  });

  messageInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage();
    }
  });
}
