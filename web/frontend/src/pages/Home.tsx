import { useCallback, useState } from "react"
import { Link } from "react-router-dom"
import { DatasetUploadButton } from "../components/DatasetUploadButton"
import { useInferenceResults } from "../context/InferenceResultsContext"
import { formatSamplingPercent } from "../utils/format"

const DATASET_FEATURES = [
  {
    name: "Flow metadata",
    summary: "Pair-level attributes that capture where the traffic is coming from and going to.",
    example: "src_ip, dst_ip, src_port, dst_port, protocol"
  },
  {
    name: "Session statistics",
    summary: "Rolling measures that highlight outliers in packet intensity or payload volume.",
    example: "dur, bytes, packets, rate, flow_pkts_s"
  },
  {
    name: "Content signatures",
    summary: "Deep packet flags that help distinguish benign versus malignant payload behaviour.",
    example: "service, state, flag, content_flags"
  },
  {
    name: "Temporal context",
    summary: "Timestamps and windows that reveal spikes or coordinated bursts.",
    example: "timestamp, flow_start, hour_of_day, weekday"
  }
]

const INTRUSION_STAGES = [
  {
    title: "Reconnaissance",
    detail: "High-volume scans and sweeps probe exposed services ahead of credential stuffing.",
    indicator: "dst_port counts exploding for SSH (22) and RDP (3389)"
  },
  {
    title: "Initial foothold",
    detail: "Brute force and exploit attempts escalate privilege before lateral movement.",
    indicator: "Repeated failed authentications followed by long-lived sessions"
  },
  {
    title: "Command & control",
    detail: "Beacon traffic fans out to external controllers with regular heartbeat cadence.",
    indicator: "Low-byte flows at 60s intervals to rare Autonomous Systems"
  },
  {
    title: "Exfiltration",
    detail: "Data staging and extraction leverage uncommon ports and compressed payloads.",
    indicator: "Large outbound transfers to unfamiliar destinations overnight"
  }
]

const DATASET_CHECKLIST = [
  "Include the 49 engineered UNSW-NB15 features or map your dataset to the same schema.",
  "Ensure timestamps are UTC or provide timezone metadata for temporal alignment.",
  "Strip personally identifiable information prior to upload to comply with policy.",
  "Cap row size at 5M when preparing batches; oversized files will be sampled for evaluation."
]

const QUICK_FACTS = [
  { label: "Reference dataset", value: "UNSW-NB15", note: "2.5M flows, 9 attack families" },
  { label: "Baseline F1", value: "0.87", note: "Logistic regression benchmark" },
  { label: "Turnaround SLA", value: "< 5 min", note: "Batch prediction processing" }
]

type ValidationModalTone = "success" | "warning" | "error"

type ValidationModalState = {
  title: string
  message: string
  tone: ValidationModalTone
  bullets?: string[]
}

