#!/data/data/com.termux/files/usr/bin/bash
set -e

clear
cat << "EOF"
==========================================================
   ____             _        _       _      _ _  __ _       
  |  _ \ ___   ____| | _____| |_    | | ___| | |/ _(_)_ __  
  | |_) / _ \ / ___| |/ / _ \ __|_  | |/ _ \ | | |_| | '_ \ 
  |  __/ (_) | |___|   <  __/ |_| |_| |  __/ | |  _| | | | |
  |_|   \___/ \____|_|\_\___|\__|\___/ \___|_|_|_| |_|_| |_|
==========================================================
     Autonomous 24/7 Media Server on Android (Termux)
==========================================================
EOF

# 1. Wake lock
echo "[+] Acquiring CPU wake-lock (prevents sleep with screen off)..."
termux-wake-lock

# 2. Storage Setup
echo ""
echo "[1/5] Checking Storage & SD Card..."
termux-setup-storage 2>/dev/null || true

# Detect SD Card
SD_ID=$(ls /storage 2>/dev/null | grep -E '^[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}$' | head -n 1 || true)

if [ -n "$SD_ID" ]; then
    echo "  ✔ Found micro-SD Card: /storage/$SD_ID"
    read -p "  Use this SD Card for Jellyfin database, cache, and media? [Y/n]: " USE_SD
    USE_SD=${USE_SD:-Y}
else
    echo "  ℹ No external micro-SD card automatically detected."
    USE_SD="n"
fi

if [[ "$USE_SD" =~ ^[Yy]$ ]]; then
    SD_PATH="/storage/$SD_ID"
    DATA_DIR="$SD_PATH/Jellyfin/data"
    CACHE_DIR="$SD_PATH/Jellyfin/cache"
    MEDIA_DIR="$SD_PATH/Media"
    echo "  ✔ Media & Cache will be stored on SD Card ($SD_PATH)"
else
    DATA_DIR="$HOME/.local/share/jellyfin/data"
    CACHE_DIR="$HOME/.cache/jellyfin"
    MEDIA_DIR="$HOME/storage/shared/Movies"
    echo "  ✔ Using Phone Internal Storage."
fi

mkdir -p "$DATA_DIR" "$CACHE_DIR" "$MEDIA_DIR/Movies" "$MEDIA_DIR/Series"

# 3. Base Packages & Options
echo ""
echo "[2/5] Updating Termux packages..."
pkg update -y
pkg install proot-distro curl jq -y

# Optional Feature: SSH
echo ""
read -p "[Optional] Do you want to enable SSH (to control this phone from a PC/Laptop)? [y/N]: " ENABLE_SSH
ENABLE_SSH=${ENABLE_SSH:-N}

if [[ "$ENABLE_SSH" =~ ^[Yy]$ ]]; then
    echo "  Installing and setting up OpenSSH..."
    pkg install openssh -y
    echo "  Please set a password for SSH access:"
    passwd
    sshd 2>/dev/null || true
    echo "  ✔ SSH enabled on port 8022."
fi

# 4. Install Debian & Jellyfin
echo ""
echo "[3/5] Installing Debian Linux Environment..."
if ! proot-distro list | grep -q "debian (installed)"; then
    proot-distro install debian
fi

echo ""
echo "[4/5] Installing Jellyfin & FFmpeg inside Debian..."
proot-distro login debian --bind /storage:/storage -- bash -c "
    apt update && apt upgrade -y
    apt install curl gnupg lsb-release ffmpeg jellyfin-web -y
    curl -fsSL https://repo.jellyfin.org/install-debuntu.sh | bash
    ln -sfn /usr/share/jellyfin/web /usr/lib/jellyfin/bin/jellyfin-web
    apt clean
    rm -rf /var/cache/apt/archives/* /tmp/*
"

# 5. Optional Feature: MovieBox-TUI Downloader
echo ""
read -p "[Optional] Install MovieBox-TUI (integrated movie/series downloader)? [Y/n]: " INSTALL_MOVIEBOX
INSTALL_MOVIEBOX=${INSTALL_MOVIEBOX:-Y}

if [[ "$INSTALL_MOVIEBOX" =~ ^[Yy]$ ]]; then
    echo "  Installing MovieBox-TUI..."
    pkg install mpv -y 2>/dev/null || true
    curl -fsSL https://raw.githubusercontent.com/mesamirh/MovieBox-Tui/main/install.sh -o "$HOME/install_moviebox.sh"
    bash "$HOME/install_moviebox.sh"
    rm -f "$HOME/install_moviebox.sh"

    # Configure canonical download path to prevent traversal bug
    mkdir -p "$HOME/.config/moviebox-tui"
    [ ! -f "$HOME/.config/moviebox-tui/config.json" ] && echo "{}" > "$HOME/.config/moviebox-tui/config.json"
    sed -i 's|"download_dir":.*|"download_dir": "'"$MEDIA_DIR"'",|' "$HOME/.config/moviebox-tui/config.json" 2>/dev/null || true

    # Create moviebox launcher
    cat << 'EOF' > "$HOME/moviebox.sh"
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
moviebox-tui
CONFIG_FILE="$HOME/.jellyfin_api_key"
if [ -f "$CONFIG_FILE" ]; then
    API_KEY=$(cat "$CONFIG_FILE")
    if [ -n "$API_KEY" ]; then
        curl -s -X POST "http://127.0.0.1:8096/Library/Refresh" \
             -H "Authorization: MediaBrowser Token=\"$API_KEY\"" > /dev/null 2>&1 || true
        echo "[OK] Jellyfin is scanning for new downloads!"
    fi
fi
EOF
    chmod +x "$HOME/moviebox.sh"
    echo "  ✔ MovieBox-TUI installed! Run '~/moviebox.sh' to download media."
fi

# 6. Configure Auto-Boot
echo ""
echo "[5/5] Configuring Auto-Boot Startup..."
mkdir -p "$HOME/.termux/boot"

SSH_LINE=""
if [[ "$ENABLE_SSH" =~ ^[Yy]$ ]]; then
    SSH_LINE="sshd 2>/dev/null || true"
fi

cat << EOF > "$HOME/.termux/boot/start-jellyfin.sh"
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
$SSH_LINE
echo "Starting PocketJellyfin..."
proot-distro login debian --bind /storage:/storage -- jellyfin --datadir "$DATA_DIR" --cachedir "$CACHE_DIR"
EOF
chmod +x "$HOME/.termux/boot/start-jellyfin.sh"

# Add easy launch alias to bashrc
echo "pgrep -f jellyfin > /dev/null || ~/.termux/boot/start-jellyfin.sh" >> "$HOME/.bashrc"

# Get IP Address
IP_ADDR=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' || echo "localhost")

echo ""
echo "=========================================================="
echo "          PocketJellyfin Installation Complete!           "
echo "=========================================================="
echo "  • Jellyfin Web UI: http://${IP_ADDR}:8096"
if [[ "$ENABLE_SSH" =~ ^[Yy]$ ]]; then
echo "  • PC Remote SSH:   ssh $(whoami)@${IP_ADDR} -p 8022"
fi
if [[ "$INSTALL_MOVIEBOX" =~ ^[Yy]$ ]]; then
echo "  • Movie Downloader: Run '~/moviebox.sh'"
fi
echo ""
echo "  Starting server now..."
echo "=========================================================="
~/.termux/boot/start-jellyfin.sh
