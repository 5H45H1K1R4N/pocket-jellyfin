# Deploying Peppy Home Hub on the phone (Termux)

Tested target: Redmi Note 5 Pro, Android 9, Termux. Zero npm dependencies —
Node.js is the only requirement.

## 1. Install Node (once)

```bash
pkg update && pkg install nodejs termux-api
```

## 2. Copy the hub onto the phone

From your computer (adjust IP; find it with `ifconfig` in Termux):

```bash
scp -r peppy-home-hub/ u0_a123@192.168.31.178:~/peppy-home-hub
```

Or copy via the SD card / USB. The folder needs no `npm install`.

## 3. Grant storage access (for Photos)

```bash
termux-setup-storage          # accept the Android permission prompt
ls /storage/emulated/0/DCIM   # confirm you can see the camera folder
```

## 4. First run

```bash
cd ~/peppy-home-hub
node server.js
```

Open `http://192.168.31.178:8090` from any device on the same Wi-Fi.
The first visit shows the **create-admin** screen — the first account becomes
the administrator. Then:

1. Sign in → **Admin → server-settings**
2. Set **Photo folders**, e.g. `/storage/emulated/0/DCIM` (one per line)
3. Save, then **Photos → Rescan storage**

For real thumbnails install ImageMagick (optional, ~30 MB):

```bash
pkg install imagemagick
```

Without it the gallery still works, just serving scaled originals.

## 5. Keep it running

Android kills background apps aggressively. Inside Termux:

```bash
termux-wake-lock        # prevents sleep mid-upload
```

Android Settings → Apps → Termux → Battery → **Unrestricted** (or exclude
from optimization). Then either run `node server.js` in a session, or use a
process manager:

```bash
pkg install tmux
tmux new -s hub
node server.js
# Ctrl-b d to detach; tmux attach -t hub to return
```

## 6. Config

`data/config.json` (created on first run) — safe to edit while stopped:

```json
{
  "port": 8090,
  "hubName": "Peppy Home Hub",
  "jellyfin": { "url": "http://127.0.0.1:8096" },
  "minecraft": { "host": "127.0.0.1", "port": 25565, "publicAddress": "192.168.31.178" },
  "photoRoots": ["/storage/emulated/0/DCIM"]
}
```

If the phone's IP changes, update `minecraft.publicAddress` (shown to
players) — the Jellyfin link derives itself from whatever address each
visitor is already using, so it usually needs no edits.

## 7. What touches what

| Service        | Port  | Modified by the Hub? |
|----------------|-------|----------------------|
| Home Hub       | 8090  | —                    |
| Jellyfin       | 8096  | Never. Health probe only; no password stored. |
| Minecraft      | 25565 | Never. Status ping only; PaperMC world untouched. |

Data lives in `data/` (users, sessions, albums ACL, files index,
announcements, config). Uploads live in `storage/drop/`, thumbnails in
`storage/thumbs/`. Back up those two folders to keep everything.

The Hub listens on all interfaces of the phone but performs **no port
forwarding and no tunneling** — it is reachable only from your LAN.

## 8. Creating household accounts

Admin → **user-management**: create one account per person.
Roles: `admin` (everything), `family` (standard member), `guest` (restricted).
Then Admin → **album-permissions** to choose who sees each photo album.
