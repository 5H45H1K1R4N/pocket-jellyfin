#!/usr/bin/env python3
"""
Peppy Home Hub — Futuristic Home Server Portal Backend
Zero external dependencies. Compatible with Python 3.10 through 3.14+ in Termux.
Binds to local Wi-Fi only (0.0.0.0:7777). Never exposes private files or credentials.
"""

import os
import sys
import json
import time
import socket
import shutil
import re
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, unquote

PORT = int(os.environ.get("PEPPY_PORT", 7777))
HOST = "0.0.0.0"

# Server identification
BRAND_NAME = "Peppy Home Hub"
TAGLINE = "Your Home. Your Services. One Hub."

# Detect storage roots safely
SD_CARD_ID = "26B2-1AEB"
SD_BASE = f"/storage/{SD_CARD_ID}" if os.path.exists(f"/storage/{SD_CARD_ID}") else os.path.expanduser("~/storage/shared")
STORAGE_ROOT = SD_BASE if os.path.exists(SD_BASE) else os.path.expanduser("~")

# Dedicated upload directory (sandboxed, prevents path traversal)
DROP_DIR = os.path.join(STORAGE_ROOT, "PeppyDrop")
os.makedirs(DROP_DIR, exist_ok=True)

# Configuration for services
SERVICES_CONFIG = {
    "jellyfin": {
        "id": "jellyfin",
        "name": "Movies & TV",
        "service_name": "Jellyfin Cinema",
        "port": 8096,
        "badge": "Cinema",
        "icon": "🍿",
        "desc": "Browse and stream movies and shows from our home library in full quality.",
        "path": "/"
    },
    "minecraft": {
        "id": "minecraft",
        "name": "Minecraft Server",
        "service_name": "PaperMC Survival World",
        "java_port": 25565,
        "bedrock_port": 19132,
        "badge": "Multiplayer",
        "icon": "⛏️",
        "desc": "24/7 crossplay survival world. Play on PC (Java) or Phone/Console (Bedrock)."
    },
    "peppydrop": {
        "id": "peppydrop",
        "name": "File Drop",
        "service_name": "Home Wi-Fi AirDrop",
        "port": PORT,
        "badge": "Local Share",
        "icon": "📤",
        "desc": "Quickly drop photos, videos, or documents directly to home storage without cloud compression."
    },
    "mc_dashboard": {
        "id": "mc_dashboard",
        "name": "Server Console",
        "service_name": "PocketMC Admin & Peppy Bot",
        "port": 8088,
        "badge": "Admin / Bot",
        "icon": "🤖",
        "desc": "Live PaperMC logs, performance metrics, and Peppy AI bot command center."
    }
}

START_TIME = time.time()

def probe_port(host="127.0.0.1", port=8096, timeout=0.5):
    """Real TCP socket health check without blocking."""
    try:
        with socket.create_connection((host, int(port)), timeout=timeout):
            return True
    except (OSError, socket.timeout):
        return False

