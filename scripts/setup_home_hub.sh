#!/data/data/com.termux/files/usr/bin/bash
set -e
cd "$HOME/pocket-jellyfin/hub"
echo "==> Setting up KHURE Home Hub..."
npm install
echo "==> Starting KHURE Home Hub..."
node server.js
