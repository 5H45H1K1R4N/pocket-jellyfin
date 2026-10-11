#!/usr/bin/env bash
# Makes a self-signed HTTPS certificate valid for 10 years.
# Usage: ./gen-cert.sh [phone-ip]
set -e
cd "$(dirname "$0")"
mkdir -p certs

IP="$1"
if [ -z "$IP" ]; then
  IP=$(ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -1 || true)
fi
if [ -z "$IP" ]; then
  IP=$(node -e 'try{const o=require("os").networkInterfaces();for(const l of Object.values(o))for(const i of l||[])if(i.family==="IPv4"&&!i.internal){console.log(i.address);process.exit()}}catch(e){}' 2>/dev/null || true)
fi
[ -z "$IP" ] && IP="192.168.31.178"

openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -keyout certs/key.pem -out certs/cert.pem \
  -subj "/CN=peppy-radio" \
  -addext "subjectAltName=IP:${IP},IP:192.168.31.178,IP:127.0.0.1,DNS:localhost" 2>/dev/null

chmod 600 certs/key.pem
echo "Certificate created for $IP (certs/cert.pem). Your browser will show a one-time warning; choose Advanced > Proceed."
