#!/usr/bin/env python3
"""
KHURE-HUB / KHURE-SERVER
Welcome Portal & Local Service Hub for Home Wi-Fi
Runs on port 7777 inside Termux on Android. Zero external dependencies.
Provides:
  - Live service status checking (Jellyfin :8096, Minecraft :25565 / :19132, Dashboard :8088, Peppy Bot :8089)
  - Direct 1-tap launchers for movies and Minecraft (Java/Bedrock copy IP)
  - High-speed Local File & Photo Drop (saved directly to shared storage / SD card)
  - File browser & download for shared family files
  - Dynamic QR Code generator for printable scan-and-connect cards
  - Real-time battery & phone health telemetry
"""

import os
import sys
import json
import time
import socket
import shutil
import cgi
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, unquote

PORT = 7777
HOST = "0.0.0.0"

# Storage paths
SD_CARD_ID = "26B2-1AEB"
SD_BASE = f"/storage/{SD_CARD_ID}" if os.path.exists(f"/storage/{SD_CARD_ID}") else os.path.expanduser("~/storage/shared")
DROP_DIR = os.path.join(SD_BASE, "KhureDrop") if os.path.exists(SD_BASE) else os.path.expanduser("~/KhureDrop")
os.makedirs(DROP_DIR, exist_ok=True)

# Service ports to probe
SERVICES = {
    "jellyfin": {"name": "Jellyfin Cinema", "port": 8096, "icon": "🍿"},
    "minecraft_java": {"name": "Minecraft Java", "port": 25565, "icon": "⛏️"},
    "minecraft_bedrock": {"name": "Minecraft Bedrock", "port": 19132, "icon": "🎮"},
    "mc_dashboard": {"name": "PocketMC Dashboard", "port": 8088, "icon": "⚙️"},
    "peppy_bot": {"name": "Peppy AI Bot", "port": 8089, "icon": "🤖"}
}

def is_port_open(host="127.0.0.1", port=8096, timeout=0.6):
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def get_battery_info():
    info = {"level": 100, "status": "Plugged", "temp": "32°C"}
    try:
        if os.path.exists("/sys/class/power_supply/battery/capacity"):
            with open("/sys/class/power_supply/battery/capacity") as f:
                info["level"] = int(f.read().strip())
        if os.path.exists("/sys/class/power_supply/battery/status"):
            with open("/sys/class/power_supply/battery/status") as f:
                info["status"] = f.read().strip()
        if os.path.exists("/sys/class/power_supply/battery/temp"):
            with open("/sys/class/power_supply/battery/temp") as f:
                raw_temp = int(f.read().strip())
                info["temp"] = f"{raw_temp / 10:.1f}°C"
    except Exception:
        pass
    return info

def get_storage_info():
    try:
        path = DROP_DIR if os.path.exists(DROP_DIR) else "/"
        total, used, free = shutil.disk_usage(path)
        return {
            "total_gb": round(total / (1024**3), 1),
            "free_gb": round(free / (1024**3), 1),
            "used_gb": round(used / (1024**3), 1),
            "percent": round((used / total) * 100, 1) if total > 0 else 0
        }
    except Exception:
        return {"total_gb": 0, "free_gb": 0, "used_gb": 0, "percent": 0}

def list_dropped_files():
    files = []
    if os.path.exists(DROP_DIR):
        try:
            for entry in sorted(os.scandir(DROP_DIR), key=lambda e: e.stat().st_mtime, reverse=True):
                if entry.is_file():
                    stat = entry.stat()
                    size_mb = round(stat.st_size / (1024**2), 2)
                    size_str = f"{size_mb} MB" if size_mb >= 1 else f"{round(stat.st_size / 1024, 1)} KB"
                    files.append({
                        "name": entry.name,
                        "size": size_str,
                        "bytes": stat.st_size,
                        "time": time.strftime("%d %b, %H:%M", time.localtime(stat.st_mtime))
                    })
        except Exception:
            pass
    return files[:40]

