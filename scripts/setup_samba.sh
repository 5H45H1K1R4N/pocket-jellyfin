#!/data/data/com.termux/files/usr/bin/bash
set -e

echo "=========================================================="
echo "      PocketJellyfin: Samba (SMB) Network Drive Setup     "
echo "=========================================================="

# 1. Install Samba
echo "[1/4] Installing Samba in Termux..."
pkg update -y
pkg install samba -y

# 2. Detect SD Card & Termux User
TERMUX_USER=$(whoami)
SD_ID=$(ls /storage 2>/dev/null | grep -E '^[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}$' | head -n 1 || true)
if [ -n "$SD_ID" ]; then
    SD_PATH="/storage/$SD_ID"
    MEDIA_DIR="$SD_PATH/Media"
else
    MEDIA_DIR="$HOME/storage/shared/Movies"
fi
mkdir -p "$MEDIA_DIR"
echo "  ✔ Termux User: $TERMUX_USER"
echo "  ✔ Media Folder: $MEDIA_DIR"

# 3. Create Windows 11-compatible Samba configuration
echo "[2/4] Generating Samba configuration ($PREFIX/etc/smb.conf)..."
mkdir -p "$PREFIX/etc"
cat << EOF > "$PREFIX/etc/smb.conf"
[global]
    workgroup = WORKGROUP
    server string = PocketJellyfin
    netbios name = POCKETJELLY
    security = user
    smb ports = 4445
    min protocol = SMB2
    server min protocol = SMB2
    client min protocol = SMB2
    ntlm auth = yes
    server signing = auto
    load printers = no
    printing = bsd
    printcap name = /dev/null
    disable spoolss = yes

[Media]
    comment = Phone SD Card Media
    path = $MEDIA_DIR
    read only = no
    writable = yes
    browseable = yes
    valid users = $TERMUX_USER
    force user = $TERMUX_USER
    create mask = 0777
    directory mask = 0777
EOF

# 4. Set Samba password (defaults to 1234)
echo "[3/4] Setting Samba password for $TERMUX_USER (password: 1234)..."
(echo "1234"; echo "1234") | smbpasswd -s -a "$TERMUX_USER" 2>/dev/null || true

# 5. Start Samba Daemon
echo "[4/4] Starting Samba service on port 4445..."
pkill smbd 2>/dev/null || true
pkill nmbd 2>/dev/null || true
smbd -D -s "$PREFIX/etc/smb.conf"

# 6. Add to boot script for 24/7 persistence
if [ -f "$HOME/.termux/boot/start-jellyfin.sh" ]; then
    if ! grep -q "smbd" "$HOME/.termux/boot/start-jellyfin.sh"; then
        sed -i 's|sshd 2>/dev/null \|\| true|sshd 2>/dev/null \|\| true\nsmbd -D -s "$PREFIX/etc/smb.conf" 2>/dev/null \|\| true|' "$HOME/.termux/boot/start-jellyfin.sh"
    fi
fi

IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1 || echo "192.168.31.178")

echo ""
echo "=========================================================="
echo "          Samba Network Drive is LIVE!                    "
echo "=========================================================="
echo "  Server:   \\\\${IP}\\Media"
echo "  Port:     4445"
echo "  Username: $TERMUX_USER"
echo "  Password: 1234"
echo "=========================================================="
