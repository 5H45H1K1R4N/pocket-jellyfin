#!/data/data/com.termux/files/usr/bin/bash
set -e

echo "=========================================================="
echo "    🚀 Peppy Home Hub — Futuristic Server Portal Setup    "
echo "=========================================================="

PORTAL_DIR="$HOME/.pocket-mc/portal"
mkdir -p "$PORTAL_DIR"

BASE_URL="https://raw.githubusercontent.com/5H45H1K1R4N/pocket-jellyfin/main/portal"

# Ensure any stale portal or port 7777 occupant is terminated
pkill -9 -f "app.py" 2>/dev/null || true
pkill -9 -f "portal" 2>/dev/null || true
if command -v fuser >/dev/null 2>&1; then fuser -k 7777/tcp 2>/dev/null || true; fi
if command -v lsof >/dev/null 2>&1; then
    PIDS=$(lsof -ti:7777 2>/dev/null || true)
    if [ -n "$PIDS" ]; then kill -9 $PIDS 2>/dev/null || true; fi
fi
sleep 1

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

stop_portal() {
    if [ -f "$PORTAL_PATH/portal.pid" ]; then
        PID=$(cat "$PORTAL_PATH/portal.pid" 2>/dev/null || true)
        if [ -n "$PID" ]; then kill -9 "$PID" 2>/dev/null || true; fi
        rm -f "$PORTAL_PATH/portal.pid"
    fi
    pkill -9 -f "app.py" 2>/dev/null || true
    pkill -9 -f "portal" 2>/dev/null || true
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
        elif pgrep -f "app.py" > /dev/null; then
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
        "$PY" -u app.py > "$HOME/.pocket-mc/portal.log" 2>&1 &
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
        "$PY" -u app.py > "$HOME/.pocket-mc/portal.log" 2>&1 &
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
        echo "  🚀 Peppy Home Hub is LIVE!                              "
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
