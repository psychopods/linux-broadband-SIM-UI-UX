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

paschaltimoth@paschaltimoth-LIFEBOOK-U747:~$ mmcli -m 0
  --------------------------------
  General  |                 path: /org/freedesktop/ModemManager1/Modem/0
           |            device id: 7764bd997f18f08234434697cd4e480214ca6dd7
  --------------------------------
  Hardware |         manufacturer: Sierra Wireless, Incorporated
           |                model: EM7455
           |    firmware revision: SWI9X30C_02.20.03.00
           |       carrier config: default
           |         h/w revision: EM7455
           |            supported: gsm-umts, lte
           |              current: gsm-umts, lte
           |         equipment id: 359073060121005
  --------------------------------
  System   |               device: /sys/devices/pci0000:00/0000:00:14.0/usb1/1-9
           |              physdev: /sys/devices/pci0000:00/0000:00:14.0/usb1/1-9
           |              drivers: cdc_mbim
           |               plugin: sierra
           |         primary port: cdc-wdm0
           |                ports: cdc-wdm0 (mbim), wwan0 (net)
  --------------------------------
  Status   |                 lock: sim-pin2
           |       unlock retries: sim-pin2 (3)
           |                state: connected
           |          power state: on
           |          access tech: lte
           |       signal quality: 41% (cached)
  --------------------------------
  Modes    |            supported: allowed: 3g; preferred: none
           |                       allowed: 4g; preferred: none
           |                       allowed: 3g, 4g; preferred: 4g
           |                       allowed: 3g, 4g; preferred: 3g
           |              current: allowed: 3g, 4g; preferred: 4g
  --------------------------------
  Bands    |            supported: utran-1, utran-3, utran-4, utran-5, utran-8, utran-2, 
           |                       eutran-1, eutran-2, eutran-3, eutran-4, eutran-5, eutran-7, eutran-8, 
           |                       eutran-12, eutran-13, eutran-20, eutran-25, eutran-26, eutran-29, 
           |                       eutran-30, eutran-41
           |              current: utran-1, utran-3, utran-4, utran-5, utran-8, utran-2, 
           |                       eutran-1, eutran-2, eutran-3, eutran-4, eutran-5, eutran-7, eutran-8, 
           |                       eutran-12, eutran-13, eutran-20, eutran-25, eutran-26, eutran-29, 
           |                       eutran-30, eutran-41
  --------------------------------
  IP       |            supported: ipv4, ipv6, ipv4v6
  --------------------------------
  3GPP     |                 imei: 359073060121005
           |        enabled locks: fixed-dialing
           |          operator id: 64005
           |        operator name: Airtel TZ
           |         registration: home
           | packet service state: attached
  --------------------------------
  SIM      |     primary sim path: /org/freedesktop/ModemManager1/SIM/0
           |       sim slot paths: slot 1: /org/freedesktop/ModemManager1/SIM/0 (active)
           |                       slot 2: none
  --------------------------------
  Bearer   |                paths: /org/freedesktop/ModemManager1/Bearer/1
           |                       /org/freedesktop/ModemManager1/Bearer/0
paschaltimoth@paschaltimoth-LIFEBOOK-U747:~$ 

