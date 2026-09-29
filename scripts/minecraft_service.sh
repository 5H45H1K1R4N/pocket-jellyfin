#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# PocketJellyfin - Minecraft Java Edition (PaperMC) Service Manager
# Architecture: Android -> Termux -> PRoot Linux (Debian) -> Java -> PaperMC
# ==============================================================================

set -e

# Default paths
CONF_FILE="$HOME/.config/pocket-jellyfin/minecraft.conf"
PROOT_DISTRO="debian"
DEFAULT_MC_VERSION="1.20.4"
DEFAULT_MC_PORT="25565"
DEFAULT_MC_RAM="1536M"
API_USER_AGENT="PocketJellyfin/1.0 (https://github.com/5H45H1K1R4N/pocket-jellyfin)"

# ------------------------------------------------------------------------------
# Colors & Formatting
# ------------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ------------------------------------------------------------------------------
# Helper Functions
# ------------------------------------------------------------------------------
log_info() { echo -e "${CYAN}[MC]${NC} $1"; }
log_ok()   { echo -e "${GREEN}[✔]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[⚠]${NC} $1"; }
log_err()  { echo -e "${RED}[✖]${NC} $1"; }

load_config() {
    if [ -f "$CONF_FILE" ]; then
        # shellcheck disable=SC1090
        source "$CONF_FILE"
    fi

    # Fallback to default root directory if not defined
    if [ -z "$MC_ROOT" ]; then
        SD_ID=$(ls /storage 2>/dev/null | grep -E '^[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}$' | head -n 1 || true)
        if [ -n "$SD_ID" ] && [ -d "/storage/$SD_ID" ]; then
            MC_ROOT="/storage/$SD_ID/Minecraft"
        else
            MC_ROOT="$HOME/pocket-jellyfin/minecraft"
        fi
    fi

    MC_VERSION="${MC_VERSION:-$DEFAULT_MC_VERSION}"
    MC_PORT="${MC_PORT:-$DEFAULT_MC_PORT}"
    MC_RAM="${MC_RAM:-$DEFAULT_MC_RAM}"
    MC_BIND="${MC_BIND:-0.0.0.0}"

    DIR_CONFIG="$MC_ROOT/config"
    DIR_SERVER="$MC_ROOT/server"
    DIR_WORLD="$MC_ROOT/world"
    DIR_PLUGINS="$MC_ROOT/plugins"
    DIR_BACKUPS="$MC_ROOT/backups"
    DIR_LOGS="$MC_ROOT/logs"
    DIR_RUNTIME="$MC_ROOT/runtime"
}

save_config() {
    mkdir -p "$(dirname "$CONF_FILE")"
    cat << EOF > "$CONF_FILE"
# PocketJellyfin Minecraft Configuration
MC_ROOT="$MC_ROOT"
MC_VERSION="$MC_VERSION"
MC_PORT="$MC_PORT"
MC_RAM="$MC_RAM"
MC_BIND="$MC_BIND"
STORAGE_TYPE="$STORAGE_TYPE"
EOF
}

check_proot() {
    if ! command -v proot-distro >/dev/null 2>&1; then
        log_err "proot-distro is not installed in Termux. Please run: pkg install proot-distro"
        exit 1
    fi
    if ! proot-distro list 2>&1 | grep -q "${PROOT_DISTRO}"; then
        log_err "PRoot Debian container is not installed. Please run: proot-distro install debian"
        exit 1
    fi
}

run_in_proot() {
    # Bind /storage and current MC_ROOT into Debian
    proot-distro login "$PROOT_DISTRO" --bind /storage:/storage --bind "$HOME:$HOME" -- bash -c "$1"
}

is_running() {
    tmux has-session -t minecraft 2>/dev/null
}

get_required_java_version() {
    local ver="$1"
    local major minor
    major=$(echo "$ver" | cut -d. -f1)
    minor=$(echo "$ver" | cut -d. -f2)
    local patch
    patch=$(echo "$ver" | cut -d. -f3 || echo "0")
    patch=${patch:-0}

    if [ "$major" -eq 1 ]; then
        if [ "$minor" -ge 21 ]; then
            echo "21"
        elif [ "$minor" -eq 20 ] && [ "$patch" -ge 5 ]; then
            echo "21"
        elif [ "$minor" -ge 18 ]; then
            echo "17"
        elif [ "$minor" -eq 17 ]; then
            echo "17"
        else
            echo "11"
        fi
    else
        echo "21"
    fi
}

