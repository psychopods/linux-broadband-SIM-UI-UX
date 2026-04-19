export function initSidebar() {
  // Sidebar items can register click handlers
  const sidebarItems = document.querySelectorAll(".sidebar-item");

  sidebarItems.forEach((item) => {
    item.addEventListener("click", () => {
      const label = item.getAttribute("aria-label");
      // Dispatch custom event for component coordination
      window.dispatchEvent(
        new CustomEvent("sidebar-item-click", { detail: { label } })
      );
    });
  });
}

export function getSidebarItemByLabel(label) {
  return Array.from(document.querySelectorAll(".sidebar-item")).find(
    (btn) => btn.getAttribute("aria-label") === label
  );
}
