# SIM Broadband Manager Tauri App

This directory contains the desktop UI and Tauri shell for SIM Broadband Manager.

For a full onboarding guide that explains the frontend, backend, command bridge, file map, and where to make common updates, see:

- [`../docs/DEVELOPER_GUIDE.md`](../docs/DEVELOPER_GUIDE.md)

Common entry points:

- `src/index.html`: app shell and component mount points
- `src/main.js`: frontend initialization
- `src/tauri-api.js`: JavaScript wrappers for Tauri commands
- `src/components/`: feature UI modules
- `src-tauri/src/lib.rs`: Tauri command layer
- `../src/lib.rs`: ModemManager backend library