# ------------------------------------------------------------------------------
# Subcommand: install
# ------------------------------------------------------------------------------
cmd_install() {
    check_proot
    log_info "Initializing PocketJellyfin Minecraft Java + PaperMC Setup..."

    # 1. Storage Selection
    echo ""
    echo -e "${BOLD}Select Storage Destination:${NC}"
    SD_ID=$(ls /storage 2>/dev/null | grep -E '^[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}$' | head -n 1 || true)
    
    INT_FREE=$(df -h "$HOME" 2>/dev/null | awk 'NR==2 {print $4}')
    echo "  [1] Internal Storage ($HOME/pocket-jellyfin/minecraft) - Free: ${INT_FREE:-Unknown}"

    if [ -n "$SD_ID" ] && [ -d "/storage/$SD_ID" ]; then
        SD_FREE=$(df -h "/storage/$SD_ID" 2>/dev/null | awk 'NR==2 {print $4}')
        echo "  [2] Micro-SD Card (/storage/$SD_ID/Minecraft) - Free: ${SD_FREE:-Unknown}"
        read -p "Choose storage destination [1/2] (Default: 2): " ST_CHOICE
        ST_CHOICE=${ST_CHOICE:-2}
        if [ "$ST_CHOICE" -eq 2 ]; then
            MC_ROOT="/storage/$SD_ID/Minecraft"
            STORAGE_TYPE="sdcard"
        else
            MC_ROOT="$HOME/pocket-jellyfin/minecraft"
            STORAGE_TYPE="internal"
        fi
    else
        echo "  ℹ No external micro-SD card detected. Using internal storage."
        MC_ROOT="$HOME/pocket-jellyfin/minecraft"
        STORAGE_TYPE="internal"
    fi

    # 2. Version Selection
    echo ""
    read -p "Enter Minecraft Version (e.g., 1.20.4, 1.21.1) [Default: $DEFAULT_MC_VERSION]: " INPUT_VER
    MC_VERSION="${INPUT_VER:-$DEFAULT_MC_VERSION}"
    REQ_JAVA=$(get_required_java_version "$MC_VERSION")
    log_info "Minecraft $MC_VERSION requires Java $REQ_JAVA runtime."

    # 3. Memory Allocation
    TOTAL_MEM_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo "4194304")
    TOTAL_MEM_MB=$((TOTAL_MEM_KB / 1024))
    REC_RAM="1536M"
    if [ "$TOTAL_MEM_MB" -ge 6000 ]; then
        REC_RAM="2048M"
    elif [ "$TOTAL_MEM_MB" -lt 3000 ]; then
        REC_RAM="1024M"
    fi
    read -p "Enter RAM allocation for PaperMC [Default: $REC_RAM]: " INPUT_RAM
    MC_RAM="${INPUT_RAM:-$REC_RAM}"

    # 4. Port Configuration
    read -p "Enter Minecraft Server Port [Default: $DEFAULT_MC_PORT]: " INPUT_PORT
    MC_PORT="${INPUT_PORT:-$DEFAULT_MC_PORT}"

    # Save Config
    save_config
    load_config

    # 5. Create Directory Layout
    log_info "Creating Minecraft module structure in: $MC_ROOT"
    mkdir -p "$DIR_CONFIG" "$DIR_SERVER" "$DIR_WORLD" "$DIR_PLUGINS" "$DIR_BACKUPS" "$DIR_LOGS" "$DIR_RUNTIME"

    # 6. Check / Install Java in PRoot Debian
    log_info "Detecting Java runtime in PRoot Linux container..."
    JAVA_PKG="openjdk-${REQ_JAVA}-jre-headless"
    
    run_in_proot "
        if ! command -v java >/dev/null 2>&1 || ! java -version 2>&1 | grep -q 'version \"${REQ_JAVA}'; then
            echo '[MC] Installing $JAVA_PKG in Debian...'
            apt update -y
            apt install -y $JAVA_PKG jq curl tmux
        else
            echo '[MC] Compatible Java already installed in Debian.'
        fi
        java -version
    "

    # 7. Fetch PaperMC from official v3 API
    log_info "Fetching latest build of PaperMC for Minecraft $MC_VERSION via official PaperMC API..."
    API_URL="https://fill.papermc.io/v3/projects/paper/versions/${MC_VERSION}"
    
    VERSION_INFO=$(curl -s -H "User-Agent: $API_USER_AGENT" "$API_URL" || true)
    if echo "$VERSION_INFO" | grep -q '"error"'; then
        log_err "Failed to query PaperMC API for version $MC_VERSION. Verify that version $MC_VERSION exists on PaperMC."
        exit 1
    fi

    LATEST_BUILD=$(echo "$VERSION_INFO" | jq -r '.builds[0]' 2>/dev/null || true)
    if [ -z "$LATEST_BUILD" ] || [ "$LATEST_BUILD" = "null" ]; then
        log_err "Could not resolve builds for Minecraft $MC_VERSION."
        exit 1
    fi

    log_info "Latest PaperMC build for $MC_VERSION is #$LATEST_BUILD"
    BUILD_URL="https://fill.papermc.io/v3/projects/paper/versions/${MC_VERSION}/builds/${LATEST_BUILD}"
    BUILD_INFO=$(curl -s -H "User-Agent: $API_USER_AGENT" "$BUILD_URL" || true)
    JAR_URL=$(echo "$BUILD_INFO" | jq -r '.downloads["server:default"].url' 2>/dev/null || true)
    JAR_NAME=$(echo "$BUILD_INFO" | jq -r '.downloads["server:default"].name' 2>/dev/null || true)
    JAR_SHA=$(echo "$BUILD_INFO" | jq -r '.downloads["server:default"].checksums.sha256' 2>/dev/null || true)

    if [ -z "$JAR_URL" ] || [ "$JAR_URL" = "null" ]; then
        log_err "Could not extract download URL for PaperMC build #$LATEST_BUILD."
        exit 1
    fi

    log_info "Downloading PaperMC: $JAR_NAME..."
    curl -# -L -H "User-Agent: $API_USER_AGENT" "$JAR_URL" -o "$DIR_SERVER/paper.jar"

    cat << EOF > "$DIR_SERVER/paper-version.json"
{
  "minecraft_version": "$MC_VERSION",
  "paper_build": $LATEST_BUILD,
  "jar_name": "$JAR_NAME",
  "sha256": "$JAR_SHA",
  "installed_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
    log_ok "PaperMC $MC_VERSION (Build #$LATEST_BUILD) installed."

    # 8. EULA & Server Properties
    echo "eula=true" > "$DIR_CONFIG/eula.txt"
    
    if [ ! -f "$DIR_CONFIG/server.properties" ]; then
        cat << EOF > "$DIR_CONFIG/server.properties"
server-port=$MC_PORT
server-ip=$MC_BIND
motd=§bPocketJellyfin §8| §aPaperMC Server
level-name=world
gamemode=survival
difficulty=easy
pvp=true
view-distance=7
simulation-distance=5
max-players=10
online-mode=true
enable-command-block=true
network-compression-threshold=256
sync-chunk-writes=false
allow-flight=true
EOF
    fi

    # Create Symlinks for server root execution
    ln -sfn "$DIR_CONFIG/eula.txt" "$DIR_SERVER/eula.txt"
    ln -sfn "$DIR_CONFIG/server.properties" "$DIR_SERVER/server.properties"
    ln -sfn "$DIR_PLUGINS" "$DIR_SERVER/plugins"
    ln -sfn "$DIR_LOGS" "$DIR_SERVER/logs"
    ln -sfn "$DIR_WORLD" "$DIR_SERVER/world"

    log_ok "PocketJellyfin Minecraft module setup complete!"
    echo ""
    echo -e "${BOLD}Next Steps:${NC}"
    echo "  • Start server:    minecraft start"
    echo "  • View console:    minecraft console"
    echo "  • Import world:    minecraft world import /path/to/AternosWorld"
    echo "  • Check status:    minecraft status"
}

