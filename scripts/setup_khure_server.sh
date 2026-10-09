#!/data/data/com.termux/files/usr/bin/bash
set -e

echo "=========================================================="
echo "    🏰 KHURE-SERVER : Home Welcome Hub & Cloud Installer  "
echo "=========================================================="

PORTAL_DIR="$HOME/.pocket-mc/portal"
mkdir -p "$PORTAL_DIR"

BASE_URL="https://raw.githubusercontent.com/5H45H1K1R4N/pocket-jellyfin/main/portal"

echo "[1/3] Downloading KHURE-SERVER Portal files..."
curl -fsSL "$BASE_URL/db.py?t=$(date +%s)" -o "$PORTAL_DIR/db.py"
curl -fsSL "$BASE_URL/app.py?t=$(date +%s)" -o "$PORTAL_DIR/app.py"
curl -fsSL "$BASE_URL/index.html?t=$(date +%s)" -o "$PORTAL_DIR/index.html"

# Ensure Python is installed
if ! command -v python >/dev/null 2>&1 && ! command -v python3 >/dev/null 2>&1; then
    echo "[*] Installing Python..."
    pkg install python -y
fi

# Create easy 1-word launcher: 'khure-server' or 'khure-hub'
cat << 'EOF' > "$PREFIX/bin/khure-server"
#!/data/data/com.termux/files/usr/bin/bash
PY=$(command -v python3 || command -v python)
PORTAL_PATH="$HOME/.pocket-mc/portal"

case "$1" in
    stop)
        pkill -f "portal/app.py" 2>/dev/null || true
        echo "KHURE-SERVER Portal stopped."
        ;;
    status)
        if pgrep -f "portal/app.py" > /dev/null; then
            echo "KHURE-SERVER Portal is running on port 7777."
        else
            echo "KHURE-SERVER Portal is offline."
        fi
        ;;
    restart)
        pkill -f "portal/app.py" 2>/dev/null || true
        sleep 1
        cd "$PORTAL_PATH"
        nohup "$PY" app.py > "$HOME/.pocket-mc/portal.log" 2>&1 &
        sleep 1
        IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1 || echo "localhost")
        echo "[✔] KHURE-SERVER restarted at: http://${IP}:7777"
        ;;
    start|"")
        pkill -f "portal/app.py" 2>/dev/null || true
        cd "$PORTAL_PATH"
        nohup "$PY" app.py > "$HOME/.pocket-mc/portal.log" 2>&1 &
        sleep 1
        IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1 || echo "localhost")
        echo ""
        echo "=========================================================="
        echo "  🏰 KHURE-SERVER Portal is LIVE on port 7777!           "
        echo "  Share this URL or print QR code from the page:        "
        echo "  👉 http://${IP}:7777                                   "
        echo "=========================================================="
        ;;
esac
EOF
chmod +x "$PREFIX/bin/khure-server"
ln -sfn "$PREFIX/bin/khure-server" "$PREFIX/bin/khure" 2>/dev/null || true

# Add to boot script if available
BOOT_SCRIPT="$HOME/.termux/boot/start-jellyfin.sh"
if [ -f "$BOOT_SCRIPT" ]; then
    if ! grep -q "khure-server" "$BOOT_SCRIPT"; then
        echo "khure-server start 2>/dev/null || true" >> "$BOOT_SCRIPT"
    fi
fi

# Start the portal now
khure-server start
