#!/usr/bin/env python3
"""
Peppy Home Hub 2.0 — Database, Authentication, and Permissions Engine
Uses SQLite3 (standard library). Fast, persistent, ACID-compliant.
Enforces strict default-deny authorization on all media and files.
"""

import os
import sqlite3
import hashlib
import secrets
import time
from typing import Optional, Dict, Any, List

DB_PATH = os.environ.get("PEPPY_DB_PATH", os.path.expanduser("~/.pocket-mc/portal/peppy_hub.db"))

def get_connection() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    """Create all tables and default administrator if missing."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.executescript("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        display_name TEXT,
        role TEXT NOT NULL DEFAULT 'member', -- 'admin', 'member', 'guest'
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        last_login INTEGER
    );

    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS albums (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        cover_photo_id INTEGER,
        access_policy TEXT NOT NULL DEFAULT 'restricted', -- 'public', 'restricted'
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS album_permissions (
        album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        can_view INTEGER NOT NULL DEFAULT 1,
        can_download INTEGER NOT NULL DEFAULT 1,
        can_manage INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (album_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        filepath TEXT NOT NULL,
        thumbnail_path TEXT,
        caption TEXT,
        date_taken TEXT,
        file_size INTEGER,
        width INTEGER,
        height INTEGER,
        media_type TEXT DEFAULT 'image',
        uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS album_photos (
        album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
        photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
        added_at INTEGER NOT NULL,
        PRIMARY KEY (album_id, photo_id)
    );

    CREATE TABLE IF NOT EXISTS favorites (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        photo_id INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, photo_id)
    );

    CREATE TABLE IF NOT EXISTS file_drops (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        filepath TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        uploader_name TEXT,
        visibility TEXT NOT NULL DEFAULT 'public', -- 'public', 'private', 'admin_only'
        uploaded_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    );
    """)

    conn.commit()

    # Check if any admin exists
    cursor.execute("SELECT COUNT(*) as count FROM users WHERE role = 'admin'")
    row = cursor.fetchone()
    if row["count"] == 0:
        # Create default administrator account
        # Username: admin, default initial password: PeppyAdmin2026!
        salt = secrets.token_hex(16)
        pw_hash = hash_password("PeppyAdmin2026!", salt)
        cursor.execute("""
            INSERT INTO users (username, password_hash, salt, display_name, role, is_active, created_at)
            VALUES (?, ?, ?, ?, 'admin', 1, ?)
        """, ("admin", pw_hash, salt, "Server Administrator", int(time.time())))

        # Create a default "Family Favorites" album
        cursor.execute("""
            INSERT INTO albums (title, description, access_policy, created_at)
            VALUES (?, ?, 'public', ?)
        """, ("Family Memories", "Shared family album accessible to household members", int(time.time())))

        conn.commit()

    conn.close()

# ── Password & Cryptography ──

def hash_password(password: str, salt: str) -> str:
    """PBKDF2-HMAC-SHA256 with 100,000 iterations."""
    return hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    ).hex()

def verify_password(password: str, stored_hash: str, salt: str) -> bool:
    calc_hash = hash_password(password, salt)
    return secrets.compare_digest(calc_hash, stored_hash)

# ── User Management ──