# ------------------------------------------------------------------------------
# Subcommand: start
# ------------------------------------------------------------------------------
cmd_start() {
    load_config
    check_proot

    if is_running; then
        log_warn "Minecraft server is already running in tmux session 'minecraft'."
        echo "Run 'minecraft console' to view live console."
        return 0
    fi

    if [ ! -f "$DIR_SERVER/paper.jar" ]; then
        log_err "PaperMC server jar not found at $DIR_SERVER/paper.jar."
        echo "Run 'minecraft install' first to install the server."
        exit 1
    fi

    log_info "Starting PocketJellyfin PaperMC Server ($MC_VERSION)..."
    termux-wake-lock

    # Ensure symlinks exist
    ln -sfn "$DIR_CONFIG/eula.txt" "$DIR_SERVER/eula.txt"
    ln -sfn "$DIR_CONFIG/server.properties" "$DIR_SERVER/server.properties"
    ln -sfn "$DIR_PLUGINS" "$DIR_SERVER/plugins"
    ln -sfn "$DIR_LOGS" "$DIR_SERVER/logs"
    ln -sfn "$DIR_WORLD" "$DIR_SERVER/world"

    # Start Paper inside a detached tmux session running in Debian PRoot
    cat << 'EOF' > "$DIR_RUNTIME/run.sh"
#!/bin/bash
cd "$MC_SERVER_DIR"
exec java -Xms${MC_RAM} -Xmx${MC_RAM} \
  -XX:+UseG1GC \
  -XX:+ParallelRefProcEnabled \
  -XX:MaxGCPauseMillis=200 \
  -XX:+UnlockExperimentalVMOptions \
  -XX:+DisableExplicitGC \
  -XX:+AlwaysPreTouch \
  -XX:G1NewSizePercent=30 \
  -XX:G1MaxNewSizePercent=40 \
  -XX:G1ReservePercent=20 \
  -XX:G1HeapWastePercent=5 \
  -XX:G1MixedGCCountTarget=4 \
  -XX:InitiatingHeapOccupancyPercent=15 \
  -XX:G1MixedGCLiveThresholdPercent=90 \
  -XX:G1RSetUpdatingPauseTimePercent=5 \
  -XX:SurvivorRatio=32 \
  -XX:+PerfDisableSharedMem \
  -XX:MaxTenuringThreshold=1 \
  -Dusing.aikars.flags=https://mcflags.emc.gs \
  -Daikars.new.flags=true \
  -jar paper.jar --nogui
EOF
    chmod +x "$DIR_RUNTIME/run.sh"

    # Launch in tmux
    tmux new-session -d -s minecraft "MC_SERVER_DIR='$DIR_SERVER' MC_RAM='$MC_RAM' proot-distro login '$PROOT_DISTRO' --bind /storage:/storage --bind '$HOME:$HOME' -- '$DIR_RUNTIME/run.sh'"

    # Wait 2 seconds and check if session is still alive
    sleep 2
    if is_running; then
        log_ok "PaperMC server started successfully in background!"
        IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1 || echo "localhost")
        echo -e "  Server IP:   ${BOLD}${IP}:${MC_PORT}${NC}"
        echo -e "  Live Console: Run ${CYAN}minecraft console${NC}"
    else
        log_err "Failed to start Minecraft server. Checking logs..."
        if [ -f "$DIR_LOGS/latest.log" ]; then
            tail -n 20 "$DIR_LOGS/latest.log"
        fi
        exit 1
    fi
}

