import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ChangeEvent, MouseEvent } from "react"
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  TimeScale,
  Tooltip
} from "chart.js"
import type { ChartData, ChartOptions } from "chart.js"
import { Line, getElementAtEvent } from "react-chartjs-2"
import "chartjs-adapter-date-fns"
import { DatasetUploadButton } from "../components/DatasetUploadButton"
import { SidebarNav } from "../components/SidebarNav"
import { useInferenceResults } from "../context/InferenceResultsContext"

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, TimeScale, Tooltip, Legend, Filler)

const TIMESTAMP_KEYS = ["timestamp", "time", "event_time", "datetime", "capture_time"]
const DEST_PORT_KEYS = ["dst_port", "dport", "destination_port", "dest_port", "dstport"]
const SERVICE_KEYS = ["service"]
const PROTOCOL_KEYS = ["protocol", "protocol_type"]

function findKey(keys: string[], available: Set<string>): string | null {
  const lowerMap = new Map<string, string>()
  available.forEach((value) => lowerMap.set(value.toLowerCase(), value))
  for (const candidate of keys) {
    const match = lowerMap.get(candidate)
    if (match) {
      return match
    }
  }
  return null
}

function coerceDate(value: unknown): Date | null {
  if (value == null) {
    return null
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value
  }
  if (typeof value === "number") {
    const millis = value > 1e12 ? value : value * 1000
    const date = new Date(millis)
    return Number.isNaN(date.getTime()) ? null : date
  }
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) {
      return null
    }
    const direct = new Date(trimmed)
    if (!Number.isNaN(direct.getTime())) {
      return direct
    }
    const numeric = Number(trimmed)
    if (!Number.isNaN(numeric)) {
      const millis = numeric > 1e12 ? numeric : numeric * 1000
      const date = new Date(millis)
      return Number.isNaN(date.getTime()) ? null : date
    }
  }
  return null
}

function movingAverage(values: number[], windowSize: number): number[] {
  if (windowSize <= 1) {
    return values.map((value) => Number.isFinite(value) ? value : 0)
  }
  const averaged: number[] = []
  let sum = 0
  const queue: number[] = []

  values.forEach((value) => {
    const safeValue = Number.isFinite(value) ? value : 0
    sum += safeValue
    queue.push(safeValue)
    if (queue.length > windowSize) {
      sum -= queue.shift()!
    }
    averaged.push(sum / queue.length)
  })

  return averaged
}

type SummaryStats = {
  max: number
  average: number
  current: number
}

function summarizeSeries(values: number[]): SummaryStats | null {
  const filtered = values.filter((value) => Number.isFinite(value))
  if (filtered.length === 0) {
    return null
  }
  const max = Math.max(...filtered)
  const average = filtered.reduce((acc, value) => acc + value, 0) / filtered.length
  const current = filtered[filtered.length - 1]
  return { max, average, current }
}

