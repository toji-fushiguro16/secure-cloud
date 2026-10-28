import { useEffect, useState } from "react";

const API_URL = "http://localhost:5000";
const BACKEND_DOWN_MESSAGE =
  "Cannot connect to backend. Check that Flask is running on port 5000.";

export default function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [mode, setMode] = useState("login");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState(null);

  // Restore an existing session when the page loads
  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const response = await fetch(`${API_URL}/api/me`, {
          method: "GET",
          credentials: "include",
        });

        const data = await response.json();

        if (!cancelled && data.authenticated && data.username) {
          setUsername(data.username);
          setLoggedIn(true);
        }
      } catch {
        if (!cancelled) {
          setMessage(BACKEND_DOWN_MESSAGE);
        }
      }
    }

    checkSession();

    return () => {
      cancelled = true;
    };
  }, []);

  // Load dashboard data once the user is logged in
  useEffect(() => {
    if (loggedIn) {
      loadDashboard();
    }
  }, [loggedIn]);

  async function loadDashboard() {
    try {
      const [alertsResponse, statsResponse] = await Promise.all([
        fetch(`${API_URL}/api/alerts`, { credentials: "include" }),
        fetch(`${API_URL}/api/stats`, { credentials: "include" }),
      ]);

      const alertsData = await alertsResponse.json();
      const statsData = await statsResponse.json();

      if (!alertsResponse.ok || !statsResponse.ok) {
        throw new Error(
          alertsData.error || statsData.error || "Could not load dashboard."
        );
      }

      setAlerts(alertsData.alerts || []);
      setStats(statsData);
      setMessage("");
    } catch (error) {
      setMessage(error.message || "Could not load dashboard.");
    }
  }

  async function handleAuth(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const endpoint = mode === "register" ? "/api/register" : "/api/login";

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Request failed.");
      }

      if (mode === "register") {
        setMessage("Registration successful. Please log in.");
        setMode("login");
        setPassword("");
      } else {
        setUsername(data.username || username);
        setLoggedIn(true);
        setPassword("");
        setMessage("");
      }
    } catch (error) {
      // fetch() network failures show up as a TypeError
      setMessage(
        error instanceof TypeError
          ? BACKEND_DOWN_MESSAGE
          : error.message || BACKEND_DOWN_MESSAGE
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      const response = await fetch(`${API_URL}/api/logout`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Logout failed.");
      }

      setLoggedIn(false);
      setPassword("");
      setAlerts([]);
      setStats(null);
      setMode("login");
      setMessage("You have logged out.");
    } catch (error) {
      setMessage(error.message || "Logout failed.");
    }
  }

  async function handleRefresh() {
    setMessage("");
    await loadDashboard();
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setMessage("");
  }

  // ---------- Dashboard ----------
  if (loggedIn) {
    return (
      <main style={styles.page}>
        <section style={styles.container}>
          <header style={styles.header}>
            <div>
              <h1 style={styles.title}>SecureCloud Defense</h1>
              <p style={styles.welcome}>Welcome, {username}!</p>
            </div>
            <button onClick={handleLogout} style={styles.secondaryButton}>
              Logout
            </button>
          </header>

          <div style={styles.panel}>
            <h2 style={styles.heading}>Security Dashboard</h2>
            <p style={styles.text}>
              System status: {stats?.system_status || "Loading..."}
            </p>

            <div style={styles.stats}>
              <div style={styles.statCard}>
                <h3 style={styles.statLabel}>Total Alerts</h3>
                <p style={styles.statValue}>{stats?.total_alerts ?? "—"}</p>
              </div>
              <div style={styles.statCard}>
                <h3 style={styles.statLabel}>High Severity</h3>
                <p style={styles.statValue}>{stats?.high_severity ?? "—"}</p>
              </div>
              <div style={styles.statCard}>
                <h3 style={styles.statLabel}>Medium Severity</h3>
                <p style={styles.statValue}>{stats?.medium_severity ?? "—"}</p>
              </div>
              <div style={styles.statCard}>
                <h3 style={styles.statLabel}>Low Severity</h3>
                <p style={styles.statValue}>{stats?.low_severity ?? "—"}</p>
              </div>
            </div>

            <div style={styles.alertHeader}>
              <h2 style={styles.heading}>Security Alerts</h2>
              <button onClick={handleRefresh} style={styles.button}>
                Refresh
              </button>
            </div>

            {alerts.length === 0 ? (
              <p style={styles.text}>No alerts to display.</p>
            ) : (
              alerts.map((alert) => (
                <article key={alert.id} style={styles.alertCard}>
                  <h3 style={styles.alertTitle}>{alert.title}</h3>
                  <p style={styles.text}>Severity: {alert.severity}</p>
                  <p style={styles.text}>Status: {alert.status}</p>
                </article>
              ))
            )}
          </div>

          {message && <p style={styles.message}>{message}</p>}
        </section>
      </main>
    );
  }

  // ---------- Login / Register ----------
  return (
    <main style={styles.page}>
      <section style={styles.authCard}>
        <h1 style={styles.title}>SecureCloud Defense</h1>
        <p style={styles.subtitle}>Cloud Security Monitoring System</p>

        <div style={styles.switcher}>
          <button
            type="button"
            onClick={() => switchMode("login")}
            style={mode === "login" ? styles.button : styles.secondaryButton}
          >
            Login
          </button>

          <button
            type="button"
            onClick={() => switchMode("register")}
            style={mode === "register" ? styles.button : styles.secondaryButton}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleAuth} style={styles.form}>
          <label htmlFor="username" style={styles.label}>
            Username
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            minLength={3}
            required
            style={styles.input}
          />

          <label htmlFor="password" style={styles.label}>
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={8}
            required
            style={styles.input}
          />

          <button type="submit" disabled={loading} style={styles.button}>
            {loading
              ? "Please wait..."
              : mode === "register"
                ? "Create Account"
                : "Login"}
          </button>
        </form>

        {message && <p style={styles.message}>{message}</p>}
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    boxSizing: "border-box",
    background: "#0b1220",
    color: "#f8fafc",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "24px",
    fontFamily: "Arial, sans-serif",
    textAlign: "left",
  },
  container: {
    width: "100%",
    maxWidth: "1000px",
  },
  authCard: {
    width: "100%",
    maxWidth: "420px",
    boxSizing: "border-box",
    padding: "32px",
    borderRadius: "16px",
    background: "#172033",
    boxShadow: "0 12px 36px rgba(0,0,0,0.3)",
  },

  // Title fix: explicit size and line-height stop the two lines overlapping
  title: {
    margin: "0 0 8px",
    fontSize: "2rem",
    lineHeight: 1.25,
    fontWeight: "bold",
    letterSpacing: "normal",
  },
  subtitle: {
    margin: 0,
    color: "#cbd5e1",
    lineHeight: 1.5,
  },
  welcome: {
    margin: 0,
    color: "#cbd5e1",
  },
  heading: {
    margin: 0,
    fontSize: "1.4rem",
    lineHeight: 1.3,
  },
  text: {
    margin: "8px 0 0",
    lineHeight: 1.5,
  },
  label: {
    fontSize: "0.95rem",
    lineHeight: 1.4,
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
    marginBottom: "24px",
  },
  panel: {
    background: "#172033",
    padding: "24px",
    borderRadius: "16px",
  },
  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "12px",
    margin: "20px 0",
  },
  statCard: {
    background: "#243047",
    borderRadius: "12px",
    padding: "16px",
  },
  statLabel: {
    margin: 0,
    fontSize: "0.95rem",
    color: "#cbd5e1",
    lineHeight: 1.4,
  },
  statValue: {
    margin: "8px 0 0",
    fontSize: "1.6rem",
    fontWeight: "bold",
  },
  alertHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    marginTop: "24px",
  },
  alertCard: {
    background: "#243047",
    padding: "16px",
    marginTop: "12px",
    borderRadius: "10px",
    borderLeft: "4px solid #38bdf8",
  },
  alertTitle: {
    margin: 0,
    fontSize: "1.05rem",
    lineHeight: 1.4,
  },
  switcher: {
    display: "flex",
    gap: "12px",
    margin: "20px 0",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  input: {
    boxSizing: "border-box",
    width: "100%",
    padding: "12px",
    borderRadius: "8px",
    border: "1px solid #475569",
    background: "#0f172a",
    color: "#f8fafc",
    fontSize: "1rem",
  },
  button: {
    padding: "12px 16px",
    border: "none",
    borderRadius: "8px",
    background: "#2563eb",
    color: "white",
    cursor: "pointer",
    fontWeight: "bold",
  },
  secondaryButton: {
    padding: "12px 16px",
    border: "1px solid #475569",
    borderRadius: "8px",
    background: "#334155",
    color: "white",
    cursor: "pointer",
  },
  message: {
    marginTop: "16px",
    padding: "12px",
    borderRadius: "8px",
    background: "#243047",
    overflowWrap: "anywhere",
  },
};