let contactsTab;
let contactsGrid;
let contactsCount;
let contactsSearchInput;
let detailEmpty;
let detailCard;
let detailAvatar;
let detailName;
let detailNumber;
let detailLastMsg;

let selectedContactId = null;
let allContacts = [];
let searchQuery = "";

// ── Helpers ────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getAvatarLetter(peer) {
  const trimmed = (peer || "").trim();
  if (!trimmed) return "?";
  // Use first digit/letter that isn't + or space
  const match = trimmed.match(/[a-zA-Z0-9]/);
  return match ? match[0].toUpperCase() : trimmed[0];
}

// Hue derived from peer string so each contact gets a stable colour
function getPeerHue(peer) {
  let hash = 0;
  for (let i = 0; i < peer.length; i++) {
    hash = (hash * 31 + peer.charCodeAt(i)) & 0xffffffff;
  }
  return ((hash >>> 0) % 360);
}

function avatarStyle(peer) {
  const hue = getPeerHue(peer);
  return `background: hsl(${hue}, 40%, 88%); border-color: hsl(${hue}, 45%, 70%);`;
}

function letterStyle(peer) {
  const hue = getPeerHue(peer);
  return `color: hsl(${hue}, 55%, 35%);`;
}

function getFilteredThreads(threads) {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  if (!normalizedQuery) {
    return threads;
  }

  return threads.filter((thread) => {
    const peer = String(thread.peer || "").toLowerCase();
    const lastMessage = String(thread.last_message?.text || "").toLowerCase();
    return peer.includes(normalizedQuery) || lastMessage.includes(normalizedQuery);
  });
}

function syncSelection(filteredThreads) {
  if (!selectedContactId) {
    return;
  }

  const selectedThread = filteredThreads.find((thread) => thread.id === selectedContactId);
  if (selectedThread) {
    showDetailCard(selectedThread.peer, selectedThread);
    return;
  }

  selectedContactId = null;
  if (detailEmpty && detailCard) {
    detailCard.hidden = true;
    detailEmpty.hidden = false;
  }
}

// ── Render ─────────────────────────────────────────────────────────────────

function renderGrid(threads) {
  if (!contactsGrid) return;

  const filteredThreads = getFilteredThreads(threads);
  syncSelection(filteredThreads);

  if (!threads || threads.length === 0) {
    contactsGrid.innerHTML = '<div class="contacts-placeholder">No contacts found</div>';
    if (contactsCount) contactsCount.textContent = "";
    return;
  }

  if (contactsCount) {
    const totalLabel = `${threads.length} contact${threads.length !== 1 ? "s" : ""}`;
    contactsCount.textContent = filteredThreads.length === threads.length
      ? totalLabel
      : `${filteredThreads.length} of ${threads.length}`;
  }

  if (filteredThreads.length === 0) {
    contactsGrid.innerHTML = '<div class="contacts-placeholder">No matching contacts</div>';
    return;
  }

  contactsGrid.innerHTML = filteredThreads
    .map((thread) => {
      const letter = getAvatarLetter(thread.peer);
      const selected = thread.id === selectedContactId ? " selected" : "";
      return `
        <button
          class="contact-card${selected}"
          type="button"
          data-thread-id="${escapeHtml(thread.id)}"
          data-peer="${escapeHtml(thread.peer)}"
          aria-pressed="${thread.id === selectedContactId}"
          title="${escapeHtml(thread.peer)}"
        >
          <div class="contact-avatar" style="${avatarStyle(thread.peer)}">
            <span class="contact-avatar-letter" style="${letterStyle(thread.peer)}">${escapeHtml(letter)}</span>
          </div>
          <span class="contact-name-label">${escapeHtml(thread.peer)}</span>
        </button>
      `;
    })
    .join("");

  contactsGrid.querySelectorAll(".contact-card").forEach((card) => {
    card.addEventListener("click", () => {
      const threadId = card.getAttribute("data-thread-id") || "";
      const peer = card.getAttribute("data-peer") || "";
      const thread = (window._contactsThreads || []).find((t) => t.id === threadId);
      selectContact(threadId, peer, thread);
    });
  });
}

