#!/data/data/com.termux/files/usr/bin/bash
set -e

echo "=========================================================="
echo "    🚀 Peppy Home Hub — Futuristic Server Portal Setup    "
echo "=========================================================="

PORTAL_DIR="$HOME/.pocket-mc/portal"
mkdir -p "$PORTAL_DIR"

BASE_URL="https://raw.githubusercontent.com/5H45H1K1R4N/pocket-jellyfin/main/portal"

echo "[1/3] Downloading Peppy Home Hub portal engine..."
curl -fsSL "$BASE_URL/db.py?t=$(date +%s)" -o "$PORTAL_DIR/db.py"
curl -fsSL "$BASE_URL/app.py?t=$(date +%s)" -o "$PORTAL_DIR/app.py"
curl -fsSL "$BASE_URL/index.html?t=$(date +%s)" -o "$PORTAL_DIR/index.html"

# Verify python
if ! command -v python >/dev/null 2>&1 && ! command -v python3 >/dev/null 2>&1; then
    echo "[*] Installing Python..."
    pkg install python -y
fi

# Create easy launchers: 'peppy-hub', 'home-hub', and backward-compatible 'khure-server'
cat << 'EOF' > "$PREFIX/bin/peppy-hub"
#!/data/data/com.termux/files/usr/bin/bash
PY=$(command -v python3 || command -v python)
PORTAL_PATH="$HOME/.pocket-mc/portal"

case "$1" in
    stop)
        pkill -f "portal/app.py" 2>/dev/null || true
        echo "Peppy Home Hub stopped."
        ;;
    status)
        if pgrep -f "portal/app.py" > /dev/null; then
            echo "Peppy Home Hub is running on port 7777."
        else
            echo "Peppy Home Hub is offline."
        fi
        ;;
    restart)
        pkill -f "portal/app.py" 2>/dev/null || true
        sleep 1
        cd "$PORTAL_PATH"
        nohup "$PY" app.py > "$HOME/.pocket-mc/portal.log" 2>&1 &
        sleep 1
        IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1 || echo "localhost")
        echo "[✔] Peppy Home Hub restarted at: http://${IP}:7777"
        ;;
    start|"")
        pkill -f "portal/app.py" 2>/dev/null || true
        cd "$PORTAL_PATH"
        nohup "$PY" app.py > "$HOME/.pocket-mc/portal.log" 2>&1 &
        sleep 1
        IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1 || echo "localhost")
        echo ""
        echo "=========================================================="
        echo "  🚀 Peppy Home Hub is LIVE on port 7777!                "
        echo "  Open on any device connected to your home Wi-Fi:       "
        echo "  👉 http://${IP}:7777                                   "
        echo "=========================================================="
        ;;
esac
EOF
chmod +x "$PREFIX/bin/peppy-hub"
ln -sfn "$PREFIX/bin/peppy-hub" "$PREFIX/bin/home-hub" 2>/dev/null || true
ln -sfn "$PREFIX/bin/peppy-hub" "$PREFIX/bin/khure-server" 2>/dev/null || true
ln -sfn "$PREFIX/bin/peppy-hub" "$PREFIX/bin/khure" 2>/dev/null || true

# Register in boot script if available
BOOT_SCRIPT="$HOME/.termux/boot/start-jellyfin.sh"
if [ -f "$BOOT_SCRIPT" ]; then
    if ! grep -q "peppy-hub" "$BOOT_SCRIPT"; then
        echo "peppy-hub start 2>/dev/null || true" >> "$BOOT_SCRIPT"
    fi
fi

# Launch
peppy-hub start
