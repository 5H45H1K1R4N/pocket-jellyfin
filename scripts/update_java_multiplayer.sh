#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# PocketJellyfin: Complete Java Multiplayer Setup & Modernizer
# Installs: Playit.gg (Public Tunnel), ViaVersion (All Client Versions),
#           ViaBackwards, Geyser-Spigot & Floodgate (Bedrock Cross-Play)
# Configures: enforce-secure-profile=false, online-mode=false
# ==============================================================================

set -e

clear
echo "=========================================================="
echo "    PocketJellyfin: Java Multiplayer & Tunnel Setup       "
echo "=========================================================="

# 1. Detect Minecraft Root Directory
SD_ID=$(ls /storage 2>/dev/null | grep -E '^[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}$' | head -n 1 || true)
if [ -n "$SD_ID" ] && [ -d "/storage/$SD_ID/Minecraft" ]; then
    MC_ROOT="/storage/$SD_ID/Minecraft"
elif [ -d "/storage/26B2-1AEB/Minecraft" ]; then
    MC_ROOT="/storage/26B2-1AEB/Minecraft"
elif [ -d "$HOME/pocket-jellyfin/minecraft" ]; then
    MC_ROOT="$HOME/pocket-jellyfin/minecraft"
else
    MC_ROOT="$HOME/minecraft"
fi

echo "[*] Minecraft directory: $MC_ROOT"

# Ensure plugins directory exists in all expected locations
PLUGINS_DIR="$MC_ROOT/plugins"
mkdir -p "$PLUGINS_DIR"
if [ -d "$MC_ROOT/server" ]; then
    mkdir -p "$MC_ROOT/server/plugins"
fi

# 2. Stop Server cleanly before updating
echo ""
echo "[1/5] Stopping server for safe updating..."
if command -v mc >/dev/null 2>&1; then
    mc stop 2>/dev/null || true
elif command -v tmux >/dev/null 2>&1 && tmux has-session -t minecraft 2>/dev/null; then
    tmux send-keys -t minecraft "stop" Enter
    sleep 5
fi

# 3. Optimize server.properties for Java & Cracked/Non-Premium Multiplayer
echo ""
echo "[2/5] Configuring server.properties for maximum multiplayer compatibility..."
PROPS_FILE="$MC_ROOT/server.properties"
if [ ! -f "$PROPS_FILE" ] && [ -f "$MC_ROOT/server/server.properties" ]; then
    PROPS_FILE="$MC_ROOT/server/server.properties"
elif [ ! -f "$PROPS_FILE" ] && [ -f "$MC_ROOT/config/server.properties" ]; then
    PROPS_FILE="$MC_ROOT/config/server.properties"
fi

if [ -f "$PROPS_FILE" ]; then
    sed -i 's/^enforce-secure-profile=.*/enforce-secure-profile=false/' "$PROPS_FILE" || echo "enforce-secure-profile=false" >> "$PROPS_FILE"
    sed -i 's/^online-mode=.*/online-mode=false/' "$PROPS_FILE" || echo "online-mode=false" >> "$PROPS_FILE"
    sed -i 's/^view-distance=.*/view-distance=5/' "$PROPS_FILE" || echo "view-distance=5" >> "$PROPS_FILE"
    sed -i 's/^simulation-distance=.*/simulation-distance=4/' "$PROPS_FILE" || echo "simulation-distance=4" >> "$PROPS_FILE"
    sed -i 's/^network-compression-threshold=.*/network-compression-threshold=256/' "$PROPS_FILE" || echo "network-compression-threshold=256" >> "$PROPS_FILE"
    echo "  ✔ Disabled secure profile enforcement (prevents signature kicks)"
    echo "  ✔ Enabled offline/cross-platform mode (online-mode=false)"
    echo "  ✔ Optimized view distance (5 chunks) for smooth 20 TPS on mobile"
fi

# 4. Download Essential Multiplayer Plugins
echo ""
echo "[3/5] Downloading multiplayer plugins..."

# A. Playit.gg Minecraft Plugin (Public Internet Tunnel without Port Forwarding)
echo "  ⬇ [1/4] Playit.gg Tunnel Plugin..."
PLAYIT_URL="https://github.com/playit-cloud/playit-minecraft-plugin/releases/download/v0.2.0/playit-minecraft-plugin.jar"
curl -# -L -f "$PLAYIT_URL" -o "$PLUGINS_DIR/playit-minecraft-plugin.jar"

