import { useEffect, useRef } from "react"
import * as d3 from "d3"
import type { PortAttackHeatmap as HeatmapData } from "../types/inference"

type PortAttackHeatmapProps = {
  data: HeatmapData | null
  onCellClick?: (port: number, attackType: string) => void
}

export function PortAttackHeatmap({ data, onCellClick }: PortAttackHeatmapProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!data || !data.ports || data.ports.length === 0 || !svgRef.current) {
      return
    }

    const svg = d3.select(svgRef.current)
    const margin = { top: 100, right: 60, bottom: 80, left: 140 }
    const cellWidth = 70
    const cellHeight = 50
    const width = data.ports.length * cellWidth
    const height = data.attack_types.length * cellHeight

    // * Clear previous render
    svg.selectAll("*").remove()

    svg
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`)

    // * Calculate max value for color scale
    const flatValues = data.matrix.flat()
    const maxValue = d3.max(flatValues) || 1

    // * Create color scale (white → red)
    const colorScale = d3
      .scaleSequential()
      .domain([0, maxValue])
      .interpolator(d3.interpolateReds)

    // * Draw cells
    data.attack_types.forEach((attackType, i) => {
      data.ports.forEach((port, j) => {
        const value = data.matrix[i][j]

        // * Cell rectangle
        const cell = g
          .append("rect")
          .attr("x", j * cellWidth)
          .attr("y", i * cellHeight)
          .attr("width", cellWidth - 2)
          .attr("height", cellHeight - 2)
          .attr("fill", value === 0 ? "#f8f9fa" : colorScale(value))
          .attr("stroke", "#fff")
          .attr("stroke-width", 2)
          .attr("rx", 4)
          .style("cursor", value > 0 ? "pointer" : "default")
          .attr("opacity", 0)

        // * Animate cell appearance
        cell.transition().duration(800).delay((i * data.ports.length + j) * 10).attr("opacity", 1)

        // * Hover interactions
        cell
          .on("mouseover", function (event) {
            if (value === 0) return

            d3.select(this)
              .transition()
              .duration(200)
              .attr("stroke", "#000")
              .attr("stroke-width", 3)
              .attr("opacity", 0.9)

            // * Tooltip
            const tooltip = d3
              .select("body")
              .append("div")
              .attr("class", "port-heatmap-tooltip")
              .style("position", "absolute")
              .style("background", "rgba(0, 0, 0, 0.92)")
              .style("color", "white")
              .style("padding", "14px 18px")
              .style("border-radius", "8px")
              .style("font-size", "14px")
              .style("pointer-events", "none")
              .style("z-index", "1000")
              .style("box-shadow", "0 4px 12px rgba(0,0,0,0.3)")

            tooltip
              .html(
                `
              <div style="font-size: 12px; color: #aaa; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px">Attack Pattern</div>
              <div style="font-size: 16px; font-weight: 700; margin-bottom: 8px; color: #fff">
                ${attackType} → Port ${port}
              </div>
              <div style="font-size: 20px; font-weight: 900; color: #ff4444; margin-top: 4px">
                ${value.toLocaleString()} attacks
              </div>
            `
              )
              .style("left", event.pageX + 15 + "px")
              .style("top", event.pageY - 60 + "px")
          })
          .on("mouseout", function () {
            d3.select(this)
              .transition()
              .duration(200)
              .attr("stroke", "#fff")
              .attr("stroke-width", 2)
              .attr("opacity", 1)

            d3.selectAll(".port-heatmap-tooltip").remove()
          })
          .on("click", function () {
            if (value > 0 && onCellClick) {
              onCellClick(port, attackType)
            }
          })

        // * Add text labels for values
        if (value > 0) {
          const text = g
            .append("text")
            .attr("x", j * cellWidth + cellWidth / 2)
            .attr("y", i * cellHeight + cellHeight / 2)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .attr("fill", value > maxValue / 2 ? "white" : "#1f2937")
            .attr("font-size", "13px")
            .attr("font-weight", "700")
            .attr("pointer-events", "none")
            .attr("opacity", 0)
            .text(value > 999 ? `${(value / 1000).toFixed(1)}k` : value)

          text.transition().duration(800).delay((i * data.ports.length + j) * 10 + 400).attr("opacity", 1)
        }
      })
    })

    // * X-axis labels (port numbers)
    data.ports.forEach((port, j) => {
      const label = g
        .append("text")
        .attr("x", j * cellWidth + cellWidth / 2)
        .attr("y", -15)
        .attr("text-anchor", "middle")
        .attr("font-size", "14px")
        .attr("font-weight", "700")
        .attr("fill", "#111827")
        .attr("opacity", 0)
        .text(port)

      label.transition().duration(600).delay(800).attr("opacity", 1)

      // * Port label subtitle
      g.append("text")
        .attr("x", j * cellWidth + cellWidth / 2)
        .attr("y", -2)
        .attr("text-anchor", "middle")
        .attr("font-size", "10px")
        .attr("font-weight", "500")
        .attr("fill", "#6b7280")
        .attr("opacity", 0)
        .text("port")
        .transition()
        .duration(600)
        .delay(800)
        .attr("opacity", 0.7)
    })

    // * Y-axis labels (attack types)
    data.attack_types.forEach((attackType, i) => {
      const label = g
        .append("text")
        .attr("x", -12)
        .attr("y", i * cellHeight + cellHeight / 2)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "middle")
        .attr("font-size", "14px")
        .attr("font-weight", "700")
        .attr("fill", "#111827")
        .attr("opacity", 0)
        .text(attackType)

      label.transition().duration(600).delay(800).attr("opacity", 1)
    })

    // * Add title
    svg
      .append("text")
      .attr("x", (width + margin.left + margin.right) / 2)
      .attr("y", 35)
      .attr("text-anchor", "middle")
      .attr("font-size", "18px")
      .attr("font-weight", "800")
      .attr("fill", "#111827")
      .attr("opacity", 0)
      .text("Attack Type × Target Port Heatmap")
      .transition()
      .duration(800)
      .attr("opacity", 1)

    // * Add subtitle
    svg
      .append("text")
      .attr("x", (width + margin.left + margin.right) / 2)
      .attr("y", 58)
      .attr("text-anchor", "middle")
      .attr("font-size", "13px")
      .attr("font-weight", "500")
      .attr("fill", "#6b7280")
      .attr("opacity", 0)
      .text("Click any cell to filter • Hover for details")
      .transition()
      .duration(800)
      .delay(200)
      .attr("opacity", 1)

    // * Add legend
    const legendWidth = 200
    const legendHeight = 15
    const legendX = width - legendWidth + margin.left
    const legendY = height + margin.top + 35

    const legendScale = d3.scaleLinear().domain([0, maxValue]).range([0, legendWidth])

    const legendAxis = d3
      .axisBottom(legendScale)
      .ticks(5)
      .tickFormat((d) => {
        const num = Number(d)
        return num > 999 ? `${(num / 1000).toFixed(1)}k` : num.toString()
      })

    // * Legend gradient
    const defs = svg.append("defs")
    const linearGradient = defs
      .append("linearGradient")
      .attr("id", "heatmap-gradient")
      .attr("x1", "0%")
      .attr("x2", "100%")
      .attr("y1", "0%")
      .attr("y2", "0%")

    const numStops = 10
    for (let i = 0; i <= numStops; i++) {
      const offset = (i / numStops) * 100
      const value = (i / numStops) * maxValue
      linearGradient
        .append("stop")
        .attr("offset", `${offset}%`)
        .attr("stop-color", colorScale(value))
    }

    svg
      .append("rect")
      .attr("x", legendX)
      .attr("y", legendY)
      .attr("width", legendWidth)
      .attr("height", legendHeight)
      .style("fill", "url(#heatmap-gradient)")
      .attr("opacity", 0)
      .transition()
      .duration(600)
      .delay(1000)
      .attr("opacity", 1)

    svg
      .append("g")
      .attr("transform", `translate(${legendX},${legendY + legendHeight})`)
      .call(legendAxis)
      .selectAll("text")
      .attr("font-size", "11px")
      .attr("fill", "#4b5563")
      .attr("opacity", 0)
      .transition()
      .duration(600)
      .delay(1000)
      .attr("opacity", 1)

    svg
      .append("text")
      .attr("x", legendX - 10)
      .attr("y", legendY + legendHeight / 2)
      .attr("text-anchor", "end")
      .attr("dominant-baseline", "middle")
      .attr("font-size", "12px")
      .attr("font-weight", "600")
      .attr("fill", "#374151")
      .attr("opacity", 0)
      .text("Attack Count:")
      .transition()
      .duration(600)
      .delay(1000)
      .attr("opacity", 1)
  }, [data, onCellClick])

  if (!data || !data.ports || data.ports.length === 0) {
    return (
      <div className="heatmap-empty">
        <p className="chart-placeholder">
          Port heatmap requires dataset with destination port numbers. Upload UNSW-NB15_1.csv or similar raw dataset to
          view this visualization.
        </p>
      </div>
    )
  }

  return (
    <div className="port-heatmap-container">
      <svg ref={svgRef} className="port-heatmap-svg"></svg>
    </div>
  )
}