export function HomePage() {
  const { submitDataset, clearError, isLoading } = useInferenceResults()
  const [modalState, setModalState] = useState<ValidationModalState | null>(null)

  const closeModal = useCallback(() => {
    setModalState(null)
  }, [])

  const handleSampleUpload = useCallback(
    async (file: File) => {
      clearError()
      setModalState(null)
      try {
        const payload = await submitDataset(file)
        const validation = payload.validation
        const missing = validation.missing_columns ?? []
        const extra = validation.extra_columns ?? []

        const bullets: string[] = []
        if (missing.length) {
          const preview = missing.slice(0, 12).join(", ")
          const remaining = missing.length > 12 ? ` (+${missing.length - 12} more)` : ""
          bullets.push(`Missing required columns: ${preview}${remaining}`)
        }
        if (extra.length && missing.length === 0) {
          const preview = extra.slice(0, 12).join(", ")
          const remaining = extra.length > 12 ? ` (+${extra.length - 12} more)` : ""
          bullets.push(`Extra columns detected (ignored during inference): ${preview}${remaining}`)
        }
        if (validation.downsampled) {
          const percent = formatSamplingPercent(validation.sampling_fraction) ?? "80"
          const original = validation.original_row_count
          bullets.push(
            `Large dataset detected — validated on ${percent}% of ${
              original ? original.toLocaleString() : "the uploaded"
            } rows for a quick check.`
          )
        }

        if (missing.length) {
          setModalState({
            title: "Required features missing",
            message: "We found gaps in your CSV schema. Add the columns listed below and try again.",
            tone: "error",
            bullets
          })
        } else if (extra.length) {
          setModalState({
            title: "CSV validated with warnings",
            message:
              "All mandatory features are present. Extra columns will be ignored when you run anomaly detection.",
            tone: "warning",
            bullets
          })
        } else {
          setModalState({
            title: "CSV ready for anomaly detection",
            message: "All required features are present. You're good to proceed to the anomaly detection workspace.",
            tone: "success",
            bullets
          })
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to validate the dataset. Please try again in a moment."
        setModalState({
          title: "Validation failed",
          message,
          tone: "error"
        })
      }
    },
    [clearError, submitDataset]
  )

  return (
    <>
      <div className="home">
      <section className="home-hero">
        <div className="home-hero__copy">
          <p className="eyebrow">Network Traffic Classification</p>
          <h2>From raw packet captures to actionable intrusion intelligence</h2>
          <p>
            Explore how the anomaly detection workspace inspects large volumes of flow telemetry, highlights suspicious
            activity, and keeps analysts in the loop with explainable context.
          </p>
          <div className="home-hero__actions">
            <Link to="/inference" className="primary-btn">
              Run detection
            </Link>
            <Link to="/dashboard" className="ghost-btn">
              View live metrics
            </Link>
          </div>
        </div>
        <dl className="home-hero__stats">
          {QUICK_FACTS.map((fact) => (
            <div key={fact.label} className="home-stat">
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
              <span>{fact.note}</span>
            </div>
          ))}
        </dl>
      </section>

      <section className="home-features">
        <div className="section-header">
          <p className="eyebrow">Dataset blueprint</p>
          <h3>Features you should capture before pressing upload</h3>
          <p>
            The pipeline expects a tidy CSV with consistent column naming. Use the quick examples as a checklist while
            exporting from your SIEM, NetFlow collector, or packet broker.
          </p>
        </div>
        <div className="home-feature-grid">
          {DATASET_FEATURES.map((feature) => (
            <article key={feature.name} className="home-feature-card">
              <h4>{feature.name}</h4>
              <p>{feature.summary}</p>
              <div className="home-feature-example">
                <span>Example snippet</span>
                <code>{feature.example}</code>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="home-intrusion">
        <div className="section-header">
          <p className="eyebrow">Intrusion storyline</p>
          <h3>Follow the attack chain to understand what the model flags</h3>
          <p>
            Map your telemetry to each phase of the intrusion kill chain. The richer the context, the easier it is to
            triage alerts and trace adversary movement.
          </p>
        </div>
        <div className="home-intrusion-grid">
          {INTRUSION_STAGES.map((stage) => (
            <article key={stage.title} className="home-intrusion-card">
              <h4>{stage.title}</h4>
              <p>{stage.detail}</p>
              <div className="home-intrusion-indicator">
                <span>Signal to watch</span>
                <strong>{stage.indicator}</strong>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="home-checklist">
        <div className="section-header">
          <p className="eyebrow">Upload readiness</p>
          <h3>Last checks before sending data to the anomaly detector</h3>
        </div>
        <ul className="home-checklist-list">
          {DATASET_CHECKLIST.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <div className="home-checklist-actions">
          <Link to="/contact" className="secondary-btn">
            Talk to the response team
          </Link>
          <DatasetUploadButton
            buttonText="Validate a sample CSV"
            buttonClassName="ghost-btn"
            helperText="Upload here to check required features without leaving this page."
            onFileSelected={handleSampleUpload}
            disabled={isLoading}
          />
        </div>
      </section>
    </div>
    {modalState ? (
      <div className="modal-backdrop" role="presentation" onClick={closeModal}>
        <div
          className={`modal-card modal-card--${modalState.tone}`}
          role="dialog"
          aria-modal="true"
          onClick={(event) => event.stopPropagation()}
        >
          <h4>{modalState.title}</h4>
          <p>{modalState.message}</p>
          {modalState.bullets && modalState.bullets.length ? (
            <ul className="modal-list">
              {modalState.bullets.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          ) : null}
          <div className="modal-actions">
            <button type="button" className="primary-btn" onClick={closeModal}>
              Close
            </button>
          </div>
        </div>
      </div>
    ) : null}
  </>
)
}
