#!/data/data/com.termux/files/usr/bin/bash
set -e

echo "=========================================================="
echo "    📻 PEPPY RADIO : 24/7 LAN Radio & Voice Broadcast     "
echo "=========================================================="

RADIO_DIR="$HOME/pocket-jellyfin/radio"

if [ ! -d "$RADIO_DIR" ]; then
    echo "❌ [ERROR] Directory $RADIO_DIR not found!"
    echo "Make sure you ran: cd ~/pocket-jellyfin && git pull origin main"
    exit 1
fi

echo "[1/4] Ensuring packages (nodejs, openssl-tool, ffmpeg)..."
pkg install -y nodejs openssl-tool ffmpeg termux-api 2>/dev/null || pkg install -y nodejs openssl-tool ffmpeg

echo "[2/4] Installing radio dependencies..."
cd "$RADIO_DIR"
npm install --omit=dev

mkdir -p "$RADIO_DIR/music" "$RADIO_DIR/jingles" "$RADIO_DIR/certs"

termux-setup-storage 2>/dev/null || true
if [ -d "$HOME/storage/shared/Music" ]; then
    echo "  [✔] Linking existing songs from ~/storage/shared/Music..."
    find "$HOME/storage/shared/Music" -type f -iname "*.mp3" -exec ln -sf {} "$RADIO_DIR/music/" \; 2>/dev/null || true
elif [ -d "/sdcard/Music" ]; then
    echo "  [✔] Linking existing songs from /sdcard/Music..."
    find "/sdcard/Music" -type f -iname "*.mp3" -exec ln -sf {} "$RADIO_DIR/music/" \; 2>/dev/null || true
fi

echo "[3/4] Ensuring HTTPS certificate for local network..."
if [ ! -f "$RADIO_DIR/certs/cert.pem" ]; then
    IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1 || echo "192.168.31.178")
    bash "$RADIO_DIR/gen-cert.sh" "$IP"
fi

chmod +x "$RADIO_DIR/start.sh" "$RADIO_DIR/gen-cert.sh" "$RADIO_DIR/convert.sh"

echo "[4/4] Installing quick command: 'radio' / 'peppy-radio'..."
cat << 'EOF' > "$PREFIX/bin/peppy-radio"
#!/data/data/com.termux/files/usr/bin/bash
RADIO_DIR="$HOME/pocket-jellyfin/radio"
PID_FILE="$RADIO_DIR/radio.pid"
LOG_FILE="$RADIO_DIR/radio.log"

stop_radio() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE" 2>/dev/null || true)
        if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
            kill "$PID" 2>/dev/null || true
            sleep 1
            kill -9 "$PID" 2>/dev/null || true
        fi
        rm -f "$PID_FILE"
    fi
    pkill -f "node.*server.js" 2>/dev/null || true
    if command -v fuser >/dev/null 2>&1; then fuser -k 8443/tcp 2>/dev/null || true; fi
}

case "$1" in
    stop)
        stop_radio
        echo "Peppy Radio stopped."
        ;;
    logs|log)
        tail -f "$LOG_FILE"
        ;;
    status)
        if pgrep -f "$RADIO_DIR/server.js" >/dev/null 2>&1 || ( [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE" 2>/dev/null) 2>/dev/null ); then
            IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1 || echo "192.168.31.178")
            echo "[✔] Peppy Radio is RUNNING on port 8443."
            echo "    Listen:   https://${IP}:8443/"
            echo "    DJ Booth: https://${IP}:8443/dj"
        else
            echo "[!] Peppy Radio is OFFLINE."
            if [ -f "$LOG_FILE" ]; then
                echo "--- Last log entries ---"
                tail -n 10 "$LOG_FILE"
            fi
        fi
        ;;
    restart)
        stop_radio
        sleep 1
        cd "$RADIO_DIR"
        termux-wake-lock 2>/dev/null || true
        nohup bash -c 'while true; do node server.js; sleep 3; done' > "$LOG_FILE" 2>&1 &
        echo $! > "$PID_FILE"
        sleep 2
        IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1 || echo "192.168.31.178")
        echo "[✔] Peppy Radio restarted at: https://${IP}:8443/"
        ;;
    start|"")
        stop_radio
        sleep 1
        cd "$RADIO_DIR"
        termux-wake-lock 2>/dev/null || true
        nohup bash -c 'while true; do node server.js; sleep 3; done' > "$LOG_FILE" 2>&1 &
        echo $! > "$PID_FILE"
        sleep 2
        IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1 || echo "192.168.31.178")
        echo ""
        echo "=========================================================="
        echo "  📻 PEPPY RADIO IS ON AIR (24/7 with Wake Lock)!         "
        echo "  Listeners: https://${IP}:8443/                          "
        echo "  DJ Booth:  https://${IP}:8443/dj                        "
        echo "  Logs:      radio logs                                   "
        echo "=========================================================="
        ;;
esac
EOF

chmod +x "$PREFIX/bin/peppy-radio"
ln -sfn "$PREFIX/bin/peppy-radio" "$PREFIX/bin/radio" 2>/dev/null || true

# Boot script persistence
BOOT_DIR="$HOME/.termux/boot"
if [ -d "$BOOT_DIR" ]; then
    BOOT_SCRIPT="$BOOT_DIR/start-radio.sh"
    cat << 'EOF' > "$BOOT_SCRIPT"
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock 2>/dev/null || true
radio start
EOF
    chmod +x "$BOOT_SCRIPT"
    echo "  [✔] Termux:Boot script installed to $BOOT_SCRIPT"
fi

echo ""
echo "Setup complete! Starting Peppy Radio..."
radio start
