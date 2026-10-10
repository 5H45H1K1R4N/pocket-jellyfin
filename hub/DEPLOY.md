# Peppy Home Hub — Deployment Guide

A private home-server portal inspired by Discord's UI, running on Android/Termux.

## Quick Install (Termux)

Open Termux and paste this one command:

```bash
curl -fsSL https://raw.githubusercontent.com/5H45H1K1R4N/pocket-jellyfin/main/scripts/setup_home_hub.sh | bash
```

The script will:
1. Install Node.js (if not already installed)
2. Download all hub files to `~/.pocket-mc/hub/`
3. Create the `peppy-hub` command and aliases
4. Start the server immediately

## Daily Commands

```bash
peppy-hub          # Start the hub
peppy-hub stop     # Stop the hub
peppy-hub restart  # Restart after updates
peppy-hub status   # Check if running
peppy-hub logs     # Tail live logs
```

## Update the Hub

```bash
curl -fsSL https://raw.githubusercontent.com/5H45H1K1R4N/pocket-jellyfin/main/scripts/setup_home_hub.sh | bash
```

Re-running setup updates all files but **preserves your user accounts and data**.

## Access the Hub

On any device connected to your home Wi-Fi:

```
http://192.168.31.178:7777
```

(Your phone's IP may change — check `peppy-hub status` for the current address.)

## Default Login

After a fresh install, sign in with the admin account you created, or ask your
phone's owner for family credentials. All passwords are hashed with scrypt.

## Requirements

- Android + Termux (any recent version)
- Node.js ≥ 20 (installed automatically)
- Local Wi-Fi network only — no port forwarding needed

## Project Structure

```
hub/
├── server.js          # HTTP server entry point (port 7777)
├── package.json       # ESM, zero npm dependencies
├── lib/
│   ├── config.js      # Configuration loader
│   ├── auth.js        # scrypt password hashing + sessions
│   ├── services.js    # Jellyfin probe + Minecraft SLP ping
│   ├── photos.js      # Album management + ImageMagick thumbnails
│   ├── files.js       # File drop management
│   ├── multipart.js   # Zero-dependency streaming upload parser
│   ├── store.js       # Atomic JSON persistence
│   ├── http.js        # Rate limiting + CSRF helpers
│   ├── api-auth.js    # /api/auth/* routes
│   ├── api-status.js  # /api/status/* routes
│   ├── api-media.js   # /api/media/* routes
│   └── api-admin.js   # /api/admin/* routes (admin only)
├── public/
│   ├── index.html     # App shell (Discord three-column layout)
│   ├── styles.css     # Discord design system (1900+ lines)
│   └── app.js         # SPA engine — all 13 views (1674 lines)
└── data/              # Runtime data (not committed)
    ├── users.json
    ├── sessions.json
    ├── config.json
    ├── announcements.json
    ├── files.json
    └── photo-index.json
```

## Services Integrated

| Service | Port | Notes |
|---------|------|-------|
| Jellyfin | 8096 | Media streaming — probed live |
| Minecraft Java | 25565 | PaperMC SLP ping (TCP) |
| Minecraft Bedrock | 19132 | Geyser crossplay (UDP) |
| File Drop | — | SD card `/storage/26B2-1AEB/PeppyDrop` |
| Photos | — | SD card `/storage/26B2-1AEB/PeppyPhotos` |
