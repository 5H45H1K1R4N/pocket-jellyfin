#!/usr/bin/env bash
# Converts any audio files (m4a, flac, wav, ogg, opus, mp3...) into radio-ready MP3s
# (44.1 kHz stereo, 128 kbps) so every song streams smoothly together.
# Usage: ./convert.sh <input-folder> [output-folder]      (default output: ./music)
set -e
cd "$(dirname "$0")"
IN="${1:?Usage: ./convert.sh <input-folder> [output-folder]}"
OUT="${2:-music}"
mkdir -p "$OUT"

find "$IN" -type f \( -iname '*.mp3' -o -iname '*.m4a' -o -iname '*.flac' -o -iname '*.wav' -o -iname '*.ogg' -o -iname '*.opus' -o -iname '*.aac' -o -iname '*.wma' \) | while read -r f; do
  name="$(basename "${f%.*}")"
  if [ -f "$OUT/$name.mp3" ]; then echo "skip   $name"; continue; fi
  echo "convert $name"
  ffmpeg -nostdin -loglevel error -i "$f" -vn -map_metadata 0 -ar 44100 -ac 2 -b:a 128k "$OUT/$name.mp3" || echo "  failed: $f"
done
echo "Done. New songs are picked up automatically within one playlist round."
