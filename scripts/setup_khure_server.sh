#!/data/data/com.termux/files/usr/bin/bash
set -e

echo "=========================================================="
echo "    🏰 KHURE-SERVER : Home Welcome Hub & Cloud Installer  "
echo "=========================================================="

# Delegate directly to updated setup_home_hub.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/setup_home_hub.sh" ]; then
    bash "$SCRIPT_DIR/setup_home_hub.sh"
else
    curl -fsSL https://raw.githubusercontent.com/5H45H1K1R4N/pocket-jellyfin/main/scripts/setup_home_hub.sh | bash
fi