def create_user(username: str, password: str, display_name: str = "", role: str = "member") -> Optional[int]:
    username = username.strip().lower()
    if not username or len(username) < 3:
        raise ValueError("Username must be at least 3 characters")
    if len(password) < 6:
        raise ValueError("Password must be at least 6 characters")
    if role not in ("admin", "member", "guest"):
        role = "member"

    salt = secrets.token_hex(16)
    pw_hash = hash_password(password, salt)

    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO users (username, password_hash, salt, display_name, role, is_active, created_at)
            VALUES (?, ?, ?, ?, ?, 1, ?)
        """, (username, pw_hash, salt, display_name or username.capitalize(), role, int(time.time())))
        user_id = cursor.lastrowid
        conn.commit()
        return user_id
    except sqlite3.IntegrityError:
        raise ValueError("Username already exists")
    finally:
        conn.close()

def authenticate(username: str, password: str) -> Optional[Dict[str, Any]]:
    username = username.strip().lower()
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
    user = cursor.fetchone()

    if not user or not user["is_active"]:
        conn.close()
        return None

    if not verify_password(password, user["password_hash"], user["salt"]):
        conn.close()
        return None

    # Generate session token (valid for 30 days)
    token = secrets.token_hex(32)
    now = int(time.time())
    expires_at = now + (30 * 86400)

    cursor.execute("""
        INSERT INTO sessions (token, user_id, created_at, expires_at)
        VALUES (?, ?, ?, ?)
    """, (token, user["id"], now, expires_at))

    cursor.execute("UPDATE users SET last_login = ? WHERE id = ?", (now, user["id"]))
    conn.commit()
    conn.close()

    return {
        "token": token,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "display_name": user["display_name"],
            "role": user["role"]
        }
    }

def get_user_by_session(token: str) -> Optional[Dict[str, Any]]:
    if not token:
        return None
    conn = get_connection()
    cursor = conn.cursor()
    now = int(time.time())

    cursor.execute("""
        SELECT u.id, u.username, u.display_name, u.role, u.is_active
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = ? AND s.expires_at > ? AND u.is_active = 1
    """, (token, now))

    row = cursor.fetchone()
    conn.close()
    if row:
        return dict(row)
    return None

def revoke_session(token: str):
    conn = get_connection()
    conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()

def list_users() -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, username, display_name, role, is_active, created_at, last_login
        FROM users ORDER BY role = 'admin' DESC, username ASC
    """)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def update_user(user_id: int, display_name: Optional[str] = None, role: Optional[str] = None, is_active: Optional[bool] = None, new_password: Optional[str] = None):
    conn = get_connection()
    cursor = conn.cursor()

    if display_name is not None:
        cursor.execute("UPDATE users SET display_name = ? WHERE id = ?", (display_name, user_id))
    if role is not None and role in ("admin", "member", "guest"):
        cursor.execute("UPDATE users SET role = ? WHERE id = ?", (role, user_id))
    if is_active is not None:
        cursor.execute("UPDATE users SET is_active = ? WHERE id = ?", (1 if is_active else 0, user_id))
        if not is_active:
            # Invalidate all active sessions for disabled user
            cursor.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
    if new_password:
        salt = secrets.token_hex(16)
        pw_hash = hash_password(new_password, salt)
        cursor.execute("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?", (pw_hash, salt, user_id))

    conn.commit()
    conn.close()

