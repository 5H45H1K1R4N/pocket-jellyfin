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
   PocketJellyfin Module: Minecraft Java + PaperMC Server
==========================================================
EOF

# 1. Wake lock
termux-wake-lock 2>/dev/null || true

# 2. Dependencies
echo "[1/4] Checking and installing Termux prerequisites..."
pkg update -y
pkg install proot-distro tmux curl jq unzip tar -y

# 3. Ensure PRoot Debian exists
echo "[2/4] Verifying Debian Linux environment..."
if ! proot-distro list | grep -q "debian (installed)"; then
    echo "  Installing Debian PRoot environment..."
    proot-distro install debian
else
    echo "  ✔ PRoot Debian is installed."
fi

# 4. Download and install the Minecraft CLI service
echo "[3/4] Installing 'minecraft' command in Termux ($PREFIX/bin/minecraft)..."
SERVICE_URL="https://raw.githubusercontent.com/5H45H1K1R4N/pocket-jellyfin/main/scripts/minecraft_service.sh"
mkdir -p "$PREFIX/bin"
curl -fsSL "$SERVICE_URL" -o "$PREFIX/bin/minecraft"
chmod +x "$PREFIX/bin/minecraft"

# Create easy shortcuts
ln -sfn "$PREFIX/bin/minecraft" "$PREFIX/bin/mc"
ln -sfn "$PREFIX/bin/minecraft" "$PREFIX/bin/pocket-minecraft"

# 5. Run the interactive installer
echo "[4/4] Launching PocketJellyfin Minecraft Installer..."
"$PREFIX/bin/minecraft" install "$@"

# 6. Auto-boot integration (optional)
echo ""
read -p "Would you like Minecraft to automatically start on phone boot? [Y/n]: " AUTO_BOOT
AUTO_BOOT=${AUTO_BOOT:-Y}

BOOT_SCRIPT="$HOME/.termux/boot/start-jellyfin.sh"
if [[ "$AUTO_BOOT" =~ ^[Yy]$ ]] && [ -f "$BOOT_SCRIPT" ]; then
    if ! grep -q "minecraft start" "$BOOT_SCRIPT"; then
        echo "" >> "$BOOT_SCRIPT"
        echo "# PocketJellyfin Minecraft Module" >> "$BOOT_SCRIPT"
        echo "minecraft start 2>/dev/null || true" >> "$BOOT_SCRIPT"
        echo "  ✔ Added Minecraft auto-start to $BOOT_SCRIPT"
    fi
fi

IP_ADDR=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' || echo "YOUR_PHONE_IP")

echo ""
echo "=========================================================="
echo "    PocketJellyfin Minecraft Module is Ready! 🎮          "
echo "=========================================================="
echo "  • Start Server:      minecraft start"
echo "  • Live Console:      minecraft console"
echo "  • Import World:      minecraft world import /path/to/world"
echo "  • Check Status:      minecraft status"
echo "  • Stop Server:       minecraft stop"
echo "  • Server Address:    ${IP_ADDR}:25565"
echo "=========================================================="