function selectContact(threadId, peer, thread) {
  selectedContactId = threadId;

  // Update selection highlight
  contactsGrid?.querySelectorAll(".contact-card").forEach((card) => {
    const isSelected = card.getAttribute("data-thread-id") === threadId;
    card.classList.toggle("selected", isSelected);
    card.setAttribute("aria-pressed", String(isSelected));
  });

  showDetailCard(peer, thread);
}

function showDetailCard(peer, thread) {
  if (!detailCard || !detailEmpty) return;

  // Avatar
  const letter = getAvatarLetter(peer);
  const hue = getPeerHue(peer);
  detailAvatar.style.cssText = `
    background: hsl(${hue}, 40%, 88%);
    border-color: hsl(${hue}, 55%, 60%);
    box-shadow: 0 6px 20px hsl(${hue}, 45%, 70%, 0.4);
  `;
  detailAvatar.innerHTML = `<span class="contacts-detail-avatar-letter" style="color: hsl(${hue}, 55%, 32%);">${escapeHtml(letter)}</span>`;

  // Name / number — if peer looks like a phone number show it as number only
  const looksLikeNumber = /^[\d\s\+\-\(\)]{5,}$/.test(peer.trim());
  if (looksLikeNumber) {
    detailName.textContent = peer;
    detailNumber.textContent = "";
  } else {
    detailName.textContent = peer;
    detailNumber.textContent = "";
  }

  // Last message
  const lastText = thread?.last_message?.text?.trim();
  const isIncoming = thread?.last_message?.incoming;
  if (lastText) {
    const dir = isIncoming ? "Received" : "Sent";
    detailLastMsg.innerHTML = `
      <span class="contacts-detail-msg-dir">${dir}: </span>${escapeHtml(lastText)}
    `;
  } else {
    detailLastMsg.innerHTML = '<span class="contacts-detail-no-msg">No messages yet</span>';
  }

  detailEmpty.hidden = true;
  detailCard.hidden = false;
}

// ── Init & refresh ─────────────────────────────────────────────────────────

export async function refreshContacts() {
  if (!contactsTab || contactsTab.style.display === "none") return;

  try {
    const { getSmsThreads } = await import("../../tauri-api.js");
    const threads = await getSmsThreads();
    allContacts = Array.isArray(threads) ? threads : [];
    window._contactsThreads = allContacts;
    renderGrid(allContacts);

    // If a contact was already selected, refresh its detail panel too
    if (selectedContactId) {
      const thread = allContacts.find((t) => t.id === selectedContactId);
      if (thread) {
        showDetailCard(thread.peer, thread);
      }
    }
  } catch (err) {
    console.error("Failed to load contacts:", err);
  }
}

export function initContacts() {
  contactsTab = document.querySelector("#contacts-tab");
  contactsGrid = document.querySelector("#contacts-grid");
  contactsCount = document.querySelector("#contacts-count");
  contactsSearchInput = document.querySelector("#contacts-search-input");
  detailEmpty = document.querySelector("#contacts-detail-empty");
  detailCard = document.querySelector("#contacts-detail-card");
  detailAvatar = document.querySelector("#contacts-detail-avatar");
  detailName = document.querySelector("#contacts-detail-name");
  detailNumber = document.querySelector("#contacts-detail-number");
  detailLastMsg = document.querySelector("#contacts-detail-last-msg");

  contactsSearchInput?.addEventListener("input", (event) => {
    searchQuery = event.target.value || "";
    renderGrid(allContacts);
  });

  const allTabs = () => [
    document.querySelector("#network-tab"),
    document.querySelector("#sms-tab"),
    document.querySelector("#ussd-tab"),
    document.querySelector("#phone-tab"),
  ];

  window.addEventListener("sidebar-item-click", (e) => {
    const contentShell = document.querySelector(".content-shell");

    if (e.detail.label === "Contacts") {
      // Hide all other tabs
      allTabs().forEach((tab) => {
        if (tab) tab.style.display = "none";
      });

      if (contactsTab) contactsTab.style.display = "flex";

      if (contentShell) {
        contentShell.style.overflow = "hidden";
        contentShell.classList.remove("sms-active", "network-active", "ussd-active", "phone-active");
      }

      void refreshContacts();
    } else if (contactsTab) {
      contactsTab.style.display = "none";
    }
  });
}
