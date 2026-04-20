# Contributing

Thanks for contributing to SIM Broadband Manager.

This project is a Linux desktop application built with Tauri 2, Rust, and a vanilla HTML/CSS/JavaScript frontend. The app talks to ModemManager over D-Bus, so changes should be tested with real modem hardware whenever possible.

## Before You Start

- Read the [Code of Conduct](CODE_OF_CONDUCT.md).
- Check existing issues and pull requests before starting duplicate work.
- Prefer small, focused pull requests over large mixed changes.

## Development Setup

### Requirements

- Rust stable toolchain
- Tauri CLI v2
- Linux system with ModemManager available
- Build dependencies for WebKit2GTK and GTK3

On Ubuntu, Debian, or Linux Mint:

```bash
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf \
  libsoup-3.0-dev \
  libgtk-3-dev \
  libglib2.0-dev \
  libjavascriptcoregtk-4.1-dev \
  libxdo-dev \
  fuse3

cargo install tauri-cli --version '^2' --locked
```

## Project Layout

- `src/`: Rust modem integration library and binaries
- `sim/src/`: frontend assets
- `sim/src-tauri/`: Tauri application shell, commands, packaging, updater config
- `.github/workflows/`: CI and release automation
- `snapcraft.yaml`: Snap packaging configuration

## Local Development

Run the desktop app in development mode:

```bash
cd sim/src-tauri
cargo tauri dev
```

Build release bundles locally:

```bash
cd sim/src-tauri
cargo tauri build --bundles deb,appimage
```

## Testing Changes

Before opening a pull request, run the checks relevant to your change:

```bash
cargo test
cargo fmt --all
cargo clippy --all-targets --all-features -- -D warnings
```

If you change the Tauri app or packaging, also verify:

- the app launches locally
- modem detection still works
- SMS, USSD, and connection actions still behave correctly when applicable
- AppImage, deb, or snap packaging changes build successfully

## Pull Request Guidelines

- Use a clear title and describe what changed and why.
- Include screenshots for UI changes.
- Mention Linux distro and modem hardware used for testing when relevant.
- Keep unrelated refactors out of feature or bug-fix PRs.
- Update documentation when behavior, setup, or packaging changes.

## Commit Guidance

Short, descriptive commits are preferred. Conventional-commit style is welcome but not required.

Examples:

- `fix: handle missing updater key from config`
- `feat: add snap release publishing`
- `docs: clarify AppImage installation`

## Release Notes

- Pushes to `main` run the regular Linux build workflow.
- Version tags in the form `v*` trigger the release workflow.
- Release automation builds AppImage and deb packages, signs updater artifacts, and can publish the snap package when store credentials are configured.

## Reporting Bugs

When opening a bug report, include:

- Linux distribution and version
- app version
- modem model if known
- steps to reproduce
- expected behavior
- actual behavior
- logs or screenshots if available

## Security

If you find a security issue, avoid posting sensitive details publicly in an issue. Share enough information for triage and coordinate privately when needed.
