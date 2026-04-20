import {
  initTopbar,
  setTopbarLoading,
} from "./components/topbar/topbar.js";
import { initSidebar } from "./components/sidebar/sidebar.js";
import { initNetworkPanel } from "./components/network/network.js";
import { initSMS } from "./components/sms/sms.js";
import { initUSSD } from "./components/ussd/ussd.js";
import { initPhone } from "./components/phone/phone.js";
import { initContacts } from "./components/contacts/contacts.js";
import { checkRuntimePermissions, startModemPolling } from "./tauri-api.js";

// Component loading function
async function loadComponent(componentPath, mountId) {
  try {
    const response = await fetch(componentPath);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while loading ${componentPath}`);
    }

    const html = await response.text();
    const mountPoint = document.getElementById(mountId);

    if (mountPoint) {
      mountPoint.innerHTML = html;
    }
  } catch (error) {
    console.error(`Failed to load component from ${componentPath}:`, error);
  }
}

// Initialize all components
async function initializeApp() {
  // Load components HTML
  await Promise.all([
    loadComponent("./components/topbar/topbar.html", "topbar-mount"),
    loadComponent("./components/sidebar/sidebar.html", "sidebar-mount"),
    loadComponent("./components/network/network.html", "network-mount"),
    loadComponent("./components/sms/sms.html", "sms-mount"),
    loadComponent("./components/ussd/ussd.html", "ussd-mount"),
    loadComponent("./components/phone/phone.html", "phone-mount"),
    loadComponent("./components/contacts/contacts.html", "contacts-mount"),
  ]);

  // Initialize components
  initTopbar();
  initSidebar();
  initNetworkPanel();
  initSMS();
  initUSSD();
  initPhone();
  initContacts();

  // Render immediately with an honest loading state, then hydrate from backend.
  setTopbarLoading();

  // AppImage/desktop runtime check for ModemManager access via D-Bus.
  const runtimePermissions = await checkRuntimePermissions();
  if (!runtimePermissions.ready_for_appimage_modem_access) {
    console.warn(
      "Permission check: modem access may fail. Ensure your user is in 'dialout' (or 'plugdev' on some systems) and re-login.",
      runtimePermissions
    );
  }

  // Fetch real modem data from backend and update UI.
  startModemPolling(5000);
}

// Start app when DOM is ready
window.addEventListener("DOMContentLoaded", initializeApp);
