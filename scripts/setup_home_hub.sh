#!/data/data/com.termux/files/usr/bin/bash
set -e

echo "=========================================================="
echo "    🚀 Peppy Home Hub — Discord Portal Setup (:7777)     "
echo "=========================================================="

PORTAL_DIR="$HOME/.pocket-mc/portal"
mkdir -p "$PORTAL_DIR"

# Ensure any stale portal or port 7777 occupant is completely terminated
echo "[*] Cleaning up old portal processes..."
pkill -9 -f "app.py" 2>/dev/null || true
pkill -9 -f "portal/server.js" 2>/dev/null || true
pkill -9 -f "node server.js" 2>/dev/null || true
if command -v fuser >/dev/null 2>&1; then fuser -k 7777/tcp 2>/dev/null || true; fi
if command -v lsof >/dev/null 2>&1; then
    PIDS=$(lsof -ti:7777 2>/dev/null || true)
    if [ -n "$PIDS" ]; then kill -9 $PIDS 2>/dev/null || true; fi
fi
sleep 1

# Ensure Node.js is installed
if ! command -v node >/dev/null 2>&1; then
    echo "[*] Installing Node.js..."
    pkg update -y
    pkg install nodejs -y
fi

echo "[1/3] Downloading latest Peppy Home Hub portal engine..."
# Remove any legacy Python portal files
rm -f "$PORTAL_DIR/app.py" "$PORTAL_DIR/db.py" "$PORTAL_DIR/portal.db" 2>/dev/null || true
rm -rf "$PORTAL_DIR/__pycache__" 2>/dev/null || true

# Extract updated Node.js portal from main branch
curl -fsSL https://github.com/5H45H1K1R4N/pocket-jellyfin/archive/refs/heads/main.tar.gz | tar -xz --strip-components=2 -C "$PORTAL_DIR" pocket-jellyfin-main/portal

# Create easy launchers: 'peppy-hub', 'home-hub', and backward-compatible 'khure-server'
cat << 'EOF' > "$PREFIX/bin/peppy-hub"
#!/data/data/com.termux/files/usr/bin/bash
PORTAL_PATH="$HOME/.pocket-mc/portal"

stop_portal() {
    if [ -f "$PORTAL_PATH/portal.pid" ]; then
        PID=$(cat "$PORTAL_PATH/portal.pid" 2>/dev/null || true)
        if [ -n "$PID" ]; then kill -9 "$PID" 2>/dev/null || true; fi
        rm -f "$PORTAL_PATH/portal.pid"
    fi
    pkill -9 -f "app.py" 2>/dev/null || true
    pkill -9 -f "portal/server.js" 2>/dev/null || true
    pkill -9 -f "node server.js" 2>/dev/null || true
    if command -v fuser >/dev/null 2>&1; then fuser -k 7777/tcp 2>/dev/null || true; fi
    sleep 1
}

case "$1" in
    stop)
        stop_portal
        echo "Peppy Home Hub stopped."
        ;;
    log|logs)
        tail -f "$HOME/.pocket-mc/portal.log"
        ;;
    status)
        if [ -f "$PORTAL_PATH/portal.pid" ] && kill -0 $(cat "$PORTAL_PATH/portal.pid" 2>/dev/null) 2>/dev/null; then
            echo "[✔] Peppy Home Hub is running (PID: $(cat "$PORTAL_PATH/portal.pid"))."
        elif pgrep -f "server.js" > /dev/null; then
            echo "[✔] Peppy Home Hub is running."
        else
            echo "[!] Peppy Home Hub is offline."
            if [ -f "$HOME/.pocket-mc/portal.log" ]; then
                echo "--- Last log entries ---"
                tail -n 15 "$HOME/.pocket-mc/portal.log"
            fi
        fi
        ;;
    restart)
        stop_portal
        cd "$PORTAL_PATH"
        node server.js > "$HOME/.pocket-mc/portal.log" 2>&1 &
        PID=$!
        echo "$PID" > "$PORTAL_PATH/portal.pid"
        sleep 2
        if ! kill -0 "$PID" 2>/dev/null; then
            echo "❌ [ERROR] Peppy Home Hub failed to start! Log contents:"
            cat "$HOME/.pocket-mc/portal.log"
            exit 1
        fi
        IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1 || echo "localhost")
        echo "[✔] Peppy Home Hub restarted at: http://${IP}:7777"
        ;;
    start|"")
        stop_portal
        cd "$PORTAL_PATH"
        node server.js > "$HOME/.pocket-mc/portal.log" 2>&1 &
        PID=$!
        echo "$PID" > "$PORTAL_PATH/portal.pid"
        sleep 2
        if ! kill -0 "$PID" 2>/dev/null; then
            echo "❌ [ERROR] Peppy Home Hub failed to start! Log contents:"
            cat "$HOME/.pocket-mc/portal.log"
            exit 1
        fi
        IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1 || echo "localhost")
        echo ""
        echo "=========================================================="
        echo "  🚀 Peppy Home Hub (Discord Edition) is LIVE!            "
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
