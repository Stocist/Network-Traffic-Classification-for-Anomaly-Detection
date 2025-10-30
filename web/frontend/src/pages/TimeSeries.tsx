import { SidebarNav } from "../components/SidebarNav"

const flagged = [
  { t: 40, actual: "112.0", pred: "40.2", z: "7.91", ifScore: "1.00", sigma: "Yes", ifFlag: "Yes" },
  { t: 47, actual: "104.6", pred: "41.5", z: "6.42", ifScore: "0.98", sigma: "Yes", ifFlag: "Yes" }
]

export function TimeSeriesPage() {
  return (
    <div className="time-series">
      <aside className="inference-sidebar">
        <SidebarNav />
        <div className="info-card">
          <h3>Threshold (attack prediction)</h3>
          <p>Supervised helper when comparing with binary models.</p>
          <input type="range" min="0" max="100" defaultValue="50" />
        </div>
        <div className="info-card">
          <h3>Anomaly rules</h3>
          <p>One-class heuristics layered over IsolationForest scores.</p>
          <label>
            3 sigma (|z| greater than sigma)
            <input type="range" min="1" max="5" defaultValue="3" />
          </label>
          <label>
            IsolationForest greater or equal
            <input type="range" min="0" max="100" defaultValue="80" />
          </label>
        </div>
      </aside>

      <section className="time-series-content">
        <header className="hero">
          <p className="eyebrow">Time series monitoring</p>
          <h2>One-class dashboard snapshot</h2>
          <p>
            Placeholder charts and table illustrating throughput, z-score, and IsolationForest scores before real time
            scoring was added.
          </p>
        </header>

        <section className="card-grid">
          <article className="card">
            <h3>Target</h3>
            <p>Filter by institution or IP, review last 24 hours.</p>
          </article>
          <article className="card">
            <h3>Rules</h3>
            <ul>
              <li>3 sigma: absolute z greater than sigma indicates anomaly.</li>
              <li>IsolationForest score above threshold indicates anomaly.</li>
            </ul>
          </article>
        </section>

        <section className="chart-strip">
          <p className="chart-placeholder">Throughput placeholder</p>
          <div className="chart-row">
            <p className="chart-placeholder">Z score placeholder</p>
            <p className="chart-placeholder">IsolationForest placeholder</p>
          </div>
        </section>

        <section className="table-card">
          <h3>Flagged windows</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>t</th>
                  <th>actual</th>
                  <th>pred</th>
                  <th>z</th>
                  <th>IF score</th>
                  <th>3 sigma</th>
                  <th>IF</th>
                </tr>
              </thead>
              <tbody>
                {flagged.map((row) => (
                  <tr key={row.t}>
                    <td>{row.t}</td>
                    <td>{row.actual}</td>
                    <td>{row.pred}</td>
                    <td>{row.z}</td>
                    <td>{row.ifScore}</td>
                    <td className={row.sigma === "Yes" ? "status-negative" : "status-positive"}>{row.sigma}</td>
                    <td className={row.ifFlag === "Yes" ? "status-negative" : "status-positive"}>{row.ifFlag}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </div>
  )
}
