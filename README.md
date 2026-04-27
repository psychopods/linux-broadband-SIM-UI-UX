# SIM Broadband Manager

A Linux desktop application for managing mobile broadband SIM modems. Monitor connectivity, send SMS, make calls, run USSD codes, and manage your SIM phonebook — all from a clean native UI.

Built with [Tauri 2](https://tauri.app/) (Rust + WebKit2GTK) and powered by [ModemManager](https://modemmanager.org/) over D-Bus.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, testing, and pull request guidelines.

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community participation and behavior expectations.

See [SECURITY.md](SECURITY.md) for vulnerability reporting and supported version policy.

---

## Features

- **Signal & Network Status** — real-time signal strength, radio technology (4G/LTE/5G), operator name, roaming state, and registration status
- **Data Connection** — connect/disconnect with custom APN, view active bearer details (IP, speed, interface)
- **SMS** — threaded conversations, send messages, view full history per contact
- **Phone Calls** — initiate, answer, hang up, and send DTMF tones
- **USSD** — send codes (e.g. `*100#`), handle interactive sessions
- **SIM Contacts** — browse the phonebook stored on your SIM card
- **SIM Management** — PIN unlock, lock state display
- **Auto-updater** — built-in update check with signed AppImage delivery via GitHub Releases

---

## Installation

### AppImage (recommended)

Download the latest `.AppImage` from [Releases](https://github.com/psychopods/linux-broadband-SIM-UI-UX/releases/latest), make it executable, and run it:

```bash
chmod +x SIM.Broadband.Manager_*.AppImage
./SIM.Broadband.Manager_*.AppImage
```

### Debian / Ubuntu (.deb)

```bash
sudo dpkg -i sim-broadband-manager_*.deb
```

### Snap

```bash
sudo snap install sim-broadband-manager
```

> **Note:** ModemManager must be running on your system. On most Ubuntu/Debian systems it is installed by default. Verify with `systemctl status ModemManager`.

---

## Requirements

| Requirement  | Details                                              |
| ------------ | ---------------------------------------------------- |
| OS           | Linux (Ubuntu 22.04+ / Debian 12+ / Linux Mint 21+)  |
| ModemManager | ≥ 1.18                                               |
| D-Bus        | System bus access to `org.freedesktop.ModemManager1` |
| Modem        | USB or PCIe modem recognised by ModemManager         |

### Permissions (AppImage)

The app communicates with ModemManager over the system D-Bus. If your modem isn't detected, ensure your user is in the `dialout` group:

```bash
sudo usermod -aG dialout $USER
# Log out and back in for the change to take effect
```

---

## Building from Source

### Prerequisites

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# System dependencies (Ubuntu/Debian)
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev \
  libjavascriptcoregtk-4.1-dev libappindicator3-dev \
  librsvg2-dev libglib2.0-dev libxdo-dev patchelf

# Tauri CLI
cargo install tauri-cli --version '^2' --locked
```

### Build

```bash
git clone https://github.com/psychopods/linux-broadband-SIM-UI-UX.git
cd linux-broadband-SIM-UI-UX/sim/src-tauri
cargo tauri build
```

The AppImage and `.deb` will be output to `sim/src-tauri/target/release/bundle/`.

---

## Tech Stack

| Layer         | Technology                        |
| ------------- | --------------------------------- |
| UI            | HTML / CSS / JavaScript (vanilla) |
| Desktop shell | Tauri 2 (Rust)                    |
| Modem backend | ModemManager via zbus (D-Bus)     |
| Packaging     | AppImage, .deb, Snap              |
| CI/CD         | GitHub Actions                    |

---

## License

[MIT](LICENSE)
