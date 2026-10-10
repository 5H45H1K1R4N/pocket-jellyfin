#!/data/data/com.termux/files/usr/bin/bash
set -e

echo "=========================================================="
echo "    🏠 Peppy Home Hub — Discord-Inspired Home Server       "
echo "=========================================================="

HUB_DIR="$HOME/.pocket-mc/hub"
REPO_BASE="https://raw.githubusercontent.com/5H45H1K1R4N/pocket-jellyfin/main/hub"
SCRIPTS=(
  "server.js"
  "package.json"
  "lib/config.js"
  "lib/store.js"
  "lib/http.js"
  "lib/auth.js"
  "lib/services.js"
  "lib/photos.js"
  "lib/files.js"
  "lib/multipart.js"
  "lib/api-auth.js"
  "lib/api-status.js"
  "lib/api-media.js"
  "lib/api-admin.js"
  "public/index.html"
  "public/styles.css"
  "public/app.js"
)

# Kill any existing hub process on port 7777
pkill -9 -f "peppy-home-hub" 2>/dev/null || true
pkill -9 -f "app.py" 2>/dev/null || true
if command -v fuser >/dev/null 2>&1; then fuser -k 7777/tcp 2>/dev/null || true; fi
if command -v lsof >/dev/null 2>&1; then
  PIDS=$(lsof -ti:7777 2>/dev/null || true)
  [ -n "$PIDS" ] && kill -9 $PIDS 2>/dev/null || true
fi
sleep 1

# Install Node.js if missing
if ! command -v node >/dev/null 2>&1; then
  echo "[*] Installing Node.js..."
  pkg install nodejs -y
fi

NODE_VER=$(node --version 2>/dev/null || echo "v0")
MAJOR=${NODE_VER#v}
MAJOR=${MAJOR%%.*}
if [ "$MAJOR" -lt 20 ] 2>/dev/null; then
  echo "[*] Upgrading Node.js to v20+..."
  pkg upgrade nodejs -y
fi

echo "[1/3] Creating hub directory structure..."
mkdir -p "$HUB_DIR/lib"
mkdir -p "$HUB_DIR/public"
mkdir -p "$HUB_DIR/data"
mkdir -p "$HUB_DIR/storage/drop"
mkdir -p "$HUB_DIR/storage/tmp"

echo "[2/3] Downloading Peppy Home Hub files..."
for f in "${SCRIPTS[@]}"; do
  mkdir -p "$HUB_DIR/$(dirname "$f")" 2>/dev/null || true
  curl -fsSL "$REPO_BASE/$f?t=$(date +%s)" -o "$HUB_DIR/$f"
  echo "  ✓ $f"
done

# Seed default data files if not already present (preserve existing user accounts)
if [ ! -f "$HUB_DIR/data/users.json" ]; then
  echo "[]" > "$HUB_DIR/data/users.json"
fi
if [ ! -f "$HUB_DIR/data/sessions.json" ]; then
  echo "{}" > "$HUB_DIR/data/sessions.json"
fi
if [ ! -f "$HUB_DIR/data/announcements.json" ]; then
  echo '{"items":[]}' > "$HUB_DIR/data/announcements.json"
fi
if [ ! -f "$HUB_DIR/data/files.json" ]; then
  echo '{"files":[]}' > "$HUB_DIR/data/files.json"
fi
if [ ! -f "$HUB_DIR/data/photo-index.json" ]; then
  echo '{"albums":[]}' > "$HUB_DIR/data/photo-index.json"
fi
if [ ! -f "$HUB_DIR/data/config.json" ]; then
  cat > "$HUB_DIR/data/config.json" <<CONF
{
  "port": 7777,
  "hubName": "Peppy Home Hub",
  "jellyfin": { "url": "http://127.0.0.1:8096", "publicUrl": null },
  "minecraft": { "host": "127.0.0.1", "port": 25565 },
  "photoRoots": ["/storage/26B2-1AEB/PeppyPhotos"],
  "dropDir": "/storage/26B2-1AEB/PeppyDrop",
  "maxUploadMB": 2048
}
CONF
fi

echo "[3/3] Installing launch commands..."
cat > "$PREFIX/bin/peppy-hub" <<'LAUNCHEOF'
#!/data/data/com.termux/files/usr/bin/bash
HUB_DIR="$HOME/.pocket-mc/hub"
LOG="$HOME/.pocket-mc/hub.log"
PID_FILE="$HOME/.pocket-mc/hub.pid"

stop_hub() {
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE" 2>/dev/null || true)
    [ -n "$PID" ] && kill -9 "$PID" 2>/dev/null || true
    rm -f "$PID_FILE"
  fi
  pkill -9 -f "peppy-home-hub" 2>/dev/null || true
  pkill -9 -f "server.js" 2>/dev/null || true
  if command -v fuser >/dev/null 2>&1; then fuser -k 7777/tcp 2>/dev/null || true; fi
  sleep 1
}

case "$1" in
  stop)
    stop_hub
    echo "Peppy Home Hub stopped."
    ;;
  log|logs)
    tail -f "$LOG"
    ;;
  status)
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE" 2>/dev/null)" 2>/dev/null; then
      echo "[✔] Peppy Home Hub is running (PID: $(cat "$PID_FILE"))."
    else
      echo "[!] Peppy Home Hub is offline."
      [ -f "$LOG" ] && tail -n 15 "$LOG"
    fi
    ;;
  restart)
    stop_hub
    cd "$HUB_DIR"
    node server.js > "$LOG" 2>&1 &
    PID=$!
    echo "$PID" > "$PID_FILE"
    sleep 2
    if ! kill -0 "$PID" 2>/dev/null; then
      echo "❌ Failed to start! Log:"; cat "$LOG"; exit 1
    fi
    IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1 || echo "localhost")
    echo "[✔] Restarted at http://${IP}:7777"
    ;;
  start|"")
    stop_hub
    cd "$HUB_DIR"
    termux-wake-lock 2>/dev/null || true
    node server.js > "$LOG" 2>&1 &
    PID=$!
    echo "$PID" > "$PID_FILE"
    sleep 2
    if ! kill -0 "$PID" 2>/dev/null; then
      echo "❌ Peppy Home Hub failed to start! Log contents:"; cat "$LOG"; exit 1
    fi
    IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1 || echo "localhost")
    echo ""
    echo "=========================================================="
    echo "  🏠 Peppy Home Hub is LIVE!                              "
    echo "  Open on any device on your home Wi-Fi:                 "
    echo "  👉 http://${IP}:7777                                   "
    echo "=========================================================="
    ;;
esac
LAUNCHEOF

chmod +x "$PREFIX/bin/peppy-hub"
ln -sfn "$PREFIX/bin/peppy-hub" "$PREFIX/bin/home-hub"   2>/dev/null || true
ln -sfn "$PREFIX/bin/peppy-hub" "$PREFIX/bin/khure-server" 2>/dev/null || true
ln -sfn "$PREFIX/bin/peppy-hub" "$PREFIX/bin/khure"        2>/dev/null || true

# Auto-start on Termux boot
BOOT_SCRIPT="$HOME/.termux/boot/start-jellyfin.sh"
if [ -f "$BOOT_SCRIPT" ] && ! grep -q "peppy-hub" "$BOOT_SCRIPT"; then
  echo "peppy-hub start 2>/dev/null || true" >> "$BOOT_SCRIPT"
fi

echo ""
echo "Setup complete! Starting Peppy Home Hub..."
peppy-hub start
