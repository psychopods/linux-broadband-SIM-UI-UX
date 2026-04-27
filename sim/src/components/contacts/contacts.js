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
let detailMessageUserBtn;

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

function getAvatarLetter(label) {
  const trimmed = (label || "").trim();
  if (!trimmed) return "?";
  const match = trimmed.match(/[a-zA-Z0-9]/);
  return match ? match[0].toUpperCase() : trimmed[0];
}

function getContactLabel(contact) {
  return String(contact?.name || contact?.number || "").trim();
}

function getContactNumber(contact) {
  return String(contact?.number || "").trim();
}

function getContactLastMessage(contact) {
  return String(contact?.last_message?.text || "");
}

function openSmsComposerForContact(contact) {
  const number = getContactNumber(contact);
  if (!number) {
    return;
  }

  const name = getContactLabel(contact);
  const smsSidebarItem = document.querySelector(
    '.sidebar-item[aria-label="SMS"]',
  );
  if (smsSidebarItem) {
    smsSidebarItem.click();
  } else {
    window.dispatchEvent(
      new CustomEvent("sidebar-item-click", { detail: { label: "SMS" } }),
    );
  }

  window.dispatchEvent(
    new CustomEvent("sms-compose-recipient", {
      detail: {
        number,
        label: name || number,
      },
    }),
  );
}

// Hue derived from contact identity so each contact gets a stable colour
function getPeerHue(identity) {
  let hash = 0;
  for (let i = 0; i < identity.length; i++) {
    hash = (hash * 31 + identity.charCodeAt(i)) & 0xffffffff;
  }
  return (hash >>> 0) % 360;
}

function avatarStyle(identity) {
  const hue = getPeerHue(identity);
  return `background: hsl(${hue}, 40%, 88%); border-color: hsl(${hue}, 45%, 70%);`;
}

function letterStyle(identity) {
  const hue = getPeerHue(identity);
  return `color: hsl(${hue}, 55%, 35%);`;
}

function getFilteredThreads(contacts) {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  if (!normalizedQuery) {
    return contacts;
  }

  return contacts.filter((contact) => {
    const name = getContactLabel(contact).toLowerCase();
    const number = getContactNumber(contact).toLowerCase();
    const lastMessage = getContactLastMessage(contact).toLowerCase();
    return (
      name.includes(normalizedQuery) ||
      number.includes(normalizedQuery) ||
      lastMessage.includes(normalizedQuery)
    );
  });
}

function syncSelection(filteredThreads) {
  if (!selectedContactId) {
    return;
  }

  const selectedThread = filteredThreads.find(
    (thread) => thread.id === selectedContactId,
  );
  if (selectedThread) {
    showDetailCard(selectedThread);
    return;
  }

  selectedContactId = null;
  if (detailEmpty && detailCard) {
    detailCard.hidden = true;
    detailEmpty.hidden = false;
  }
}

// ── Render ─────────────────────────────────────────────────────────────────

function renderGrid(contacts) {
  if (!contactsGrid) return;

  const filteredThreads = getFilteredThreads(contacts);
  syncSelection(filteredThreads);

  if (!contacts || contacts.length === 0) {
    contactsGrid.innerHTML =
      '<div class="contacts-placeholder">No contacts found</div>';
    if (contactsCount) contactsCount.textContent = "";
    return;
  }

  if (contactsCount) {
    const totalLabel = `${contacts.length} contact${contacts.length !== 1 ? "s" : ""}`;
    contactsCount.textContent =
      filteredThreads.length === contacts.length
        ? totalLabel
        : `${filteredThreads.length} of ${contacts.length}`;
  }

  if (filteredThreads.length === 0) {
    contactsGrid.innerHTML =
      '<div class="contacts-placeholder">No matching contacts</div>';
    return;
  }

  contactsGrid.innerHTML = filteredThreads
    .map((contact) => {
      const label = getContactLabel(contact);
      const number = getContactNumber(contact);
      const identity = `${label}|${number}|${contact.id}`;
      const letter = getAvatarLetter(label || number);
      const selected = contact.id === selectedContactId ? " selected" : "";
      return `
        <button
          class="contact-card${selected}"
          type="button"
          data-contact-id="${escapeHtml(contact.id)}"
          aria-pressed="${contact.id === selectedContactId}"
          title="${escapeHtml(label || number)}"
        >
          <div class="contact-avatar" style="${avatarStyle(identity)}">
            <span class="contact-avatar-letter" style="${letterStyle(identity)}">${escapeHtml(letter)}</span>
          </div>
          <span class="contact-name-label">${escapeHtml(label || number)}</span>
        </button>
      `;
    })
    .join("");

  contactsGrid.querySelectorAll(".contact-card").forEach((card) => {
    card.addEventListener("click", () => {
      const contactId = card.getAttribute("data-contact-id") || "";
      const contact = allContacts.find((item) => item.id === contactId);
      selectContact(contactId, contact);
    });
  });
}

