# 📱 PocketJellyfin: Autonomous 24/7 Media Server on Android

> Turn any spare or old Android phone into a 24/7 autonomous, headless Jellyfin streaming server. Use it **100% standalone on your phone**, or remotely control it from your PC/Laptop—your choice!

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform: Android (Termux)](https://img.shields.io/badge/Platform-Android%20%7C%20Termux-3DDC84.svg)](https://termux.dev)
[![Jellyfin](https://img.shields.io/badge/Jellyfin-12.x-00A4DC.svg)](https://jellyfin.org)

---

## 🎯 Two Ways to Use It

PocketJellyfin is modular and lets you choose how you want to run it:

| Feature | 📱 Mode 1: Phone-Only (Standalone) | 💻 Mode 2: Remote Control (Laptop/PC) |
| :--- | :--- | :--- |
| **PC/Laptop Required?** | ❌ **No PC needed at all** | ✅ Optional (for power users) |
| **Terminal Operations** | Done directly inside Termux on your phone screen | Run comfortably from your PC terminal via SSH |
| **Streaming** | Stream on your phone, Chromecast, or Smart TV | Stream on your Laptop, TV, or any device |
| **Downloading Movies** | Run `~/moviebox.sh` in Termux on your phone | Run `~/moviebox.sh` through your PC terminal |

---

## 🌟 Why PocketJellyfin?

Running a media server on an Android phone usually hits several brick walls:
1. **The 2.0 GiB Internal Storage Check**: Jellyfin crashes on phones with low internal storage.
2. **SD Card Execution Limits**: Android prevents Linux binaries from executing directly on external micro-SD cards.
3. **Screen-Off Sleep**: Android kills background CPU and network processes when the display sleeps.
4. **Download Path Traversal**: Android's storage emulation breaks symlinks, causing terminal downloaders like `MovieBox-TUI` to fail.

**PocketJellyfin** solves these issues automatically during setup.

---

## 🏗️ How It Works

```
┌────────────────────────────────────────────────────────┐
│                   ANDROID HOST (PHONE)                 │
│                                                        │
│  [Termux Native Environment]                           │
│   ├── Wake Lock (Prevents sleep with screen off)       │
│   ├── MovieBox-TUI (Optional movie downloader)         │
│   └── OpenSSH Server (:8022) [Optional for PC users]   │
│                                                        │
│  [PRoot Debian Container]                              │
│   └── Jellyfin Media Server (:8096)                    │
│        ├── Database  ──────┐                           │
│        ├── Transcode Cache ┤                           │
│        └── Media Libraries ┼─────────┐                 │
└────────────────────────────┼─────────┼─────────────────┘
                             │         │
                 ┌───────────▼─────────▼──────────┐
                 │     MICRO-SD CARD STORAGE      │
                 │     (/storage/XXXX-XXXX/)      │
                 │  • Unlimited storage capacity  │
                 │  • Zero internal memory wear   │
                 └────────────────────────────────┘
```

- **Linux Engine & Binaries**: Stored safely in Termux internal storage (~1.5 GB).
- **All Media, Cache & Database**: Directly routed to the external **micro-SD card** (`/storage/XXXX-XXXX/`) or internal storage.
- **Sleep-Proof**: CPU wake-locks keep streaming active even with the screen locked.

---

## 🚀 1-Command Installation

### 1. Prerequisites (On your phone)
1. Install **Termux** from [F-Droid](https://f-droid.org/packages/com.termux/) *(Do not use Google Play)*.
2. *(Optional for auto-start)* Install **Termux:Boot** from [F-Droid](https://f-droid.org/packages/com.termux.boot/).
3. Open Termux on your phone and run:
   ```bash
   termux-setup-storage
   ```
   *(Tap "Allow" when the prompt appears)*.

### 2. Run the Installer
Run this single command in Termux:

```bash
curl -fsSL https://raw.githubusercontent.com/5H45H1K1R4N/pocket-jellyfin/main/scripts/install.sh | bash
```

The interactive installer will ask you:
- ✔ **Use Micro-SD Card?** Automatically detects and offloads database and cache to SD storage.
- ✔ **Enable PC Remote Control (SSH)?** Keep it disabled if you only want to use your phone, or enable it if you want to type from a laptop.
- ✔ **Install MovieBox-TUI Downloader?** Optional terminal movie downloader with auto-library sync.

---

## 📱 How to Use (Standalone Phone-Only)

1. **Watch your media:** Open your phone's browser and go to `http://localhost:8096`, or install the free **Jellyfin app** from Google Play.
2. **Download new movies:** Open Termux and type:
   ```bash
   ~/moviebox.sh
   ```
   Search, select quality, and download. When you exit (`q`), it automatically syncs with Jellyfin.
3. **Turn off the screen:** You can lock your phone and put it aside; the wake lock keeps your server running 24/7!

---

## 💻 How to Use (Remote PC Mode)

If you chose to enable SSH during installation:
1. Connect from your laptop's PowerShell or terminal:
   ```powershell
   ssh u0_aXXX@<PHONE_IP> -p 8022
   ```
2. Run commands, manage files, or launch the movie downloader right from your keyboard.
3. Stream on your laptop at `http://<PHONE_IP>:8096`.

---

## 🛠️ Jellyfin Library Configuration

When configuring your libraries in the Jellyfin Dashboard (`http://<PHONE_IP>:8096`):
- **Movies**: `/storage/<SD_ID>/Media/MovieBox-TUI/Movies`
- **TV Shows**: `/storage/<SD_ID>/Media/MovieBox-TUI/Series`

*(If not using an SD card, use `/data/data/com.termux/files/home/storage/shared/Movies`)*.

---

## 💡 Battery & Longevity Tips

- **Charge Limiting**: If your phone has a "Protect Battery" feature (limiting charge to 80%), turn it ON so the battery stays cool when plugged in 24/7.
- **Direct Play**: In the Jellyfin player settings on your TV or laptop, set playback to **Original Quality / Direct Play** to avoid heavy CPU transcoding on the phone.

---

## 🎮 Minecraft Java + PaperMC Server Module

Host your personal **Minecraft Java Edition** world locally on your phone 24/7! Powered by **PaperMC** running inside the Debian PRoot container.

### Features
* **PaperMC Engine**: Extremely optimized for performance with low CPU usage and Aikar's G1GC tuning.
* **Aternos World Migration**: Easily import your existing Aternos/Paper world without losing builds, inventories, or progress (`minecraft world import`).
* **Storage Choice**: Place your world on your fast internal storage or micro-SD card.
* **Managed Background Service**: Runs inside a background `tmux` session with wake-lock—your server stays online even when the screen is locked.
* **Live Interactive Console**: Attach to the server console anytime with `minecraft console`.

### Quick Install
```bash
curl -fsSL https://raw.githubusercontent.com/5H45H1K1R4N/pocket-jellyfin/main/scripts/setup_minecraft.sh | bash
```

### Essential Commands
* `minecraft start` — Start server in background
* `minecraft console` — Access live server console (type `op`, `save-all`, etc.)
* `minecraft world import <path>` — Import your existing Aternos world
* `minecraft backup` — Create a full world backup
* `minecraft status` — View live RAM, player count, and storage stats
* `minecraft stop` — Gracefully save and stop server

📖 *For full world migration instructions, plugin setup, and configuration details, read the [Minecraft Documentation](docs/MINECRAFT.md).*

📖 *For the Peppy bot setup, permission model, supported commands, and limitations, read the [Minecraft Bot Guide](docs/PEPPY_BOT.md).*

---

## 📄 License

This project is open-source under the [MIT License](LICENSE).
