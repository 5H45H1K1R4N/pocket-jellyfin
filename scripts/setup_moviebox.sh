#!/data/data/com.termux/files/usr/bin/bash
set -e

echo "=========================================================="
echo "      PocketJellyfin: MovieBox-TUI Auto-Downloader        "
echo "=========================================================="

# 1. Detect SD Card
SD_ID=$(ls /storage | grep -E '^[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}$' | head -n 1)
if [ -z "$SD_ID" ]; then
    read -p "Enter your SD Card identifier (e.g. 26B2-1AEB): " SD_ID
fi
SD_PATH="/storage/$SD_ID"

# 2. Install dependencies
echo "[1/4] Installing dependencies (curl, mpv, jq)..."
pkg update -y
pkg install curl mpv jq -y

# 3. Install MovieBox-TUI
echo "[2/4] Installing MovieBox-TUI..."
curl -fsSL https://raw.githubusercontent.com/mesamirh/MovieBox-Tui/main/install.sh -o "$HOME/install_moviebox.sh"
bash "$HOME/install_moviebox.sh"
rm -f "$HOME/install_moviebox.sh"

# 4. Prepare SD Card download directory & fix configuration
echo "[3/4] Configuring canonical SD card download paths..."
mkdir -p "$SD_PATH/Media"
mkdir -p "$HOME/.config/moviebox-tui"

# Launch once in background to generate default config if not present, then patch
if [ ! -f "$HOME/.config/moviebox-tui/config.json" ]; then
    echo "{}" > "$HOME/.config/moviebox-tui/config.json"
fi

# Patch config.json with SD card download path to avoid canonical path containment bug
sed -i 's|"download_dir":.*|"download_dir": "'"$SD_PATH/Media"'",|' "$HOME/.config/moviebox-tui/config.json" 2>/dev/null || true

# 5. Create launcher script
echo "[4/4] Creating launcher script at ~/moviebox.sh..."
cat << 'EOF' > "$HOME/moviebox.sh"
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock

echo "=========================================="
echo "        Starting MovieBox-TUI"
echo "  (Downloads go straight to your SD Card)"
echo "=========================================="
echo ""

moviebox-tui

echo ""
echo "=========================================="
echo "Checking for Jellyfin auto-refresh..."
CONFIG_FILE="$HOME/.jellyfin_api_key"
if [ -f "$CONFIG_FILE" ]; then
    API_KEY=$(cat "$CONFIG_FILE")
    if [ -n "$API_KEY" ]; then
        echo "Notifying Jellyfin to scan SD Card for new downloads..."
        curl -s -X POST "http://127.0.0.1:8096/Library/Refresh" \
             -H "Authorization: MediaBrowser Token=\"$API_KEY\"" > /dev/null 2>&1 || true
        echo "[OK] Jellyfin is scanning your media library!"
    fi
else
    echo "Tip: To enable instant Jellyfin library scans upon download:"
    echo "  echo \"YOUR_JELLYFIN_API_KEY\" > ~/.jellyfin_api_key"
fi
echo "=========================================="
EOF

chmod +x "$HOME/moviebox.sh"

echo ""
echo "=========================================================="
echo "  MovieBox-TUI Setup Complete!"
echo "  Run '~/moviebox.sh' to download movies/shows."
echo "=========================================================="
