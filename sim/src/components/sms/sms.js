let smsTab;
let networkTab;
let contentShell;
let contactsList;
let messagesArea;
let chatTitle;
let messageInput;
let sendBtn;
let newMessagesIndicator;

const SMS_READ_STATE_KEY = "sim.sms.readState";

const smsState = {
  threads: [],
  selectedThreadId: null,
  selectedPeer: "",
  selectedLabel: "",
  pendingCompose: null,
  renderedThreadsKey: "",
  renderedConversationKey: "",
  lastConversationMessages: [],
  readState: loadReadState(),
  pendingIncomingCount: 0,
  loadingThreads: false,
  loadingConversation: false,
  sending: false,
};

function loadReadState() {
  try {
    return JSON.parse(window.localStorage.getItem(SMS_READ_STATE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveReadState() {
  try {
    window.localStorage.setItem(SMS_READ_STATE_KEY, JSON.stringify(smsState.readState));
  } catch {
    // Ignore storage failures and keep the in-memory session state.
  }
}

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

function normalizePhone(value) {
  return String(value || "").replace(/\D+/g, "");
}

function phoneMatches(left, right) {
  const a = normalizePhone(left);
  const b = normalizePhone(right);

  if (!a || !b) {
    return String(left || "").trim() === String(right || "").trim();
  }

  if (a === b) {
    return true;
  }

  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.length >= 7 && longer.endsWith(shorter);
}

function findThreadByPeer(peer) {
  return smsState.threads.find((thread) => phoneMatches(thread.peer, peer)) || null;
}

function getThreadsKey(threads) {
  return JSON.stringify(
    (threads || []).map((thread) => ({
      id: thread.id,
      peer: thread.peer,
      message_count: thread.message_count,
      last_message_id: thread.last_message?.id || "",
      last_message_text: thread.last_message?.text || "",
      last_message_timestamp: thread.last_message?.timestamp || "",
    }))
  );
}

function getConversationKey(messages) {
  return JSON.stringify(
    (messages || []).map((message) => ({
      id: message.id,
      text: message.text || "",
      timestamp: message.timestamp || "",
      state: message.state || "",
      incoming: Boolean(message.incoming),
    }))
  );
}

function getLatestIncomingMessage(messages) {
  return [...(messages || [])].reverse().find((message) => message.incoming) || null;
}

function getReadMarker(threadId) {
  return smsState.readState[threadId] || null;
}

function getUnreadCountForMessages(threadId, messages) {
  const marker = getReadMarker(threadId);
  let unreadCount = 0;

  for (const message of messages || []) {
    if (!message.incoming) {
      continue;
    }

    if (marker && marker.id === message.id) {
      unreadCount = 0;
      continue;
    }

    unreadCount += 1;
  }

  return unreadCount;
}

function updateSidebarUnreadBadge() {
  import("../sidebar/sidebar.js")
    .then(({ setSidebarBadge }) => {
      const unreadCount = smsState.threads.reduce(
        (total, thread) => total + (smsState.readState[thread.id]?.unreadCount || 0),
        0
      );

      setSidebarBadge("SMS", unreadCount);
    })
    .catch((error) => {
      console.error("Failed to update SMS sidebar badge:", error);
    });
}

function isNearBottom() {
  if (!messagesArea) {
    return true;
  }

  const threshold = 48;
  return messagesArea.scrollHeight - messagesArea.scrollTop - messagesArea.clientHeight <= threshold;
}

function restoreScroll(previousOffsetFromBottom) {
  if (!messagesArea) {
    return;
  }

  messagesArea.scrollTop = Math.max(0, messagesArea.scrollHeight - messagesArea.clientHeight - previousOffsetFromBottom);
}

function setNewMessagesIndicator(count) {
  smsState.pendingIncomingCount = count;

  if (!newMessagesIndicator) {
    return;
  }

  if (count > 0) {
    newMessagesIndicator.hidden = false;
    newMessagesIndicator.textContent = count === 1 ? "1 new message" : `${count} new messages`;
  } else {
    newMessagesIndicator.hidden = true;
    newMessagesIndicator.textContent = "";
  }
}

function markThreadAsRead(threadId, messages) {
  const latestIncoming = getLatestIncomingMessage(messages);
  if (!threadId) {
    setNewMessagesIndicator(0);
    updateSidebarUnreadBadge();
    return;
  }

  smsState.readState[threadId] = {
    id: latestIncoming?.id || smsState.readState[threadId]?.id || "",
    timestamp: latestIncoming?.timestamp || smsState.readState[threadId]?.timestamp || "",
    unreadCount: 0,
    knownMessageCount: messages.length,
  };
  saveReadState();
  setNewMessagesIndicator(0);
  updateSidebarUnreadBadge();
}

function syncUnreadStateForThreads() {
  let changed = false;
  const activeVisibleAndAtBottom =
    smsTab?.style.display !== "none" &&
    smsState.selectedThreadId &&
    isNearBottom();
  const activeThreadIds = new Set(smsState.threads.map((thread) => thread.id));

  for (const threadId of Object.keys(smsState.readState)) {
    if (!activeThreadIds.has(threadId)) {
      delete smsState.readState[threadId];
      changed = true;
    }
  }

  for (const thread of smsState.threads) {
    const previous = smsState.readState[thread.id] || {};
    let unreadCount = previous.unreadCount || 0;
    let knownMessageCount = previous.knownMessageCount || 0;

    if (thread.message_count < knownMessageCount) {
      unreadCount = 0;
      knownMessageCount = thread.message_count;
    }

    const delta = Math.max(0, thread.message_count - knownMessageCount);
    if (delta > 0) {
      if (
        thread.id === smsState.selectedThreadId &&
        activeVisibleAndAtBottom
      ) {
        unreadCount = 0;
      } else if (thread.last_message?.incoming) {
        unreadCount += delta;
      }
      knownMessageCount = thread.message_count;
    }

    const next = {
      id: previous.id || "",
      timestamp: previous.timestamp || "",
      unreadCount,
      knownMessageCount,
    };

    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      smsState.readState[thread.id] = next;
      changed = true;
    }
  }

  if (changed) {
    saveReadState();
  }
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
    smsState.renderedThreadsKey = "__loading__";
    updateSidebarUnreadBadge();
    return;
  }

  if (smsState.threads.length === 0) {
    contactsList.innerHTML = '<div class="sms-placeholder">No modem messages found</div>';
    smsState.renderedThreadsKey = "__empty__";
    updateSidebarUnreadBadge();
    return;
  }

  const threadsKey = `${getThreadsKey(smsState.threads)}::${smsState.selectedThreadId || ""}`;
  if (threadsKey === smsState.renderedThreadsKey) {
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

  smsState.renderedThreadsKey = threadsKey;
  updateSidebarUnreadBadge();
}

function renderMessages(messages, placeholder, options = {}) {
  if (!messagesArea) {
    return;
  }

  const preserveScroll = Boolean(options.preserveScroll);
  const shouldAutoScroll = options.autoScroll ?? true;
  const previousOffsetFromBottom = preserveScroll
    ? Math.max(0, messagesArea.scrollHeight - messagesArea.scrollTop - messagesArea.clientHeight)
    : 0;
  const conversationKey = getConversationKey(messages);

  if (!messages || messages.length === 0) {
    const emptyKey = `empty:${placeholder}`;
    if (emptyKey === smsState.renderedConversationKey) {
      return;
    }
    messagesArea.innerHTML = `<div class="sms-placeholder">${escapeHtml(placeholder)}</div>`;
    smsState.renderedConversationKey = emptyKey;
    return;
  }

  if (conversationKey === smsState.renderedConversationKey) {
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

  smsState.renderedConversationKey = conversationKey;

  if (preserveScroll) {
    restoreScroll(previousOffsetFromBottom);
  } else if (shouldAutoScroll) {
    messagesArea.scrollTop = messagesArea.scrollHeight;
  }
}

function setActiveThread(threadId, peer, label = "") {
  smsState.selectedThreadId = threadId;
  smsState.selectedPeer = peer;
  smsState.selectedLabel = label || peer || "";

  if (chatTitle) {
    chatTitle.textContent = smsState.selectedLabel || "Select a conversation";
  }

  setComposerEnabled(Boolean(peer));
  renderContacts();
}

async function loadConversation(threadId, options = {}) {
  const { getSmsConversation } = await import("../../tauri-api.js");
  const showLoading = options.showLoading ?? true;
  const preserveScroll = options.preserveScroll ?? false;
  const autoScroll = options.autoScroll ?? true;
  const markReadIfAtBottom = options.markReadIfAtBottom ?? true;

  smsState.loadingConversation = true;
  if (showLoading) {
    renderMessages([], "Loading conversation...");
  }

  try {
    const messages = await getSmsConversation(threadId);
    const wasNearBottom = isNearBottom();
    const previousKey = smsState.renderedConversationKey;
    const nextKey = getConversationKey(messages);
    const unreadIncoming = getUnreadCountForMessages(threadId, messages);
    const incomingChanged =
      previousKey &&
      previousKey !== nextKey &&
      getLatestIncomingMessage(messages)?.id !== getLatestIncomingMessage(smsState.lastConversationMessages)?.id;

    smsState.lastConversationMessages = messages;

    renderMessages(messages, "No messages yet", {
      preserveScroll,
      autoScroll,
    });

    // Only mark as read if this is not the very first load (previousKey exists),
    // or if the user explicitly triggered the load (e.g. clicked a thread).
    // This prevents the badge from flashing in and immediately disappearing on startup.
    const isInitialLoad = !previousKey || previousKey === "__loading__";
    if (markReadIfAtBottom && !isInitialLoad && (autoScroll || wasNearBottom)) {
      markThreadAsRead(threadId, messages);
    } else if (incomingChanged && unreadIncoming > 0) {
      setNewMessagesIndicator(unreadIncoming);
      updateSidebarUnreadBadge();
    }
  } catch (error) {
    console.error("Failed to load SMS conversation:", error);
    renderMessages([], "Unable to load conversation");
  } finally {
    smsState.loadingConversation = false;
  }
}

async function selectThread(threadId, peer) {
  if (!threadId) {
    setActiveThread(null, "", "");
    smsState.lastConversationMessages = [];
    setNewMessagesIndicator(0);
    renderMessages([], "Select a conversation to view messages");
    return;
  }

  setActiveThread(threadId, peer, peer);
  await loadConversation(threadId, {
    showLoading: true,
    preserveScroll: false,
    autoScroll: true,
  });
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
    syncUnreadStateForThreads();

    if (smsState.threads.length === 0) {
      smsState.selectedThreadId = null;
      smsState.selectedPeer = "";
      smsState.selectedLabel = "";
      smsState.renderedConversationKey = "";
      smsState.lastConversationMessages = [];
      setNewMessagesIndicator(0);
      if (chatTitle) {
        chatTitle.textContent = "No conversations";
      }
      setComposerEnabled(false);
      renderContacts();
      renderMessages([], "No modem messages found");
      return;
    }

    if (smsState.pendingCompose?.number) {
      const composeNumber = smsState.pendingCompose.number;
      const composeLabel = smsState.pendingCompose.label || composeNumber;
      const matchingThread = findThreadByPeer(composeNumber);

      if (matchingThread) {
        smsState.pendingCompose = null;
        await selectThread(matchingThread.id, matchingThread.peer);
      } else {
        setActiveThread(null, composeNumber, composeLabel);
        smsState.lastConversationMessages = [];
        smsState.renderedConversationKey = "";
        renderMessages([], `Start a new message to ${composeLabel}`);
        renderContacts();
      }
      return;
    }

    const selectedThread =
      smsState.threads.find((thread) => thread.id === smsState.selectedThreadId) || smsState.threads[0];

    renderContacts();

    if (selectedThread && !smsState.loadingConversation && !smsState.sending) {
      const selectedChanged =
        selectedThread.id !== smsState.selectedThreadId || selectedThread.peer !== smsState.selectedPeer;
      if (selectedChanged) {
        await selectThread(selectedThread.id, selectedThread.peer);
      } else {
        setActiveThread(selectedThread.id, selectedThread.peer, selectedThread.peer);
        await loadConversation(selectedThread.id, {
          showLoading: false,
          preserveScroll: !isNearBottom(),
          autoScroll: isNearBottom(),
          markReadIfAtBottom: true,
        });
      }
    } else if (selectedThread) {
      setActiveThread(selectedThread.id, selectedThread.peer, selectedThread.peer);
    }
  } catch (error) {
    console.error("Failed to refresh SMS threads:", error);
    smsState.threads = [];
    smsState.selectedThreadId = null;
    smsState.selectedPeer = "";
    smsState.renderedThreadsKey = "";
    smsState.renderedConversationKey = "";
    smsState.lastConversationMessages = [];
    setNewMessagesIndicator(0);
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
  const number = smsState.selectedPeer;

  if (!text || !number || smsState.sending) {
    return;
  }

  const { sendSms } = await import("../../tauri-api.js");
  smsState.sending = true;
  setComposerEnabled(true);

  try {
    await sendSms(number, text);
    messageInput.value = "";
    await refreshSMS();

    const matchingThread = findThreadByPeer(number);
    if (matchingThread) {
      await selectThread(matchingThread.id, matchingThread.peer);
    } else {
      renderMessages([], `Message sent to ${smsState.selectedLabel || number}`);
    }
  } catch (error) {
    console.error("Failed to send SMS:", error);
    renderMessages([], `Send failed: ${String(error)}`);

    if (smsState.selectedThreadId) {
      await loadConversation(smsState.selectedThreadId, {
        showLoading: false,
        preserveScroll: true,
        autoScroll: false,
        markReadIfAtBottom: false,
      });
    }
  } finally {
    smsState.sending = false;
    setComposerEnabled(Boolean(smsState.selectedPeer));
  }
}

export function initSMS() {
  smsTab = document.querySelector("#sms-tab");
  networkTab = document.querySelector("#network-tab");
  const ussdTab = document.querySelector("#ussd-tab");
  const phoneTab = document.querySelector("#phone-tab");
  contentShell = document.querySelector(".content-shell");
  contactsList = document.querySelector("#sms-contacts-list");
  messagesArea = document.querySelector("#sms-messages-area");
  chatTitle = document.querySelector("#sms-chat-title");
  messageInput = document.querySelector("#sms-input");
  sendBtn = document.querySelector("#sms-send-btn");
  newMessagesIndicator = document.createElement("button");
  newMessagesIndicator.type = "button";
  newMessagesIndicator.className = "sms-new-messages-indicator";
  newMessagesIndicator.hidden = true;
  newMessagesIndicator.addEventListener("click", () => {
    if (!messagesArea) {
      return;
    }

    messagesArea.scrollTop = messagesArea.scrollHeight;
    markThreadAsRead(smsState.selectedThreadId, smsState.lastConversationMessages);
  });
  messagesArea?.parentElement?.appendChild(newMessagesIndicator);

  window.addEventListener("sidebar-item-click", (e) => {
    if (e.detail.label === "SMS") {
      if (smsTab) {
        smsTab.style.display = "flex";
      }

      if (networkTab) {
        networkTab.style.display = "none";
      }

      if (ussdTab) {
        ussdTab.style.display = "none";
      }

      if (phoneTab) {
        phoneTab.style.display = "none";
      }

      if (contentShell) {
        contentShell.style.overflow = "hidden";
        contentShell.classList.add("sms-active");
        contentShell.classList.remove("network-active");
        contentShell.classList.remove("ussd-active");
        contentShell.classList.remove("phone-active");
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

  window.addEventListener("sms-compose-recipient", (event) => {
    const number = String(event?.detail?.number || "").trim();
    const label = String(event?.detail?.label || number).trim() || number;
    if (!number) {
      return;
    }

    smsState.pendingCompose = { number, label };
    if (smsTab?.style.display !== "none") {
      void refreshSMS();
    }
  });

  setComposerEnabled(false);
  renderContacts();
  renderMessages([], "Select a conversation to view messages");
  updateSidebarUnreadBadge();

  messagesArea?.addEventListener("scroll", () => {
    if (isNearBottom() && smsState.selectedThreadId) {
      markThreadAsRead(smsState.selectedThreadId, smsState.lastConversationMessages);
    }
  });

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