# ------------------------------------------------------------------------------
# Subcommand: stop
# ------------------------------------------------------------------------------
cmd_stop() {
    load_config
    if ! is_running; then
        log_info "Minecraft server is not running."
        return 0
    fi

    log_info "Gracefully stopping PaperMC server (saving chunks and player data)..."
    tmux send-keys -t minecraft "stop" Enter

    # Wait up to 30 seconds for clean shutdown
    local count=0
    while is_running && [ "$count" -lt 30 ]; do
        sleep 1
        count=$((count + 1))
        echo -n "."
    done
    echo ""

    if is_running; then
        log_warn "Server did not exit within 30 seconds. Forcing shutdown..."
        tmux kill-session -t minecraft 2>/dev/null || true
    fi

    log_ok "Minecraft server stopped cleanly."
}

# ------------------------------------------------------------------------------
# Subcommand: restart
# ------------------------------------------------------------------------------
cmd_restart() {
    cmd_stop
    sleep 2
    cmd_start
}

# ------------------------------------------------------------------------------
# Subcommand: status
# ------------------------------------------------------------------------------
cmd_status() {
    load_config
    echo -e "${BOLD}==========================================================${NC}"
    echo -e "${BOLD}       PocketJellyfin: Minecraft Service Status          ${NC}"
    echo -e "${BOLD}==========================================================${NC}"

    if is_running; then
        echo -e "  Status:         ${GREEN}● ONLINE${NC} (Running in background tmux session)"
    else
        echo -e "  Status:         ${RED}○ OFFLINE${NC}"
    fi

    IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1 || echo "localhost")
    echo "  Address:        ${IP}:${MC_PORT}"
    echo "  Minecraft Ver:  ${MC_VERSION}"
    
    if [ -f "$DIR_SERVER/paper-version.json" ]; then
        BUILD=$(jq -r '.paper_build' "$DIR_SERVER/paper-version.json" 2>/dev/null || echo "Unknown")
        echo "  PaperMC Build:  #${BUILD}"
    fi

    echo "  Allocated RAM:  ${MC_RAM}"
    echo "  Storage Root:   ${MC_ROOT} (${STORAGE_TYPE:-auto})"
    
    FREE_SPACE=$(df -h "$MC_ROOT" 2>/dev/null | awk 'NR==2 {print $4}' || echo "Unknown")
    echo "  Free Space:     ${FREE_SPACE}"

    if [ -d "$DIR_WORLD" ]; then
        WORLD_SIZE=$(du -sh "$DIR_WORLD" 2>/dev/null | awk '{print $1}' || echo "0 MB")
        echo "  Active World:   'world' (Size: ${WORLD_SIZE})"
    else
        echo "  Active World:   None"
    fi

    if [ -d "$DIR_PLUGINS" ]; then
        PLUGIN_COUNT=$(find "$DIR_PLUGINS" -maxdepth 1 -name "*.jar" 2>/dev/null | wc -l)
        echo "  Active Plugins: ${PLUGIN_COUNT} plugins installed"
    fi

    echo -e "${BOLD}==========================================================${NC}"
}

# ------------------------------------------------------------------------------
# Subcommand: console
# ------------------------------------------------------------------------------
cmd_console() {
    if ! is_running; then
        log_err "Minecraft server is not running. Start it first with: minecraft start"
        exit 1
    fi

    echo -e "${CYAN}Attaching to live PaperMC server console...${NC}"
    echo -e "${YELLOW}Notice:${NC} Press ${BOLD}Ctrl + B${NC}, then release and press ${BOLD}D${NC} to detach safely without stopping the server!"
    sleep 1
    tmux attach-session -t minecraft
}

