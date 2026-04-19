import {
  setInternetStatus,
  setNetworkProvider,
  setNetworkSignal,
} from "./components/topbar/topbar.js";
import { initSidebar } from "./components/sidebar/sidebar.js";
import { initSMS } from "./components/sms/sms.js";
import { startModemPolling } from "./tauri-api.js";

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
    loadComponent("./components/sms/sms.html", "sms-mount"),
  ]);

  // Initialize components
  initSidebar();
  initSMS();

  // Render immediately with safe defaults, then hydrate from backend.
  setInternetStatus({ connected: false, radioTech: "LTE" });
  setNetworkProvider("No Network");
  setNetworkSignal(-105);

  // Fetch real modem data from backend and update UI.
  startModemPolling(5000);
}

// Start app when DOM is ready
window.addEventListener("DOMContentLoaded", initializeApp);
