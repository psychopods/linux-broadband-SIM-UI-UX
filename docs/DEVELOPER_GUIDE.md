# Developer Guide

This guide is for developers joining SIM Broadband Manager. It explains how the app is wired, where to make changes, and which files are responsible for frontend, backend, modem access, packaging, and releases.

## What This App Does

SIM Broadband Manager is a Linux desktop app for controlling a mobile broadband SIM modem. It can show modem/network status, connect or disconnect data, send and read SMS, run USSD codes, show SIM contacts, handle phone calls where supported, and check/install app updates.

The app has two main parts:

- Rust backend: talks to ModemManager over the system D-Bus.
- Tauri frontend: vanilla HTML/CSS/JavaScript desktop UI.

## Repository Map

```text
.
├── src/
│   ├── lib.rs                  # Main Rust modem library used by the Tauri app
│   ├── main.rs                 # Small root binary entry point
│   └── bin/
│       ├── modem_info.rs       # CLI helper for modem inspection
│       └── sim_contacts_test.rs # CLI helper for contact testing
├── sim/
│   ├── src/                    # Frontend app files
│   │   ├── index.html          # App shell and component mount points
│   │   ├── main.js             # Loads and initializes all frontend components
│   │   ├── tauri-api.js        # JavaScript wrapper around Tauri commands
│   │   ├── global.css          # Global layout/theme styles
│   │   └── components/         # Feature UI modules
│   └── src-tauri/              # Tauri desktop shell
│       ├── src/lib.rs          # Tauri commands exposed to JavaScript
│       ├── src/main.rs         # Tauri binary entry point
│       ├── Cargo.toml          # Desktop app Rust dependencies/version
│       ├── tauri.conf.json     # App window, bundle, updater config
│       └── capabilities/       # Tauri permissions
├── Cargo.toml                  # Root modem library crate
├── CONTRIBUTING.md             # Setup, checks, PR/release notes
├── QA_PHONE_TEST_CHECKLIST.md  # Phone-call manual QA checklist
└── snapcraft.yaml              # Snap packaging
```

## Architecture Flow

Frontend code should not call ModemManager directly.

```text
UI component JS
  -> sim/src/tauri-api.js
  -> Tauri command in sim/src-tauri/src/lib.rs
  -> root Rust function in src/lib.rs
  -> ModemManager D-Bus API / helper command
```

Example: sending an SMS starts in the SMS UI, calls `sendSms()` in `sim/src/tauri-api.js`, invokes the Tauri command `send_sms`, then delegates to `send_sms()` in the root Rust modem library.

## Backend

### Root Modem Library

Main file: `src/lib.rs`

This is where modem behavior lives. It uses `zbus` to communicate with `org.freedesktop.ModemManager1` on the system D-Bus.

Important areas:

- Modem discovery and proxy setup: `connect_to_modem()`, `modem_proxy()`, `modem_3gpp_proxy()`, `modem_simple_proxy()`, `modem_messaging_proxy()`, `modem_ussd_proxy()`, `modem_voice_proxy()`.
- Network status and connection: `get_all_modem_data()`, `get_network_controls()`, `connect_network()`, `disconnect_network()`.
- SIM state and PIN: `get_sim_management()`, `unlock_sim_pin()`, `get_sim_info()`.
- SMS: `get_sms_threads()`, `get_sms_conversation()`, `send_sms()`, `list_sms_messages()`.
- USSD: `get_ussd_status()`, `initiate_ussd()`, `respond_to_ussd()`, `cancel_ussd()`.
- Phone calls: `get_phone_status()`, `start_phone_call()`, `answer_phone_call()`, `hangup_phone_call()`, `send_phone_dtmf()`.
- SIM contacts: `get_sim_contacts()`, `read_sim_contacts()`, `read_sim_contacts_mbim()`, `read_sim_contacts_at()`.

Data returned to the frontend is defined with serializable Rust structs in this file, such as `ModemData`, `NetworkControls`, `SimManagement`, `SmsThread`, `SmsMessage`, `SimContact`, `PhoneStatus`, and `UssdSession`.