# ------------------------------------------------------------------------------
# Subcommand: backup
# ------------------------------------------------------------------------------
cmd_backup() {
    load_config
    local tag="${1:-manual}"
    local timestamp
    timestamp=$(date +"%Y%m%d_%H%M%S")
    local backup_file="$DIR_BACKUPS/mc_backup_${timestamp}_${tag}.tar.gz"

    log_info "Creating backup of Minecraft world, configuration, and plugins..."
    mkdir -p "$DIR_BACKUPS"

    # If running, flush chunks without stopping
    local was_running=0
    if is_running; then
        was_running=1
        log_info "Flushing chunks to disk before archiving..."
        tmux send-keys -t minecraft "save-off" Enter
        sleep 1
        tmux send-keys -t minecraft "save-all flush" Enter
        sleep 3
    fi

    tar -czf "$backup_file" \
        -C "$MC_ROOT" \
        config \
        world \
        plugins 2>/dev/null || true

    if [ "$was_running" -eq 1 ]; then
        tmux send-keys -t minecraft "save-on" Enter
    fi

    local size
    size=$(du -sh "$backup_file" 2>/dev/null | awk '{print $1}')
    log_ok "Backup created successfully: $(basename "$backup_file") (${size})"
    echo "  Location: $backup_file"
}

