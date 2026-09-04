# Changelog

## 4.0.0 — 2026-09-04

- Introduced a restrained premium desktop workspace with stronger information hierarchy, dedicated page headers, consistent navigation states, and more legible controls.
- Replaced decorative Unicode navigation symbols with locally embedded Lucide/Feather line-icon paths and included their ISC/MIT notices in source and packaged distributions.
- Increased the default desktop canvas for dense testing workflows while retaining a responsive minimum size and bounded rendering behavior.
- Added privacy-safe README preview generation from an isolated empty profile; generated images clear all entries, selections, checkboxes, logs, and notifications before capture.
- Moved update discovery to the official `siberanka/TrafficerMC` GitHub Releases feed, added strict newer-only semantic version comparison, and suppressed update notices in documentation previews.
- Promoted the persisted-settings recovery, schema-v2 migration, Electron 28-compatible preload bridge, and rejoin-delay layout correction from the 3.6 stabilization line.

### Verified locally

- Existing local profile retained every pre-migration field and restored all 64 applicable UI controls.
- General, Botting, Scripting, Proxy, About, and Settings fit the 1240×780 default and 1040×640 minimum window matrices without horizontal document, pane, card, control, or modal overflow; longer pages remain fully reachable by bounded scrolling.
- Empty-profile UI previews and packaged migration tests run without accessing the user's real configuration.
- Live local Paper/AuthMe and Velocity/two-backend fixtures passed authentication, chat, command, transfer, re-authentication, and retained-play-state checks.
- Full unit, integration, packaged Electron, and Windows portable checks pass on the release build.

## 3.6.0 development updates — 2026-09-04

The package and release version remains 3.6.0 while stabilization is in progress.

- Fixed silent or malformed modern chat/command sending by delegating signing and acknowledgement details to Mineflayer and serializing sends per client.
- Added explicit play-state checks and visible delivery failures.
- Added AuthMe 6 pre-join dialog submission during configuration state.
- Patched the upstream `custom_click_action` optional-NBT length encoding mismatch locally and narrowly.
- Added standard prompt coverage for AuthMe, nLogin, OpeNLogin, LoginSecurity, LimboAuth, LibreLogin, mLogin, and JPremium flows, plus nLogin dialog actions.
- Removed duplicate proxy respawn/teleport handlers; server switches now rely on Mineflayer's single teleport confirmation.
- Moved auto-reconnect controls to the main connection card and added validated random min/max pacing (8-15 seconds by default), including cancellation of pending rejoins on Stop/Disconnect.
- Stopped silently mapping Minecraft 26.2 protocol 776 to incompatible 26.1 protocol 775.
- Capped UI logs and rendered them in bounded animation-frame batches; removed user-controlled HTML insertion points.
- Added direct Paper/AuthMe, deterministic proxy-transfer, and real Velocity/two-backend network test profiles.
- Removed the process-wide TLS certificate-verification bypass.
- Restricted release packaging to compiled application files and production dependencies so local test worlds, server binaries, databases, logs, and credentials cannot enter public artifacts.
- Fixed packaged Windows builds remaining invisible because the generated `preload/index.mjs` was referenced as `preload/index.js`; window startup now has a `ready-to-show` fallback and packaged tests require a real visible HWND.
- Fixed saved settings appearing empty in packaged builds: the incompatible preload helper was replaced with an Electron 28-compatible, allowlisted IPC bridge, and configuration loading now uses a race-free request/response path.
- Added idempotent schema-v2 migration for legacy, flat, aliased, and partially malformed settings; existing and unknown fields are preserved and a one-time pre-migration backup is written before conversion.
- Reworked the main-page rejoin-delay layout so its label and random min/max inputs no longer overlap or consume adjacent fields.

### Verified locally

- Paper 26.1.2 build 74 with AuthMe 6.0.1-b2770: pre-join registration, spawn, chat, and command delivery.
- Proxy-transfer harness: auth phase, `/server` command, respawn, one teleport confirmation, sub-server login, and retained play state.
- Velocity 4.1.1 build 24: real proxy command routing from the local auth backend to the local lobby backend, re-authentication, and retained play state.
- Full unit/integration suite and Electron production build (see the corresponding commit verification output).
- Windows x64 `win-unpacked` and portable packages both launched with a real visible HWND and no preload error; the archive audit found no `test/`, `test-server/`, server jar, world, database, log, or local fixture content in `app.asar`.
- Packaged Electron UI migration test restored legacy values and checkboxes, verified all 64 applicable controls against the existing local profile, and measured a non-overlapping rejoin-delay layout.
