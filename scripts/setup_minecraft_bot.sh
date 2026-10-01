#!/usr/bin/env bash

# setup_minecraft_bot.sh – one‑liner installer for the Peppy bot on Termux
#
# This script will:
#   1. Ensure Node.js is installed (via pkg install nodejs if missing)
#   2. cd into the bot directory (already present in the repository)
#   3. Run npm ci to install dependencies
#   4. Copy .env.example → .env (prompt user to edit later)
#   5. Create a tmux launcher script for easy start/stop
#   6. Optionally start the bot immediately

set -e

BOT_ROOT="$HOME/.pocket-mc/minecraft/bot"

# Ensure Node.js is available
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found – installing via pkg..."
  pkg install -y nodejs
fi

# Ensure npm is available (installed with node)
if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found – this should not happen after node install. Exiting."
  exit 1
fi

# Create target directory if missing
mkdir -p "$BOT_ROOT"

# Copy bot source files (assumes script is run from repository root)
rsync -a "$(pwd)/minecraft/bot/" "$BOT_ROOT/"

cd "$BOT_ROOT"

# Install dependencies (use ci for reproducibility)
if [ -f package-lock.json ]; then
  npm ci
else
  npm install --production
fi

# Create .env from example if not present
if [ ! -f .env ]; then
  cp .env.example .env
  echo ".env created – please edit ~/.pocket-mc/minecraft/bot/.env with your server details"
fi

# Create tmux launcher script
LAUNCHER="$HOME/.pocket-mc/mc-bot"
cat > "$LAUNCHER" <<'EOF'
#!/usr/bin/env bash
# Simple wrapper to run the Peppy bot inside a tmux session named "mc-bot"
SESSION="mc-bot"
DIR="$HOME/.pocket-mc/minecraft/bot"
cd "$DIR"
# If session exists, attach; otherwise create and run
if tmux has-session -t "$SESSION" 2>/dev/null; then
  tmux attach -t "$SESSION"
else
  tmux new-session -s "$SESSION" -d "node src/index.js"
  tmux attach -t "$SESSION"
fi
EOF
chmod +x "$LAUNCHER"

echo "Launcher script created at $LAUNCHER – you can start the bot with: $LAUNCHER"

# Optionally start bot now
read -p "Start the bot now? (y/N) " -r answer
if [[ "$answer" =~ ^[Yy]$ ]]; then
  "$LAUNCHER"
fi