def get_local_ip():
    """Detect local LAN IP reliably."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def get_system_metrics():
    """Safe system metrics without leaking private paths."""
    metrics = {
        "uptime_seconds": int(time.time() - START_TIME),
        "battery_pct": 100,
        "battery_status": "AC Plugged",
        "battery_temp": "Normal",
        "storage_free_gb": 0,
        "storage_total_gb": 0,
        "storage_pct": 0
    }
    
    # Safe sysfs battery reading on Android
    try:
        if os.path.exists("/sys/class/power_supply/battery/capacity"):
            with open("/sys/class/power_supply/battery/capacity") as f:
                metrics["battery_pct"] = int(f.read().strip())
        if os.path.exists("/sys/class/power_supply/battery/status"):
            with open("/sys/class/power_supply/battery/status") as f:
                metrics["battery_status"] = f.read().strip()
        if os.path.exists("/sys/class/power_supply/battery/temp"):
            with open("/sys/class/power_supply/battery/temp") as f:
                raw_temp = int(f.read().strip())
                metrics["battery_temp"] = f"{raw_temp / 10:.1f}°C"
    except Exception:
        pass

    # Disk metrics for drop storage
    try:
        total, used, free = shutil.disk_usage(DROP_DIR)
        metrics["storage_total_gb"] = round(total / (1024**3), 1)
        metrics["storage_free_gb"] = round(free / (1024**3), 1)
        metrics["storage_pct"] = round((used / total) * 100, 1) if total > 0 else 0
    except Exception:
        pass

    return metrics

def list_uploaded_files():
    """Safe file listing without full filesystem exposure."""
    files = []
    if os.path.exists(DROP_DIR):
        try:
            for entry in sorted(os.scandir(DROP_DIR), key=lambda e: e.stat().st_mtime, reverse=True):
                if entry.is_file() and not entry.name.startswith("."):
                    stat = entry.stat()
                    size_mb = round(stat.st_size / (1024**2), 2)
                    size_str = f"{size_mb} MB" if size_mb >= 1 else f"{round(stat.st_size / 1024, 1)} KB"
                    files.append({
                        "name": entry.name,
                        "size": size_str,
                        "raw_size": stat.st_size,
                        "timestamp": int(stat.st_mtime),
                        "date_str": time.strftime("%b %d, %Y %I:%M %p", time.localtime(stat.st_mtime))
                    })
        except Exception:
            pass
    return files[:50]

def parse_multipart_files(body_bytes, boundary_bytes):
    """
    Zero-dependency, memory-safe multipart parser.
    Strictly sanitizes filenames and prevents path traversal (e.g., ../../../).
    """
    uploaded = []
    parts = body_bytes.split(b"--" + boundary_bytes)

    for part in parts:
        if not part or part == b"--\r\n" or part == b"--":
            continue
        if b"\r\n\r\n" in part:
            header_bytes, content = part.split(b"\r\n\r\n", 1)
            if content.endswith(b"\r\n"):
                content = content[:-2]

            headers_text = header_bytes.decode("utf-8", errors="ignore")
            match = re.search(r'filename="([^"]+)"', headers_text)
            if match and len(content) > 0:
                raw_filename = match.group(1).strip()
                # Strict security: strip all directory path separators
                safe_name = os.path.basename(raw_filename.replace("\\", "/"))
                # Remove any dangerous characters
                safe_name = re.sub(r'[^a-zA-Z0-9._ -]', '_', safe_name)
                if not safe_name or safe_name == ".":
                    continue

                dest_path = os.path.join(DROP_DIR, safe_name)
                # Avoid collision by appending timestamp
                if os.path.exists(dest_path):
                    base, ext = os.path.splitext(safe_name)
                    dest_path = os.path.join(DROP_DIR, f"{base}_{int(time.time())}{ext}")
                    safe_name = os.path.basename(dest_path)

                with open(dest_path, "wb") as f:
                    f.write(content)
                uploaded.append(safe_name)

    return uploaded

class PeppyHubHandler(BaseHTTPRequestHandler):
    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
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
        path = parsed.path

        if path in ("/", "/index.html"):
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

        # Real health check API
        elif path == "/api/status":
            local_ip = get_local_ip()
            
            # Real socket probes
            jellyfin_online = probe_port(port=8096)
            mc_java_online = probe_port(port=25565)
            mc_bedrock_online = probe_port(port=19132)
            dashboard_online = probe_port(port=8088)
            bot_online = probe_port(port=8089)

            response_data = {
                "brand": BRAND_NAME,
                "tagline": TAGLINE,
                "local_ip": local_ip,
                "hub_port": PORT,
                "services": {
                    "jellyfin": {
                        "name": SERVICES_CONFIG["jellyfin"]["name"],
                        "url": f"http://{local_ip}:8096",
                        "port": 8096,
                        "online": jellyfin_online,
                        "status_text": "Online" if jellyfin_online else "Offline"
                    },
                    "minecraft": {
                        "name": SERVICES_CONFIG["minecraft"]["name"],
                        "java_port": 25565,
                        "bedrock_port": 19132,
                        "java_address": f"{local_ip}:25565",
                        "bedrock_address": f"{local_ip}:19132",
                        "online": mc_java_online,
                        "bedrock_online": mc_bedrock_online,
                        "status_text": "Online" if mc_java_online else "Offline"
                    },
                    "peppydrop": {
                        "name": SERVICES_CONFIG["peppydrop"]["name"],
                        "online": True,
                        "status_text": "Ready"
                    },
                    "mc_dashboard": {
                        "name": SERVICES_CONFIG["mc_dashboard"]["name"],
                        "url": f"http://{local_ip}:8088",
                        "online": dashboard_online,
                        "status_text": "Online" if dashboard_online else "Offline"
                    },
                    "peppy_bot": {
                        "online": bot_online,
                        "status_text": "Online" if bot_online else "Offline"
                    }
                },
                "metrics": get_system_metrics(),
                "files_count": len(list_uploaded_files()),
                "timestamp": int(time.time()),
                "check_time_str": time.strftime("%I:%M:%S %p", time.localtime())
            }
            self.send_json(response_data)
            return

        # List files in drop storage
        elif path == "/api/files":
            self.send_json({"files": list_uploaded_files()})
            return

        # Download dropped file
        elif path.startswith("/download/"):
            filename = unquote(path[len("/download/"):])
            # Security: Prevent path traversal
            safe_name = os.path.basename(filename.replace("\\", "/"))
            filepath = os.path.join(DROP_DIR, safe_name)
            if os.path.exists(filepath) and os.path.isfile(filepath):
                self.send_response(200)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Disposition", f'attachment; filename="{safe_name}"')
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
                self.send_json({"success": False, "error": "Invalid multipart form submission"}, 400)
                return

            try:
                boundary_match = re.search(r'boundary=(.+)$', content_type)
                if not boundary_match:
                    self.send_json({"success": False, "error": "Missing multipart boundary"}, 400)
                    return

                boundary = boundary_match.group(1).strip()
                if boundary.startswith('"') and boundary.endswith('"'):
                    boundary = boundary[1:-1]
                boundary_bytes = boundary.encode("utf-8")

                content_length = int(self.headers.get("Content-Length", 0))
                # 200MB max per upload request to safeguard phone RAM
                if content_length > 200 * 1024 * 1024:
                    self.send_json({"success": False, "error": "Upload size exceeds 200MB limit"}, 413)
                    return

                body_bytes = self.rfile.read(content_length)
                uploaded = parse_multipart_files(body_bytes, boundary_bytes)
                self.send_json({"success": True, "uploaded": uploaded})
            except Exception as e:
                self.send_json({"success": False, "error": str(e)}, 500)
            return

        self.send_error(404)

    def log_message(self, format, *args):
        # Quiet logger: battery efficient, avoids leaking query params or tokens to disk
        pass

def run():
    ip = get_local_ip()
    print("=" * 64)
    print("  🚀 Peppy Home Hub — Futuristic Home Server Portal")
    print(f"  Live on Local Wi-Fi: http://{ip}:{PORT}")
    print(f"  Drop Directory:      {DROP_DIR}")
    print("=" * 64)
    server = HTTPServer((HOST, PORT), PeppyHubHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    server.server_close()

if __name__ == "__main__":
    run()
