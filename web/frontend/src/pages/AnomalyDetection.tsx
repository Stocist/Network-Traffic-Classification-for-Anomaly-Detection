import { useCallback, useEffect, useMemo, useState, useRef } from "react"
import { FaDownload, FaSort, FaSortUp, FaSortDown } from "react-icons/fa"
import { DatasetUploadButton } from "../components/DatasetUploadButton"
import { PredictionCharts, PortHeatmapSection } from "../components/PredictionCharts"
import { SidebarNav } from "../components/SidebarNav"
import { FilterPanel } from "../components/FilterPanel"
import { ErrorAlert } from "../components/ErrorAlert"
import { LoadingOverlay } from "../components/LoadingOverlay"
import { useInferenceResults } from "../context/InferenceResultsContext"
import { useLinkedVisualization } from "../hooks/useLinkedVisualization"
import { exportToCSV } from "../utils/export"
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
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc")
  
  // * Ref for scrolling to table
  const tableRef = useRef<HTMLDivElement>(null)
  
  // * Initialize linked visualization hook
  const {
    filters,
    filteredData,
    updateFilter,
    clearFilter,
    clearAllFilters,
    activeFilterCount
  } = useLinkedVisualization(state.predictions)

  useEffect(() => {
    setCurrentPage(1)
  }, [state.resultId, sortMode])
  
  // * Reset current page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [activeFilterCount])
  
  // * Handle column sorting
  const handleColumnSort = useCallback((column: string) => {
    if (sortColumn === column) {
      // Toggle direction
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('desc')
    }
  }, [sortColumn])

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
    // * Use filtered data from linked visualization hook
    const workingData = filteredData.length > 0 ? filteredData : state.predictions
    
    if (workingData.length === 0) {
      return EMPTY_TABLE
    }

    // Re-sort client side so analysts can scan anomalies first without re-fetching data.
    const sortedPredictions = [...workingData]
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
    
    // * Apply column-based sorting if active
    if (sortColumn) {
      sortedPredictions.sort((a, b) => {
        let aVal: any
        let bVal: any
        
        if (sortColumn === 'row_index') {
          aVal = a.row_index
          bVal = b.row_index
        } else if (sortColumn === 'prediction') {
          aVal = a.prediction
          bVal = b.prediction
        } else if (sortColumn === 'score') {
          aVal = a.score ?? -1
          bVal = b.score ?? -1
        } else {
          aVal = a.data[sortColumn]
          bVal = b.data[sortColumn]
        }
        
        // Handle null/undefined
        if (aVal == null) aVal = ''
        if (bVal == null) bVal = ''
        
        // Compare
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
        }
        
        const aStr = String(aVal)
        const bStr = String(bVal)
        return sortDirection === 'asc' 
          ? aStr.localeCompare(bStr)
          : bStr.localeCompare(aStr)
      })
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
  }, [state.predictions, filteredData, sortMode, positiveLabel, sortColumn, sortDirection])

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
  
  // * Export filtered results as CSV
  const handleExportFiltered = useCallback(() => {
    const dataToExport = filteredData.length > 0 ? filteredData : state.predictions
    if (dataToExport.length === 0) {
      alert('No data to export')
      return
    }
    exportToCSV(dataToExport, 'anomaly_detection_results.csv')
  }, [filteredData, state.predictions])
  
  // * Scroll to results table
  const handleJumpToTable = useCallback(() => {
    tableRef.current?.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'start'
    })
    // Add a flash animation to highlight the table
    tableRef.current?.classList.add('table-flash')
    setTimeout(() => {
      tableRef.current?.classList.remove('table-flash')
    }, 1500)
  }, [])

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
  
  // * Extract available filter options from charts data for consistency
  const availableFilterOptions = useMemo(() => {
    // * Get attack types from attack_taxonomy (consistent with polar chart)
    const attackTypes = state.charts?.attack_taxonomy 
      ? Object.keys(state.charts.attack_taxonomy).sort()
      : []
    
    // * Get services from top_destination_ports (consistent with bar chart)
    const services = state.charts?.top_destination_ports 
      ? state.charts.top_destination_ports.map(item => item.port).slice(0, 10)
      : []
    
    return {
      attackTypes,
      services
    }
  }, [state.charts])

  return (
    <div className="inference-wrapper">
      {/* * Loading overlay */}
      {isLoading && <LoadingOverlay message="Processing dataset and running anomaly detection..." />}
      
      <aside className="inference-sidebar">
        <SidebarNav />
        
        {state.predictions.length > 0 && (
          <div className="filter-panel-sticky">
            <FilterPanel
              filters={filters}
              filteredCount={filteredData.length}
              totalCount={state.predictions.length}
              onClearFilter={clearFilter}
              onClearAll={clearAllFilters}
              onJumpToTable={handleJumpToTable}
              availableAttackTypes={availableFilterOptions.attackTypes}
              availableServices={availableFilterOptions.services}
              onFilterChange={updateFilter}
            />
          </div>
        )}
      </aside>

      <section className="inference-content">
        <header className="hero">
          <div>
            <p className="eyebrow">Anomaly detection workspace</p>
            <h2>Static anomaly detection demo</h2>
            <p>
              This workspace now connects to the FastAPI backend. Upload a CSV to run the trained logistic regression model
              and inspect predictions, charts, and downloadable results.
            </p>
          </div>
          <div className="hero-actions" style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '1rem' }}>
            <DatasetUploadButton
              buttonText="Upload Dataset"
              helperText="Accepts CSV files only."
              onFileSelected={handleUpload}
              disabled={isLoading}
            />
            {hasResults && (
              <button 
                className="secondary-btn" 
                type="button" 
                onClick={handleDownload}
              >
                <FaDownload style={{ marginRight: '0.5rem' }} />
                Download Results
              </button>
            )}
          </div>
          {state.validation && !isLoading ? (
            <p className="upload-status" style={{ marginTop: '0.75rem' }}>
              Rows processed: {state.validation.row_count.toLocaleString()}
              {state.validation.downsampled ? (
                <span style={{ color: '#f57c00', marginLeft: '0.5rem' }}>
                  (Sampled {samplingPercent ?? "80"}% of {state.validation.original_row_count?.toLocaleString()})
                </span>
              ) : null}
            </p>
          ) : null}
          {error ? <ErrorAlert error={error} onRetry={() => clearError()} onDismiss={clearError} /> : null}
        </header>

        <PredictionCharts 
          charts={state.charts} 
          predictions={filteredData}
          onFilterChange={updateFilter}
          activeFilters={filters}
        />

        <section className="table-card" ref={tableRef}>
          <div className="table-header">
            <div>
              <h3>Detection results</h3>
              <p>
                {hasResults
                  ? `Showing ${tableData.rows.length.toLocaleString()} ${activeFilterCount > 0 ? 'filtered ' : ''}results`
                  : "Upload a dataset to populate the table with model predictions."}
              </p>
            </div>
            {hasResults && (
              <button 
                className="btn-export" 
                onClick={handleExportFiltered}
                title="Export current view as CSV"
              >
                <FaDownload /> Export Results
              </button>
            )}
          </div>
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
                    <th key={column}>
                      <span 
                        className="sortable-header"
                        onClick={() => handleColumnSort(column)}
                        title={`Sort by ${column}`}
                      >
                        {column}
                        {sortColumn === column ? (
                          sortDirection === 'asc' ? 
                            <FaSortUp className="sort-icon active" /> : 
                            <FaSortDown className="sort-icon active" />
                        ) : (
                          <FaSort className="sort-icon" />
                        )}
                      </span>
                    </th>
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
                          
                          // * Enhanced prediction cell with badge
                          if (column === "prediction") {
                            const normalized = cellValue.toLowerCase()
                            const isAttack = normalized === "attack" || normalized === "1"
                            return (
                              <td key={column}>
                                <span className={`label-badge ${isAttack ? "attack" : "normal"}`}>
                                  {cellValue}
                                </span>
                              </td>
                            )
                          }
                          
                          // * Enhanced score cell with visual bar
                          if (column === "score" && cellValue) {
                            const score = parseFloat(cellValue)
                            const scoreClass = score > 0.7 ? 'high' : score > 0.4 ? 'medium' : 'low'
                            return (
                              <td key={column}>
                                <div className="score-bar">
                                  <div className={`score-fill ${scoreClass}`} style={{ width: `${score * 100}%` }}>
                                    <span className="score-text">{cellValue}</span>
                                  </div>
                                </div>
                              </td>
                            )
                          }
                          
                          return <td key={column}>{cellValue}</td>
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
