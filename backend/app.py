import os
import sqlite3
import secrets
from datetime import timedelta

from dotenv import load_dotenv
from flask import Flask, jsonify, request, session, g
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE = os.path.join(BASE_DIR, "securecloud.db")

app = Flask(__name__)

# Set SECRET_KEY in your .env file. The fallback changes on every restart,
# which logs everyone out, so use a fixed value in .env.
app.secret_key = os.getenv("SECRET_KEY") or secrets.token_hex(32)

app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=False,  # keep False on http://localhost
    PERMANENT_SESSION_LIFETIME=timedelta(hours=8),
)

CORS(
    app,
    supports_credentials=True,
    origins=["http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",],
)

# ---------- Database helpers ----------
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(_error):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = sqlite3.connect(DATABASE)
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            severity TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    # Seed sample alerts the first time only
    count = db.execute("SELECT COUNT(*) FROM alerts").fetchone()[0]
    if count == 0:
        sample_alerts = [
            ("Multiple failed login attempts", "High", "Open"),
            ("Unusual data transfer to external IP", "High", "Investigating"),
            ("Storage bucket made public", "High", "Open"),
            ("New admin user created", "Medium", "Open"),
            ("Login from a new location", "Medium", "Resolved"),
            ("Outdated SSL certificate detected", "Medium", "Investigating"),
            ("Firewall rule modified", "Low", "Resolved"),
            ("Password changed", "Low", "Resolved"),
        ]
        db.executemany(
            "INSERT INTO alerts (title, severity, status) VALUES (?, ?, ?)",
            sample_alerts,
        )

    db.commit()
    db.close()


def login_required():
    """Return an error response if not logged in, else None."""
    if "user_id" not in session:
        return jsonify({"error": "Please log in first."}), 401
    return None


# ---------- Auth routes ----------
@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))

    if len(username) < 3:
        return jsonify({"error": "Username must be at least 3 characters."}), 400
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters."}), 400

    db = get_db()
    existing = db.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing:
        return jsonify({"error": "Username already exists."}), 409

    db.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        (username, generate_password_hash(password)),
    )
    db.commit()

    return jsonify({"message": "Registration successful."}), 201


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))

    if not username or not password:
        return jsonify({"error": "Username and password are required."}), 400

    db = get_db()
    user = db.execute(
        "SELECT * FROM users WHERE username = ?", (username,)
    ).fetchone()

    if user is None or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Invalid username or password."}), 401

    session.clear()
    session.permanent = True
    session["user_id"] = user["id"]
    session["username"] = user["username"]

    return jsonify({"message": "Login successful.", "username": user["username"]})


@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "Logged out."})


@app.route("/api/me", methods=["GET"])
def me():
    if "user_id" in session:
        return jsonify({"authenticated": True, "username": session.get("username")})
    return jsonify({"authenticated": False})


# ---------- Dashboard routes ----------
@app.route("/api/alerts", methods=["GET"])
def get_alerts():
    error = login_required()
    if error:
        return error

    rows = get_db().execute(
        """
        SELECT id, title, severity, status
        FROM alerts
        ORDER BY
            CASE severity WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END,
            id DESC
        """
    ).fetchall()

    return jsonify({"alerts": [dict(row) for row in rows]})


@app.route("/api/stats", methods=["GET"])
def get_stats():
    error = login_required()
    if error:
        return error

    db = get_db()

    def count(severity=None):
        if severity:
            return db.execute(
                "SELECT COUNT(*) FROM alerts WHERE severity = ?", (severity,)
            ).fetchone()[0]
        return db.execute("SELECT COUNT(*) FROM alerts").fetchone()[0]

    high = count("High")
    medium = count("Medium")
    low = count("Low")

    return jsonify(
        {
            "system_status": "Attention needed" if high > 0 else "All systems normal",
            "total_alerts": count(),
            "high_severity": high,
            "medium_severity": medium,
            "low_severity": low,
        }
    )


@app.route("/")
def index():
    return jsonify({"service": "SecureCloud Defense API", "status": "running"})


if __name__ == "__main__":
    init_db()
    app.run(host="127.0.0.1", port=5000, debug=True)