### Tauri Command Layer

Main file: `sim/src-tauri/src/lib.rs`

This file exposes Rust functions to JavaScript with `#[tauri::command]`. Most commands are thin wrappers around the root modem library. If you add a backend feature for the UI, update three places:

1. Add or update the modem function in `src/lib.rs`.
2. Add a `#[tauri::command]` wrapper in `sim/src-tauri/src/lib.rs`.
3. Add the command name to the `tauri::generate_handler![...]` list in `sim/src-tauri/src/lib.rs`.

This file also contains:

- App metadata command: `get_app_metadata`.
- Updater commands: `check_app_update`, `install_app_update`.
- Runtime permission check: `check_runtime_permissions`.
- Tauri plugin setup in `run()`.

### Backend Dependencies and Versions

- Root crate config: `Cargo.toml`.
- Tauri app config: `sim/src-tauri/Cargo.toml`.
- App version also appears in `sim/src-tauri/tauri.conf.json`.

When changing the app version for a release, keep `sim/src-tauri/Cargo.toml` and `sim/src-tauri/tauri.conf.json` in sync.

## Frontend

The frontend is vanilla JavaScript with static HTML fragments and CSS files. There is no npm/package.json workflow in the current app.

### App Shell

- `sim/src/index.html`: top-level HTML shell. It mounts component fragments into IDs such as `topbar-mount`, `sidebar-mount`, `network-mount`, `sms-mount`, `ussd-mount`, and `contacts-mount`.
- `sim/src/main.js`: loads component HTML files with `fetch()`, initializes each component, sets the default sidebar tab, checks runtime permissions, and starts modem polling.
- `sim/src/global.css`: shared app layout and global styling.

### Tauri API Wrapper

Main file: `sim/src/tauri-api.js`

Frontend components should call this wrapper rather than calling `window.__TAURI__.core.invoke` directly. It centralizes command names, input cleanup, fallback values, polling, and cross-component refreshes.

Important functions:

- Modem status: `getModemData()`, `getNetworkControls()`, `updateAllModemData()`, `startModemPolling()`.
- Network actions: `connectModem()`, `disconnectModem()`.
- SIM management: `getSimManagement()`, `unlockSim()`.
- SMS: `getSmsThreads()`, `getSmsConversation()`, `sendSms()`.
- Contacts: `getSimContacts()`.
- USSD: `getUssdStatus()`, `executeUssd()`, `respondUssd()`, `cancelUssdSession()`.
- Phone: `getPhoneStatus()`, `startPhoneCall()`, `answerPhoneCall()`, `hangupPhoneCall()`, `sendPhoneDtmf()`.
- App support: `getAppMetadata()`, `checkAppUpdate()`, `installAppUpdate()`, `checkRuntimePermissions()`.

### Components

Each component normally has three files:

```text
sim/src/components/<feature>/<feature>.html
sim/src/components/<feature>/<feature>.css
sim/src/components/<feature>/<feature>.js
```

Current components:

- `topbar`: global modem status, provider, signal, SIM info, app/update indicators.
- `sidebar`: navigation and badges. It emits the `sidebar-item-click` custom event.
- `network`: data connection controls, APN input, bearer and registration display.
- `sms`: SMS thread list, conversation view, composing and sending messages.
- `ussd`: USSD dialpad, request/response flow, interactive sessions.
- `phone`: call controls and voice status. Its mount is currently commented out in `sim/src/index.html`, so check that before expecting it to appear.
- `contacts`: SIM phonebook display and links into SMS compose.

Most page switching is driven by the `sidebar-item-click` browser event. If you add a new sidebar screen, update:

1. `sim/src/components/sidebar/sidebar.html` and `sidebar.js`.
2. `sim/src/index.html` with a mount point.
3. `sim/src/main.js` to load and initialize the component.
4. The new component's JS event listener for `sidebar-item-click`.

## Where To Change Common Features

