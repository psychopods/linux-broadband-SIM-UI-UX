# Good First Issues

These are starter tasks that are useful for the project and approachable for new contributors. When creating GitHub issues from this list, label them `good first issue` and, where appropriate, `help wanted`.

## Add App Screenshots

Capture the Network, SMS, USSD, Contacts, and Settings views and place them in `docs/screenshots/`. Update the README screenshots section to embed the best images.

Acceptance notes:

- Use mock mode if hardware is unavailable.
- Include at least one full-window desktop screenshot.
- Avoid exposing real phone numbers, ICCIDs, IMSIs, or message contents.

## Improve Mock Mode Data

Expand the sample data in `src/lib.rs` so the UI shows richer edge cases such as no signal, roaming, locked SIM, multiple SMS threads, and a USSD menu that requires a reply.

Acceptance notes:

- Keep mock mode deterministic.
- Do not add network or hardware dependencies.
- Update `docs/MOCK_MODE.md` if behavior changes.

## Add A Dark Mode Toggle

Add a user-facing theme toggle to the settings/topbar area and persist the choice in local storage.

Acceptance notes:

- Respect the existing visual style.
- Ensure text contrast remains readable.
- Include screenshots in the PR.

## Translate Key UI Labels To Swahili

Add a small translation layer for common labels and provide an English/Swahili option.

Acceptance notes:

- Start with visible navigation, topbar, Network, SMS, and USSD labels.
- Keep the default language English.
- Avoid changing backend command names or data shapes.

## Update The Hardware Compatibility Table

Test another ModemManager-compatible modem and update the README hardware table.

Acceptance notes:

- Include modem model, Linux distribution, ModemManager version, and carrier/SIM.
- Mark which features worked: network status, connect/disconnect, SMS, USSD, contacts, voice.
- Mention any manual permissions or setup needed.

## Make Phone UI Reachable When Supported

The phone component exists, but the mount/sidebar entry are currently commented out. Make the Phone screen appear only when `phone_capabilities.supported` is true.

Acceptance notes:

- Keep unsupported modems from showing dead controls.
- Test with mock mode.
- Document hardware testing if you have a voice-capable modem.
