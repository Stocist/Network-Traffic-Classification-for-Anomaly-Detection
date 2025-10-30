import { NavLink } from "react-router-dom"

const sidebarLinks = [
  { path: "/dashboard", label: "Dashboard", description: "Overview & metrics" },
  { path: "/inference", label: "Anomaly Detection", description: "Batch & streaming detection" },
  { path: "/time-series", label: "Time Series", description: "Trend monitoring" }
]

export function SidebarNav() {
  return (
    <nav className="sidebar-nav" aria-label="Sidebar">
      {sidebarLinks.map((link) => (
        <NavLink
          key={link.path}
          to={link.path}
          className={({ isActive }) => (isActive ? "sidebar-link active" : "sidebar-link")}
        >
          <span className="sidebar-link__label">{link.label}</span>
          <small>{link.description}</small>
        </NavLink>
      ))}
    </nav>
  )
}
