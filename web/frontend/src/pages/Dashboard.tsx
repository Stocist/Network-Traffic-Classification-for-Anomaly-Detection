import { SidebarNav } from "../components/SidebarNav"

const metricCards = [
  { label: "Macro-F1", value: "0.850", detail: "Last training – UNSW LR" },
  { label: "PR-AUC", value: "0.930", detail: "Higher is better for imbalanced datasets." },
  { label: "Recall", value: "0.950", detail: "Target: catch above 95% malicious flows." }
]

export function DashboardPage() {
  return (
    <div className="dashboard">
      <aside className="dashboard-sidebar">
        <SidebarNav />
      </aside>
      <section className="dashboard-content">
        <header className="hero">
          <h2>Operational dashboard</h2>
          <p>
            This static dashboard mirrors the design before backend wiring. It highlights the monochrome look, card
            spacing, and placeholder metrics used during the design phase.
          </p>
          <div className="hero-actions">
            <button className="secondary-btn" type="button">
              Upload dataset
            </button>
          </div>
        </header>

        <section className="metric-grid">
          {metricCards.map((card) => (
            <article key={card.label} className="metric">
              <p className="metric-label">{card.label}</p>
              <p className="metric-value">{card.value}</p>
              <p className="metric-note">{card.detail}</p>
            </article>
          ))}
        </section>

        <section className="chart-card">
          <h3>PR Curve (example)</h3>
          <p>Placeholder chart retained from the original concept.</p>
          <p>PR curve placeholder</p>
        </section>
      </section>
    </div>
  )
}
