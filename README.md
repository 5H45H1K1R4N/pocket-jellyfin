# 📱 PocketJellyfin: Autonomous 24/7 Media Server on Android

> Turn any spare or old Android phone into a 24/7 autonomous, headless Jellyfin streaming server with micro-SD card storage, automatic boot persistence, remote SSH control, and a built-in movie/show downloader.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform: Android (Termux)](https://img.shields.io/badge/Platform-Android%20%7C%20Termux-3DDC84.svg)](https://termux.dev)
[![Jellyfin](https://img.shields.io/badge/Jellyfin-12.x-00A4DC.svg)](https://jellyfin.org)

---

## 🌟 Overview

Most guides for running Jellyfin on Android fail because:
1. **Internal Storage Locks**: Android requires at least 2.0 GiB of free space, which crashes Jellyfin on phones with low internal storage.
2. **Execution Bans on SD Cards**: Android mounts external micro-SD cards with `noexec` (blocking Linux binaries from running directly on the SD card).
3. **Aggressive Battery Management**: Android puts CPU and networking to sleep as soon as the screen turns off.
4. **Symbolic Link Failures**: Android's FUSE filesystem (`/storage/emulated/0`) rejects symlinks, causing terminal downloaders like `MovieBox-TUI` to crash with path containment errors.

**PocketJellyfin** solves all of these problems with an optimized hybrid architecture.

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────┐
│                   ANDROID HOST (PHONE)                 │
│                                                        │
│  [Termux Native Environment]                           │
│   ├── OpenSSH Server (:8022)       <── Remote Laptop   │
│   ├── Wake Lock (Prevents Sleep)                       │
│   └── MovieBox-TUI (Downloader)                        │
│                                                        │
│  [PRoot Debian Container]                              │
│   └── Jellyfin Media Server (:8096)                    │
│        ├── Database  ──────┐                           │
│        ├── Transcode Cache ┤                           │
│        └── Media Libraries ┼─────────┐                 │
└────────────────────────────┼─────────┼─────────────────┘
                             │         │
                 ┌───────────▼─────────▼──────────┐
                 │    EXTERNAL MICRO-SD CARD      │
                 │     (/storage/XXXX-XXXX/)      │
                 │  • Unlimited storage capacity  │
                 │  • Zero internal memory wear   │
                 └────────────────────────────────┘
```

- **Linux Engine & Binaries**: Stored safely in Termux internal storage (~1.5 GB).
- **All Media, Cache & Database**: Directly routed to the external **micro-SD card** (`/storage/XXXX-XXXX/`).
- **Headless Control**: Managed entirely from your PC/laptop terminal via SSH—you never need to touch the phone screen.

---

## ✨ Features

- 🔋 **24/7 Sleep-Proof**: Integrated CPU wake locks (`termux-wake-lock`) keep the server alive with the screen off.
- 🔄 **Reboot Resilience**: Auto-starts both SSH and Jellyfin on phone boot via `Termux:Boot`.
- 💾 **Micro-SD Offloading**: All transcodes, cache, metadata, and video files are written to the SD card.
- 💻 **Laptop Remote Control**: Full OpenSSH access over your local Wi-Fi.
- 🍿 **Integrated Movie Downloader**: Pre-configured `MovieBox-TUI` integration with canonical path fixes to download straight to your SD card.
- ⚡ **Auto-Library Refresh**: Automatically alerts Jellyfin to scan for new movies as soon as a download finishes.

---

## 📋 Prerequisites

1. **Android Device** (Android 7.0+ recommended).
2. **Termux app** (Installed from [F-Droid](https://f-droid.org/packages/com.termux/), NOT Google Play).
3. **Termux:Boot app** (From [F-Droid](https://f-droid.org/packages/com.termux.boot/)).
4. **Micro-SD Card** inserted in your phone.
5. Laptop or PC connected to the same Wi-Fi network.

---

## 🚀 Quick Start (Installation)

### 1. Initial Phone Setup (One-time)
1. Open phone **Settings** $\rightarrow$ **Apps** $\rightarrow$ **Termux** $\rightarrow$ Set **Battery** to **Unrestricted**.
2. Open Termux and grant storage access:
   ```bash
   termux-setup-storage
   ```
3. Find your SD card ID by running:
   ```bash
   ls /storage
   ```
   *(Look for a 8-character ID like `26B2-1AEB`)*.

### 2. Run the Installer
Run this command in Termux:
```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/pocket-jellyfin/main/scripts/install.sh | bash
```

The script will:
- Install Debian in `proot-distro`
- Install Jellyfin, Jellyfin-Web, and FFmpeg
- Route Jellyfin's database and cache to your SD card
- Configure OpenSSH on port `8022`
- Set up `Termux:Boot` for automatic startup

---

## 🖥️ Daily Usage

### Accessing Jellyfin
Open any web browser on your laptop, smart TV, or phone:
```text
http://<PHONE_IP>:8096
```

### Remote Terminal Control (SSH)
From your laptop terminal:
```powershell
ssh <TERMUX_USER>@<PHONE_IP> -p 8022
```

### Downloading Movies & Shows
In your SSH session:
```bash
~/moviebox.sh
```
1. Search and select your movie/show.
2. Select **Download** and choose your quality.
3. Exit MovieBox (`q`).
4. PocketJellyfin automatically moves media to your SD card and triggers a Jellyfin library scan!

---

## 🛠️ Jellyfin Library Paths

When setting up your libraries in the Jellyfin Dashboard:
- **Movies**: `/storage/<SD_CARD_ID>/Media/MovieBox-TUI/Movies`
- **TV Shows**: `/storage/<SD_CARD_ID>/Media/MovieBox-TUI/Series`

---

## ⚠️ Tips for 24/7 Phone Health

1. **Battery Longevity**: If your phone supports charge limiting (e.g. Samsung's "Protect Battery" to 80%), enable it to prevent battery swelling while plugged in 24/7.
2. **Direct Play**: Configure your streaming client devices (laptop/TV) to **Direct Play** original quality. This avoids software video transcoding on the phone's ARM CPU, keeping temperatures low.
3. **Static IP**: In your phone's Wi-Fi settings, set your IP to **Static** so your laptop can always reach the same address.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
