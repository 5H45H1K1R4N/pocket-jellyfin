#!/data/data/com.termux/files/usr/bin/bash
set -e

echo "=========================================================="
echo "    PocketJellyfin: Minecraft Aternos-Style Dashboard     "
echo "=========================================================="

DASH_DIR="$HOME/.pocket-mc"
mkdir -p "$DASH_DIR"

BASE_URL="https://raw.githubusercontent.com/5H45H1K1R4N/pocket-jellyfin/main/minecraft/dashboard"

echo "[1/3] Downloading dashboard files..."
curl -fsSL "$BASE_URL/app.py?t=$(date +%s)" -o "$DASH_DIR/app.py"
curl -fsSL "$BASE_URL/index.html?t=$(date +%s)" -o "$DASH_DIR/index.html"

# Ensure Python is installed
if ! command -v python >/dev/null 2>&1 && ! command -v python3 >/dev/null 2>&1; then
    echo "[*] Installing Python..."
    pkg install python -y
fi

# Create easy 1-word launcher
cat << 'EOF' > "$PREFIX/bin/mc-web"
#!/data/data/com.termux/files/usr/bin/bash
PY=$(command -v python3 || command -v python)
case "$1" in
    stop)
        pkill -f "pocket-mc/app.py" 2>/dev/null || true
        echo "Dashboard stopped."
        ;;
    status)
        if pgrep -f "pocket-mc/app.py" > /dev/null; then
            echo "Dashboard is running on port 8088."
        else
            echo "Dashboard is offline."
        fi
        ;;
    restart)
        pkill -f "pocket-mc/app.py" 2>/dev/null || true
        sleep 1
        cd "$HOME/.pocket-mc"
        nohup "$PY" app.py > "$HOME/.pocket-mc/dashboard.log" 2>&1 &
        sleep 1
        IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1 || echo "localhost")
        echo "[✔] Dashboard restarted at: http://${IP}:8088"
        ;;
    start|"")
        pkill -f "pocket-mc/app.py" 2>/dev/null || true
        cd "$HOME/.pocket-mc"
        nohup "$PY" app.py > "$HOME/.pocket-mc/dashboard.log" 2>&1 &
        sleep 1
        IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1 || echo "localhost")
        echo "[✔] Aternos-style Minecraft Dashboard is LIVE!"
        echo "    Open in any browser: http://${IP}:8088"
        ;;
esac
EOF
chmod +x "$PREFIX/bin/mc-web"

# Add to boot script if available
BOOT_SCRIPT="$HOME/.termux/boot/start-jellyfin.sh"
if [ -f "$BOOT_SCRIPT" ]; then
    if ! grep -q "mc-web" "$BOOT_SCRIPT"; then
        sed -i 's|mc start 2>/dev/null \|\| true|mc start 2>/dev/null \|\| true\nmc-web start 2>/dev/null \|\| true|' "$BOOT_SCRIPT"
    fi
fi

# Start it now
mc-web start