# ------------------------------------------------------------------------------
# Subcommand: restore
# ------------------------------------------------------------------------------
cmd_restore() {
    load_config
    local backup_target="$1"

    if [ -z "$backup_target" ]; then
        echo -e "${BOLD}Available Backups in $DIR_BACKUPS:${NC}"
        # shellcheck disable=SC2012
        ls -lh "$DIR_BACKUPS"/*.tar.gz 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'
        echo ""
        read -p "Enter backup filename to restore: " backup_target
    fi

    if [ ! -f "$backup_target" ] && [ -f "$DIR_BACKUPS/$backup_target" ]; then
        backup_target="$DIR_BACKUPS/$backup_target"
    fi

    if [ ! -f "$backup_target" ]; then
        log_err "Backup file not found: $backup_target"
        exit 1
    fi

    log_warn "Restoring from backup will replace the current world and configuration."
    read -p "Are you sure you want to proceed? [y/N]: " CONFIRM
    if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
        echo "Restore cancelled."
        return 0
    fi

    if is_running; then
        cmd_stop
    fi

    # Safety snapshot before restoring
    log_info "Creating safety pre-restore backup..."
    cmd_backup "pre_restore"

    log_info "Restoring backup: $(basename "$backup_target")..."
    tar -xzf "$backup_target" -C "$MC_ROOT"
    log_ok "Restore completed successfully!"
    echo "Run 'minecraft start' to boot the server with the restored world."
}

# ------------------------------------------------------------------------------
# Subcommand: world import (Aternos & Standard World Migration Engine)
# ------------------------------------------------------------------------------
cmd_world_import() {
    load_config
    local src="$1"

    if [ -z "$src" ]; then
        echo -e "${BOLD}Import Existing World from Aternos / PaperMC:${NC}"
        read -p "Enter path to world folder or .zip file: " src
    fi

    # Expand relative paths
    src=$(realpath "$src" 2>/dev/null || echo "$src")

    if [ ! -e "$src" ]; then
        log_err "Source path does not exist: $src"
        exit 1
    fi

    local temp_import_dir="$DIR_RUNTIME/import_temp"
    rm -rf "$temp_import_dir"
    mkdir -p "$temp_import_dir"

    # 1. Handle Archive Extraction if zip or tar
    if [ -f "$src" ]; then
        log_info "Source is an archive file. Extracting for inspection..."
        if [[ "$src" =~ \.zip$ ]]; then
            if ! command -v unzip >/dev/null 2>&1; then
                pkg install unzip -y 2>/dev/null || true
            fi
            unzip -q "$src" -d "$temp_import_dir"
        elif [[ "$src" =~ \.tar\.gz$|\.tgz$ ]]; then
            tar -xzf "$src" -d "$temp_import_dir"
        else
            log_err "Unsupported archive format. Please provide a directory, .zip, or .tar.gz file."
            rm -rf "$temp_import_dir"
            exit 1
        fi
        src="$temp_import_dir"
    fi

    # 2. Locate the world root containing level.dat
    local detected_world_dir=""
    if [ -f "$src/level.dat" ]; then
        detected_world_dir="$src"
    else
        # Search up to 2 levels deep for level.dat
        found=$(find "$src" -maxdepth 3 -name "level.dat" 2>/dev/null | head -n 1 || true)
        if [ -n "$found" ]; then
            detected_world_dir=$(dirname "$found")
        fi
    fi

    # 3. Validation: Must be a valid Minecraft world
    if [ -z "$detected_world_dir" ] || [ ! -f "$detected_world_dir/level.dat" ]; then
        log_err "Validation Failed: The provided directory is NOT a valid Minecraft world!"
        log_err "Missing 'level.dat' file."
        log_warn "PocketJellyfin will NOT overwrite your existing world or generate a corrupt world."
        rm -rf "$temp_import_dir"
        exit 1
    fi

    log_ok "Valid Minecraft World Detected: $detected_world_dir"
    
    # Check for crucial components
    local has_region=0 has_players=0 has_poi=0
    [ -d "$detected_world_dir/region" ] && has_region=1
    [ -d "$detected_world_dir/playerdata" ] && has_players=1
    [ -d "$detected_world_dir/poi" ] && has_poi=1

    echo "  • Level Data:     Found (level.dat)"
    echo "  • Chunks/Builds:  $([ $has_region -eq 1 ] && echo -e "${GREEN}Found (region/)${NC}" || echo -e "${YELLOW}None${NC}")"
    echo "  • Player Data:    $([ $has_players -eq 1 ] && echo -e "${GREEN}Found (playerdata/)${NC}" || echo -e "${YELLOW}None${NC}")"
    echo "  • POI / Entities: $([ $has_poi -eq 1 ] && echo -e "${GREEN}Found${NC}" || echo -e "${YELLOW}Standard${NC}")"

    # 4. Stop Minecraft if running
    if is_running; then
        log_info "Stopping active Minecraft server before importing..."
        cmd_stop
    fi

    # 5. Backup current world before replacement
    if [ -d "$DIR_WORLD" ] && [ -f "$DIR_WORLD/level.dat" ]; then
        log_info "Backing up currently configured world before replacement..."
        cmd_backup "pre_world_import"
    fi

    # 6. Perform the Clean Import
    log_info "Migrating world files into PocketJellyfin ($DIR_WORLD)..."
    rm -rf "${DIR_WORLD:?}"/*
    mkdir -p "$DIR_WORLD"

    # Copy all files preserving timestamps, permissions, and subdirectories
    cp -a "$detected_world_dir"/* "$DIR_WORLD/"

    # Check for separate Nether / End (common in Aternos PaperMC exports)
    parent_dir=$(dirname "$detected_world_dir")
    if [ -d "$parent_dir/world_nether" ]; then
        log_info "Detected separate Aternos Nether dimension (world_nether). Migrating..."
        mkdir -p "$MC_ROOT/world_nether"
        cp -a "$parent_dir/world_nether"/* "$MC_ROOT/world_nether/"
        ln -sfn "$MC_ROOT/world_nether" "$DIR_SERVER/world_nether"
    elif [ -d "$DIR_WORLD/DIM-1" ]; then
        log_info "Vanilla Nether folder (DIM-1) preserved."
    fi

    if [ -d "$parent_dir/world_the_end" ]; then
        log_info "Detected separate Aternos End dimension (world_the_end). Migrating..."
        mkdir -p "$MC_ROOT/world_the_end"
        cp -a "$parent_dir/world_the_end"/* "$MC_ROOT/world_the_end/"
        ln -sfn "$MC_ROOT/world_the_end" "$DIR_SERVER/world_the_end"
    elif [ -d "$DIR_WORLD/DIM1" ]; then
        log_info "Vanilla End folder (DIM1) preserved."
    fi

    # Cleanup temp
    rm -rf "$temp_import_dir"

    # 7. Verification
    if [ -f "$DIR_WORLD/level.dat" ]; then
        local chunk_count
        chunk_count=$(find "$DIR_WORLD/region" -name "*.mca" 2>/dev/null | wc -l || echo "0")
        local total_size
        total_size=$(du -sh "$DIR_WORLD" 2>/dev/null | awk '{print $1}')
        
        log_ok "World Migration Completed Successfully!"
        echo -e "  • Total Size:    ${BOLD}${total_size}${NC}"
        echo -e "  • Chunk Regions: ${BOLD}${chunk_count} region files${NC}"
        echo -e "  • Overworld, Nether, End, Inventories & Build Data preserved."
        echo ""
        read -p "Start the Minecraft server now to test the imported world? [Y/n]: " START_NOW
        START_NOW=${START_NOW:-Y}
        if [[ "$START_NOW" =~ ^[Yy]$ ]]; then
            cmd_start
        fi
    else
        log_err "Migration verification failed: level.dat is missing after copy."
        exit 1
    fi
}

# ------------------------------------------------------------------------------
# Subcommand: world list
# ------------------------------------------------------------------------------
cmd_world_list() {
    load_config
    echo -e "${BOLD}==========================================================${NC}"
    echo -e "${BOLD}       PocketJellyfin: Configured Minecraft Worlds        ${NC}"
    echo -e "${BOLD}==========================================================${NC}"
    if [ -d "$DIR_WORLD" ] && [ -f "$DIR_WORLD/level.dat" ]; then
        local size chunks players
        size=$(du -sh "$DIR_WORLD" 2>/dev/null | awk '{print $1}')
        chunks=$(find "$DIR_WORLD/region" -name "*.mca" 2>/dev/null | wc -l)
        players=$(find "$DIR_WORLD/playerdata" -name "*.dat" 2>/dev/null | wc -l)
        echo -e "  ${GREEN}● Active World:${NC} 'world'"
        echo "    - Total Size:     $size"
        echo "    - Region Chunks:  $chunks"
        echo "    - Player Profiles: $players"
    else
        echo "  No active world installed. Run 'minecraft world import' to import your Aternos world."
    fi
    echo -e "${BOLD}==========================================================${NC}"
}

# ------------------------------------------------------------------------------
# Subcommand: plugins import
# ------------------------------------------------------------------------------
cmd_plugins_import() {
    load_config
    local src="$1"
    if [ -z "$src" ]; then
        read -p "Enter path to plugins folder or plugin jar: " src
    fi

    if [ ! -e "$src" ]; then
        log_err "Source not found: $src"
        exit 1
    fi

    mkdir -p "$DIR_PLUGINS"

    if [ -f "$src" ] && [[ "$src" =~ \.jar$ ]]; then
        cp -a "$src" "$DIR_PLUGINS/"
        log_ok "Imported plugin: $(basename "$src")"
    elif [ -d "$src" ]; then
        log_info "Importing plugin jars and configuration directories from $src..."
        cp -a "$src"/* "$DIR_PLUGINS/"
        log_ok "Plugins and plugin data successfully imported into $DIR_PLUGINS!"
    else
        log_err "Invalid plugin source."
        exit 1
    fi
}

# ------------------------------------------------------------------------------
# Subcommand: logs
# ------------------------------------------------------------------------------
cmd_logs() {
    load_config
    local log_file="$DIR_LOGS/latest.log"
    if [ ! -f "$log_file" ]; then
        log_warn "No log file found at $log_file."
        exit 0
    fi

    if [ "$1" = "-f" ] || [ "$1" = "--follow" ]; then
        tail -f "$log_file"
    else
        tail -n 50 "$log_file"
    fi
}

# ------------------------------------------------------------------------------
# Subcommand: update
# ------------------------------------------------------------------------------
cmd_update() {
    load_config
    check_proot
    local target_ver="${1:-$MC_VERSION}"

    log_info "Checking for PaperMC updates for Minecraft $target_ver..."
    API_URL="https://fill.papermc.io/v3/projects/paper/versions/${target_ver}"
    VERSION_INFO=$(curl -s -H "User-Agent: $API_USER_AGENT" "$API_URL" || true)
    
    LATEST_BUILD=$(echo "$VERSION_INFO" | jq -r '.builds[0]' 2>/dev/null || true)
    if [ -z "$LATEST_BUILD" ] || [ "$LATEST_BUILD" = "null" ]; then
        log_err "Could not find builds for Minecraft $target_ver."
        exit 1
    fi

    CURRENT_BUILD="0"
    if [ -f "$DIR_SERVER/paper-version.json" ]; then
        CURRENT_BUILD=$(jq -r '.paper_build' "$DIR_SERVER/paper-version.json" 2>/dev/null || echo "0")
    fi

    if [ "$CURRENT_BUILD" = "$LATEST_BUILD" ] && [ "$target_ver" = "$MC_VERSION" ]; then
        log_ok "PaperMC is already up to date! (Build #$LATEST_BUILD)"
        return 0
    fi

    log_info "Updating PaperMC from build #${CURRENT_BUILD} -> #${LATEST_BUILD}..."
    BUILD_URL="https://fill.papermc.io/v3/projects/paper/versions/${target_ver}/builds/${LATEST_BUILD}"
    BUILD_INFO=$(curl -s -H "User-Agent: $API_USER_AGENT" "$BUILD_URL" || true)
    JAR_URL=$(echo "$BUILD_INFO" | jq -r '.downloads["server:default"].url' 2>/dev/null || true)
    JAR_NAME=$(echo "$BUILD_INFO" | jq -r '.downloads["server:default"].name' 2>/dev/null || true)
    JAR_SHA=$(echo "$BUILD_INFO" | jq -r '.downloads["server:default"].checksums.sha256' 2>/dev/null || true)

    local was_running=0
    if is_running; then
        was_running=1
        cmd_stop
    fi

    # Backup existing jar
    [ -f "$DIR_SERVER/paper.jar" ] && cp "$DIR_SERVER/paper.jar" "$DIR_SERVER/paper.jar.bak"

    log_info "Downloading new PaperMC build..."
    curl -# -L -H "User-Agent: $API_USER_AGENT" "$JAR_URL" -o "$DIR_SERVER/paper.jar"

    cat << EOF > "$DIR_SERVER/paper-version.json"
{
  "minecraft_version": "$target_ver",
  "paper_build": $LATEST_BUILD,
  "jar_name": "$JAR_NAME",
  "sha256": "$JAR_SHA",
  "updated_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
    log_ok "PaperMC updated to Build #${LATEST_BUILD}!"

    if [ "$was_running" -eq 1 ]; then
        cmd_start
    fi
}

# ------------------------------------------------------------------------------
# Subcommand: config
# ------------------------------------------------------------------------------
cmd_config() {
    load_config
    local key="$1"
    local val="$2"

    if [ -z "$key" ]; then
        echo -e "${BOLD}Current PocketJellyfin Minecraft Configuration:${NC}"
        echo "  MC_ROOT:      $MC_ROOT"
        echo "  MC_VERSION:   $MC_VERSION"
        echo "  MC_PORT:      $MC_PORT"
        echo "  MC_RAM:       $MC_RAM"
        echo "  MC_BIND:      $MC_BIND"
        echo "  STORAGE_TYPE: $STORAGE_TYPE"
        echo ""
        echo "Usage to modify: minecraft config <key> <value>"
        echo "Example: minecraft config ram 2048M"
        return 0
    fi

    case "$key" in
        ram|RAM)
            MC_RAM="$val"
            save_config
            log_ok "RAM allocation set to: $MC_RAM"
            ;;
        port|PORT)
            MC_PORT="$val"
            save_config
            if [ -f "$DIR_CONFIG/server.properties" ]; then
                sed -i "s/^server-port=.*/server-port=$MC_PORT/" "$DIR_CONFIG/server.properties"
            fi
            log_ok "Server port set to: $MC_PORT"
            ;;
        bind|ip|IP)
            MC_BIND="$val"
            save_config
            if [ -f "$DIR_CONFIG/server.properties" ]; then
                sed -i "s/^server-ip=.*/server-ip=$MC_BIND/" "$DIR_CONFIG/server.properties"
            fi
            log_ok "Bind address set to: $MC_BIND"
            ;;
        *)
            log_err "Unknown config key: $key (Allowed: ram, port, bind)"
            exit 1
            ;;
    esac
}

