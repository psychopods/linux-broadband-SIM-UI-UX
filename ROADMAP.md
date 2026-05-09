# Roadmap

This roadmap keeps the project focused on being a practical Linux desktop app for mobile broadband modems. It intentionally does not include cluster, Kubernetes, or distributed orchestration work.

## Near Term

- Keep mock mode useful for UI and documentation contributors.
- Add screenshots and short demo GIFs to the README.
- Improve hardware compatibility notes with community test reports.
- Make the Phone screen reachable only when the modem exposes voice support.
- Improve error messages for missing ModemManager, missing permissions, and unsupported modem capabilities.

## Mid Term

- Add network scan and operator selection when supported by ModemManager.
- Add diagnostics for modem path, IMEI, raw access technology, and signal quality.
- Improve SMS history handling and unread state.
- Add UI language support, starting with English and Swahili.
- Explore Flatpak/Flathub packaging alongside AppImage, deb, and Snap.

## Long Term

- Provide a reusable CLI around the root Rust modem library.
- Add richer modem compatibility profiles for known hardware.
- Improve automated tests around parsing, mock data, and frontend command wrappers.