class KhurePortalHandler(BaseHTTPRequestHandler):
    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/" or parsed.path == "/index.html":
            html_path = os.path.join(os.path.dirname(__file__), "index.html")
            if os.path.exists(html_path):
                with open(html_path, "rb") as f:
                    content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
            else:
                self.send_error(404, "Portal index.html missing")
            return

        elif parsed.path == "/api/status":
            local_ip = get_local_ip()
            statuses = {
                k: {
                    "name": v["name"],
                    "port": v["port"],
                    "icon": v["icon"],
                    "online": is_port_open(port=v["port"])
                }
                for k, v in SERVICES.items()
            }
            data = {
                "server_name": "KHURE-SERVER",
                "tagline": "Khure Family Home Cloud & Gaming Hub",
                "local_ip": local_ip,
                "portal_port": PORT,
                "services": statuses,
                "battery": get_battery_info(),
                "storage": get_storage_info(),
                "files_count": len(list_dropped_files())
            }
            self.send_json(data)
            return

        elif parsed.path == "/api/files":
            self.send_json({"files": list_dropped_files()})
            return

        elif parsed.path.startswith("/download/"):
            filename = unquote(parsed.path[len("/download/"):])
            # Prevent directory traversal
            clean_name = os.path.basename(filename)
            filepath = os.path.join(DROP_DIR, clean_name)
            if os.path.exists(filepath) and os.path.isfile(filepath):
                self.send_response(200)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Disposition", f'attachment; filename="{clean_name}"')
                self.send_header("Content-Length", str(os.path.getsize(filepath)))
                self.end_headers()
                with open(filepath, "rb") as f:
                    shutil.copyfileobj(f, self.wfile)
                return
            else:
                self.send_error(404, "File not found")
                return

        self.send_error(404)

    def do_POST(self):
        parsed = urlparse(self.path)

        if parsed.path == "/api/upload":
            content_type = self.headers.get("Content-Type", "")
            if not content_type.startswith("multipart/form-data"):
                self.send_json({"success": False, "error": "Invalid form submission"}, 400)
                return

            try:
                # Parse multipart upload without dependencies
                form = cgi.FieldStorage(
                    fp=self.rfile,
                    headers=self.headers,
                    environ={
                        'REQUEST_METHOD': 'POST',
                        'CONTENT_TYPE': content_type,
                    }
                )

                uploaded_files = []
                file_items = form['files'] if 'files' in form else []
                if not isinstance(file_items, list):
                    file_items = [file_items]

                for item in file_items:
                    if item.filename:
                        safe_name = os.path.basename(item.filename)
                        dest_path = os.path.join(DROP_DIR, safe_name)
                        # Avoid overwrite if file exists by appending timestamp
                        if os.path.exists(dest_path):
                            base, ext = os.path.splitext(safe_name)
                            dest_path = os.path.join(DROP_DIR, f"{base}_{int(time.time())}{ext}")
                            safe_name = os.path.basename(dest_path)

                        with open(dest_path, "wb") as f:
                            f.write(item.file.read())
                        uploaded_files.append(safe_name)

                self.send_json({"success": True, "uploaded": uploaded_files})
            except Exception as e:
                self.send_json({"success": False, "error": str(e)}, 500)
            return

        self.send_error(404)

    def log_message(self, format, *args):
        pass  # Quiet logs for battery efficiency

def main():
    ip = get_local_ip()
    print("=" * 60)
    print("    🏰 KHURE-SERVER : Home Welcome Portal & Cloud Hub    ")
    print(f"    Available at: http://{ip}:{PORT}                     ")
    print(f"    Drop Storage: {DROP_DIR}                             ")
    print("=" * 60)
    server = HTTPServer((HOST, PORT), KhurePortalHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    server.server_close()

if __name__ == "__main__":
    main()
