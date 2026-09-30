#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# PocketJellyfin: EssentialsX Suite + LuckPerms Installer
# Installs: EssentialsX (Core), EssentialsXSpawn, EssentialsXChat, LuckPerms
# Auto-configures: /home, /sethome, /tpa, /tpaccept, /spawn for all players!
# ==============================================================================

set -e

clear
echo "=========================================================="
echo "      PocketJellyfin: Installing EssentialsX Suite        "
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
PLUGINS_DIR="$MC_ROOT/plugins"
mkdir -p "$PLUGINS_DIR"
if [ -d "$MC_ROOT/server" ]; then
    mkdir -p "$MC_ROOT/server/plugins"
fi

# 2. Stop server for clean plugin installation
echo ""
echo "[1/4] Stopping Minecraft server for clean installation..."
if command -v mc >/dev/null 2>&1; then
    mc stop 2>/dev/null || true
elif command -v tmux >/dev/null 2>&1 && tmux has-session -t minecraft 2>/dev/null; then
    tmux send-keys -t minecraft "stop" Enter
    sleep 5
fi

# 3. Download EssentialsX Suite & LuckPerms
echo ""
echo "[2/4] Downloading EssentialsX Suite & LuckPerms..."

# A. EssentialsX Core
echo "  ⬇ [1/4] EssentialsX Core..."
curl -# -L -f "https://github.com/EssentialsX/Essentials/releases/download/2.22.0/EssentialsX-2.22.0.jar" -o "$PLUGINS_DIR/EssentialsX.jar"

# B. EssentialsX Spawn
echo "  ⬇ [2/4] EssentialsX Spawn..."
curl -# -L -f "https://github.com/EssentialsX/Essentials/releases/download/2.22.0/EssentialsXSpawn-2.22.0.jar" -o "$PLUGINS_DIR/EssentialsXSpawn.jar"

# C. EssentialsX Chat
echo "  ⬇ [3/4] EssentialsX Chat..."
curl -# -L -f "https://github.com/EssentialsX/Essentials/releases/download/2.22.0/EssentialsXChat-2.22.0.jar" -o "$PLUGINS_DIR/EssentialsXChat.jar"

# D. LuckPerms (Permissions engine so non-OPs can use /home, /tpa, /spawn)
echo "  ⬇ [4/4] LuckPerms (Permission Manager)..."
curl -# -L -f "https://cdn.modrinth.com/data/Vebnzrzj/versions/b0mk8uS6/LuckPerms-Bukkit-5.5.71.jar" -o "$PLUGINS_DIR/LuckPerms.jar"

# Mirror to server/plugins if separate directory
if [ -d "$MC_ROOT/server/plugins" ] && [ "$MC_ROOT/server/plugins" != "$PLUGINS_DIR" ]; then
    cp -u "$PLUGINS_DIR"/EssentialsX*.jar "$MC_ROOT/server/plugins/" 2>/dev/null || true
    cp -u "$PLUGINS_DIR"/LuckPerms*.jar "$MC_ROOT/server/plugins/" 2>/dev/null || true
fi

echo "  ✔ Plugins downloaded successfully."

# 4. Start Server
echo ""
echo "[3/4] Starting Minecraft server with EssentialsX..."
if command -v mc >/dev/null 2>&1; then
    mc start
fi

# Ensure web dashboard is also running
if command -v mc-web >/dev/null 2>&1; then
    mc-web start >/dev/null 2>&1 || true
fi

echo ""
echo "[4/4] Configuring default player permissions (waiting for server to boot)..."
sleep 15

# 5. Inject default player permissions into LuckPerms so regular players can use commands!
if command -v tmux >/dev/null 2>&1 && tmux has-session -t minecraft 2>/dev/null; then
    echo "  Applying permissions for all players..."
    tmux send-keys -t minecraft "lp group default permission set essentials.home true" Enter
    tmux send-keys -t minecraft "lp group default permission set essentials.sethome true" Enter
    tmux send-keys -t minecraft "lp group default permission set essentials.delhome true" Enter
    tmux send-keys -t minecraft "lp group default permission set essentials.tpa true" Enter
    tmux send-keys -t minecraft "lp group default permission set essentials.tpaccept true" Enter
    tmux send-keys -t minecraft "lp group default permission set essentials.tpdeny true" Enter
    tmux send-keys -t minecraft "lp group default permission set essentials.spawn true" Enter
    tmux send-keys -t minecraft "lp group default permission set essentials.back true" Enter
    tmux send-keys -t minecraft "lp group default permission set essentials.msg true" Enter
    tmux send-keys -t minecraft "lp group default permission set essentials.warp true" Enter
    tmux send-keys -t minecraft "lp group default permission set essentials.warp.list true" Enter
    tmux send-keys -t minecraft "lp group default permission set essentials.pay true" Enter
    tmux send-keys -t minecraft "lp group default permission set essentials.balance true" Enter
    echo "  ✔ Default permissions granted to all players!"
fi

IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1 || echo "localhost")

echo ""
echo "=========================================================="
echo "    🎉 EssentialsX Suite Installed Successfully!          "
echo "=========================================================="
echo "  Active Commands for You and Your Friends:"
echo "  • /sethome [name]    - Save your base location"
echo "  • /home [name]       - Teleport back to your base"
echo "  • /tpa <player>      - Request to teleport to a friend"
echo "  • /tpaccept          - Accept teleport request"
echo "  • /tpdeny            - Deny teleport request"
echo "  • /spawn             - Teleport to world spawn"
echo "  • /back              - Return to where you died"
echo "  • /msg <player> <msg>- Send private message"
echo "  • /warp [name]       - Teleport to server warps"
echo ""
echo "  Web Dashboard: http://${IP}:8088"
echo "=========================================================="
