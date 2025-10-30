import { useEffect, useState } from "react"
import { NavLink, Outlet } from "react-router-dom"

const navLinks = [
  { path: "/dashboard", label: "Dashboard" },
  { path: "/inference", label: "Anomaly Detection" },
  { path: "/time-series", label: "Time Series" },
  { path: "/contact", label: "Contact Us" }
]

export function Layout() {
  const melbourneTime = useMelbourneTime()
  const currentYear = new Date().getFullYear()

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="brand">
          <h1>NETWORK TRAFFIC CLASSIFICATION</h1>
          <p className="brand-subtitle">Anomaly Detection Workspace</p>
        </div>
        <nav>
          {navLinks.map((link) => (
            <NavLink
              key={link.path}
              to={link.path}
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="site-main">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-column footer-contact">
            <p className="footer-title footer-title-inline">
              Contact <span className="footer-highlight">Network Traffic Lab</span>
            </p>
            <p>abc123@gmail.com</p>
            <p>+61 432 232 456</p>
          </div>
          <div className="footer-column footer-status">
            <p className="footer-title">Current time (Melbourne)</p>
            <p className="footer-time">{melbourneTime}</p>
            <p className="footer-note">Australian Eastern Daylight Time</p>
          </div>
          <div className="footer-column footer-nav-column">
            <p className="footer-title">Navigation</p>
            <div className="footer-nav-vertical">
              {navLinks.map((link) => (
                <NavLink key={link.path} to={link.path} className="footer-nav-link">
                  {link.label}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

function useMelbourneTime() {
  const [time, setTime] = useState(() => formatMelbourneTime())

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTime(formatMelbourneTime())
    }, 60_000)

    return () => window.clearInterval(interval)
  }, [])

  return time
}

function formatMelbourneTime() {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Australia/Melbourne",
    timeZoneName: "short"
  }).format(new Date())
}
