<p align="center">
  <img src="./src/renderer/assets/icons/icon.png" width="96" height="96" alt="TrafficerMC Logo" />
</p>

<h1 align="center">TrafficerMC</h1>

<p align="center">
  <b>High-Performance Minecraft Botting, Stress Testing & Proxy Tool</b>
</p>

<p align="center">
  <a href="https://github.com/siberanka/TrafficerMC/releases/latest">
    <img src="https://img.shields.io/github/v/release/siberanka/TrafficerMC?color=0ea5e9&style=for-the-badge" alt="Latest Release" />
  </a>
  <a href="https://github.com/siberanka/TrafficerMC/releases">
    <img src="https://img.shields.io/github/downloads/siberanka/TrafficerMC/total?color=0ea5e9&style=for-the-badge" alt="Total Downloads" />
  </a>
  <a href="https://discord.gg/uFpaAZdVgS">
    <img src="https://img.shields.io/discord/935341227400904734?label=DISCORD&color=5865F2&style=for-the-badge" alt="Discord" />
  </a>
</p>

---

## 🌟 Key Features

TrafficerMC is a modern, modular, and high-performance Minecraft client orchestration tool:

- 🔐 **AuthMe Reloaded 6.0+ Auto-Auth**: Automatic pre-login and in-game authentication handling `/register` and `/login` via chat commands, modern dialog packets (`open_dialog`), titles, and actionbars. Default password: `trafficermc123a`.
- 🌐 **Live Multi-Source Proxy Scraper**: Download thousands of live HTTP/SOCKS5 proxies with a single click from ProxyScrape API v4/v2, popular GitHub repositories, Geonode API, and custom user-defined Raw URLs.
- 🛡️ **Anonymity Level Filtering**: Filter scraped proxies by anonymity (`Elite`, `Anonymous`, `Transparent`, `All`).
- ⚡ **HTTP CONNECT & SOCKS5 Tunneling**: Full proxy authentication and socket tunneling support with latency and timeout checkers.
- 🎮 **Extended Minecraft Version Support**: Supports all protocol versions from **1.8.x up to 26.2** (including 1.21.11, 26.0, 26.1, 26.2).
- 🎨 **Modern, Sleek & Fluid UI**: Fluid, card-based dark theme (`#0d1117`) layout with expanded 1040x640 dimensions, eliminating cluttered inline styles, noisy tiled backgrounds, and legacy blur effects.
- 📦 **Zero-Install Portable Executable**: Standalone Windows executable (`TrafficerMC 3.6.0.exe`) available directly from GitHub Releases.
- 🤖 **Comprehensive Botting Controls**:
  - Multi-bot management & auto-selection
  - Anti-AFK module
  - Chat spammer with delay & bypass modes
  - Hotbar & Inventory window manager
  - Directional movement & look control
  - KillAura with target filters (Players, Vehicles, Mobs, Animals)
  - Custom script runner (`scripting`)
  - Discord webhook integration

---

## 📸 Screenshots (v3.6.0 Modern UI)

### General Tab (Connection & Configuration)

![General Tab](docs/images/general.png)

### Botting Tab (Controls & Chat)

![Botting Tab](docs/images/botting.png)

### Proxy Tab (Live Scraper & Tester)

![Proxy Tab](docs/images/proxy.png)

### Scripting Tab (Automation & Actions)

![Scripting Tab](docs/images/scripting.png)

### Settings Modal (Preferences & Delays)

![Settings Modal](docs/images/settings.png)

---

## 🚀 Quick Start & Download

### Download Executable

Directly download the latest portable Windows executable from the Releases page:
👉 **[Download TrafficerMC Latest Release](https://github.com/siberanka/TrafficerMC/releases/latest)**

Simply run `TrafficerMC.exe` — no installer or Node.js runtime required.

---

## 🛠️ Building from Source

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- Git

### Installation & Run

```bash
# Clone the repository
git clone https://github.com/siberanka/TrafficerMC.git
cd TrafficerMC

# Install dependencies
npm install

# Run automated tests
npm test

# Run development mode
npm run dev
```

### Packaging Executable

```bash
# Windows Portable .exe
npm run build:win

# Unpacked directory for inspection
npm run build:unpack

# Linux
npm run build:linux

# macOS
npm run build:mac
```

---

## 📜 Scripting Syntax

The built-in scripting engine enables multi-action automation sequences:

```text
chat Hello from TrafficerMC!
delay 1000
useheld
delay 2000
winclick 36 0
delay 1000
disconnect
```

### Supported Commands

- `chat <message>`: Send server chat (supports `{player}` and `{random}`)
- `delay <ms>`: Pause execution for specified milliseconds
- `useHeld`: Use currently equipped hotbar item
- `setHotbar <0-8>`: Select hotbar slot
- `winClick <slot> <type>`: Click window/inventory item (`0` = left click, `1` = right click)
- `closeWindow`: Close open container window
- `drop [slot]`: Drop specific slot item or all items
- `startMove <direction>` / `stopMove <direction>`: Directional movement (`forward`, `back`, `left`, `right`, `jump`, `sneak`, `sprint`)
- `resetMove`: Reset all movement states
- `afkOn` / `afkOff`: Toggle Anti-AFK module
- `disconnect` / `reconnect`: Manage connection state
- `startScript`: Loop the script from the start

---

## 📄 License

This project is open-source under the [MIT License](LICENSE).
Fork maintained by [siberanka](https://github.com/siberanka).
