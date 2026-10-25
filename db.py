import os
import sqlite3
from datetime import date, timedelta

DB_PATH = os.getenv("DB_PATH", "wajibot.db")


def _connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = _connect()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id            INTEGER PRIMARY KEY,
            chat_id            INTEGER NOT NULL,
            name               TEXT NOT NULL,
            tracking_streak    INTEGER NOT NULL DEFAULT 0,
            pushup_streak      INTEGER NOT NULL DEFAULT 0,
            last_checkin_date  TEXT,
            created_at         TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS checkins (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id      INTEGER NOT NULL,
            checkin_date TEXT NOT NULL,
            km           REAL NOT NULL,
            pushups      INTEGER NOT NULL,
            created_at   TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, checkin_date)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT
        )
    """)
    conn.commit()
    conn.close()


def register_user(user_id, chat_id, name):
    conn = _connect()
    conn.execute(
        "INSERT INTO users (user_id, chat_id, name) VALUES (?,?,?) "
        "ON CONFLICT(user_id) DO UPDATE SET name = excluded.name, chat_id = excluded.chat_id",
        (user_id, chat_id, name),
    )
    conn.commit()
    conn.close()
    if get_setting("challenge_start_date") is None:
        set_setting("challenge_start_date", date.today().isoformat())


def get_user(user_id):
    conn = _connect()
    row = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
    conn.close()
    return row


def get_all_users():
    conn = _connect()
    rows = conn.execute("SELECT * FROM users").fetchall()
    conn.close()
    return rows


def record_checkin(user_id, checkin_date, km, pushups):
    """Records today's answers and updates streaks. Returns (tracking_streak, pushup_streak, recorded).
    recorded=False if this user already checked in for checkin_date."""
    conn = _connect()
    try:
        conn.execute(
            "INSERT INTO checkins (user_id, checkin_date, km, pushups) VALUES (?,?,?,?)",
            (user_id, checkin_date, km, int(pushups)),
        )
    except sqlite3.IntegrityError:
        conn.close()
        return None, None, False

    row = conn.execute(
        "SELECT tracking_streak, pushup_streak, last_checkin_date FROM users WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    tracking_streak, pushup_streak, last_checkin_date = (
        row["tracking_streak"], row["pushup_streak"], row["last_checkin_date"]
    )

    checkin_dt = date.fromisoformat(checkin_date)
    yesterday = (checkin_dt - timedelta(days=1)).isoformat()

    if last_checkin_date == yesterday:
        tracking_streak += 1
        pushup_streak = pushup_streak + 1 if pushups else 0
    else:
        tracking_streak = 1
        pushup_streak = 1 if pushups else 0

    conn.execute(
        "UPDATE users SET tracking_streak = ?, pushup_streak = ?, last_checkin_date = ? WHERE user_id = ?",
        (tracking_streak, pushup_streak, checkin_date, user_id),
    )
    conn.commit()
    conn.close()
    return tracking_streak, pushup_streak, True


def has_checked_in(user_id, checkin_date):
    conn = _connect()
    row = conn.execute(
        "SELECT 1 FROM checkins WHERE user_id = ? AND checkin_date = ?", (user_id, checkin_date)
    ).fetchone()
    conn.close()
    return row is not None


def get_total_km(user_id):
    conn = _connect()
    row = conn.execute("SELECT COALESCE(SUM(km), 0) AS total FROM checkins WHERE user_id = ?", (user_id,)).fetchone()
    conn.close()
    return row["total"]


def get_tracked_days(user_id):
    conn = _connect()
    row = conn.execute("SELECT COUNT(*) AS c FROM checkins WHERE user_id = ?", (user_id,)).fetchone()
    conn.close()
    return row["c"]


def get_pushup_days(user_id):
    conn = _connect()
    row = conn.execute(
        "SELECT COUNT(*) AS c FROM checkins WHERE user_id = ? AND pushups = 1", (user_id,)
    ).fetchone()
    conn.close()
    return row["c"]


def set_setting(key, value):
    conn = _connect()
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )
    conn.commit()
    conn.close()


def get_setting(key, default=None):
    conn = _connect()
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    conn.close()
    return row["value"] if row else default