function selectContact(contactId, contact) {
  selectedContactId = contactId;

  contactsGrid?.querySelectorAll(".contact-card").forEach((card) => {
    const isSelected = card.getAttribute("data-contact-id") === contactId;
    card.classList.toggle("selected", isSelected);
    card.setAttribute("aria-pressed", String(isSelected));
  });

  if (contact) {
    showDetailCard(contact);
  }
}

function showDetailCard(contact) {
  if (!detailCard || !detailEmpty) return;

  const label = getContactLabel(contact);
  const number = getContactNumber(contact);
  const letter = getAvatarLetter(label || number);
  const hue = getPeerHue(`${label}|${number}|${contact?.id || ""}`);
  detailAvatar.style.cssText = `
    background: hsl(${hue}, 40%, 88%);
    border-color: hsl(${hue}, 55%, 60%);
    box-shadow: 0 6px 20px hsl(${hue}, 45%, 70%, 0.4);
  `;
  detailAvatar.innerHTML = `<span class="contacts-detail-avatar-letter" style="color: hsl(${hue}, 55%, 32%);">${escapeHtml(letter)}</span>`;

  detailName.textContent = label || number || "Unknown contact";
  detailNumber.textContent = number || "No number stored";

  const lastText = contact?.last_message?.text?.trim();
  const isIncoming = contact?.last_message?.incoming;
  if (lastText) {
    const dir = isIncoming ? "Received" : "Sent";
    detailLastMsg.innerHTML = `
      <span class="contacts-detail-msg-dir">${dir}: </span>${escapeHtml(lastText)}
    `;
  } else {
    detailLastMsg.innerHTML =
      '<span class="contacts-detail-no-msg">No messages yet</span>';
  }

  if (detailMessageUserBtn) {
    const canMessage = Boolean(number);
    detailMessageUserBtn.disabled = !canMessage;
    detailMessageUserBtn.onclick = () => {
      openSmsComposerForContact(contact);
    };
  }

  detailEmpty.hidden = true;
  detailCard.hidden = false;
}

// ── Init & refresh ─────────────────────────────────────────────────────────

export async function refreshContacts() {
  if (!contactsTab || contactsTab.style.display === "none") return;

  try {
    const { getSimContacts } = await import("../../tauri-api.js");
    const contacts = await getSimContacts();
    allContacts = Array.isArray(contacts) ? contacts : [];
    renderGrid(allContacts);

    if (selectedContactId) {
      const contact = allContacts.find((item) => item.id === selectedContactId);
      if (contact) {
        showDetailCard(contact);
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
  detailMessageUserBtn = document.querySelector("#contacts-message-user-btn");

  if (detailMessageUserBtn) {
    detailMessageUserBtn.disabled = true;
  }

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
        contentShell.classList.remove(
          "sms-active",
          "network-active",
          "ussd-active",
          "phone-active",
        );
      }

      void refreshContacts();
    } else if (contactsTab) {
      contactsTab.style.display = "none";
    }
  });
}
