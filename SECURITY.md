# Security Policy

## Supported Versions

Security fixes are applied to the latest released version on `main`.

| Version | Supported |
| --- | --- |
| Latest release | Yes |
| Older releases | No |
| Unreleased local forks | No |

## Reporting a Vulnerability

If you discover a security issue, do not open a public GitHub issue with exploit details.

Report it privately to:

- [paschaltimoth@gmx.us](mailto:paschaltimoth@gmx.us)

Please include:

- a clear description of the issue
- steps to reproduce
- affected version or commit if known
- impact assessment
- any logs, screenshots, or proof of concept that help validate the report

You can expect:

- acknowledgement of the report as soon as reasonably possible
- triage and validation of the issue
- coordination on a fix before public disclosure when appropriate

## Scope

Security reports are especially relevant for:

- updater and release signing configuration
- package distribution and update delivery
- Tauri command exposure and privilege boundaries
- modem control actions over D-Bus
- dependency-related vulnerabilities affecting shipped builds

## Disclosure Guidance

Please avoid publicly disclosing vulnerabilities until a fix or mitigation is available.

Responsible disclosure helps protect users running the desktop application from avoidable risk.
