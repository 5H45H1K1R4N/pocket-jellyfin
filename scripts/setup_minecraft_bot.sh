#!/usr/bin/env bash

# setup_minecraft_bot.sh – one-liner installer for the Peppy bot on Termux
#
# This script will:
#   1. Ensure Node.js is installed (via pkg install nodejs if missing)
#   2. Clone / download bot files directly from GitHub into ~/.pocket-mc/minecraft/bot
#   3. Run npm install to get dependencies
#   4. Copy .env.example → .env (edit it after install)
#   5. Create a tmux launcher: ~/.pocket-mc/mc-bot
#   6. Optionally start the bot immediately

set -e

REPO="5H45H1K1R4N/pocket-jellyfin"
BRANCH="main"
BOT_ROOT="$HOME/.pocket-mc/minecraft/bot"
RAW="https://raw.githubusercontent.com/$REPO/$BRANCH"

echo "=== Peppy Bot Installer ==="

# ── 1. Node.js ──────────────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  echo "[1/5] Installing Node.js..."
  pkg install -y nodejs
else
  echo "[1/5] Node.js $(node -v) already installed."
fi

# ── 2. Download bot source files from GitHub (no rsync, no git needed) ─────
echo "[2/5] Downloading bot source from GitHub..."
mkdir -p \
  "$BOT_ROOT/src/ai" \
  "$BOT_ROOT/src/api" \
  "$BOT_ROOT/src/skills" \
  "$BOT_ROOT/src/tasks" \
  "$BOT_ROOT/src/security" \
  "$BOT_ROOT/blueprints"

files=(
  "minecraft/bot/package.json"
  "minecraft/bot/.env.example"
  "minecraft/bot/src/index.js"
  "minecraft/bot/src/bot.js"
  "minecraft/bot/src/chat.js"
  "minecraft/bot/src/ai/mockProvider.js"
  "minecraft/bot/src/ai/remoteProvider.js"
  "minecraft/bot/src/api/botServer.js"
  "minecraft/bot/src/skills/movement.js"
  "minecraft/bot/src/skills/mining.js"
  "minecraft/bot/src/skills/farming.js"
  "minecraft/bot/src/skills/building.js"
  "minecraft/bot/src/tasks/taskQueue.js"
  "minecraft/bot/src/tasks/taskPlanner.js"
  "minecraft/bot/src/security/permissions.js"
)

for f in "${files[@]}"; do
  dest="$BOT_ROOT/${f#minecraft/bot/}"
  dest_dir=$(dirname "$dest")
  mkdir -p "$dest_dir"
  curl -fsSL "$RAW/$f" -o "$dest"
  echo "  downloaded: ${f#minecraft/bot/}"
done

# ── 3. Install npm dependencies ─────────────────────────────────────────────
echo "[3/5] Installing npm dependencies (this may take a minute)..."
cd "$BOT_ROOT"
npm install --production 2>&1

# ── 4. Create .env from example ─────────────────────────────────────────────
echo "[4/5] Setting up .env configuration..."
if [ ! -f "$BOT_ROOT/.env" ]; then
  cp "$BOT_ROOT/.env.example" "$BOT_ROOT/.env"
  echo ""
  echo "  !! .env created at $BOT_ROOT/.env"
  echo "  !! Edit it before starting the bot:"
  echo "     nano $BOT_ROOT/.env"
  echo ""
else
  echo "  .env already exists, skipping."
fi

# ── 5. Create tmux launcher ─────────────────────────────────────────────────
echo "[5/5] Creating mc-bot launcher..."
LAUNCHER="$HOME/.pocket-mc/mc-bot"
mkdir -p "$HOME/.pocket-mc"

cat > "$LAUNCHER" << 'LAUNCHER_EOF'
#!/usr/bin/env bash
# Peppy bot launcher – manages a tmux session named "mc-bot"
SESSION="mc-bot"
BOT_DIR="$HOME/.pocket-mc/minecraft/bot"

case "${1:-start}" in
  start)
    if tmux has-session -t "$SESSION" 2>/dev/null; then
      echo "Bot is already running. Use: mc-bot attach"
    else
      tmux new-session -s "$SESSION" -d "cd '$BOT_DIR' && node src/index.js"
      echo "Bot started in tmux session '$SESSION'. Use: mc-bot attach"
    fi
    ;;
  stop)
    tmux kill-session -t "$SESSION" 2>/dev/null && echo "Bot stopped." || echo "Bot was not running."
    ;;
  restart)
    tmux kill-session -t "$SESSION" 2>/dev/null || true
    sleep 1
    tmux new-session -s "$SESSION" -d "cd '$BOT_DIR' && node src/index.js"
    echo "Bot restarted."
    ;;
  attach)
    tmux attach -t "$SESSION"
    ;;
  status)
    if tmux has-session -t "$SESSION" 2>/dev/null; then
      echo "Bot is RUNNING (tmux session: $SESSION)"
    else
      echo "Bot is STOPPED"
    fi
    ;;
  *)
    echo "Usage: mc-bot [start|stop|restart|attach|status]"
    ;;
esac
LAUNCHER_EOF

chmod +x "$LAUNCHER"

# Make it globally accessible if ~/.pocket-mc is on PATH
if ! grep -q 'pocket-mc' "$HOME/.bashrc" 2>/dev/null; then
  echo 'export PATH="$HOME/.pocket-mc:$PATH"' >> "$HOME/.bashrc"
fi

echo ""
echo "==================================================="
echo " Peppy bot installed successfully!"
echo "==================================================="
echo ""
echo " NEXT STEPS:"
echo " 1. Edit your config:"
echo "    nano $BOT_ROOT/.env"
echo ""
echo " 2. Start the bot:"
echo "    $LAUNCHER start"
echo ""
echo " 3. View bot output:"
echo "    $LAUNCHER attach   (Ctrl+B then D to detach)"
echo ""
echo " 4. Stop the bot:"
echo "    $LAUNCHER stop"
echo "==================================================="
echo ""

# Optionally start bot now
read -p "Start the bot now? (y/N) " -r answer 2>/dev/tty || answer="n"
if [[ "$answer" =~ ^[Yy]$ ]]; then
  "$LAUNCHER" start
fi
