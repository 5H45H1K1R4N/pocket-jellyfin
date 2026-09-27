#!/data/data/com.termux/files/usr/bin/bash
set -e
echo "==========================================="
echo "  Installing PocketJellyfin Manager"
echo "==========================================="

MANAGER_DIR="$HOME/.pocket-jellyfin"
mkdir -p "$MANAGER_DIR"

# 1. Install Python (for backend)
echo "[1/4] Ensuring Python is available..."
pkg install python -y 2>/dev/null || true

# 2. Install ttyd (web terminal for MovieBox-TUI embed)
echo "[2/4] Installing ttyd (web terminal)..."
pkg install ttyd -y 2>/dev/null || true

# 3. Download manager files
echo "[3/4] Downloading manager files..."
BASE_URL="https://raw.githubusercontent.com/5H45H1K1R4N/pocket-jellyfin/main/manager"
curl -fsSL "$BASE_URL/app.py" -o "$MANAGER_DIR/app.py"
curl -fsSL "$BASE_URL/index.html" -o "$MANAGER_DIR/index.html"

# 4. Create startup script (run manager + ttyd alongside Jellyfin)
echo "[4/4] Updating boot script..."
cat << 'EOF' > "$HOME/.termux/boot/start-pocket-jellyfin.sh"
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock

SD_ID=$(ls /storage 2>/dev/null | grep -E '^[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}$' | head -n 1 || true)
SD_PATH="/storage/$SD_ID"

# 1. Start SSH
sshd 2>/dev/null || true

# 2. Start PocketJellyfin Manager API on port 5000
cd "$HOME/.pocket-jellyfin"
nohup python app.py > "$HOME/.pocket-jellyfin/manager.log" 2>&1 &

# 3. Start ttyd on port 7681 (embedded movie downloader terminal)
if command -v ttyd >/dev/null 2>&1; then
    nohup ttyd --port 7681 --once tmux new-session -A -s movies bash -c "~/moviebox.sh || bash" > /dev/null 2>&1 &
fi

# 4. Start Jellyfin in foreground (keeps proot alive)
echo "Starting Jellyfin..."
proot-distro login debian --bind /storage:/storage -- \
    jellyfin \
    --datadir "$SD_PATH/Jellyfin/data" \
    --cachedir "$SD_PATH/Jellyfin/cache"
EOF
chmod +x "$HOME/.termux/boot/start-pocket-jellyfin.sh"

# Quick launch alias
grep -q "pocket-jellyfin" "$HOME/.bashrc" 2>/dev/null || \
    echo "[ -f ~/.pocket-jellyfin/app.py ] && (pgrep -f 'app.py' > /dev/null || (cd ~/.pocket-jellyfin && nohup python app.py > manager.log 2>&1 &))" >> "$HOME/.bashrc"

IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1 || echo "YOUR_PHONE_IP")

echo ""
echo "==========================================="
echo "  Manager Installed!"
echo "  Open:  http://${IP}:5000"
echo "  Start: ~/.termux/boot/start-pocket-jellyfin.sh"
echo "==========================================="

# Start it now
cd "$HOME/.pocket-jellyfin" && python app.py
