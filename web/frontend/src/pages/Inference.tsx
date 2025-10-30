import { SidebarNav } from "../components/SidebarNav"

const rows = [
  { src: "10.0.0.12", dst: "203.0.113.5", protocol: "TCP", score: "0.91", label: "Attack" },
  { src: "10.0.0.9", dst: "198.51.100.8", protocol: "UDP", score: "0.08", label: "Normal" },
  { src: "10.0.0.7", dst: "203.0.113.21", protocol: "TCP", score: "0.67", label: "Attack" },
  { src: "10.0.0.44", dst: "203.0.113.77", protocol: "ICMP", score: "0.12", label: "Normal" }
]

export function InferencePage() {
  return (
    <div className="inference">
      <aside className="inference-sidebar">
        <SidebarNav />
        <div className="info-card">
          <h3>Threshold (attack prediction)</h3>
          <p>Shift the slider to balance precision versus recall.</p>
          <input type="range" min="0" max="100" defaultValue="50" />
        </div>
        <div className="info-card">
          <h3>Anomaly rules</h3>
          <p>One-class heuristics layered over model scores.</p>
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

      <section className="inference-content">
        <header className="hero">
          <p className="eyebrow">Anomaly detection workspace</p>
          <h2>Static anomaly detection demo</h2>
          <p>
            This page shows the layout before FastAPI integration. It keeps the controls, cards, and table used to
            present logistic regression anomaly scores.
          </p>
        </header>

        <section className="card-grid">
          <article className="card">
            <h3>Select model</h3>
            <p>Current: UNSW - LR (Binary)</p>
            <button className="secondary-btn" type="button">
              Start detection
            </button>
          </article>
          <article className="card">
            <h3>Export</h3>
            <p>Download predictions sample (CSV or JSON).</p>
            <button className="secondary-btn" type="button">
              Download example
            </button>
          </article>
          <article className="card">
            <h3>Health checks</h3>
            <ul>
              <li>OneHotEncoder handle_unknown equals ignore.</li>
              <li>Median or mode imputations applied.</li>
              <li>Schema validated against meta JSON.</li>
            </ul>
          </article>
        </section>

        <section className="table-card">
          <h3>Detection results (demo)</h3>
          <p>Static entries mirroring the earlier prototype.</p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>src_ip</th>
                  <th>dst_ip</th>
                  <th>protocol</th>
                  <th>score</th>
                  <th>label</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.src + row.dst}>
                    <td>{row.src}</td>
                    <td>{row.dst}</td>
                    <td>{row.protocol}</td>
                    <td>{row.score}</td>
                    <td className={row.label === "Attack" ? "status-negative" : "status-positive"}>{row.label}</td>
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
