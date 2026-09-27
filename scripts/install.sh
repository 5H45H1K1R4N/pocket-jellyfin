#!/data/data/com.termux/files/usr/bin/bash
set -e

echo "=========================================================="
echo "          PocketJellyfin Automated Installer              "
echo "=========================================================="

# 1. Wake lock
termux-wake-lock

# 2. Detect SD Card
echo "[1/6] Detecting SD Card..."
SD_ID=$(ls /storage | grep -E '^[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}$' | head -n 1)

if [ -z "$SD_ID" ]; then
    echo "Warning: No SD card matching XXXX-XXXX format detected."
    echo "Listing available /storage paths:"
    ls /storage
    read -p "Please enter your SD Card folder name (e.g. 26B2-1AEB): " SD_ID
fi

SD_PATH="/storage/$SD_ID"
echo "Using SD Card at: $SD_PATH"

# 3. Install Termux dependencies
echo "[2/6] Updating Termux & installing base packages..."
pkg update -y
pkg install proot-distro curl openssh jq -y

# 4. Create directories on SD Card
echo "[3/6] Setting up media & database directories on SD Card..."
mkdir -p "$SD_PATH/Jellyfin/data"
mkdir -p "$SD_PATH/Jellyfin/cache"
mkdir -p "$SD_PATH/Media/Movies"
mkdir -p "$SD_PATH/Media/Series"

# 5. Install Debian & Jellyfin
echo "[4/6] Installing Debian PRoot environment..."
if ! proot-distro list | grep -q "debian (installed)"; then
    proot-distro install debian
fi

echo "[5/6] Installing Jellyfin and FFmpeg inside Debian..."
proot-distro login debian --bind /storage:/storage -- bash -c "
    apt update && apt upgrade -y
    apt install curl gnupg lsb-release ffmpeg jellyfin-web -y
    curl -fsSL https://repo.jellyfin.org/install-debuntu.sh | bash
    ln -sfn /usr/share/jellyfin/web /usr/lib/jellyfin/bin/jellyfin-web
    apt clean
    rm -rf /var/cache/apt/archives/* /tmp/*
"

# 6. Configure Startup Script
echo "[6/6] Configuring auto-start & SSH..."
mkdir -p "$HOME/.termux/boot"
cat << EOF > "$HOME/.termux/boot/start-jellyfin.sh"
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
sshd 2>/dev/null || true
echo "Starting PocketJellyfin on SD Card ($SD_ID)..."
proot-distro login debian --bind /storage:/storage -- jellyfin --datadir $SD_PATH/Jellyfin/data --cachedir $SD_PATH/Jellyfin/cache
EOF
chmod +x "$HOME/.termux/boot/start-jellyfin.sh"

# Enable SSH daemon
sshd 2>/dev/null || true

# IP address detection
IP_ADDR=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' || echo "YOUR_PHONE_IP")

echo ""
echo "=========================================================="
echo "          PocketJellyfin Installation Complete!           "
echo "=========================================================="
echo "  Jellyfin Web:  http://${IP_ADDR}:8096"
echo "  SSH Remote:    ssh $(whoami)@${IP_ADDR} -p 8022"
echo ""
echo "  To start the server now:"
echo "    ~/.termux/boot/start-jellyfin.sh"
echo "=========================================================="
