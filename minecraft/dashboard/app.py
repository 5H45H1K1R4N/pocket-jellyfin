#!/usr/bin/env python3
"""
PocketJellyfin - Aternos-Style Minecraft Web Dashboard
Zero-dependency Python 3 HTTP Server
Provides live status, interactive console, options, player management, and backups.
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import subprocess
import os
import json
import socket
import struct
import time
import re

PORT = 8088
MC_DIR = "/storage/26B2-1AEB/Minecraft"
TMUX_SESSION = "minecraft"

# Detect fallback if not on SD card
if not os.path.exists(MC_DIR):
    alt_dir = os.path.expanduser("~/pocket-jellyfin/minecraft")
    if os.path.exists(alt_dir):
        MC_DIR = alt_dir
    else:
        alt_dir2 = os.path.expanduser("~/minecraft")
        if os.path.exists(alt_dir2):
            MC_DIR = alt_dir2

def is_server_running():
    try:
        r = subprocess.run(["tmux", "has-session", "-t", TMUX_SESSION],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return r.returncode == 0
    except Exception:
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

def ping_minecraft_slp(host="127.0.0.1", port=25565, timeout=1.0):
    """Query Minecraft Server List Ping protocol for real-time stats."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(timeout)
    try:
        s.connect((host, port))
        h = host.encode('utf-8')
        packet = b'\x00\x00' + struct.pack('>B', len(h)) + h + struct.pack('>H', port) + b'\x01'
        s.sendall(struct.pack('>B', len(packet)) + packet)
        s.sendall(b'\x01\x00')
        raw = s.recv(4096)
        start = raw.find(b'{')
        if start != -1:
            data = json.loads(raw[start:].decode('utf-8', errors='ignore'))
            return {
                "online": True,
                "version": data.get("version", {}).get("name", "Paper"),
                "protocol": data.get("version", {}).get("protocol", 0),
                "players_online": data.get("players", {}).get("online", 0),
                "players_max": data.get("players", {}).get("max", 10),
                "players_sample": [p.get("name") for p in data.get("players", {}).get("sample", []) if "name" in p],
                "motd": data.get("description", {}).get("text", "") if isinstance(data.get("description"), dict) else str(data.get("description", ""))
            }
    except Exception:
        pass
    finally:
        s.close()
    return None

def resolve_mc_path(*subpaths):
    candidate1 = os.path.join(MC_DIR, *subpaths)
    if os.path.exists(candidate1):
        return candidate1
    candidate2 = os.path.join(MC_DIR, "server", *subpaths)
    if os.path.exists(candidate2):
        return candidate2
    candidate3 = os.path.join(MC_DIR, "config", *subpaths)
    if os.path.exists(candidate3):
        return candidate3
    return candidate1

