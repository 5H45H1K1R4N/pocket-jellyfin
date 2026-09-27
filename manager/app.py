#!/usr/bin/env python3
"""
PocketJellyfin Manager - Unified Backend Engine
Runs as a zero-dependency web service on Android Termux.
"""

import os
import sys
import json
import time
import socket
import shutil
import subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

PORT = 5000
SD_CARD_ID = "26B2-1AEB"
SD_BASE = f"/storage/{SD_CARD_ID}" if os.path.exists(f"/storage/{SD_CARD_ID}") else os.path.expanduser("~/storage/shared")
MEDIA_DIR = os.path.join(SD_BASE, "Media")
JELLYFIN_PORT = 8096

def is_port_open(host="127.0.0.1", port=JELLYFIN_PORT):
    try:
        with socket.create_connection((host, port), timeout=0.8):
            return True
    except OSError:
        return False

def get_disk_info(path):
    try:
        if not os.path.exists(path):
            return {"total_gb": 0, "used_gb": 0, "free_gb": 0, "percent": 0}
        total, used, free = shutil.disk_usage(path)
        return {
            "total_gb": round(total / (1024**3), 1),
            "used_gb": round(used / (1024**3), 1),
            "free_gb": round(free / (1024**3), 1),
            "percent": round((used / total) * 100, 1)
        }
    except Exception:
        return {"total_gb": 0, "used_gb": 0, "free_gb": 0, "percent": 0}

def get_battery_info():
    info = {"level": 100, "status": "Unknown", "temp": "Normal"}
    # Try reading sysfs battery
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

def get_media_files():
    files = []
    if not os.path.exists(MEDIA_DIR):
        return files
    
    for root, _, filenames in os.walk(MEDIA_DIR):
        for name in filenames:
            ext = os.path.splitext(name)[1].lower()
            if ext in [".mp4", ".mkv", ".avi", ".mov", ".webm", ".part", ".downloading"]:
                full_path = os.path.join(root, name)
                try:
                    stat = os.stat(full_path)
                    files.append({
                        "name": name,
                        "path": full_path,
                        "relative_path": os.path.relpath(full_path, MEDIA_DIR),
                        "size_mb": round(stat.st_size / (1024**2), 1),
                        "mtime": stat.st_mtime,
                        "is_active": ext in [".part", ".downloading"] or (time.time() - stat.st_mtime < 15)
                    })
                except OSError:
                    continue
    # Sort newest first
    files.sort(key=lambda x: x["mtime"], reverse=True)
    return files

def get_jellyfin_api_key():
    key_path = os.path.expanduser("~/.jellyfin_api_key")
    if os.path.exists(key_path):
        with open(key_path) as f:
            return f.read().strip()
    return ""

def trigger_jellyfin_refresh():
    api_key = get_jellyfin_api_key()
    headers = ["-H", f'Authorization: MediaBrowser Token="{api_key}"'] if api_key else []
    try:
        cmd = ["curl", "-s", "-X", "POST", f"http://127.0.0.1:{JELLYFIN_PORT}/Library/Refresh"] + headers
        res = subprocess.run(cmd, capture_output=True, timeout=5)
        return res.returncode == 0
    except Exception:
        return False

def is_tmux_movie_running():
    try:
        res = subprocess.run(["tmux", "has-session", "-t", "movies"], capture_output=True)
        return res.returncode == 0
    except Exception:
        return False

class ManagerHandler(BaseHTTPRequestHandler):
    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        
        if parsed.path == "/":
            template_path = os.path.join(os.path.dirname(__file__), "index.html")
            if os.path.exists(template_path):
                with open(template_path, "rb") as f:
                    content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
            else:
                self.send_error(404, "Dashboard HTML not found")
            return

        elif parsed.path == "/manifest.json":
            manifest = {
                "name": "PocketJellyfin Manager",
                "short_name": "PocketJellyfin",
                "start_url": "/",
                "display": "standalone",
                "background_color": "#0f172a",
                "theme_color": "#00a4dc",
                "icons": [{
                    "src": "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2300a4dc'%3E%3Cpath d='M4 6h16v12H4z'/%3E%3Cpath d='M10 9l5 3-5 3z' fill='%23ffffff'/%3E%3C/svg%3E",
                    "sizes": "192x192 512x512",
                    "type": "image/svg+xml"
                }]
            }
            self.send_json(manifest)
            return

        elif parsed.path == "/api/status":
            disk = get_disk_info(SD_BASE)
            battery = get_battery_info()
            files = get_media_files()
            active_downloads = [f for f in files if f["is_active"]]
            
            data = {
                "jellyfin_online": is_port_open(),
                "jellyfin_url": f"http://{self.headers.get('Host', 'localhost').split(':')[0]}:{JELLYFIN_PORT}",
                "sd_storage": disk,
                "sd_path": SD_BASE,
                "battery": battery,
                "tmux_active": is_tmux_movie_running(),
                "active_downloads": active_downloads,
                "all_files": files[:25],
                "api_key_configured": bool(get_jellyfin_api_key()),
                "ttyd_url": f"http://{self.headers.get('Host', 'localhost').split(':')[0]}:7681"
            }
            self.send_json(data)
            return

        self.send_error(404)

    def do_POST(self):
        parsed = urlparse(self.path)
        
        if parsed.path == "/api/rescan":
            success = trigger_jellyfin_refresh()
            self.send_json({"success": success})
            return

        elif parsed.path == "/api/clean-cache":
            cache_dir = os.path.join(SD_BASE, "Jellyfin", "cache", "transcodes")
            cleaned_mb = 0
            if os.path.exists(cache_dir):
                for f in os.listdir(cache_dir):
                    fp = os.path.join(cache_dir, f)
                    try:
                        sz = os.path.getsize(fp)
                        os.remove(fp)
                        cleaned_mb += sz / (1024**2)
                    except Exception:
                        pass
            self.send_json({"success": True, "cleaned_mb": round(cleaned_mb, 1)})
            return

        elif parsed.path == "/api/delete":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8")
            params = json.loads(body) if body else {}
            target_path = params.get("path", "")
            
            # Security check: must reside inside MEDIA_DIR
            if target_path and target_path.startswith(MEDIA_DIR) and os.path.exists(target_path):
                try:
                    os.remove(target_path)
                    self.send_json({"success": True})
                    return
                except Exception as e:
                    self.send_json({"success": False, "error": str(e)}, status=500)
                    return
            self.send_json({"success": False, "error": "Invalid path"}, status=400)
            return

        self.send_error(404)

def run():
    server_address = ("0.0.0.0", PORT)
    httpd = HTTPServer(server_address, ManagerHandler)
    print(f"PocketJellyfin Manager running at http://0.0.0.0:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    httpd.server_close()

if __name__ == "__main__":
    run()