| Task | Start Here | Also Check |
| --- | --- | --- |
| Change app window size/title | `sim/src-tauri/tauri.conf.json` | `sim/src-tauri/Cargo.toml` for metadata |
| Change app version | `sim/src-tauri/Cargo.toml` | `sim/src-tauri/tauri.conf.json` |
| Add a modem backend operation | `src/lib.rs` | `sim/src-tauri/src/lib.rs`, `sim/src/tauri-api.js` |
| Add a frontend command wrapper | `sim/src/tauri-api.js` | matching command in `sim/src-tauri/src/lib.rs` |
| Update network UI | `sim/src/components/network/` | `sim/src/tauri-api.js`, `src/lib.rs` |
| Update SMS UI/backend | `sim/src/components/sms/` | `sim/src/tauri-api.js`, `src/lib.rs` SMS functions |
| Update USSD UI/backend | `sim/src/components/ussd/` | `sim/src/tauri-api.js`, `src/lib.rs` USSD functions |
| Update contacts UI/backend | `sim/src/components/contacts/` | `src/lib.rs` contact parsing/read functions |
| Update call UI/backend | `sim/src/components/phone/` | `sim/src/index.html`, `src/lib.rs` phone functions |
| Update top status widgets | `sim/src/components/topbar/` | `updateAllModemData()` in `sim/src/tauri-api.js` |
| Update icons/images | `sim/src/assets/` or `sim/Icons8/` | matching HTML/CSS references |
| Update updater behavior | `sim/src-tauri/src/lib.rs` | `sim/src-tauri/tauri.conf.json` |
| Update Tauri permissions | `sim/src-tauri/capabilities/default.json` | Tauri command/plugin requirements |
| Update packaging | `sim/src-tauri/tauri.conf.json` | `snapcraft.yaml`, release workflow |

## Adding A New Feature

Use this checklist for features that need both backend and frontend work:

1. Define the backend data shape in `src/lib.rs` with `Serialize`/`Deserialize` if it crosses into JavaScript.
2. Implement the ModemManager/D-Bus behavior in `src/lib.rs`.
3. Add a Tauri command wrapper in `sim/src-tauri/src/lib.rs`.
4. Register the command in `tauri::generate_handler![...]`.
5. Add a JavaScript wrapper in `sim/src/tauri-api.js`.
6. Create or update component HTML/CSS/JS under `sim/src/components/`.
7. Mount and initialize the component from `sim/src/index.html` and `sim/src/main.js` if it is a new screen.
8. Add manual QA notes or tests for hardware behavior.

## Local Development

Install the system requirements listed in `CONTRIBUTING.md`, then run:

```bash
cd sim/src-tauri
cargo tauri dev
```

Build release bundles:

```bash
cd sim/src-tauri
cargo tauri build --bundles deb,appimage
```

Useful checks:

```bash
cargo fmt --all
cargo clippy --all-targets --all-features -- -D warnings
cargo test
```

Because this app depends on real modem hardware and ModemManager, always manually test hardware features when changing D-Bus behavior. At minimum, test launch, modem detection, signal/network status, SMS, USSD, connection actions, and any feature you touched.

## Runtime Requirements

The app expects:

- Linux desktop environment.
- ModemManager running.
- A USB or PCIe modem recognized by ModemManager.
- System D-Bus access to `org.freedesktop.ModemManager1`.
- User permissions for modem access, usually membership in the `dialout` group.

Permission help shown by the app comes from `check_runtime_permissions()` in `sim/src-tauri/src/lib.rs`.

## Notes For New Developers

- Keep frontend command names in sync across `sim/src/tauri-api.js` and `sim/src-tauri/src/lib.rs`.
- Keep serializable Rust field names stable unless you also update all frontend consumers.
- Prefer adding modem behavior to the root `src/lib.rs` instead of hiding it inside the Tauri command layer.
- Avoid duplicating backend fallback logic in components; put shared frontend behavior in `sim/src/tauri-api.js`.
- If a UI panel does not show, check both the component mount in `sim/src/index.html` and the sidebar event logic.
- For contacts, remember that the app has both MBIM and AT-command style contact-reading code paths.
- For phone calling, not every modem supports the voice interface; keep unsupported states user-friendly.