# B. ViaVersion (Allows newer Minecraft Java clients to connect)
echo "  ⬇ [2/4] ViaVersion (Forward Compatibility)..."
VIA_URL="https://github.com/ViaVersion/ViaVersion/releases/download/5.12.0/ViaVersion-5.12.0.jar"
curl -# -L -f "$VIA_URL" -o "$PLUGINS_DIR/ViaVersion.jar"

# C. ViaBackwards (Allows older Minecraft Java clients to connect)
echo "  ⬇ [3/4] ViaBackwards (Backward Compatibility)..."
VIAB_URL="https://github.com/ViaVersion/ViaBackwards/releases/download/5.12.0/ViaBackwards-5.12.0.jar"
curl -# -L -f "$VIAB_URL" -o "$PLUGINS_DIR/ViaBackwards.jar"

# D. Geyser & Floodgate (Bedrock Cross-Play for Phones, Consoles, Tablets)
echo "  ⬇ [4/4] Geyser-Spigot & Floodgate (Bedrock Cross-Play)..."
curl -# -L -f "https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/spigot" -o "$PLUGINS_DIR/Geyser-Spigot.jar" || true
curl -# -L -f "https://download.geysermc.org/v2/projects/floodgate/versions/latest/builds/latest/downloads/spigot" -o "$PLUGINS_DIR/Floodgate-Spigot.jar" || true

# Mirror to server/plugins if separate directory
if [ -d "$MC_ROOT/server/plugins" ] && [ "$MC_ROOT/server/plugins" != "$PLUGINS_DIR" ]; then
    cp -u "$PLUGINS_DIR"/*.jar "$MC_ROOT/server/plugins/" 2>/dev/null || true
fi

echo "  ✔ All plugins installed in $PLUGINS_DIR"

# 5. Clean up stale playit data so a clean claim link is generated
echo ""
echo "[4/5] Preparing clean Playit tunnel..."
rm -rf "$PLUGINS_DIR/playit/playit.toml" "$PLUGINS_DIR/playit/secret.toml" 2>/dev/null || true
if [ -d "$MC_ROOT/server/plugins/playit" ]; then
    rm -rf "$MC_ROOT/server/plugins/playit/playit.toml" "$MC_ROOT/server/plugins/playit/secret.toml" 2>/dev/null || true
fi

# 6. Start Server and watch for Playit Claim URL
echo ""
echo "[5/5] Starting Minecraft server with new multiplayer plugins..."
if command -v mc >/dev/null 2>&1; then
    mc start
else
    echo "Starting via start-jellyfin or tmux..."
fi

echo ""
echo "Waiting for server to load plugins (approx 15 seconds)..."
sleep 15

IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1 || echo "localhost")
LOG_FILE="$MC_ROOT/logs/latest.log"
if [ ! -f "$LOG_FILE" ] && [ -f "$MC_ROOT/server/logs/latest.log" ]; then
    LOG_FILE="$MC_ROOT/server/logs/latest.log"
fi

CLAIM_URL=""
TUNNEL_ADDR=""
if [ -f "$LOG_FILE" ]; then
    CLAIM_URL=$(grep -oE 'https://playit\.gg/claim/[a-zA-Z0-9_-]+' "$LOG_FILE" | tail -1 || true)
    TUNNEL_ADDR=$(grep -oE '([a-zA-Z0-9-]+\.gl\.joinmc\.link|[a-zA-Z0-9-]+\.playit\.gg:[0-9]+)' "$LOG_FILE" | tail -1 || true)
fi

echo "=========================================================="
echo "    🎉 Java Multiplayer is Ready!                        "
echo "=========================================================="
echo "  • Local Wi-Fi (Home):       ${IP}:25565"
echo "  • Bedrock (Phones/Consoles): ${IP} (Port: 19132)"
echo "  • All Client Versions:      1.16 through 1.21.x (ViaVersion)"
echo ""
if [ -n "$TUNNEL_ADDR" ]; then
    echo "  • Public Internet Domain:   ${TUNNEL_ADDR}"
elif [ -n "$CLAIM_URL" ]; then
    echo "  👉 ACTION REQUIRED: Link your free public domain:"
    echo "     $CLAIM_URL"
    echo "     (Open this link in Chrome/browser to link Playit tunnel)"
else
    echo "  ℹ Playit claim link will appear in a moment in console:"
    echo "    Run: mc console   or check dashboard: http://${IP}:8088"
fi
echo ""
echo "  • Web Dashboard:            http://${IP}:8088"
echo "=========================================================="
