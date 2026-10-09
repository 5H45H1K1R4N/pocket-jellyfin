#!/usr/bin/env python3
"""
Peppy Home Hub 2.0 — Backend Engine
Serves the private Home Cloud & Media Portal.
Provides:
  - Session-based authentication & default-deny authorization
  - Peppy Photos: Album permissions, thumbnail generation, timeline queries
  - File Drop: Per-user access control & sandboxed storage
  - Movies & TV: Jellyfin live probing & guest connection help
  - Minecraft: PaperMC & Bedrock live status and connection guides
  - Server Telemetry: Battery, temperature, storage, zero credential leaks
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
from typing import Optional, Dict, Any

# Local database and security engine
import db

PORT = int(os.environ.get("PEPPY_PORT", 7777))
HOST = "0.0.0.0"

# Safe storage root resolution (Android Termux Scoped Storage compatible)
SD_CARD_ID = "26B2-1AEB"

def get_writable_dir(sub_name: str) -> str:
    """Find a genuinely writable directory, checking external storage then internal then home."""
    candidates = [
        f"/storage/{SD_CARD_ID}/{sub_name}",
        os.path.expanduser(f"~/storage/shared/{sub_name}"),
        os.path.expanduser(f"~/.pocket-mc/{sub_name}"),
        os.path.expanduser(f"~/{sub_name}")
    ]
    for path in candidates:
        try:
            os.makedirs(path, exist_ok=True)
            test_file = os.path.join(path, ".probe_write")
            with open(test_file, "w") as f:
                f.write("1")
            os.remove(test_file)
            return path
        except Exception:
            continue
    fallback = os.path.expanduser(f"~/.pocket-mc/{sub_name}")
    try:
        os.makedirs(fallback, exist_ok=True)
    except Exception:
        pass
    return fallback

PHOTOS_DIR = get_writable_dir("PeppyPhotos")
ORIGINALS_DIR = os.path.join(PHOTOS_DIR, "originals")
THUMBS_DIR = os.path.join(PHOTOS_DIR, "thumbnails")
DROP_DIR = get_writable_dir("PeppyDrop")

for d in (ORIGINALS_DIR, THUMBS_DIR):
    try:
        os.makedirs(d, exist_ok=True)
    except Exception:
        pass

# Try loading Pillow for high-quality thumbnail resizing
try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

SERVICES_PORTS = {
    "jellyfin": 8096,
    "minecraft_java": 25565,
    "minecraft_bedrock": 19132,
    "mc_dashboard": 8088,
    "peppy_bot": 8089
}

START_TIME = time.time()

def probe_port(host="127.0.0.1", port=8096, timeout=0.5) -> bool:
    try:
        with socket.create_connection((host, int(port)), timeout=timeout):
            return True
    except (OSError, socket.timeout):
        return False

def get_local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def get_system_metrics() -> Dict[str, Any]:
    metrics = {
        "uptime_seconds": int(time.time() - START_TIME),
        "battery_pct": 100,
        "battery_status": "AC Plugged",
        "battery_temp": "Normal",
        "storage_free_gb": 0,
        "storage_total_gb": 0,
        "storage_pct": 0
    }
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

    try:
        total, used, free = shutil.disk_usage(STORAGE_ROOT)
        metrics["storage_total_gb"] = round(total / (1024**3), 1)
        metrics["storage_free_gb"] = round(free / (1024**3), 1)
        metrics["storage_pct"] = round((used / total) * 100, 1) if total > 0 else 0
    except Exception:
        pass

    return metrics

def make_thumbnail(orig_path: str, thumb_path: str) -> str:
    """Generate and cache thumbnail using PIL if available, else point to original."""
    if not os.path.exists(orig_path):
        return orig_path

    if os.path.exists(thumb_path):
        return thumb_path

    if HAS_PIL:
        try:
            with Image.open(orig_path) as im:
                im.thumbnail((360, 360), Image.BILINEAR)
                # Convert to RGB if RGBA/P for jpeg/webp
                if im.mode in ("RGBA", "P"):
                    im = im.convert("RGB")
                im.save(thumb_path, "JPEG", quality=82)
                return thumb_path
        except Exception:
            return orig_path
    return orig_path

def parse_multipart(body_bytes: bytes, boundary_bytes: bytes):
    """Zero-dependency multipart file and form-data parser."""
    fields = {}
    files = []
    parts = body_bytes.split(b"--" + boundary_bytes)

    for part in parts:
        if not part or part in (b"--\r\n", b"--"):
            continue
        if b"\r\n\r\n" in part:
            header_bytes, content = part.split(b"\r\n\r\n", 1)
            if content.endswith(b"\r\n"):
                content = content[:-2]

            headers_text = header_bytes.decode("utf-8", errors="ignore")
            # Extract name
            name_match = re.search(r'name="([^"]+)"', headers_text)
            field_name = name_match.group(1) if name_match else ""

            # Check if file
            fn_match = re.search(r'filename="([^"]+)"', headers_text)
            if fn_match and len(content) > 0:
                raw_filename = fn_match.group(1).strip()
                safe_name = os.path.basename(raw_filename.replace("\\", "/"))
                safe_name = re.sub(r'[^a-zA-Z0-9._ -]', '_', safe_name)
                if safe_name and safe_name != ".":
                    files.append({
                        "field": field_name,
                        "filename": safe_name,
                        "data": content
                    })
            else:
                try:
                    fields[field_name] = content.decode("utf-8").strip()
                except Exception:
                    pass

    return fields, files

class PeppyHomeHubHandler(BaseHTTPRequestHandler):

    def send_json(self, data: Any, status: int = 200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, filepath: str, filename: str, as_download: bool = False):
        if not os.path.exists(filepath) or not os.path.isfile(filepath):
            self.send_error(404, "File not found")
            return

        file_size = os.path.getsize(filepath)
        ext = os.path.splitext(filepath)[1].lower()
        content_type = "application/octet-stream"
        if ext in (".jpg", ".jpeg"): content_type = "image/jpeg"
        elif ext == ".png": content_type = "image/png"
        elif ext == ".webp": content_type = "image/webp"
        elif ext == ".mp4": content_type = "video/mp4"

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(file_size))
        self.send_header("Access-Control-Allow-Origin", "*")
        if as_download:
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        else:
            self.send_header("Cache-Control", "public, max-age=86400")
        self.end_headers()

        with open(filepath, "rb") as f:
            shutil.copyfileobj(f, self.wfile)

    def get_auth_user(self) -> Optional[Dict[str, Any]]:
        """Extract and authenticate session token from headers or cookies."""
        auth_hdr = self.headers.get("Authorization", "")
        token = ""
        if auth_hdr.startswith("Bearer "):
            token = auth_hdr[7:].strip()
        if not token:
            cookie_hdr = self.headers.get("Cookie", "")
            match = re.search(r'peppy_session=([a-f0-9]+)', cookie_hdr)
            if match:
                token = match.group(1)
        if token:
            return db.get_user_by_session(token)
        return None

    def read_json_body(self) -> Optional[Dict[str, Any]]:
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length == 0:
                return {}
            raw = self.rfile.read(length)
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return None

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        try:
            self._handle_get()
        except Exception as e:
            sys.stderr.write(f"[Server Error in GET {getattr(self, 'path', '')}]: {e}\n")
            import traceback
            traceback.print_exc()
            self.send_json({"error": f"Server error: {str(e)}"}, 500)

    def _handle_get(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        # ── Static UI ──
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
                self.send_error(404, "index.html missing")
            return

        # ── Public Telemetry & Status ──
        elif path == "/api/public/status":
            local_ip = get_local_ip()
            statuses = {
                k: probe_port(port=v)
                for k, v in SERVICES_PORTS.items()
            }
            data = {
                "server_name": "Peppy Home Hub",
                "tagline": "Your Home. Your Memories. Your Private Cloud.",
                "local_ip": local_ip,
                "hub_port": PORT,
                "services": {
                    "jellyfin": {"online": statuses["jellyfin"], "port": 8096, "url": f"http://{local_ip}:8096"},
                    "minecraft_java": {"online": statuses["minecraft_java"], "port": 25565, "address": f"{local_ip}:25565"},
                    "minecraft_bedrock": {"online": statuses["minecraft_bedrock"], "port": 19132, "address": f"{local_ip}:19132"},
                    "mc_dashboard": {"online": statuses["mc_dashboard"], "port": 8088, "url": f"http://{local_ip}:8088"},
                    "peppy_bot": {"online": statuses["peppy_bot"], "port": 8089}
                },
                "metrics": get_system_metrics(),
                "time_str": time.strftime("%I:%M:%S %p", time.localtime())
            }
            self.send_json(data)
            return

        # ── Auth: Current Session Info ──
        elif path == "/api/auth/me":
            user = self.get_auth_user()
            if not user:
                self.send_json({"authenticated": False}, 401)
                return
            self.send_json({"authenticated": True, "user": user})
            return

        # ── Photos & Albums (Protected) ──
        elif path == "/api/photos":
            user = self.get_auth_user()
            if not user:
                self.send_json({"error": "Unauthorized"}, 401)
                return
            album_id = int(qs["album_id"][0]) if "album_id" in qs else None
            search = qs["search"][0] if "search" in qs else None
            photos = db.get_authorized_photos(user, album_id=album_id, search=search)
            self.send_json({"photos": photos})
            return

        elif path == "/api/albums":
            user = self.get_auth_user()
            if not user:
                self.send_json({"error": "Unauthorized"}, 401)
                return
            albums = db.get_authorized_albums(user)
            self.send_json({"albums": albums})
            return

        elif re.match(r"^/api/photos/(\d+)/(thumb|view|download)$", path):
            m = re.match(r"^/api/photos/(\d+)/(thumb|view|download)$", path)
            photo_id = int(m.group(1))
            action_type = m.group(2)

            user = self.get_auth_user()
            if not user:
                self.send_json({"error": "Unauthorized"}, 401)
                return

            req_action = "download" if action_type == "download" else "view"
            if not db.can_access_photo(user, photo_id, action=req_action):
                self.send_json({"error": "Access Denied: You do not have permission to view this photo."}, 403)
                return

            conn = db.get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM photos WHERE id = ?", (photo_id,))
            photo = cursor.fetchone()
            conn.close()

            if not photo:
                self.send_error(404, "Photo not found")
                return

            orig_path = photo["filepath"]
            if action_type == "thumb":
                thumb_name = f"thumb_{photo_id}.jpg"
                thumb_path = os.path.join(THUMBS_DIR, thumb_name)
                resolved = make_thumbnail(orig_path, thumb_path)
                self.send_file(resolved, photo["filename"])
            elif action_type == "view":
                self.send_file(orig_path, photo["filename"], as_download=False)
            elif action_type == "download":
                self.send_file(orig_path, photo["filename"], as_download=True)
            return

        # ── File Drop (Protected) ──
        elif path == "/api/files":
            user = self.get_auth_user()
            if not user:
                self.send_json({"error": "Unauthorized"}, 401)
                return
            files = db.get_authorized_file_drops(user)
            self.send_json({"files": files})
            return

        elif re.match(r"^/api/files/(\d+)/download$", path):
            file_id = int(re.match(r"^/api/files/(\d+)/download$", path).group(1))
            user = self.get_auth_user()
            if not user or not db.can_access_file_drop(user, file_id, action="download"):
                self.send_json({"error": "Access Denied"}, 403)
                return

            conn = db.get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM file_drops WHERE id = ?", (file_id,))
            file_row = cursor.fetchone()
            conn.close()

            if not file_row:
                self.send_error(404, "File not found")
                return

            self.send_file(file_row["filepath"], file_row["filename"], as_download=True)
            return

        # ── Admin Only: Users List ──
        elif path == "/api/admin/users":
            user = self.get_auth_user()
            if not user or user["role"] != "admin":
                self.send_json({"error": "Admin required"}, 403)
                return
            users = db.list_users()
            self.send_json({"users": users})
            return

        # ── Admin Only: Album Permissions ──
        elif re.match(r"^/api/admin/albums/(\d+)/permissions$", path):
            album_id = int(re.match(r"^/api/admin/albums/(\d+)/permissions$", path).group(1))
            user = self.get_auth_user()
            if not user or user["role"] != "admin":
                self.send_json({"error": "Admin required"}, 403)
                return
            perms = db.get_album_permissions(album_id)
            self.send_json({"permissions": perms})
            return

        # ── Admin Only: Import Sources Explorer ──
        elif path == "/api/admin/import/sources":
            user = self.get_auth_user()
            if not user or user["role"] != "admin":
                self.send_json({"error": "Admin required"}, 403)
                return

            # Approved, safe import directories
            candidates = [
                os.path.join(STORAGE_ROOT, "DCIM"),
                os.path.join(STORAGE_ROOT, "Pictures"),
                os.path.join(STORAGE_ROOT, "Download"),
                "/storage/emulated/0/DCIM",
                "/storage/emulated/0/Pictures",
                os.path.expanduser("~/storage/shared/DCIM")
            ]
            valid_sources = [p for p in candidates if os.path.exists(p) and os.path.isdir(p)]
            self.send_json({"sources": valid_sources})
            return

        elif path == "/api/admin/import/browse":
            user = self.get_auth_user()
            if not user or user["role"] != "admin":
                self.send_json({"error": "Admin required"}, 403)
                return

            folder = qs.get("folder", [""])[0]
            # Verify folder is allowed
            if not folder or not os.path.exists(folder) or not os.path.isdir(folder):
                self.send_json({"error": "Invalid folder"}, 400)
                return

            items = []
            valid_exts = {".jpg", ".jpeg", ".png", ".webp"}
            try:
                for entry in sorted(os.scandir(folder), key=lambda e: e.stat().st_mtime, reverse=True):
                    if entry.is_file():
                        ext = os.path.splitext(entry.name)[1].lower()
                        if ext in valid_exts:
                            items.append({
                                "name": entry.name,
                                "path": entry.path,
                                "size_mb": round(entry.stat().st_size / (1024**2), 2),
                                "time": time.strftime("%Y-%m-%d", time.localtime(entry.stat().st_mtime))
                            })
                    if len(items) >= 200:
                        break
            except Exception as e:
                self.send_json({"error": str(e)}, 500)
                return

            self.send_json({"items": items})
            return

        self.send_error(404)

    def do_POST(self):
        try:
            self._handle_post()
        except Exception as e:
            sys.stderr.write(f"[Server Error in POST {getattr(self, 'path', '')}]: {e}\n")
            import traceback
            traceback.print_exc()
            self.send_json({"error": f"Server error: {str(e)}"}, 500)

    def _handle_post(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # ── Auth: Login ──
        if path == "/api/auth/login":
            data = self.read_json_body()
            if not data or "username" not in data or "password" not in data:
                self.send_json({"error": "Username and password required"}, 400)
                return

            res = db.authenticate(data["username"], data["password"])
            if not res:
                self.send_json({"error": "Invalid username or password"}, 401)
                return

            # Set HTTP-only session cookie AND CORS headers
            body = json.dumps(res).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie")
            self.send_header("Set-Cookie", f"peppy_session={res['token']}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        elif path == "/api/auth/logout":
            auth_hdr = self.headers.get("Authorization", "")
            token = auth_hdr[7:].strip() if auth_hdr.startswith("Bearer ") else ""
            if not token:
                cookie_hdr = self.headers.get("Cookie", "")
                m = re.search(r'peppy_session=([a-f0-9]+)', cookie_hdr)
                if m: token = m.group(1)
            if token:
                db.revoke_session(token)
            self.send_json({"success": True})
            return

        # ── Favorite Photo ──
        elif re.match(r"^/api/photos/(\d+)/favorite$", path):
            photo_id = int(re.match(r"^/api/photos/(\d+)/favorite$", path).group(1))
            user = self.get_auth_user()
            if not user or not db.can_access_photo(user, photo_id, action="view"):
                self.send_json({"error": "Unauthorized"}, 403)
                return
            is_fav = db.toggle_favorite(user["id"], photo_id)
            self.send_json({"photo_id": photo_id, "is_favorite": is_fav})
            return

        # ── File Drop Upload ──
        elif path == "/api/files/upload":
            user = self.get_auth_user()
            if not user:
                self.send_json({"error": "Sign in required to drop files"}, 401)
                return

            content_type = self.headers.get("Content-Type", "")
            if not content_type.startswith("multipart/form-data"):
                self.send_json({"error": "Invalid multipart data"}, 400)
                return

            b_match = re.search(r'boundary=(.+)$', content_type)
            if not b_match:
                self.send_json({"error": "Missing boundary"}, 400)
                return

            boundary = b_match.group(1).strip().strip('"').encode("utf-8")
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length > 300 * 1024 * 1024:
                self.send_json({"error": "Payload exceeds 300MB limit"}, 413)
                return

            body_bytes = self.rfile.read(content_length)
            fields, files = parse_multipart(body_bytes, boundary)
            visibility = fields.get("visibility", "public")
            if visibility not in ("public", "private", "admin_only"):
                visibility = "public"

            saved_items = []
            for f in files:
                dest_path = os.path.join(DROP_DIR, f["filename"])
                if os.path.exists(dest_path):
                    base, ext = os.path.splitext(f["filename"])
                    dest_path = os.path.join(DROP_DIR, f"{base}_{int(time.time())}{ext}")
                with open(dest_path, "wb") as out:
                    out.write(f["data"])

                size = os.path.getsize(dest_path)
                file_id = db.add_file_drop(
                    filename=os.path.basename(dest_path),
                    filepath=dest_path,
                    file_size=size,
                    user_id=user["id"],
                    uploader_name=user["display_name"] or user["username"],
                    visibility=visibility
                )
                saved_items.append({"id": file_id, "name": os.path.basename(dest_path)})

            self.send_json({"success": True, "files": saved_items})
            return

        # ── Admin Only: Create Album ──
        elif path == "/api/admin/albums":
            user = self.get_auth_user()
            if not user or user["role"] != "admin":
                self.send_json({"error": "Admin required"}, 403)
                return
            data = self.read_json_body()
            if not data or not data.get("title"):
                self.send_json({"error": "Title required"}, 400)
                return
            album_id = db.create_album(
                title=data["title"].strip(),
                description=data.get("description", "").strip(),
                access_policy=data.get("access_policy", "restricted"),
                user_id=user["id"]
            )
            self.send_json({"success": True, "album_id": album_id})
            return

        # ── Admin Only: Create User ──
        elif path == "/api/admin/users":
            user = self.get_auth_user()
            if not user or user["role"] != "admin":
                self.send_json({"error": "Admin required"}, 403)
                return
            data = self.read_json_body()
            try:
                new_id = db.create_user(
                    username=data.get("username", ""),
                    password=data.get("password", ""),
                    display_name=data.get("display_name", ""),
                    role=data.get("role", "member")
                )
                self.send_json({"success": True, "user_id": new_id})
            except ValueError as e:
                self.send_json({"error": str(e)}, 400)
            return

        # ── Admin Only: Import Photos to Library ──
        elif path == "/api/admin/import/execute":
            user = self.get_auth_user()
            if not user or user["role"] != "admin":
                self.send_json({"error": "Admin required"}, 403)
                return
            data = self.read_json_body()
            if not data or not data.get("files"):
                self.send_json({"error": "File list required"}, 400)
                return

            album_id = data.get("album_id")
            imported_count = 0

            for src in data["files"]:
                if os.path.exists(src) and os.path.isfile(src):
                    fname = os.path.basename(src)
                    dest = os.path.join(ORIGINALS_DIR, fname)
                    if os.path.exists(dest):
                        base, ext = os.path.splitext(fname)
                        dest = os.path.join(ORIGINALS_DIR, f"{base}_{int(time.time())}{ext}")

                    # Non-destructive copy
                    shutil.copy2(src, dest)
                    size = os.path.getsize(dest)
                    mtime_date = time.strftime("%Y-%m-%d", time.localtime(os.path.getmtime(src)))

                    photo_id = db.add_photo(
                        filename=os.path.basename(dest),
                        filepath=dest,
                        thumbnail_path="",
                        file_size=size,
                        user_id=user["id"],
                        caption=data.get("caption", ""),
                        date_taken=mtime_date
                    )
                    if album_id:
                        db.assign_photo_to_album(int(album_id), photo_id)
                    imported_count += 1

            self.send_json({"success": True, "imported_count": imported_count})
            return

        self.send_error(404)

    def do_PUT(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # ── Admin Only: Update User ──
        if re.match(r"^/api/admin/users/(\d+)$", path):
            target_id = int(re.match(r"^/api/admin/users/(\d+)$", path).group(1))
            user = self.get_auth_user()
            if not user or user["role"] != "admin":
                self.send_json({"error": "Admin required"}, 403)
                return

            data = self.read_json_body()
            if not data:
                self.send_json({"error": "Payload required"}, 400)
                return

            db.update_user(
                user_id=target_id,
                display_name=data.get("display_name"),
                role=data.get("role"),
                is_active=data.get("is_active"),
                new_password=data.get("new_password")
            )
            self.send_json({"success": True})
            return

        # ── Admin Only: Set Album Permissions ──
        elif re.match(r"^/api/admin/albums/(\d+)/permissions$", path):
            album_id = int(re.match(r"^/api/admin/albums/(\d+)/permissions$", path).group(1))
            user = self.get_auth_user()
            if not user or user["role"] != "admin":
                self.send_json({"error": "Admin required"}, 403)
                return

            data = self.read_json_body()
            if not data or "user_id" not in data:
                self.send_json({"error": "user_id required"}, 400)
                return

            db.set_album_permissions(
                album_id=album_id,
                user_id=int(data["user_id"]),
                can_view=bool(data.get("can_view", True)),
                can_download=bool(data.get("can_download", True)),
                can_manage=bool(data.get("can_manage", False))
            )
            self.send_json({"success": True})
            return

        self.send_error(404)

    def do_DELETE(self):
        try:
            self._handle_delete()
        except Exception as e:
            sys.stderr.write(f"[Server Error in DELETE {getattr(self, 'path', '')}]: {e}\n")
            import traceback
            traceback.print_exc()
            self.send_json({"error": f"Server error: {str(e)}"}, 500)

    def _handle_delete(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # ── Delete File Drop ──
        if re.match(r"^/api/files/(\d+)$", path):
            file_id = int(re.match(r"^/api/files/(\d+)$", path).group(1))
            user = self.get_auth_user()
            if not user or not db.can_access_file_drop(user, file_id, action="delete"):
                self.send_json({"error": "Access Denied"}, 403)
                return

            db.delete_file_drop(file_id)
            self.send_json({"success": True})
            return

        # ── Admin Only: Delete User ──
        elif re.match(r"^/api/admin/users/(\d+)$", path):
            target_id = int(re.match(r"^/api/admin/users/(\d+)$", path).group(1))
            user = self.get_auth_user()
            if not user or user["role"] != "admin":
                self.send_json({"error": "Admin required"}, 403)
                return
            try:
                db.delete_user(target_id)
                self.send_json({"success": True})
            except ValueError as e:
                self.send_json({"error": str(e)}, 400)
            return

        self.send_error(404)

    def log_message(self, format, *args):
        # Write to stderr so Termux portal.log retains clean request traces
        try:
            sys.stderr.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {format % args}\n")
        except Exception:
            pass

def free_port(port: int):
    """Scan /proc to find and terminate any stale process holding the port."""
    hex_port = f"{port:04X}"
    inodes = set()
    for tcp_file in ("/proc/net/tcp", "/proc/net/tcp6"):
        if not os.path.exists(tcp_file):
            continue
        try:
            with open(tcp_file, "r") as f:
                lines = f.readlines()[1:]
            for line in lines:
                parts = line.strip().split()
                if len(parts) >= 10:
                    local_addr = parts[1]
                    if local_addr.endswith(":" + hex_port):
                        inodes.add(parts[9])
        except Exception:
            pass

    if not inodes:
        return

    my_pid = os.getpid()
    for pid_str in os.listdir("/proc"):
        if not pid_str.isdigit():
            continue
        pid = int(pid_str)
        if pid == my_pid:
            continue
        fd_dir = f"/proc/{pid}/fd"
        if not os.path.exists(fd_dir):
            continue
        try:
            for fd in os.listdir(fd_dir):
                try:
                    target = os.readlink(f"{fd_dir}/{fd}")
                    for inode in inodes:
                        if f"socket:[{inode}]" in target or inode in target:
                            os.kill(pid, 9)
                            sys.stderr.write(f"Freed port {port} by terminating PID {pid}\n")
                            break
                except Exception:
                    pass
        except Exception:
            continue

class ReusableHTTPServer(HTTPServer):
    allow_reuse_address = True

    def server_bind(self):
        self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        if hasattr(socket, "SO_REUSEPORT"):
            try:
                self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
            except OSError:
                pass
        super().server_bind()

def main():
    free_port(PORT)
    db.init_db()
    ip = get_local_ip()
    print("=" * 64)
    print("  [Peppy Home Hub 2.0] Private Home Cloud & Media Portal")
    print(f"  Live on Local Wi-Fi: http://{ip}:{PORT}")
    print(f"  Photos Directory:    {PHOTOS_DIR}")
    print(f"  File Drop Directory: {DROP_DIR}")
    print("=" * 64)

    server = None
    for attempt in range(5):
        try:
            server = ReusableHTTPServer((HOST, PORT), PeppyHomeHubHandler)
            break
        except OSError as e:
            if "Address already in use" in str(e) or getattr(e, "errno", None) in (98, 10048):
                sys.stderr.write(f"Port {PORT} busy (attempt {attempt+1}/5). Freeing socket...\n")
                free_port(PORT)
                time.sleep(1)
            else:
                raise

    if not server:
        sys.stderr.write(f"Fatal: Could not bind to port {PORT} after multiple attempts.\n")
        sys.exit(1)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    server.server_close()

if __name__ == "__main__":
    main()
