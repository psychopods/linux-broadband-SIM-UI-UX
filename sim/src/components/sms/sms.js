// Sample messages data
const messagesData = {
  1: [
    { text: "Hello! How are you?", sent: false, time: "10:30" },
    { text: "I'm doing great, thanks!", sent: true, time: "10:31" },
    { text: "Want to grab coffee?", sent: false, time: "10:32" },
  ],
  2: [
    { text: "See you later", sent: false, time: "09:15" },
    { text: "Sounds good!", sent: true, time: "09:16" },
  ],
};

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function initSMS() {
  const smsTab = document.querySelector("#sms-tab");
  const networkTab = document.querySelector("#network-tab");
  const contentShell = document.querySelector(".content-shell");
  const contactItems = document.querySelectorAll(".sms-contact-item");
  const messagesArea = document.querySelector("#sms-messages-area");
  const chatTitle = document.querySelector("#sms-chat-title");
  const messageInput = document.querySelector("#sms-input");
  const sendBtn = document.querySelector("#sms-send-btn");

  // Handle SMS tab toggle
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

  // Handle contact selection
  contactItems.forEach((item) => {
    item.addEventListener("click", () => {
      // Remove active state from all contacts
      contactItems.forEach((c) => c.classList.remove("active"));
      item.classList.add("active");

      const contactId = item.getAttribute("data-contact-id");
      const contactName = item.querySelector(".sms-contact-name").textContent;

      // Update chat header
      chatTitle.textContent = contactName;

      // Update messages
      const messages = messagesData[contactId] || [];
      messagesArea.innerHTML = "";

      if (messages.length === 0) {
        messagesArea.innerHTML = '<div class="sms-placeholder">No messages yet</div>';
      } else {
        messages.forEach((msg) => {
          const msgDiv = document.createElement("div");
          msgDiv.className = `sms-message ${msg.sent ? "sent" : "received"}`;
          msgDiv.innerHTML = `
            <div>
              <div class="sms-message-bubble">${escapeHtml(msg.text)}</div>
              <div class="sms-message-time">${msg.time}</div>
            </div>
          `;
          messagesArea.appendChild(msgDiv);
        });
      }

      // Enable input
      messageInput.disabled = false;
      sendBtn.disabled = false;

      // Auto-scroll to bottom
      messagesArea.scrollTop = messagesArea.scrollHeight;
    });
  });

  // Send message handler
  sendBtn.addEventListener("click", () => {
    const text = messageInput.value.trim();
    if (!text) return;

    const activeContact = document.querySelector(".sms-contact-item.active");
    if (!activeContact) return;

    const contactId = activeContact.getAttribute("data-contact-id");
    if (!messagesData[contactId]) {
      messagesData[contactId] = [];
    }

    // Add message to data
    const now = new Date();
    const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    messagesData[contactId].push({ text, sent: true, time });

    // Display message
    const msgDiv = document.createElement("div");
    msgDiv.className = "sms-message sent";
    msgDiv.innerHTML = `
      <div>
        <div class="sms-message-bubble">${escapeHtml(text)}</div>
        <div class="sms-message-time">${time}</div>
      </div>
    `;
    messagesArea.appendChild(msgDiv);

    // Clear input
    messageInput.value = "";
    messagesArea.scrollTop = messagesArea.scrollHeight;
  });

  // Enter key to send
  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendBtn.click();
    }
  });
}