def get_server_properties():
    props_path = resolve_mc_path("server.properties")
    props = {}
    if os.path.exists(props_path):
        try:
            with open(props_path, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        props[k.strip()] = v.strip()
        except Exception:
            pass
    return props

def save_server_properties(new_props):
    props_path = resolve_mc_path("server.properties")
    if not os.path.exists(props_path):
        props_path = os.path.join(MC_DIR, "server.properties")
    try:
        lines = []
        if os.path.exists(props_path):
            with open(props_path, "r", encoding="utf-8", errors="ignore") as f:
                lines = f.readlines()
        
        updated_keys = set()
        new_lines = []
        for line in lines:
            stripped = line.strip()
            if stripped and not stripped.startswith("#") and "=" in stripped:
                k, _ = stripped.split("=", 1)
                k = k.strip()
                if k in new_props:
                    new_lines.append(f"{k}={new_props[k]}\n")
                    updated_keys.add(k)
                    continue
            new_lines.append(line)
        
        for k, v in new_props.items():
            if k not in updated_keys:
                new_lines.append(f"{k}={v}\n")
                
        with open(props_path, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
        return True
    except Exception:
        return False

def get_dir_size_mb(path):
    if not os.path.exists(path):
        return 0
    total = 0
    try:
        for entry in os.scandir(path):
            if entry.is_file(follow_symlinks=False):
                total += entry.stat().st_size
            elif entry.is_dir(follow_symlinks=False):
                total += get_dir_size_mb(entry.path) * (1024**2)
    except Exception:
        pass
    return round(total / (1024**2), 1)

def get_disk_info(path):
    try:
        st = os.statvfs(path)
        total = (st.f_blocks * st.f_frsize) / (1024**3)
        free = (st.f_bavail * st.f_frsize) / (1024**3)
        used = total - free
        return {
            "total_gb": round(total, 1),
            "free_gb": round(free, 1),
            "used_gb": round(used, 1),
            "percent": round((used / total) * 100, 1) if total > 0 else 0
        }
    except Exception:
        return {"total_gb": 0, "free_gb": 0, "used_gb": 0, "percent": 0}

def get_process_memory():
    try:
        # Check java process rss memory
        r = subprocess.run(["pgrep", "-f", "paper.jar"], stdout=subprocess.PIPE, text=True)
        pids = r.stdout.strip().split()
        if pids:
            pid = pids[0]
            with open(f"/proc/{pid}/status", "r") as f:
                for line in f:
                    if line.startswith("VmRSS:"):
                        kb = int(re.search(r'\d+', line).group())
                        return round(kb / 1024)
    except Exception:
        pass
    return 0

class DashboardHandler(BaseHTTPRequestHandler):
    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/" or parsed.path == "/index.html":
            html_path = os.path.join(os.path.dirname(__file__), "index.html")
            if os.path.exists(html_path):
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                with open(html_path, "rb") as f:
                    content = f.read()
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
            else:
                self.send_error(404, "index.html missing")
            return

        elif parsed.path == "/icon.png" or parsed.path == "/server-icon.png":
            icon_path = resolve_mc_path("server-icon.png")
            if not os.path.exists(icon_path):
                icon_path = resolve_mc_path("world", "icon.png")
            if os.path.exists(icon_path):
                self.send_response(200)
                self.send_header("Content-Type", "image/png")
                with open(icon_path, "rb") as f:
                    content = f.read()
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
                return
            self.send_error(404)
            return

        elif parsed.path == "/api/status":
            running = is_server_running()
            props = get_server_properties()
            slp = ping_minecraft_slp(port=int(props.get("server-port", 25565))) if running else None
            
            disk = get_disk_info(MC_DIR)
            rss_mb = get_process_memory() if running else 0
            
            # Check backups
            backups_dir = resolve_mc_path("backups")
            backup_count = len(os.listdir(backups_dir)) if os.path.exists(backups_dir) else 0

            # Public playit IP or Claim URL detection from log if active
            playit_ip = None
            playit_claim_url = None
            log_path = resolve_mc_path("logs", "latest.log")
            if os.path.exists(log_path):
                try:
                    with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
                        recent_logs = f.read()[-8000:]
                        m = re.search(r'([a-zA-Z0-9\-]+\.gl\.joinmc\.link|[a-zA-Z0-9\-]+\.playit\.gg:\d+)', recent_logs)
                        if m:
                            playit_ip = m.group(1)
                        m2 = re.search(r'(https://playit\.gg/claim/[a-zA-Z0-9\-_]+)', recent_logs)
                        if m2:
                            playit_claim_url = m2.group(1)
                except Exception:
                    pass

            # Installed plugins list
            plugins_list = []
            pdir = resolve_mc_path("plugins")
            if os.path.exists(pdir):
                try:
                    for f in os.listdir(pdir):
                        if f.endswith(".jar"):
                            clean_name = f.replace(".jar", "").split("-")[0]
                            plugins_list.append(clean_name)
                except Exception:
                    pass

            icon_exists = os.path.exists(resolve_mc_path("server-icon.png")) or os.path.exists(resolve_mc_path("world", "icon.png"))
            data = {
                "running": running,
                "version": slp.get("version", "Paper 26.2") if slp else "Paper 26.2",
                "players_online": slp.get("players_online", 0) if slp else 0,
                "players_max": int(props.get("max-players", 10)),
                "players_sample": slp.get("players_sample", []) if slp else [],
                "motd": props.get("motd", "PocketJellyfin | PaperMC Server"),
                "port": int(props.get("server-port", 25565)),
                "bedrock_port": 19132,
                "local_ip": get_local_ip(),
                "playit_ip": playit_ip,
                "playit_claim_url": playit_claim_url,
                "plugins": plugins_list,
                "ram_used_mb": rss_mb,
                "ram_max_mb": 1024,
                "storage": disk,
                "world_size_mb": get_dir_size_mb(resolve_mc_path("world")),
                "backup_count": backup_count,
                "has_icon": icon_exists
            }
            self.send_json(data)
            return

        elif parsed.path == "/api/logs":
            log_path = resolve_mc_path("logs", "latest.log")
            lines = []
            if os.path.exists(log_path):
                try:
                    with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
                        lines = [l.rstrip("\r\n") for l in f.readlines()[-200:]]
                except Exception:
                    pass
            self.send_json({"lines": lines})
            return

        elif parsed.path == "/api/options":
            props = get_server_properties()
            self.send_json(props)
            return

        elif parsed.path == "/api/players":
            # Read ops.json, whitelist.json, banned-players.json, usercache.json
            def read_json_file(filename):
                p = resolve_mc_path(filename)
                if os.path.exists(p):
                    try:
                        with open(p, "r", encoding="utf-8") as f:
                            return json.load(f)
                    except Exception:
                        pass
                return []
            
            ops = read_json_file("ops.json")
            whitelist = read_json_file("whitelist.json")
            banned = read_json_file("banned-players.json")
            cache = read_json_file("usercache.json")
            
            self.send_json({
                "ops": ops,
                "whitelist": whitelist,
                "banned": banned,
                "known_players": cache
            })
            return

        elif parsed.path == "/api/backups":
            bdir = os.path.join(MC_DIR, "backups")
            backups = []
            if os.path.exists(bdir):
                for f in sorted(os.listdir(bdir), reverse=True):
                    if f.endswith(".tar.gz") or f.endswith(".zip"):
                        fp = os.path.join(bdir, f)
                        st = os.stat(fp)
                        backups.append({
                            "name": f,
                            "size_mb": round(st.st_size / (1024**2), 1),
                            "date": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(st.st_mtime))
                        })
            self.send_json({"backups": backups})
            return

        self.send_error(404)

    def do_POST(self):
        parsed = urlparse(self.path)
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
        try:
            params = json.loads(body) if body else {}
        except Exception:
            params = {}

        if parsed.path == "/api/command":
            cmd = params.get("command", "").strip()
            if cmd.startswith("/"):
                cmd = cmd[1:]
            if cmd:
                if is_server_running():
                    subprocess.run(["tmux", "send-keys", "-t", TMUX_SESSION, cmd, "Enter"])
                    self.send_json({"success": True})
                    return
                else:
                    self.send_json({"success": False, "error": "Server is offline"}, status=400)
                    return
            self.send_json({"success": False, "error": "Empty command"}, status=400)
            return

        elif parsed.path == "/api/power":
            action = params.get("action", "").lower()
            if action == "start":
                subprocess.run(["mc", "start"])
                self.send_json({"success": True})
                return
            elif action == "stop":
                subprocess.run(["mc", "stop"])
                self.send_json({"success": True})
                return
            elif action == "restart":
                subprocess.run(["mc", "stop"])
                time.sleep(2)
                subprocess.run(["mc", "start"])
                self.send_json({"success": True})
                return
            self.send_json({"success": False, "error": "Invalid action"}, status=400)
            return

        elif parsed.path == "/api/options":
            success = save_server_properties(params)
            self.send_json({"success": success})
            return

        elif parsed.path == "/api/backup":
            tag = params.get("tag", "web_backup")
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            bdir = os.path.join(MC_DIR, "backups")
            os.makedirs(bdir, exist_ok=True)
            tar_name = f"mc_backup_{timestamp}_{tag}.tar.gz"
            tar_path = os.path.join(bdir, tar_name)
            
            # Send save-all flush if online
            if is_server_running():
                subprocess.run(["tmux", "send-keys", "-t", TMUX_SESSION, "save-all flush", "Enter"])
                time.sleep(2)

            backup_src = MC_DIR
            items_to_backup = []
            for item in ["world", "server.properties", "plugins", "ops.json", "whitelist.json"]:
                if os.path.exists(os.path.join(MC_DIR, item)):
                    items_to_backup.append(item)
                elif os.path.exists(os.path.join(MC_DIR, "server", item)):
                    backup_src = os.path.join(MC_DIR, "server")
                    items_to_backup.append(item)

            if items_to_backup:
                subprocess.run([
                    "tar", "-czf", tar_path, "-C", backup_src, *items_to_backup
                ], stderr=subprocess.DEVNULL)
            self.send_json({"success": True, "filename": tar_name})
            return

        self.send_error(404)

def run():
    server_address = ("0.0.0.0", PORT)
    httpd = HTTPServer(server_address, DashboardHandler)
    print(f"============================================================")
    print(f"  PocketJellyfin - Minecraft Aternos-Style Web Dashboard    ")
    print(f"  Live at: http://0.0.0.0:{PORT}                             ")
    print(f"============================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    httpd.server_close()

if __name__ == "__main__":
    run()