def delete_user(user_id: int):
    conn = get_connection()
    # Prevent deleting the last admin
    cursor = conn.cursor()
    cursor.execute("SELECT role FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    if row and row["role"] == "admin":
        cursor.execute("SELECT COUNT(*) as count FROM users WHERE role = 'admin'")
        if cursor.fetchone()["count"] <= 1:
            conn.close()
            raise ValueError("Cannot delete the only administrator account")

    cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()

# ── Permissions Checking Engine (Strict Default-Deny) ──

def can_access_album(user: Dict[str, Any], album_id: int, action: str = "view") -> bool:
    """Enforce authorization on album access."""
    if not user:
        return False
    if user["role"] == "admin":
        return True

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT created_by, access_policy FROM albums WHERE id = ?", (album_id,))
    album = cursor.fetchone()
    if not album:
        conn.close()
        return False

    if album["created_by"] == user["id"]:
        conn.close()
        return True

    if album["access_policy"] == "public" and action in ("view", "download"):
        conn.close()
        return True

    # Check granular user permission
    cursor.execute("""
        SELECT can_view, can_download, can_manage FROM album_permissions
        WHERE album_id = ? AND user_id = ?
    """, (album_id, user["id"]))
    perm = cursor.fetchone()
    conn.close()

    if not perm:
        return False

    if action == "view":
        return bool(perm["can_view"])
    elif action == "download":
        return bool(perm["can_download"])
    elif action == "manage":
        return bool(perm["can_manage"])
    return False

def can_access_photo(user: Dict[str, Any], photo_id: int, action: str = "view") -> bool:
    """
    Enforce authorization on photo access.
    Checks if photo was uploaded by user OR is present in at least one album the user can access.
    """
    if not user:
        return False
    if user["role"] == "admin":
        return True

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT uploaded_by FROM photos WHERE id = ?", (photo_id,))
    photo = cursor.fetchone()
    if not photo:
        conn.close()
        return False

    if photo["uploaded_by"] == user["id"]:
        conn.close()
        return True

    # Check albums containing this photo
    cursor.execute("""
        SELECT a.id, a.access_policy, a.created_by, ap.can_view, ap.can_download
        FROM album_photos map
        JOIN albums a ON map.album_id = a.id
        LEFT JOIN album_permissions ap ON ap.album_id = a.id AND ap.user_id = ?
        WHERE map.photo_id = ?
    """, (user["id"], photo_id))

    rows = cursor.fetchall()
    conn.close()

    for r in rows:
        if r["created_by"] == user["id"]:
            return True
        if r["access_policy"] == "public" and action in ("view", "download"):
            return True
        if action == "view" and r["can_view"]:
            return True
        if action == "download" and r["can_download"]:
            return True

    return False

def can_access_file_drop(user: Dict[str, Any], file_id: int, action: str = "download") -> bool:
    """Enforce authorization on file drop uploads/downloads/deletions."""
    if not user:
        return False
    if user["role"] == "admin":
        return True

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT uploaded_by, visibility FROM file_drops WHERE id = ?", (file_id,))
    f = cursor.fetchone()
    conn.close()
    if not f:
        return False

    is_owner = f["uploaded_by"] == user["id"]
    if action == "delete":
        return is_owner or user["role"] == "admin"

    if action == "download":
        if is_owner:
            return True
        if f["visibility"] == "public":
            return True
        if f["visibility"] == "admin_only":
            return user["role"] == "admin"
        return False

    return False

# ── Photos & Albums API ──

def get_authorized_albums(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()

    if user["role"] == "admin":
        cursor.execute("""
            SELECT a.*, COUNT(ap.photo_id) as photo_count
            FROM albums a
            LEFT JOIN album_photos ap ON a.id = ap.album_id
            GROUP BY a.id
            ORDER BY a.created_at DESC
        """)
    else:
        cursor.execute("""
            SELECT a.*, COUNT(DISTINCT ap.photo_id) as photo_count
            FROM albums a
            LEFT JOIN album_photos ap ON a.id = ap.album_id
            LEFT JOIN album_permissions perm ON a.id = perm.album_id AND perm.user_id = ?
            WHERE a.access_policy = 'public' 
               OR a.created_by = ?
               OR perm.can_view = 1
            GROUP BY a.id
            ORDER BY a.created_at DESC
        """, (user["id"], user["id"]))

    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_authorized_photos(user: Dict[str, Any], album_id: Optional[int] = None, search: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()

    query = """
        SELECT DISTINCT p.id, p.filename, p.caption, p.date_taken, p.file_size, p.width, p.height, p.media_type, p.created_at,
               (SELECT COUNT(*) FROM favorites fav WHERE fav.photo_id = p.id AND fav.user_id = ?) as is_favorite
        FROM photos p
    """
    params = [user["id"]]
    joins = []
    wheres = []

    if user["role"] != "admin":
        joins.append("""
            LEFT JOIN album_photos map ON p.id = map.photo_id
            LEFT JOIN albums a ON map.album_id = a.id
            LEFT JOIN album_permissions perm ON a.id = perm.album_id AND perm.user_id = ?
        """)
        params.append(user["id"])
        wheres.append("(p.uploaded_by = ? OR a.access_policy = 'public' OR perm.can_view = 1)")
        params.append(user["id"])

    if album_id:
        if "map" not in "".join(joins):
            joins.append("JOIN album_photos map ON p.id = map.photo_id")
        wheres.append("map.album_id = ?")
        params.append(album_id)

    if search:
        wheres.append("(p.caption LIKE ? OR p.filename LIKE ?)")
        params.extend([f"%{search}%", f"%{search}%"])

    full_sql = query + " " + " ".join(joins)
    if wheres:
        full_sql += " WHERE " + " AND ".join(wheres)

    full_sql += " ORDER BY p.date_taken DESC, p.created_at DESC"

    cursor.execute(full_sql, params)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def add_photo(filename: str, filepath: str, thumbnail_path: str, file_size: int, user_id: int, caption: str = "", date_taken: Optional[str] = None, width: int = 0, height: int = 0) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    now = int(time.time())
    date_str = date_taken or time.strftime("%Y-%m-%d", time.localtime(now))

    cursor.execute("""
        INSERT INTO photos (filename, filepath, thumbnail_path, caption, date_taken, file_size, width, height, uploaded_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (filename, filepath, thumbnail_path, caption, date_str, file_size, width, height, user_id, now))

    photo_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return photo_id

def create_album(title: str, description: str = "", access_policy: str = "restricted", user_id: Optional[int] = None) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO albums (title, description, access_policy, created_by, created_at)
        VALUES (?, ?, ?, ?, ?)
    """, (title, description, access_policy, user_id, int(time.time())))
    album_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return album_id

def set_album_permissions(album_id: int, user_id: int, can_view: bool = True, can_download: bool = True, can_manage: bool = False):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO album_permissions (album_id, user_id, can_view, can_download, can_manage)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(album_id, user_id) DO UPDATE SET
            can_view = excluded.can_view,
            can_download = excluded.can_download,
            can_manage = excluded.can_manage
    """, (album_id, user_id, 1 if can_view else 0, 1 if can_download else 0, 1 if can_manage else 0))
    conn.commit()
    conn.close()

def get_album_permissions(album_id: int) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT u.id as user_id, u.username, u.display_name, ap.can_view, ap.can_download, ap.can_manage
        FROM album_permissions ap
        JOIN users u ON ap.user_id = u.id
        WHERE ap.album_id = ?
    """, (album_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def assign_photo_to_album(album_id: int, photo_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR IGNORE INTO album_photos (album_id, photo_id, added_at)
        VALUES (?, ?, ?)
    """, (album_id, photo_id, int(time.time())))
    # Set cover photo if missing
    cursor.execute("UPDATE albums SET cover_photo_id = ? WHERE id = ? AND cover_photo_id IS NULL", (photo_id, album_id))
    conn.commit()
    conn.close()

def toggle_favorite(user_id: int, photo_id: int) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM favorites WHERE user_id = ? AND photo_id = ?", (user_id, photo_id))
    exists = cursor.fetchone()
    if exists:
        cursor.execute("DELETE FROM favorites WHERE user_id = ? AND photo_id = ?", (user_id, photo_id))
        is_fav = False
    else:
        cursor.execute("INSERT INTO favorites (user_id, photo_id, created_at) VALUES (?, ?, ?)", (user_id, photo_id, int(time.time())))
        is_fav = True
    conn.commit()
    conn.close()
    return is_fav

# ── File Drop Management ──

def add_file_drop(filename: str, filepath: str, file_size: int, user_id: Optional[int], uploader_name: str, visibility: str = "public") -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO file_drops (filename, filepath, file_size, uploaded_by, uploader_name, visibility, uploaded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (filename, filepath, file_size, user_id, uploader_name, visibility, int(time.time())))
    file_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return file_id

def get_authorized_file_drops(user: Dict[str, Any]) -> List[Dict[str, Any]]:
    conn = get_connection()
    cursor = conn.cursor()
    if user["role"] == "admin":
        cursor.execute("SELECT * FROM file_drops ORDER BY uploaded_at DESC LIMIT 100")
    else:
        cursor.execute("""
            SELECT * FROM file_drops
            WHERE visibility = 'public' OR uploaded_by = ?
            ORDER BY uploaded_at DESC LIMIT 100
        """, (user["id"],))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def delete_file_drop(file_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT filepath FROM file_drops WHERE id = ?", (file_id,))
    row = cursor.fetchone()
    if row and os.path.exists(row["filepath"]):
        try:
            os.remove(row["filepath"])
        except Exception:
            pass
    cursor.execute("DELETE FROM file_drops WHERE id = ?", (file_id,))
    conn.commit()
    conn.close()