function formatCount(value: number): string {
  if (!Number.isFinite(value)) {
    return "-"
  }
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`
  }
  if (Math.abs(value) >= 100) {
    return value.toFixed(0)
  }
  return value.toFixed(1)
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "-"
  }
  return `${(value * 100).toFixed(1)}%`
}

function formatScore(value: number): string {
  if (!Number.isFinite(value)) {
    return "-"
  }
  return value.toFixed(3)
}

function formatTimestamp(timestamp: number | null | undefined): string {
  if (!timestamp || Number.isNaN(timestamp)) {
    return "N/A"
  }
  return new Date(timestamp).toLocaleString()
}

export function TimeSeriesPage() {
  const { state, submitDataset, isLoading, error, clearError } = useInferenceResults()
  const [bucketMinutes, setBucketMinutes] = useState<number>(30)
  type SeriesKey = "normal" | "anomaly" | "ratio"
  const [seriesVisibility, setSeriesVisibility] = useState<Record<SeriesKey, boolean>>({
    normal: true,
    anomaly: true,
    ratio: false
  })
  const [selectedBucketIndex, setSelectedBucketIndex] = useState<number | null>(null)
  const flowChartRef = useRef<ChartJS<"line", (number | null)[], Date> | null>(null)

  const availableKeys = useMemo(() => {
    const keys = new Set<string>()
    state.predictions.forEach((row) => {
      Object.keys(row.data).forEach((key) => keys.add(key))
    })
    return keys
  }, [state.predictions])

  const timestampKey = useMemo(() => findKey(TIMESTAMP_KEYS, availableKeys), [availableKeys])
  const portKey = useMemo(() => findKey(DEST_PORT_KEYS, availableKeys), [availableKeys])
  const serviceKey = useMemo(() => findKey(SERVICE_KEYS, availableKeys), [availableKeys])
  const protocolKey = useMemo(() => findKey(PROTOCOL_KEYS, availableKeys), [availableKeys])

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

  const anomalies = useMemo(() => {
    return state.predictions
      .filter((row) => row.prediction === positiveLabel)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 12)
      .map((row, index) => ({
        rank: index + 1,
        score: row.score != null ? row.score.toFixed(3) : "-",
        timestamp: timestampKey ? String(row.data[timestampKey] ?? "") : "",
        port: portKey ? String(row.data[portKey] ?? "") : "",
        service: serviceKey ? String(row.data[serviceKey] ?? "") : "",
        protocol: protocolKey ? String(row.data[protocolKey] ?? "") : "",
        rowIndex: row.row_index
      }))
  }, [state.predictions, positiveLabel, portKey, serviceKey, protocolKey, timestampKey])

  const minuteSeries = useMemo(() => {
    if (!timestampKey) {
      return []
    }

    const bucket = new Map<
      number,
      { total: number; anomalies: number; sumScore: number; maxScore: number; scoreCount: number }
    >()

    state.predictions.forEach((row) => {
      const raw = row.data[timestampKey]
      const date = coerceDate(raw)
      if (!date) {
        return
      }
      const minute = new Date(date)
      minute.setSeconds(0, 0)
      const key = minute.getTime()
      if (!bucket.has(key)) {
        bucket.set(key, { total: 0, anomalies: 0, sumScore: 0, maxScore: Number.NEGATIVE_INFINITY, scoreCount: 0 })
      }
      const entry = bucket.get(key)!
      entry.total += 1
      if (row.prediction === positiveLabel) {
        entry.anomalies += 1
      }
      if (typeof row.score === "number" && !Number.isNaN(row.score)) {
        entry.sumScore += row.score
        entry.scoreCount += 1
        entry.maxScore = Math.max(entry.maxScore, row.score)
      }
    })

    if (bucket.size === 0) {
      return []
    }

    return Array.from(bucket.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([timestamp, value]) => ({
        timestamp,
        total: value.total,
        normal: Math.max(value.total - value.anomalies, 0),
        anomalies: value.anomalies,
        avgScore: value.scoreCount > 0 ? value.sumScore / value.scoreCount : null,
        maxScore: value.scoreCount > 0 ? value.maxScore : null,
        scoreSum: value.sumScore,
        scoreCount: value.scoreCount
      }))
  }, [state.predictions, timestampKey, positiveLabel])

  const bucketedSeries = useMemo(() => {
    if (minuteSeries.length === 0) {
      return []
    }
    const bucketMs = bucketMinutes * 60 * 1000
    const buckets = new Map<
      number,
      {
        totalSum: number
        normalSum: number
        anomalySum: number
        scoreSum: number
        scoreCount: number
        peakScore: number
        count: number
      }
    >()

    minuteSeries.forEach((point) => {
      const bucketKey = Math.floor(point.timestamp / bucketMs) * bucketMs
      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, {
          totalSum: 0,
          normalSum: 0,
          anomalySum: 0,
          scoreSum: 0,
          scoreCount: 0,
          peakScore: Number.NEGATIVE_INFINITY,
          count: 0
        })
      }
      const entry = buckets.get(bucketKey)!
      entry.totalSum += point.total
      entry.normalSum += point.normal
      entry.anomalySum += point.anomalies
      if (point.scoreCount && point.scoreCount > 0 && point.scoreSum != null) {
        entry.scoreSum += point.scoreSum
        entry.scoreCount += point.scoreCount
      }
      if (point.maxScore != null) {
        entry.peakScore = Math.max(entry.peakScore, point.maxScore)
      }
      entry.count += 1
    })

    return Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([timestamp, entry]) => {
        const divisor = entry.count || 1
        const normal = entry.normalSum / divisor
        const anomalies = entry.anomalySum / divisor
        const total = entry.totalSum / divisor
        return {
          timestamp,
          normal,
          anomalies,
          total,
          avgScore: entry.scoreCount > 0 ? entry.scoreSum / entry.scoreCount : null,
          maxScore: entry.peakScore === Number.NEGATIVE_INFINITY ? null : entry.peakScore,
          bucketMinutes
        }
      })
  }, [minuteSeries, bucketMinutes])

  useEffect(() => {
    setSelectedBucketIndex(null)
  }, [state.resultId, bucketMinutes, bucketedSeries.length])

  const flowChartData = useMemo<ChartData<"line"> | null>(() => {
    if (bucketedSeries.length === 0) {
      return null
    }

    const labels = bucketedSeries.map((point) => new Date(point.timestamp))
    const normalSeries = bucketedSeries.map((point) => point.normal)
    const anomalySeries = bucketedSeries.map((point) => point.anomalies)
    const ratioSeries = bucketedSeries.map((point) => (point.total === 0 ? 0 : point.anomalies / point.total))
    const overlayWindow = Math.min(ratioSeries.length, Math.max(1, Math.round(30 / bucketMinutes)))
    const ratioOverlay = movingAverage(ratioSeries, overlayWindow)

    return {
      labels,
      datasets: [
        {
          label: "Normal (avg)",
          data: normalSeries,
          fill: "origin",
          borderColor: "#1d4ed8",
          backgroundColor: "rgba(29,78,216,0.24)",
          pointRadius: 0,
          borderWidth: 2,
          tension: 0.3,
          yAxisID: "volume",
          hidden: !seriesVisibility.normal,
          order: 2
        },
        {
          label: "Anomaly (avg)",
          data: anomalySeries,
          fill: false,
          borderColor: "#dc2626",
          backgroundColor: "rgba(220,38,38,0.2)",
          pointRadius: 0,
          borderWidth: 2,
          tension: 0.3,
          yAxisID: "volume",
          hidden: !seriesVisibility.anomaly,
          order: 3
        },
        {
          label: "Anomaly ratio overlay",
          data: ratioOverlay,
          fill: false,
          borderColor: "#0f766e",
          backgroundColor: "rgba(15,118,110,0.18)",
          pointRadius: 0,
          borderWidth: 2,
          borderDash: [6, 4],
          tension: 0.25,
          yAxisID: "ratio",
          hidden: !seriesVisibility.ratio,
          order: 1
        }
      ]
    }
  }, [bucketedSeries, bucketMinutes, seriesVisibility])

  const flowChartOptions = useMemo<ChartOptions<"line">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => {
              const label = context.dataset?.label ?? "Series"
              if (context.dataset?.yAxisID === "ratio" && typeof context.parsed.y === "number") {
                return `${label}: ${formatPercent(context.parsed.y)}`
              }
              if (typeof context.parsed.y === "number") {
                return `${label}: ${context.parsed.y.toLocaleString()} flows`
              }
              return `${label}: ${context.parsed.y}`
            }
          }
        }
      },
      scales: {
        x: {
          type: "time",
          time: { unit: "minute", displayFormats: { minute: "HH:mm" } },
          ticks: { color: "#1f2937" },
          grid: { color: "rgba(148, 163, 184, 0.12)" }
        },
        volume: {
          beginAtZero: true,
          ticks: { color: "#1f2937" },
          grid: { color: "rgba(203, 213, 225, 0.2)" }
        },
        ratio: {
          display: seriesVisibility.ratio,
          position: "right",
          beginAtZero: true,
          suggestedMax: 1,
          ticks: {
            color: "#0f172a",
            callback: (value) => {
              const numeric = typeof value === "number" ? value : Number(value)
              return Number.isFinite(numeric) ? `${Math.round(numeric * 100)}%` : value
            }
          },
          grid: { drawOnChartArea: false }
        }
      }
    }),
    [seriesVisibility]
  )

  const flowSummary = useMemo(() => {
    if (bucketedSeries.length === 0) {
      return null
    }
    const normalSeries = bucketedSeries.map((point) => point.normal)
    const anomalySeries = bucketedSeries.map((point) => point.anomalies)
    return {
      normal: summarizeSeries(normalSeries),
      anomaly: summarizeSeries(anomalySeries)
    }
  }, [bucketedSeries])

  const flowTotals: Record<keyof SummaryStats, number> | null = flowSummary
    ? {
        max: (flowSummary.normal?.max ?? 0) + (flowSummary.anomaly?.max ?? 0),
        average: (flowSummary.normal?.average ?? 0) + (flowSummary.anomaly?.average ?? 0),
        current: (flowSummary.normal?.current ?? 0) + (flowSummary.anomaly?.current ?? 0)
      }
    : null

  const flowValue = (stats: SummaryStats | null | undefined, key: keyof SummaryStats): string => {
    if (!stats) {
      return "-"
    }
    return formatCount(stats[key])
  }

  const flowShare = (stats: SummaryStats | null | undefined, key: keyof SummaryStats): string => {
    if (!stats || !flowTotals) {
      return ""
    }
    const total = flowTotals[key]
    if (!Number.isFinite(total) || total <= 0) {
      return ""
    }
    const ratio = stats[key] / total
    if (!Number.isFinite(ratio) || ratio < 0) {
      return ""
    }
    return ` (${formatPercent(ratio)})`
  }

  const toggleSeries = useCallback((key: SeriesKey) => {
    setSeriesVisibility((prev) => ({
      ...prev,
      [key]: !prev[key]
    }))
  }, [])

  const handleBucketChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setBucketMinutes(Number(event.target.value))
  }, [])

  const handleFlowClick = useCallback(
    (event: MouseEvent<HTMLCanvasElement>) => {
      const chart = flowChartRef.current
      if (!chart) {
        return
      }
      const elements = getElementAtEvent(chart, event)
      if (!elements.length) {
        setSelectedBucketIndex(null)
        return
      }
      setSelectedBucketIndex(elements[0].index)
    },
    []
  )

  const selectedBucket =
    selectedBucketIndex != null && bucketedSeries[selectedBucketIndex]
      ? bucketedSeries[selectedBucketIndex]
      : null

  const selectedRatio =
    selectedBucket && selectedBucket.total
      ? selectedBucket.anomalies / selectedBucket.total
      : null

  const ratioChartData = useMemo(() => {
    if (bucketedSeries.length === 0) {
      return null
    }
    const labels = bucketedSeries.map((point) => new Date(point.timestamp))
    const ratioSeries = bucketedSeries.map((point) => (point.total === 0 ? 0 : point.anomalies / point.total))
    const smoothWindow = Math.min(ratioSeries.length, Math.max(1, Math.round(30 / bucketMinutes)))
    const smoothed = movingAverage(ratioSeries, smoothWindow)
    return {
      labels,
      datasets: [
        {
          label: `Anomaly ratio (${bucketMinutes} min buckets)`,
          data: smoothed,
          fill: "origin",
          borderColor: "#0d9488",
          backgroundColor: "rgba(13, 148, 136, 0.25)",
          pointRadius: 0,
          borderWidth: 2,
          tension: 0.3
        },
        {
          label: "Observed ratio",
          data: ratioSeries,
          fill: false,
          borderColor: "#1d4ed8",
          pointRadius: 0,
          borderWidth: 1.2,
          tension: 0.2
        }
      ]
    }
  }, [bucketedSeries, bucketMinutes])

  const ratioSummary = useMemo(() => {
    if (bucketedSeries.length === 0) {
      return null
    }
    const ratioSeries = bucketedSeries.map((point) => (point.total === 0 ? 0 : point.anomalies / point.total))
    return summarizeSeries(ratioSeries)
  }, [bucketedSeries])

  const scoreChartData = useMemo(() => {
    const scoredPoints = bucketedSeries.filter((point) => point.avgScore != null && point.maxScore != null)
    if (scoredPoints.length === 0) {
      return null
    }
    const labels = scoredPoints.map((point) => new Date(point.timestamp))
    const averageSeries = scoredPoints.map((point) => point.avgScore ?? 0)
    const maxSeries = scoredPoints.map((point) => point.maxScore ?? 0)
    const scoreWindow = Math.min(averageSeries.length, Math.max(1, Math.round(30 / bucketMinutes)))
    const smoothedAverage = movingAverage(averageSeries, scoreWindow)

    return {
      labels,
      datasets: [
        {
          label: `Average score (${bucketMinutes} min buckets)`,
          data: smoothedAverage,
          fill: "origin",
          borderColor: "#6366f1",
          backgroundColor: "rgba(99,102,241,0.22)",
          pointRadius: 0,
          borderWidth: 2,
          tension: 0.35
        },
        {
          label: "Peak score",
          data: maxSeries,
          fill: false,
          borderColor: "#dc2626",
          pointRadius: 0,
          borderWidth: 1.3,
          tension: 0.2
        }
      ]
    }
  }, [bucketedSeries, bucketMinutes])

  const scoreSummary = useMemo(() => {
    const scoredPoints = bucketedSeries.filter((point) => point.avgScore != null && point.maxScore != null)
    if (scoredPoints.length === 0) {
      return null
    }
    const averageSeries = scoredPoints.map((point) => point.avgScore ?? 0)
    const maxSeries = scoredPoints.map((point) => point.maxScore ?? 0)
    return {
      average: summarizeSeries(averageSeries),
      peak: summarizeSeries(maxSeries)
    }
  }, [bucketedSeries])
  const totalAnomalies = minuteSeries.reduce((acc, point) => acc + point.anomalies, 0)
  const distinctWindows = bucketedSeries.length

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

  return (
    <div className="time-series">
      <aside className="inference-sidebar">
        <SidebarNav />
      </aside>

      <section className="time-series-content">
        <header className="hero">
          <p className="eyebrow">Time series monitoring</p>
          <h2>One-class dashboard snapshot</h2>
          <p>
            Upload a CSV to inspect anomalies over time, top destination ports, and the highest-risk windows detected by
            the classifier.
          </p>
        </header>

        <section className="card-grid">
          <article className="card">
            <h3>Target</h3>
            <p>
              Monitor live flows or historical exports. This demo surfaces the top anomaly windows discovered in the
              latest upload.
            </p>
          </article>
          <article className="card">
            <h3>Rules</h3>
            <ul>
              <li>3 sigma: absolute z greater than sigma indicates anomaly.</li>
              <li>IsolationForest score above threshold indicates anomaly.</li>
            </ul>
            <p className="metric-note">
              Model flag used here: <strong>{positiveLabel}</strong>
            </p>
          </article>
          <article className="card">
            <h3>Dataset upload</h3>
            <p>Bring new CSV windows to inspect flagged intervals.</p>
            <DatasetUploadButton
              helperText="CSV files only."
              onFileSelected={handleUpload}
              disabled={isLoading}
            />
            {isLoading ? <p className="upload-status">Processing dataset...</p> : null}
            {error ? <p className="upload-error">{error}</p> : null}
          </article>
        </section>

        <section className="chart-strip chart-strip--stacked">
          <div className="chart-card chart-card--wide">
            <div className="chart-card__header">
              <div>
                <h3>Flow timeline</h3>
                <p className="chart-subtitle">Blue = normal, red = anomaly. Values averaged over the selected bucket size.</p>
              </div>
              <div className="chart-controls">
                <label className="chart-control">
                  <span>Bucket size:</span>
                  <input type="range" min={5} max={60} step={5} value={bucketMinutes} onChange={handleBucketChange} />
                  <span>{bucketMinutes} min</span>
                </label>
                <div className="chart-toggle-group">
                  <button
                    type="button"
                    className={`toggle-pill toggle-pill--normal ${seriesVisibility.normal ? "is-active" : ""}`}
                    onClick={() => toggleSeries("normal")}
                  >
                    Normal (blue)
                  </button>
                  <button
                    type="button"
                    className={`toggle-pill toggle-pill--anomaly ${seriesVisibility.anomaly ? "is-active" : ""}`}
                    onClick={() => toggleSeries("anomaly")}
                  >
                    Anomaly (red)
                  </button>
                  <button
                    type="button"
                    className={`toggle-pill toggle-pill--ratio ${seriesVisibility.ratio ? "is-active" : ""}`}
                    onClick={() => toggleSeries("ratio")}
                  >
                    Ratio overlay
                  </button>
                </div>
              </div>
            </div>
            {flowChartData ? (
              <div className="chart-shell chart-shell--tall">
                <Line
                  ref={flowChartRef}
                  data={flowChartData}
                  options={flowChartOptions}
                  onClick={handleFlowClick}
                />
              </div>
            ) : (
              <p className="chart-placeholder">Upload data to visualise normal versus anomalous throughput.</p>
            )}
            {flowSummary ? (
              <table className="metric-table">
                <thead>
                  <tr>
                    <th scope="col" />
                    <th scope="col">Max</th>
                    <th scope="col">Average</th>
                    <th scope="col">Current</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row" className="metric-table__label metric-table__label--normal">
                      Normal
                    </th>
                    <td>
                      {flowValue(flowSummary.normal, "max")}
                      {flowShare(flowSummary.normal, "max")}
                    </td>
                    <td>
                      {flowValue(flowSummary.normal, "average")}
                      {flowShare(flowSummary.normal, "average")}
                    </td>
                    <td>
                      {flowValue(flowSummary.normal, "current")}
                      {flowShare(flowSummary.normal, "current")}
                    </td>
                  </tr>
                  <tr>
                    <th scope="row" className="metric-table__label metric-table__label--anomaly">
                      Anomaly
                    </th>
                    <td>
                      {flowValue(flowSummary.anomaly, "max")}
                      {flowShare(flowSummary.anomaly, "max")}
                    </td>
                    <td>
                      {flowValue(flowSummary.anomaly, "average")}
                      {flowShare(flowSummary.anomaly, "average")}
                    </td>
                    <td>
                      {flowValue(flowSummary.anomaly, "current")}
                      {flowShare(flowSummary.anomaly, "current")}
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : null}
          </div>
        </section>

        <div className="chart-row chart-row--metrics">
          <div className="chart-card">
            <h3>Total anomalies</h3>
            <p className="metric-value">{totalAnomalies.toLocaleString()}</p>
            <p className="metric-note">Across {distinctWindows.toLocaleString()} time windows.</p>
          </div>
          <div className="chart-card">
            <h3>Top destination port</h3>
            <p className="metric-value">{state.charts?.top_destination_ports[0]?.port ?? "No anomalies"}</p>
            <p className="metric-note">
              Count: {state.charts?.top_destination_ports[0]?.count?.toLocaleString() ?? 0}
            </p>
          </div>
          <div className="chart-card chart-card--compact">
            <h3>Focused window</h3>
            {selectedBucket ? (
              <ul className="snapshot-list">
                <li>
                  <span className="snapshot-label">Bucket start</span>
                  <span className="snapshot-value">{formatTimestamp(selectedBucket.timestamp)}</span>
                </li>
                <li>
                  <span className="snapshot-label">Bucket size</span>
                  <span className="snapshot-value">{selectedBucket.bucketMinutes} min</span>
                </li>
                <li>
                  <span className="snapshot-label">Avg total flows</span>
                  <span className="snapshot-value">{selectedBucket.total.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                </li>
                <li>
                  <span className="snapshot-label">Avg anomalies</span>
                  <span className="snapshot-value">
                    {selectedBucket.anomalies.toLocaleString(undefined, { maximumFractionDigits: 1 })}{" "}
                    {selectedRatio != null ? `(${formatPercent(selectedRatio)})` : ""}
                  </span>
                </li>
                <li>
                  <span className="snapshot-label">Average score</span>
                  <span className="snapshot-value">
                    {selectedBucket.avgScore != null ? formatScore(selectedBucket.avgScore) : "N/A"}
                  </span>
                </li>
                <li>
                  <span className="snapshot-label">Peak score</span>
                  <span className="snapshot-value">
                    {selectedBucket.maxScore != null ? formatScore(selectedBucket.maxScore) : "N/A"}
                  </span>
                </li>
              </ul>
            ) : (
              <p className="chart-placeholder chart-placeholder--mini">
                Click the flow chart to inspect a bucketed time window.
              </p>
            )}
          </div>
        </div>

        <section className="chart-strip chart-strip--advanced">
          <div className="chart-card chart-card--wide">
            <h3>Anomaly ratio trend</h3>
            {ratioChartData ? (
              <div className="chart-shell chart-shell--tall">
                <Line
                  data={ratioChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: "index", intersect: false },
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          label: (context) => {
                            if (typeof context.parsed.y === "number") {
                              return `Ratio: ${formatPercent(context.parsed.y)}`
                            }
                            return `Ratio: ${context.parsed.y}`
                          }
                        }
                      }
                    },
                    scales: {
                      x: {
                        type: "time",
                        time: { unit: "minute", displayFormats: { minute: "HH:mm" } },
                        ticks: { color: "#1f2937" },
                        grid: { color: "rgba(148, 163, 184, 0.12)" }
                      },
                      y: {
                        beginAtZero: true,
                        suggestedMax: 1,
                        ticks: {
                          color: "#0f172a",
                          callback: (value) => {
                            const numeric = typeof value === "number" ? value : Number(value)
                            return Number.isFinite(numeric) ? `${Math.round(numeric * 100)}%` : value
                          }
                        },
                        grid: { color: "rgba(203, 213, 225, 0.2)" }
                      }
                    }
                  }}
                />
              </div>
            ) : (
              <p className="chart-placeholder">Upload data to inspect anomaly share over time.</p>
            )}
            {ratioSummary ? (
              <table className="metric-table metric-table--compact">
                <thead>
                  <tr>
                    <th scope="col" />
                    <th scope="col">Max</th>
                    <th scope="col">Average</th>
                    <th scope="col">Current</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row" className="metric-table__label metric-table__label--ratio">
                      Anomaly ratio
                    </th>
                    <td>{formatPercent(ratioSummary.max)}</td>
                    <td>{formatPercent(ratioSummary.average)}</td>
                    <td>{formatPercent(ratioSummary.current)}</td>
                  </tr>
                </tbody>
              </table>
            ) : null}
          </div>

          <div className="chart-card chart-card--wide">
            <h3>Score trajectory</h3>
            {scoreChartData ? (
              <div className="chart-shell chart-shell--tall">
                <Line
                  data={scoreChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: "index", intersect: false },
                    plugins: {
                      legend: { display: true, position: "bottom" }
                    },
                    scales: {
                      x: {
                        type: "time",
                        time: { unit: "minute", displayFormats: { minute: "HH:mm" } },
                        ticks: { color: "#312e81" },
                        grid: { color: "rgba(129, 140, 248, 0.12)" }
                      },
                      y: {
                        beginAtZero: true,
                        suggestedMax: 1,
                        ticks: { color: "#312e81" },
                        grid: { color: "rgba(129, 140, 248, 0.18)" }
                      }
                    }
                  }}
                />
              </div>
            ) : (
              <p className="chart-placeholder">Upload data with model scores to plot trajectory.</p>
            )}
            {scoreSummary ? (
              <table className="metric-table metric-table--compact">
                <thead>
                  <tr>
                    <th scope="col" />
                    <th scope="col">Max</th>
                    <th scope="col">Average</th>
                    <th scope="col">Current</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row" className="metric-table__label metric-table__label--score">
                      Average score
                    </th>
                    <td>{formatScore(scoreSummary.average?.max ?? NaN)}</td>
                    <td>{formatScore(scoreSummary.average?.average ?? NaN)}</td>
                    <td>{formatScore(scoreSummary.average?.current ?? NaN)}</td>
                  </tr>
                  <tr>
                    <th scope="row" className="metric-table__label metric-table__label--score">
                      Peak score
                    </th>
                    <td>{formatScore(scoreSummary.peak?.max ?? NaN)}</td>
                    <td>{formatScore(scoreSummary.peak?.average ?? NaN)}</td>
                    <td>{formatScore(scoreSummary.peak?.current ?? NaN)}</td>
                  </tr>
                </tbody>
              </table>
            ) : null}
          </div>
        </section>

        <section className="table-card">
          <h3>Flagged windows</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Timestamp</th>
                  <th>Score</th>
                  <th>Destination port</th>
                  <th>Service</th>
                  <th>Protocol</th>
                  <th>Row</th>
                </tr>
              </thead>
              <tbody>
                {anomalies.length === 0 ? (
                  <tr>
                    <td colSpan={7}>Upload a dataset to surface anomaly windows.</td>
                  </tr>
                ) : (
                  anomalies.map((row) => (
                    <tr key={`${row.rowIndex}-${row.rank}`}>
                      <td>{row.rank}</td>
                      <td>{row.timestamp || "N/A"}</td>
                      <td>{row.score}</td>
                      <td>{row.port || "N/A"}</td>
                      <td>{row.service || "N/A"}</td>
                      <td>{row.protocol || "N/A"}</td>
                      <td>{row.rowIndex}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </div>
  )
}
