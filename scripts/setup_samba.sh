#!/data/data/com.termux/files/usr/bin/bash
set -e

echo "=========================================================="
echo "      PocketJellyfin: Samba (SMB) Network Drive Setup     "
echo "=========================================================="

# 1. Install Samba
echo "[1/4] Installing Samba in Termux..."
pkg update -y
pkg install samba -y

# 2. Detect SD Card
SD_ID=$(ls /storage 2>/dev/null | grep -E '^[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}$' | head -n 1 || true)
if [ -n "$SD_ID" ]; then
    SD_PATH="/storage/$SD_ID"
    MEDIA_DIR="$SD_PATH/Media"
else
    MEDIA_DIR="$HOME/storage/shared/Movies"
fi
mkdir -p "$MEDIA_DIR"
echo "  ✔ Sharing folder: $MEDIA_DIR"

# 3. Create Samba configuration
echo "[2/4] Generating Samba configuration ($PREFIX/etc/smb.conf)..."
mkdir -p "$PREFIX/etc"
cat << EOF > "$PREFIX/etc/smb.conf"
[global]
    workgroup = WORKGROUP
    server string = PocketJellyfin SMB
    netbios name = POCKETJELLY
    security = user
    smb ports = 4445
    bind interfaces only = no
    map to guest = Bad User
    guest account = nobody
    load printers = no
    printing = bsd
    printcap name = /dev/null
    disable spoolss = yes

[Media]
    comment = Phone SD Card Media
    path = $MEDIA_DIR
    read only = no
    writable = yes
    guest ok = yes
    browseable = yes
    create mask = 0777
    directory mask = 0777
EOF

# 4. Start Samba Daemon
echo "[3/4] Starting Samba service on port 4445..."
pkill smbd 2>/dev/null || true
smbd -D -s "$PREFIX/etc/smb.conf"

# 5. Add to boot script for 24/7 persistence
echo "[4/4] Adding Samba to auto-boot script..."
if [ -f "$HOME/.termux/boot/start-jellyfin.sh" ]; then
    if ! grep -q "smbd" "$HOME/.termux/boot/start-jellyfin.sh"; then
        sed -i 's|sshd 2>/dev/null \|\| true|sshd 2>/dev/null \|\| true\nsmbd -D -s "$PREFIX/etc/smb.conf" 2>/dev/null \|\| true|' "$HOME/.termux/boot/start-jellyfin.sh"
    fi
fi

# Detect Wi-Fi IP
IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1 || echo "192.168.31.178")

echo ""
echo "=========================================================="
echo "          Samba Network Drive is LIVE!                    "
echo "=========================================================="
echo "  Folder Shared:  $MEDIA_DIR"
echo "  Server Address: \\\\${IP}\\Media"
echo "  Port:           4445"
echo ""
echo "  To connect from Windows, open PowerShell as Admin and run:"
echo "    net use Z: \\\\${IP}\\Media /TCPPORT:4445 /PERSISTENT:YES"
echo "=========================================================="
