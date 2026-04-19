import {
  setInternetStatus,
  setNetworkProvider,
  setNetworkSignal,
} from "./components/topbar/topbar.js";
import { initSidebar } from "./components/sidebar/sidebar.js";
import { initSMS } from "./components/sms/sms.js";

// Component loading function
async function loadComponent(componentPath, mountId) {
  try {
    const response = await fetch(componentPath);
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

  // Set placeholder values for topbar
  setInternetStatus({ connected: false, radioTech: "LTE" });
  setNetworkProvider("No Network");
  setNetworkSignal(-105);
}

// Start app when DOM is ready
window.addEventListener("DOMContentLoaded", initializeApp);
