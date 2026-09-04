# Changelog

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

### Verified locally

- Paper 26.1.2 build 74 with AuthMe 6.0.1-b2770: pre-join registration, spawn, chat, and command delivery.
- Proxy-transfer harness: auth phase, `/server` command, respawn, one teleport confirmation, sub-server login, and retained play state.
- Velocity 4.1.1 build 24: real proxy command routing from the local auth backend to the local lobby backend, re-authentication, and retained play state.
- Full unit/integration suite and Electron production build (see the corresponding commit verification output).
- Windows x64 portable package smoke test and archive audit; no `test/`, `test-server/`, server jar, world, database, log, or local fixture content is present in `app.asar`.
