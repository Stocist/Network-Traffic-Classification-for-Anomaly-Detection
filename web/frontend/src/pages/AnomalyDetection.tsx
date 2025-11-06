import { useCallback, useEffect, useMemo, useState } from "react"
import { DatasetUploadButton } from "../components/DatasetUploadButton"
import { PredictionCharts } from "../components/PredictionCharts"
import { SidebarNav } from "../components/SidebarNav"
import { useInferenceResults } from "../context/InferenceResultsContext"
import { formatSamplingPercent } from "../utils/format"

const ROWS_PER_PAGE = 10
const PREFERRED_COLUMNS = [
  "src_ip",
  "dst_ip",
  "sport",
  "dport",
  "dst_port",
  "protocol",
  "protocol_type",
  "service",
  "flag",
  "timestamp"
]

type TableData = {
  columns: string[]
  rows: Record<string, string>[]
  hasScore: boolean
}

const EMPTY_TABLE: TableData = {
  columns: [],
  rows: [],
  hasScore: false
}

export function AnomalyDetectionPage() {
  const { state, submitDataset, isLoading, error, clearError, getDownloadUrl } = useInferenceResults()
  const [currentPage, setCurrentPage] = useState(1)
  const [sortMode, setSortMode] = useState<"original" | "attack-first" | "normal-first">("original")

  useEffect(() => {
    setCurrentPage(1)
  }, [state.resultId, sortMode])

  // Derive the label that should be treated as anomalous when toggling sort modes.
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

  const tableData = useMemo<TableData>(() => {
    if (state.predictions.length === 0) {
      return EMPTY_TABLE
    }

    // Re-sort client side so analysts can scan anomalies first without re-fetching data.
    const sortedPredictions = [...state.predictions]
    if (sortMode === "attack-first" || sortMode === "normal-first") {
      sortedPredictions.sort((a, b) => {
        const aIsPositive = a.prediction === positiveLabel
        const bIsPositive = b.prediction === positiveLabel
        if (aIsPositive === bIsPositive) {
          return a.row_index - b.row_index
        }
        if (sortMode === "attack-first") {
          return aIsPositive ? -1 : 1
        }
        return aIsPositive ? 1 : -1
      })
    } else {
      sortedPredictions.sort((a, b) => a.row_index - b.row_index)
    }

    const hasScore = state.predictions.some((row) => row.score != null)
    const dataKeys = new Set<string>()
    sortedPredictions.forEach((row) => {
      Object.keys(row.data).forEach((key) => {
        dataKeys.add(key)
      })
    })

    const orderedPreferred = PREFERRED_COLUMNS.filter((column) => dataKeys.has(column))
    const remaining = Array.from(dataKeys).filter((column) => !orderedPreferred.includes(column))

    const columns: string[] = ["row_index", "prediction"]
    if (hasScore) {
      columns.push("score")
    }
    // Keep key network identifiers near the prediction results, then append any other observed fields.
    columns.push(...orderedPreferred, ...remaining)

    const rows = sortedPredictions.map((row) => {
      const formatted: Record<string, string> = {
        row_index: String(row.row_index),
        prediction: String(row.prediction)
      }
      if (hasScore) {
        formatted.score = row.score != null ? row.score.toFixed(3) : ""
      }
      columns.forEach((column) => {
        if (column === "row_index" || column === "prediction" || column === "score") {
          return
        }
        const value = row.data[column]
        if (value === null || value === undefined) {
          formatted[column] = ""
        } else if (typeof value === "number") {
          formatted[column] = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(3)
        } else {
          formatted[column] = String(value)
        }
      })
      return formatted
    })

    return { columns, rows, hasScore }
  }, [state.predictions, sortMode, positiveLabel])

  const totalPages = Math.max(1, Math.ceil(tableData.rows.length / ROWS_PER_PAGE))
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * ROWS_PER_PAGE
    const end = start + ROWS_PER_PAGE
    return tableData.rows.slice(start, end)
  }, [tableData.rows, currentPage])

  const handlePageChange = useCallback(
    (direction: "prev" | "next") => {
      setCurrentPage((prev) => {
        if (direction === "prev") {
          return Math.max(1, prev - 1)
        }
        return Math.min(totalPages, prev + 1)
      })
    },
    [totalPages]
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

  const handleDownload = useCallback(() => {
    const url = getDownloadUrl()
    if (!url) {
      return
    }
    window.open(url, "_blank")
  }, [getDownloadUrl])

  const samplingPercent = useMemo(() => {
    if (!state.validation?.downsampled) {
      return null
    }
    const fraction =
      state.validation.sampling_fraction ??
      (state.validation.original_row_count
        ? state.validation.row_count / state.validation.original_row_count
        : null)
    return formatSamplingPercent(fraction)
  }, [state.validation])

  const hasResults = tableData.rows.length > 0

  return (
    <div className="inference">
      <aside className="inference-sidebar">
        <SidebarNav />
      </aside>

      <section className="inference-content">
        <header className="hero">
          <p className="eyebrow">Anomaly detection workspace</p>
          <h2>Static anomaly detection demo</h2>
          <p>
            This workspace now connects to the FastAPI backend. Upload a CSV to run the trained logistic regression model
            and inspect predictions, charts, and downloadable results.
          </p>
        </header>

        <section className="card-grid card-grid--balanced">
          <article className="card">
            <h3>Select model</h3>
            <p>Current: UNSW - LR (Binary)</p>
            <button className="secondary-btn" type="button" disabled>
              Start detection
            </button>
          </article>
          <article className="card">
            <h3>Export</h3>
            <p>Download the latest prediction run as CSV.</p>
            <button className="secondary-btn" type="button" onClick={handleDownload} disabled={!hasResults}>
              Download results
            </button>
          </article>
          <article className="card">
            <h3>Dataset upload</h3>
            <p>Bring a CSV to simulate running anomaly detection against custom flows.</p>
            <DatasetUploadButton
              helperText="Accepts CSV files only."
              onFileSelected={handleUpload}
              disabled={isLoading}
            />
            {isLoading ? <p className="upload-status">Processing dataset...</p> : null}
            {state.validation && !isLoading ? (
              <>
                <p className="upload-status">
                  Rows processed: {state.validation.row_count.toLocaleString()}
                </p>
                {state.validation.downsampled ? (
                  <p className="upload-helper upload-helper--notice">
                    Sampled {samplingPercent ?? "80"}% of{" "}
                    {state.validation.original_row_count?.toLocaleString()} rows for this run.
                  </p>
                ) : null}
              </>
            ) : null}
            {error ? <p className="upload-error">{error}</p> : null}
          </article>
        </section>

        <div className="anomaly-visualization-stack">
          <PredictionCharts charts={state.charts} predictions={state.predictions} />
        </div>

        <section className="table-card">
          <h3>Detection results</h3>
          <p>
            {hasResults
              ? "Review predictions with client-side pagination."
              : "Upload a dataset to populate the table with model predictions."}
          </p>
          <div className="table-controls">
            <label>
              Sort order:{" "}
              <select
                value={sortMode}
                onChange={(event) =>
                  setSortMode(
                    event.target.value as "original" | "attack-first" | "normal-first"
                  )
                }
              >
                <option value="original">Original order</option>
                <option value="attack-first">{positiveLabel} first</option>
                <option value="normal-first">Normal first</option>
              </select>
            </label>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {tableData.columns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={tableData.columns.length || 1}>No data available.</td>
                  </tr>
                ) : (
                  paginatedRows.map((row, idx) => (
                    <tr key={`${row.row_index}-${idx}`}>
                      {tableData.columns.map((column) => (
                        (() => {
                          const cellValue = row[column] ?? ""
                          if (column !== "prediction") {
                            return <td key={column}>{cellValue}</td>
                          }
                          const normalized = cellValue.toLowerCase()
                          const classNames = [
                            "prediction-cell",
                            normalized === "attack" ? "prediction-cell--attack" : "",
                            normalized === "normal" ? "prediction-cell--normal" : ""
                          ]
                            .filter(Boolean)
                            .join(" ")
                          return (
                            <td key={column} className={classNames}>
                              {cellValue}
                            </td>
                          )
                        })()
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {hasResults ? (
            <div className="pagination">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => handlePageChange("prev")}
                disabled={currentPage === 1}
              >
                Previous
              </button>
              <span className="pagination-status">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => handlePageChange("next")}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>
          ) : null}
        </section>
      </section>
    </div>
  )
}