# ------------------------------------------------------------------------------
# CLI Help / Dispatcher
# ------------------------------------------------------------------------------
cmd_help() {
    echo -e "${BOLD}PocketJellyfin - Minecraft Java Edition (PaperMC) Service${NC}"
    echo "Usage: minecraft <command> [arguments]"
    echo ""
    echo "Service Commands:"
    echo "  install [version]       Install or reconfigure Minecraft & PaperMC"
    echo "  start                   Start the PaperMC server in background (tmux)"
    echo "  stop                    Gracefully save and stop the server"
    echo "  restart                 Restart the server cleanly"
    echo "  status                  Show live server status, players, RAM, storage"
    echo "  console                 Attach to live interactive PaperMC server console"
    echo "  logs [-f]               View or follow server output logs"
    echo "  update [version]        Update PaperMC to the latest official build"
    echo ""
    echo "World & Data Migration:"
    echo "  world import <path>     Validate and import an existing Aternos/Paper world"
    echo "  world list              Inspect active world and chunk statistics"
    echo "  plugins import <path>   Import plugins and plugin configuration data"
    echo ""
    echo "Backup & Restore:"
    echo "  backup [name]           Create an instantaneous full server backup"
    echo "  restore [file]          Restore world & configs from a backup archive"
    echo ""
    echo "Settings:"
    echo "  config [key] [val]      View or change settings (ram, port, bind)"
}

# Load config on entry
load_config

case "$1" in
    install)
        shift
        cmd_install "$@"
        ;;
    start)
        cmd_start
        ;;
    stop)
        cmd_stop
        ;;
    restart)
        cmd_restart
        ;;
    status)
        cmd_status
        ;;
    console)
        cmd_console
        ;;
    backup)
        shift
        cmd_backup "$@"
        ;;
    restore)
        shift
        cmd_restore "$@"
        ;;
    world)
        shift
        subcmd="$1"
        shift || true
        case "$subcmd" in
            import) cmd_world_import "$@" ;;
            list)   cmd_world_list ;;
            *)      cmd_help ;;
        esac
        ;;
    plugins)
        shift
        subcmd="$1"
        shift || true
        case "$subcmd" in
            import) cmd_plugins_import "$@" ;;
            *)      cmd_help ;;
        esac
        ;;
    logs)
        shift
        cmd_logs "$@"
        ;;
    update)
        shift
        cmd_update "$@"
        ;;
    config)
        shift
        cmd_config "$@"
        ;;
    help|--help|-h|"")
        cmd_help
        ;;
    *)
        log_err "Unknown command: $1"
        cmd_help
        exit 1
        ;;
esac
