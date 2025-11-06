import { useEffect, useMemo, useState } from "react"
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  Title,
  Tooltip,
  Legend,
  CategoryScale
} from "chart.js"
import { Line } from "react-chartjs-2"
import type { PredictionRow } from "../types/inference"
import { findLabelColumn, inferPositiveLabel, normalizeLabel } from "../utils/labelUtils"

type PRCurveChartProps = {
  predictions: PredictionRow[]
  columns: string[]
  positiveLabelHint?: string | null
}

type ThresholdMetrics = {
  threshold: number
  flagged: number
  precision: number
  recall: number
  f1: number
}

ChartJS.register(LineElement, PointElement, LinearScale, Title, Tooltip, Legend, CategoryScale)

const DEFAULT_THRESHOLD = 0.5

export function PRCurveChart({ predictions, columns, positiveLabelHint }: PRCurveChartProps) {
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD)
  const labelColumn = useMemo(() => findLabelColumn(columns), [columns])

  const curveData = useMemo(() => {
    if (!labelColumn) {
      return null
    }

    type Entry = { score: number; actualLower: string }
    const entries: Entry[] = []
    const labelSamples: string[] = []

    predictions.forEach((row) => {
      if (typeof row.score !== "number") {
        return
      }
      const normalized = normalizeLabel(row.data[labelColumn])
      if (!normalized) {
        return
      }
      labelSamples.push(normalized)
      entries.push({ score: row.score, actualLower: normalized.toLowerCase() })
    })

    if (entries.length === 0) {
      return null
    }

    const uniqueLabels = Array.from(new Set(labelSamples))
    const positiveLabel = inferPositiveLabel(uniqueLabels, positiveLabelHint)
    if (!positiveLabel) {
      return null
    }

    const positiveLower = positiveLabel.toLowerCase()
    const totalPositives = entries.reduce(
      (acc, entry) => (entry.actualLower === positiveLower ? acc + 1 : acc),
      0
    )
    if (totalPositives === 0) {
      return null
    }
    const totalNegatives = entries.length - totalPositives

    const sorted = [...entries].sort((a, b) => b.score - a.score)

    let tp = 0
    let fp = 0
    const points: Array<{ recall: number; precision: number; threshold: number }> = [
      { recall: 0, precision: 1, threshold: 1 }
    ]

    sorted.forEach((entry) => {
      if (entry.actualLower === positiveLower) {
        tp += 1
      } else {
        fp += 1
      }
      const precision = tp + fp === 0 ? 1 : tp / (tp + fp)
      const recall = tp / totalPositives
      points.push({ recall, precision, threshold: entry.score })
    })

    if (points[points.length - 1].recall < 1) {
      const precisionTail =
        totalPositives + totalNegatives === 0 ? 0 : totalPositives / (totalPositives + totalNegatives)
      points.push({ recall: 1, precision: precisionTail, threshold: 0 })
    }

    const ap = points.reduce((acc, point, index) => {
      if (index === 0) {
        return acc
      }
      const prev = points[index - 1]
      const deltaRecall = point.recall - prev.recall
      return acc + point.precision * Math.max(deltaRecall, 0)
    }, 0)

    const evaluate = (cutoff: number) => {
      let tpCut = 0
      let fpCut = 0
      let flagged = 0

      entries.forEach((entry) => {
        if (entry.score >= cutoff) {
          flagged += 1
          if (entry.actualLower === positiveLower) {
            tpCut += 1
          } else {
            fpCut += 1
          }
        }
      })

      return { tpCut, fpCut, flagged }
    }

    const computeMetrics = (cutoff: number): ThresholdMetrics => {
      const result = evaluate(cutoff)
      const precision = result.tpCut + result.fpCut === 0 ? 1 : result.tpCut / (result.tpCut + result.fpCut)
      const recall = totalPositives === 0 ? 0 : result.tpCut / totalPositives
      const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)

      return {
        threshold: cutoff,
        flagged: result.flagged,
        precision,
        recall,
        f1
      }
    }

    const candidateThresholds = Array.from(new Set(sorted.map((entry) => entry.score)))
    candidateThresholds.push(1)
    candidateThresholds.push(0)

    let bestThreshold = candidateThresholds[0] ?? DEFAULT_THRESHOLD
    let bestF1 = -1

    candidateThresholds.forEach((value) => {
      const metrics = computeMetrics(value)
      if (metrics.f1 > bestF1) {
        bestF1 = metrics.f1
        bestThreshold = value
      }
    })

    return {
      points,
      positiveLabel,
      averagePrecision: ap,
      computeMetrics,
      defaultThreshold: Math.min(Math.max(bestThreshold, 0), 1),
      bestF1: bestF1 < 0 ? 0 : bestF1
    }
  }, [labelColumn, predictions, positiveLabelHint])

  useEffect(() => {
    if (curveData) {
      setThreshold(curveData.defaultThreshold)
    }
  }, [curveData])

  const selectedMetrics = useMemo(() => {
    if (!curveData) {
      return null
    }
    const clamped = Math.min(Math.max(threshold, 0), 1)
    return curveData.computeMetrics(clamped)
  }, [curveData, threshold])

  if (!curveData || !selectedMetrics || selectedMetrics.precision == null || selectedMetrics.recall == null) {
    return (
      <div className="prc-empty">
        <p className="chart-placeholder">
          Upload scored data with ground truth labels to explore the precision-recall curve. Ensure the CSV contains a
          label column and probability scores.
        </p>
      </div>
    )
  }

  const highlightPoint = [
    {
      x: selectedMetrics.recall,
      y: selectedMetrics.precision
    }
  ]

  const chartData = {
    datasets: [
      {
        label: `Precision vs Recall (${curveData.positiveLabel})`,
        data: curveData.points.map((point) => ({ x: point.recall, y: point.precision })),
        showLine: true,
        borderWidth: 3,
        borderColor: (context: any) => {
          const chart = context.chart
          const { ctx, chartArea } = chart
          if (!chartArea) {
            return "#2563eb"
          }
          const gradient = ctx.createLinearGradient(chartArea.left, chartArea.bottom, chartArea.right, chartArea.top)
          gradient.addColorStop(0, "#2563eb")
          gradient.addColorStop(0.5, "#8b5cf6")
          gradient.addColorStop(1, "#ec4899")
          return gradient
        },
        backgroundColor: (context: any) => {
          const chart = context.chart
          const { ctx, chartArea } = chart
          if (!chartArea) {
            return "rgba(37, 99, 235, 0.12)"
          }
          const gradient = ctx.createLinearGradient(chartArea.left, chartArea.bottom, chartArea.right, chartArea.top)
          gradient.addColorStop(0, "rgba(37, 99, 235, 0.12)")
          gradient.addColorStop(0.5, "rgba(139, 92, 246, 0.1)")
          gradient.addColorStop(1, "rgba(236, 72, 153, 0.08)")
          return gradient
        },
        pointRadius: 0,
        tension: 0.35,
        fill: true,
        segment: {
          borderDash: (ctx: any) => (ctx.p1.parsed.x >= selectedMetrics.recall ? [6, 6] : undefined)
        }
      },
      {
        label: "Selected threshold",
        data: highlightPoint,
        type: "scatter" as const,
        pointBackgroundColor: "#facc15",
        pointBorderColor: "#f59e0b",
        pointRadius: 8,
        pointHoverRadius: 10
      }
    ]
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 1000,
      easing: "easeOutQuart"
    },
    scales: {
      x: {
        type: "linear" as const,
        min: 0,
        max: 1,
        title: { display: true, text: "Recall" },
        grid: { color: "rgba(30, 41, 59, 0.08)" },
        ticks: { callback: (value: number | string) => Number(value).toFixed(1) }
      },
      y: {
        min: 0,
        max: 1,
        title: { display: true, text: "Precision" },
        grid: { color: "rgba(30, 41, 59, 0.08)" },
        ticks: { callback: (value: number | string) => Number(value).toFixed(1) }
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const x = typeof context.parsed.x === "number" ? context.parsed.x.toFixed(3) : "0"
            const y = typeof context.parsed.y === "number" ? context.parsed.y.toFixed(3) : "0"
            return `Precision ${y} @ Recall ${x}`
          }
        }
      },
      title: {
        display: true,
        text: `Average precision: ${curveData.averagePrecision.toFixed(3)}`
      }
    }
  }

  return (
    <div className="pr-curve-panel">
      <div className="pr-controls">
        <label htmlFor="pr-threshold">
          Threshold
          <span className="threshold-value">{threshold.toFixed(2)}</span>
        </label>
        <input
          id="pr-threshold"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={threshold}
          onChange={(event) => setThreshold(Number(event.target.value))}
        />
        <div className="pr-stats">
          <div>
            <p className="metric-label">Precision</p>
            <p className="metric-value">{selectedMetrics.precision.toFixed(3)}</p>
          </div>
          <div>
            <p className="metric-label">Recall</p>
            <p className="metric-value">{selectedMetrics.recall.toFixed(3)}</p>
          </div>
          <div>
            <p className="metric-label">Flagged flows</p>
            <p className="metric-value">{selectedMetrics.flagged.toLocaleString()}</p>
          </div>
          <div>
            <p className="metric-label">F1 score</p>
            <p className="metric-value">{selectedMetrics.f1.toFixed(3)}</p>
          </div>
          <div>
            <p className="metric-label">Best F1</p>
            <p className="metric-value">{curveData.bestF1.toFixed(3)}</p>
          </div>
          <div>
            <p className="metric-label">Best F1 threshold</p>
            <p className="metric-value">{curveData.defaultThreshold.toFixed(2)}</p>
          </div>
          <div>
            <p className="metric-label">Positive label</p>
            <p className="metric-value">{curveData.positiveLabel}</p>
          </div>
        </div>
      </div>
      <div className="chart-shell chart-shell--tall pr-chart-shell">
        <Line data={chartData} options={options} />
      </div>
    </div>
  )
}
