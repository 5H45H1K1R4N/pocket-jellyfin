#!/data/data/com.termux/files/usr/bin/bash
# One-time setup for Peppy Radio on Termux. Safe to run again.
set -e
cd "$(dirname "$0")"

echo "==> Installing packages (nodejs, openssl, ffmpeg)..."
pkg install -y nodejs openssl-tool ffmpeg

echo "==> Installing the radio's one dependency..."
npm install --omit=dev

mkdir -p music jingles certs

if [ ! -f certs/cert.pem ]; then
  echo "==> Making the HTTPS certificate (needed so the browser allows your microphone)..."
  bash ./gen-cert.sh
fi

chmod +x start.sh gen-cert.sh convert.sh

echo
echo "Setup done. Next:"
echo "  1) Put songs in the music folder (or run ./convert.sh <folder> to convert any audio to MP3)"
echo "  2) Start the radio:  ./start.sh"
