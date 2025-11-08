import { useCallback, useMemo } from "react"
import { DatasetUploadButton } from "../components/DatasetUploadButton"
import { SidebarNav } from "../components/SidebarNav"
import { PRCurveChart } from "../components/PRCurveChart"
import { useInferenceResults } from "../context/InferenceResultsContext"
import { formatSamplingPercent } from "../utils/format"

const FALLBACK_CARDS = [
  { label: "Macro-F1", value: "0.850", detail: "Last training - UNSW LR" },
  { label: "PR-AUC", value: "0.930", detail: "Higher is better for imbalanced datasets." },
  { label: "Recall", value: "0.950", detail: "Target: catch above 95% malicious flows." }
]

export function DashboardPage() {
  const { state, submitDataset, isLoading, error, clearError } = useInferenceResults()

  const positiveLabel = useMemo(() => {
    const counts = state.charts?.label_breakdown.counts
    if (!counts) {
      return "Attack"
    }
    if ("Attack" in counts) {
      return "Attack"
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
    return sorted[0]?.[0] ?? "Attack"
  }, [state.charts])

  const samplingFraction = useMemo(() => {
    if (!state.validation?.downsampled) {
      return null
    }
    if (state.validation.sampling_fraction != null) {
      return state.validation.sampling_fraction
    }
    if (state.validation.original_row_count) {
      return state.validation.row_count / state.validation.original_row_count
    }
    return null
  }, [state.validation])

  const samplingPercent = useMemo(
    () => formatSamplingPercent(samplingFraction),
    [samplingFraction]
  )

  const handleUpload = useCallback(
    async (file: File) => {
      clearError()
      try {
        await submitDataset(file)
      } catch {
        /* error handled via context state */
      }
    },
    [submitDataset, clearError]
  )

  const metrics = useMemo(() => {
    if (!state.validation) {
      return FALLBACK_CARDS
    }

    const counts = state.charts?.label_breakdown.counts ?? {}
    const anomalies = counts[positiveLabel] ?? 0
    const processedRows = state.validation.row_count
    const originalRows = state.validation.original_row_count ?? processedRows
    const normal = processedRows - anomalies
    const processedDetail = state.validation.downsampled
      ? `Sampled ${samplingPercent ?? "80"}% of ${originalRows.toLocaleString()} rows`
      : "Latest upload"

    return [
      { label: "Rows processed", value: processedRows.toLocaleString(), detail: processedDetail },
      { label: "Anomalies flagged", value: anomalies.toLocaleString(), detail: `Label: ${positiveLabel}` },
      { label: "Normal predictions", value: Math.max(normal, 0).toLocaleString(), detail: "Non-attack flows" }
    ]
  }, [state.validation, state.charts, positiveLabel, samplingPercent])

  return (
    <div className="dashboard">
      <aside className="dashboard-sidebar">
        <SidebarNav />
      </aside>
      <section className="dashboard-content">
        <header className="hero">
          <h2>Batch Predictions Dashboard</h2>
          <p>
            Upload a CSV in <strong>UNSW-NB15 format</strong> for batch processing. The system validates the schema and returns predictions with visualizations.
          </p>
          <p style={{fontSize: '0.9rem', color: '#666', marginTop: '0.5rem'}}>
            <a href="/template.csv" download style={{color: '#1976d2', textDecoration: 'underline'}}>
              Download template CSV
            </a> with required headers (46 features).
          </p>
          <div className="hero-actions">
            <DatasetUploadButton
              buttonText="Upload UNSW-NB15 Dataset"
              helperText="Maximum: 50,000 rows (larger files will be auto-sampled)."
              onFileSelected={handleUpload}
              disabled={isLoading}
            />
            {isLoading ? <p className="upload-status">Processing dataset...</p> : null}
            {error ? <p className="upload-error">{error}</p> : null}
            {state.validation?.downsampled ? (
              <p className="upload-helper upload-helper--notice">
                Processed {state.validation.row_count.toLocaleString()} rows ({samplingPercent ?? "80"}%) sampled from{" "}
                {state.validation.original_row_count?.toLocaleString()} total.
              </p>
            ) : null}
          </div>
        </header>

        <section className="metric-grid">
          {metrics.map((card) => (
            <article key={card.label} className="metric">
              <p className="metric-label">{card.label}</p>
              <p className="metric-value">{card.value}</p>
              <p className="metric-note">{card.detail}</p>
            </article>
          ))}
        </section>

        <section className="chart-card chart-card--wide">
          <h3>Precision-Recall Curve</h3>
          <p>
            Explore how precision and recall trade off as you adjust the score threshold. Move the slider to highlight
            the active operating point and watch the curve animate.
          </p>
          <PRCurveChart
            predictions={state.predictions}
            columns={state.columns}
            positiveLabelHint={positiveLabel}
          />
        </section>
      </section>
    </div>
  )
}
