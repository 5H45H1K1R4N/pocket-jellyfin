#!/data/data/com.termux/files/usr/bin/bash
set -e

echo "=========================================================="
echo "    🎬 Updating MovieBox-TUI to Latest Version...         "
echo "=========================================================="

# Ensure required packages and video player integration
echo "[1/2] Updating package repository and tools..."
pkg update -y
pkg install curl mpv jq termux-tools -y

# Force upgrade to latest MovieBox-TUI release
echo "[2/2] Downloading latest MovieBox-TUI release..."
curl -fsSL https://raw.githubusercontent.com/mesamirh/MovieBox-Tui/main/install.sh | bash -s -- -f

echo ""
echo "=========================================================="
echo "  ✔ MovieBox-TUI has been successfully updated!"
if command -v moviebox-tui >/dev/null 2>&1; then
    echo "  Binary location: $(command -v moviebox-tui)"
fi
echo "  Run '~/moviebox.sh' to download movies/shows."
echo "=========================================================="
