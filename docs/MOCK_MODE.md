# Mock Mode

Mock mode lets contributors run SIM Broadband Manager without a physical modem, SIM card, carrier account, or ModemManager access. It is meant for UI, documentation, copy, and workflow contributions.

## Start The App

```bash
cd sim/src-tauri
SIM_BROADBAND_MOCK=1 cargo tauri dev
```

When `SIM_BROADBAND_MOCK` is set to `1`, `true`, `yes`, or `on`, the Rust modem library returns stable sample data instead of opening the system D-Bus connection to ModemManager.

## What Is Mocked

- LTE network status with signal strength and operator name
- SIM management state with sample ICCID/IMSI values
- Active bearer details such as APN and interface
- SMS threads and conversations
- SIM contacts
- USSD responses and menu prompts
- Voice calling capability and no-op call actions
- Runtime permission checks

Mutating actions such as connect, disconnect, send SMS, answer call, hang up, send DTMF, unlock SIM, and cancel USSD return successful mock responses without touching hardware.

## What Still Needs Hardware

Use real hardware before release when changing:

- Modem discovery or D-Bus object handling
- Bearer connect/disconnect behavior
- SMS creation, sending, listing, or parsing
- USSD session handling
- SIM PIN unlock behavior
- Voice call behavior
- Snap/AppImage permission behavior

When reporting hardware results, include your Linux distribution, modem model, carrier/SIM, ModemManager version, and which features you tested.
