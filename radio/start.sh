#!/data/data/com.termux/files/usr/bin/bash
# Keeps the radio running 24/7: holds a wake-lock and restarts the server if it ever stops.
cd "$(dirname "$0")"
termux-wake-lock 2>/dev/null || true
while true; do
  node server.js
  echo "[$(date '+%F %T')] radio stopped, restarting in 3s (Ctrl+C to quit)"
  sleep 3
done
