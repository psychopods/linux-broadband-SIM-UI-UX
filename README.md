# linux-broadband-SIM-UI-UX

┌─────────────────────────────────────────────────┐
│  Frontend (JS/HTML/CSS)                         │
│  - tauri-api.js (calls Tauri commands)         │
│  - startModemPolling() polls every 5 seconds   │
└────────────────┬────────────────────────────────┘
                 │ invoke("get_modem_data")
┌────────────────▼──────────────────────────────┐
│  Tauri App (sim/src-tauri)                    │
│  - [tauri::command] get_modem_data            │
│  - [tauri::command] get_radio_technology      │
│  - [tauri::command] get_signal                │
│  - [tauri::command] get_operator              │
│  - [tauri::command] get_connection            │
│  - [tauri::command] get_sim                   │
└────────────────┬──────────────────────────────┘
                 │ calls backend functions
┌────────────────▼──────────────────────────────┐
│  Backend (root crate / src/lib.rs)            │
│  - get_all_modem_data()                       │
│  - get_radio_tech()                           │
│  - get_signal_strength()                      │
│  - get_operator_name()                        │
│  - get_connection_status()                    │
│  - get_sim_info()                             │
└────────────────┬──────────────────────────────┘
                 │ zbus D-Bus queries
┌────────────────▼──────────────────────────────┐
│  ModemManager (system D-Bus)                  │
└───────────────────────────────────────────────┘