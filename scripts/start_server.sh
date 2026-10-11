#!/data/data/com.termux/files/usr/bin/bash
# KHURE Home Server & Peppy Radio - All-in-One Live Launcher
set -e

IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1 || echo "192.168.31.178")

echo "=========================================================="
echo "    🏰 KHURE HOME SERVER & PEPPY RADIO - GOING LIVE!       "
echo "=========================================================="

# 1. Hold wake-lock so CPU stays awake 24/7 with screen off
termux-wake-lock 2>/dev/null || true

# 2. Start Peppy Radio 24/7 Background Service (Port 8443)
if command -v radio >/dev/null 2>&1; then
    radio start
else
    cd "$HOME/pocket-jellyfin/radio"
    nohup bash -c 'while true; do node server.js; sleep 3; done' > radio.log 2>&1 &
    echo $! > radio.pid
    echo "[✔] Peppy Radio started in background on port 8443."
fi

# 3. Print URLs
echo ""
echo "=========================================================="
echo "  🌐 ALL SERVICES ARE LIVE ON YOUR HOME WI-FI:            "
echo "  ------------------------------------------------------  "
echo "  👉 KHURE Home Portal:  http://${IP}:7777                "
echo "  👉 Peppy Radio Live:   https://${IP}:8443/              "
echo "  👉 Radio DJ Booth:     https://${IP}:8443/dj            "
echo "  👉 Jellyfin Media:     http://${IP}:8096                "
echo "  👉 Minecraft SMP:      ${IP}:25565                      "
echo "=========================================================="
echo ""

# 4. Start KHURE Web Hub in foreground
cd "$HOME/pocket-jellyfin/hub"
node server.js
