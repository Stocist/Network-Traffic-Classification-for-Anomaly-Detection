import { useEffect, useMemo, useRef, useState } from "react"
import * as d3 from "d3"
import type { PredictionRow } from "../types/inference"
import { findLabelColumn, inferPositiveLabel, normalizeLabel } from "../utils/labelUtils"

type PRCurveChartD3Props = {
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

type PRPoint = {
  threshold: number
  precision: number
  recall: number
}

const DEFAULT_THRESHOLD = 0.5

export function PRCurveChartD3({ predictions, columns, positiveLabelHint }: PRCurveChartD3Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD)
  const [hoveredPoint, setHoveredPoint] = useState<PRPoint | null>(null)
  const labelColumn = useMemo(() => findLabelColumn(columns), [columns])

  // * Compute PR curve data and metrics (same logic as original)
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
    const points: PRPoint[] = [{ recall: 0, precision: 1, threshold: 1 }]

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

    // * Calculate average precision
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

    // * Find best threshold based on F1 score
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

  // * Initialize threshold to best F1 threshold
  useEffect(() => {
    if (curveData) {
      setThreshold(curveData.defaultThreshold)
    }
  }, [curveData])

  // * Calculate current metrics based on threshold
  const selectedMetrics = useMemo(() => {
    if (!curveData) {
      return null
    }
    const clamped = Math.min(Math.max(threshold, 0), 1)
    return curveData.computeMetrics(clamped)
  }, [curveData, threshold])

  // * D3 visualization
  useEffect(() => {
    if (!curveData || !selectedMetrics || !svgRef.current) {
      return
    }

    const svg = d3.select(svgRef.current)
    const container = svgRef.current.parentElement
    if (!container) {
      return
    }

    // * Get responsive dimensions
    const containerWidth = container.clientWidth
    const margin = { top: 30, right: 30, bottom: 60, left: 70 }
    const width = Math.max(500, containerWidth - 40) - margin.left - margin.right
    const height = 450 - margin.top - margin.bottom

    // * Clear previous render
    svg.selectAll("*").remove()

    // * Set SVG dimensions
    svg
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)

    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`)

    // * Create scales
    const xScale = d3.scaleLinear().domain([0, 1]).range([0, width])
    const yScale = d3.scaleLinear().domain([0, 1]).range([height, 0])

    // * Add background zones for visual guidance
    const zones = [
      {
        x: 0,
        y: 0,
        width: width * 0.5,
        height: height * 0.5,
        fill: "#ffebee",
        opacity: 0.25,
        label: "Poor Performance",
        labelX: width * 0.15,
        labelY: height * 0.35
      },
      {
        x: width * 0.5,
        y: 0,
        width: width * 0.5,
        height: height * 0.5,
        fill: "#e8f5e9",
        opacity: 0.3,
        label: "Good Performance",
        labelX: width * 0.72,
        labelY: height * 0.35
      }
    ]

    zones.forEach((zone) => {
      g.append("rect")
        .attr("x", zone.x)
        .attr("y", zone.y)
        .attr("width", zone.width)
        .attr("height", zone.height)
        .attr("fill", zone.fill)
        .attr("opacity", 0)
        .transition()
        .duration(600)
        .attr("opacity", zone.opacity)

      g.append("text")
        .attr("x", zone.labelX)
        .attr("y", zone.labelY)
        .attr("text-anchor", "middle")
        .attr("fill", "#666")
        .attr("font-size", "11px")
        .attr("font-weight", "500")
        .attr("opacity", 0)
        .text(zone.label)
        .transition()
        .duration(600)
        .delay(300)
        .attr("opacity", 0.6)
    })

    // * Line generator for PR curve
    const line = d3
      .line<PRPoint>()
      .x((d) => xScale(d.recall))
      .y((d) => yScale(d.precision))
      .curve(d3.curveMonotoneX)

    // * Create gradient for the curve
    const gradient = svg
      .append("defs")
      .append("linearGradient")
      .attr("id", "pr-curve-gradient")
      .attr("gradientUnits", "userSpaceOnUse")
      .attr("x1", xScale(0))
      .attr("y1", 0)
      .attr("x2", xScale(1))
      .attr("y2", 0)

    gradient.append("stop").attr("offset", "0%").attr("stop-color", "#2563eb")
    gradient.append("stop").attr("offset", "50%").attr("stop-color", "#8b5cf6")
    gradient.append("stop").attr("offset", "100%").attr("stop-color", "#ec4899")

    // * Draw the PR curve with animation
    const path = g
      .append("path")
      .datum(curveData.points)
      .attr("class", "pr-curve-line")
      .attr("fill", "none")
      .attr("stroke", "url(#pr-curve-gradient)")
      .attr("stroke-width", 3)
      .attr("d", line)

    // * Animate path drawing
    const pathLength = path.node()?.getTotalLength() ?? 0
    path
      .attr("stroke-dasharray", pathLength)
      .attr("stroke-dashoffset", pathLength)
      .transition()
      .duration(1500)
      .ease(d3.easeQuadOut)
      .attr("stroke-dashoffset", 0)

    // * Add fill area under curve
    const area = d3
      .area<PRPoint>()
      .x((d) => xScale(d.recall))
      .y0(height)
      .y1((d) => yScale(d.precision))
      .curve(d3.curveMonotoneX)

    g.append("path")
      .datum(curveData.points)
      .attr("class", "pr-curve-area")
      .attr("fill", "url(#pr-curve-gradient)")
      .attr("opacity", 0)
      .attr("d", area)
      .transition()
      .duration(800)
      .delay(700)
      .attr("opacity", 0.1)

    // * Find current threshold point
    const thresholdPoint =
      curveData.points.reduce((prev, curr) =>
        Math.abs(curr.threshold - threshold) < Math.abs(prev.threshold - threshold) ? curr : prev
      ) || curveData.points[0]

    // * Draw crosshair lines for current threshold
    const crosshairX = g
      .append("line")
      .attr("class", "crosshair-x")
      .attr("x1", 0)
      .attr("x2", xScale(thresholdPoint.recall))
      .attr("y1", yScale(thresholdPoint.precision))
      .attr("y2", yScale(thresholdPoint.precision))
      .attr("stroke", "#f59e0b")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "5,5")
      .attr("opacity", 0)

    const crosshairY = g
      .append("line")
      .attr("class", "crosshair-y")
      .attr("x1", xScale(thresholdPoint.recall))
      .attr("x2", xScale(thresholdPoint.recall))
      .attr("y1", height)
      .attr("y2", yScale(thresholdPoint.precision))
      .attr("stroke", "#f59e0b")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "5,5")
      .attr("opacity", 0)

    crosshairX.transition().delay(1600).duration(400).attr("opacity", 0.5)
    crosshairY.transition().delay(1600).duration(400).attr("opacity", 0.5)

    // * Draw threshold point highlight
    const highlightCircle = g
      .append("circle")
      .attr("class", "threshold-point")
      .attr("cx", xScale(thresholdPoint.recall))
      .attr("cy", yScale(thresholdPoint.precision))
      .attr("r", 0)
      .attr("fill", "#facc15")
      .attr("stroke", "#f59e0b")
      .attr("stroke-width", 3)

    highlightCircle.transition().delay(1600).duration(500).attr("r", 9)

    // * Interactive overlay for hover and click
    const overlay = g
      .append("rect")
      .attr("class", "overlay")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "none")
      .attr("pointer-events", "all")
      .style("cursor", "crosshair")

    // * Hover interaction
    overlay.on("mousemove", function (event) {
      const [mouseX] = d3.pointer(event)
      const recall = xScale.invert(mouseX)

      // * Find nearest point on curve
      const point =
        curveData.points.reduce((prev, curr) =>
          Math.abs(curr.recall - recall) < Math.abs(prev.recall - recall) ? curr : prev
        ) || curveData.points[0]

      setHoveredPoint(point)

      // * Update hover circle
      g.selectAll(".hover-circle").remove()
      g.append("circle")
        .attr("class", "hover-circle")
        .attr("cx", xScale(point.recall))
        .attr("cy", yScale(point.precision))
        .attr("r", 6)
        .attr("fill", "#3b82f6")
        .attr("stroke", "white")
        .attr("stroke-width", 2)
        .style("pointer-events", "none")
    })

    overlay.on("mouseleave", function () {
      setHoveredPoint(null)
      g.selectAll(".hover-circle").remove()
    })

    // * Click to set threshold
    overlay.on("click", function (event) {
      const [mouseX] = d3.pointer(event)
      const recall = xScale.invert(mouseX)
      const point =
        curveData.points.reduce((prev, curr) =>
          Math.abs(curr.recall - recall) < Math.abs(prev.recall - recall) ? curr : prev
        ) || curveData.points[0]

      setThreshold(point.threshold)

      // * Animate threshold point update
      highlightCircle
        .transition()
        .duration(300)
        .attr("cx", xScale(point.recall))
        .attr("cy", yScale(point.precision))

      crosshairX
        .transition()
        .duration(300)
        .attr("x2", xScale(point.recall))
        .attr("y1", yScale(point.precision))
        .attr("y2", yScale(point.precision))

      crosshairY
        .transition()
        .duration(300)
        .attr("x1", xScale(point.recall))
        .attr("x2", xScale(point.recall))
        .attr("y2", yScale(point.precision))
    })

    // * Add axes
    const xAxis = d3.axisBottom(xScale).ticks(10).tickFormat(d3.format(".1f"))
    const yAxis = d3.axisLeft(yScale).ticks(10).tickFormat(d3.format(".1f"))

    g.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${height})`)
      .call(xAxis)
      .selectAll("text")
      .attr("fill", "#374151")
      .attr("font-size", "12px")

    g.append("g")
      .attr("class", "y-axis")
      .call(yAxis)
      .selectAll("text")
      .attr("fill", "#374151")
      .attr("font-size", "12px")

    // * Add axis labels
    g.append("text")
      .attr("x", width / 2)
      .attr("y", height + 45)
      .attr("text-anchor", "middle")
      .attr("fill", "#111827")
      .attr("font-size", "14px")
      .attr("font-weight", "600")
      .text("Recall")

    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -55)
      .attr("x", -height / 2)
      .attr("text-anchor", "middle")
      .attr("fill", "#111827")
      .attr("font-size", "14px")
      .attr("font-weight", "600")
      .text("Precision")

    // * Add title with AP score
    g.append("text")
      .attr("x", width / 2)
      .attr("y", -10)
      .attr("text-anchor", "middle")
      .attr("fill", "#111827")
      .attr("font-size", "13px")
      .attr("font-weight", "500")
      .text(`Average Precision: ${curveData.averagePrecision.toFixed(3)}`)
  }, [curveData, threshold, selectedMetrics])

  // * Empty state
  if (!curveData || !selectedMetrics) {
    return (
      <div className="pr-curve-empty">
        <p className="chart-placeholder">
          Upload scored data with ground truth labels to explore the precision-recall curve. Ensure the CSV contains a
          label column and probability scores.
        </p>
      </div>
    )
  }

  return (
    <div className="pr-curve-d3-container">
      <div className="pr-curve-main">
        <svg ref={svgRef} className="pr-curve-svg"></svg>
      </div>

      <div className="pr-controls-enhanced">
        <div className="pr-slider-section">
          <label htmlFor="pr-threshold-d3" className="threshold-label">
            <span>Decision Threshold</span>
            <span className="threshold-value">{threshold.toFixed(3)}</span>
          </label>
          <input
            id="pr-threshold-d3"
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={threshold}
            onChange={(event) => setThreshold(Number(event.target.value))}
            className="threshold-slider"
          />
          <div className="threshold-hint">
            Click on the curve or drag the slider to adjust the classification threshold
          </div>
        </div>

        <div className="pr-metrics-grid">
          <div className="metric-box metric-box--precision">
            <div className="metric-header">Precision</div>
            <div className="metric-value">{selectedMetrics.precision.toFixed(3)}</div>
            <div className="metric-desc">True positives / All positives predicted</div>
          </div>

          <div className="metric-box metric-box--recall">
            <div className="metric-header">Recall</div>
            <div className="metric-value">{selectedMetrics.recall.toFixed(3)}</div>
            <div className="metric-desc">True positives / All actual positives</div>
          </div>

          <div className="metric-box metric-box--f1">
            <div className="metric-header">F1 Score</div>
            <div className="metric-value">{selectedMetrics.f1.toFixed(3)}</div>
            <div className="metric-desc">Harmonic mean of precision and recall</div>
          </div>

          <div className="metric-box metric-box--flagged">
            <div className="metric-header">Flows Flagged</div>
            <div className="metric-value">{selectedMetrics.flagged.toLocaleString()}</div>
            <div className="metric-desc">Predictions above threshold</div>
          </div>

          <div className="metric-box metric-box--best">
            <div className="metric-header">Best F1 Score</div>
            <div className="metric-value">{curveData.bestF1.toFixed(3)}</div>
            <div className="metric-desc">Maximum achievable F1 score</div>
          </div>

          <div className="metric-box metric-box--optimal">
            <div className="metric-header">Optimal Threshold</div>
            <div className="metric-value">{curveData.defaultThreshold.toFixed(3)}</div>
            <div className="metric-desc">Threshold that maximizes F1 score</div>
          </div>
        </div>

        {hoveredPoint && (
          <div className="hover-info-panel">
            <div className="hover-info-header">Hovered Point</div>
            <div className="hover-info-content">
              <span>
                Threshold: <strong>{hoveredPoint.threshold.toFixed(3)}</strong>
              </span>
              <span>
                Precision: <strong>{hoveredPoint.precision.toFixed(3)}</strong>
              </span>
              <span>
                Recall: <strong>{hoveredPoint.recall.toFixed(3)}</strong>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

