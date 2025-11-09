import { useCallback, useMemo } from "react"
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  RadialLinearScale,
  Title,
  Tooltip
} from "chart.js"
import { Bar, Doughnut, PolarArea } from "react-chartjs-2"
import "chartjs-adapter-date-fns"
import type { ChartsPayload, PredictionRow } from "../types/inference"
import { PortAttackHeatmap } from "./PortAttackHeatmap"

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  RadialLinearScale
)

import type { FilterState } from '../hooks/useLinkedVisualization'

type PredictionChartsProps = {
  charts: ChartsPayload | null
  predictions: PredictionRow[]
  onFilterChange?: (filterType: keyof FilterState, value: any) => void
  activeFilters?: FilterState
}

// Ranked candidate columns that commonly describe attack taxonomy across public datasets.
const ATTACK_FIELDS = ["attack_type", "attack_cat", "category", "label", "label_family", "threat_type"]

// * Normalize attack category names to consolidate variants
const normalizeAttackCategory = (category: string): string => {
  const catLower = category.toLowerCase().trim()
  
  const normalizationMap: Record<string, string> = {
    'backdoors': 'Backdoor',
    'backdoor': 'Backdoor',
    'fuzzers': 'Fuzzers',
    'fuzzer': 'Fuzzers',
    'exploits': 'Exploits',
    'exploit': 'Exploits',
    'worms': 'Worms',
    'worm': 'Worms',
    'shellcode': 'Shellcode',
    'shellcodes': 'Shellcode',
    'reconnaissance': 'Reconnaissance',
    'generic': 'Generic',
    'dos': 'DoS',
    'analysis': 'Analysis'
  }
  
  return normalizationMap[catLower] || category
}

export function PredictionCharts({ charts, predictions, onFilterChange, activeFilters }: PredictionChartsProps) {
  const hasCharts = Boolean(charts)
  
  // * Handle chart click for filtering
  const handleChartClick = useCallback((filterType: keyof FilterState, value: any) => {
    if (onFilterChange) {
      onFilterChange(filterType, value)
    }
  }, [onFilterChange])

  const handleHoverCursor = useCallback((_: any, elements: any[], chart: any) => {
    if (!chart?.canvas) {
      return
    }
    chart.canvas.style.cursor = elements.length ? "pointer" : "default"
  }, [])

  const doughnutData = useMemo(() => {
    if (!charts) {
      return null
    }
    const labels = Object.keys(charts.label_breakdown.counts)
    const data = Object.values(charts.label_breakdown.counts)
    const palette = ["#2563eb", "#ec4899", "#22c55e", "#f97316", "#14b8a6", "#facc15", "#6366f1", "#0ea5e9"]
    const backgroundColor = data.map((_, idx) => palette[idx % palette.length])
    return {
      labels,
      datasets: [
        {
          data,
          backgroundColor,
          hoverBackgroundColor: backgroundColor.map((hex) => `${hex}cc`),
          borderColor: "rgba(255,255,255,0.85)",
          borderWidth: 4,
          hoverOffset: 18,
          cutout: "55%"
        }
      ]
    }
  }, [charts])

  const doughnutOptions = useMemo(
    () => ({
      responsive: true,
      animation: {
        animateRotate: true,
        animateScale: true,
        easing: "easeOutQuart" as const,
        duration: 900
      },
      plugins: {
        legend: {
          position: "right" as const,
          labels: {
            usePointStyle: true,
            padding: 18
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx: any) => {
              const label = ctx.label ? `${ctx.label}: ` : ""
              return `${label}${ctx.parsed} flows`
            }
          }
        }
      },
      onHover: handleHoverCursor,
      onClick: (event: any, elements: any[], chart: any) => {
        if (elements.length > 0 && doughnutData) {
          const index = elements[0].index
          const prediction = doughnutData.labels[index]
          handleChartClick('prediction', prediction)
        }
      }
    }),
    [handleHoverCursor, handleChartClick, doughnutData]
  )

  const attackDistribution = useMemo(() => {
    // * Always recompute from predictions to respect active filters
    if (!predictions || predictions.length === 0) {
      return null
    }

    let chosenField: string | null = null
    let counts: Map<string, number> | null = null

    // * Try to find attack taxonomy column from the data
    for (const field of ATTACK_FIELDS) {
      const tally = new Map<string, number>()
      predictions.forEach((row) => {
        const raw = row.data?.[field]
        if (raw === undefined || raw === null) {
          return
        }
        const value = String(raw).trim()
        const valueLower = value.toLowerCase()
        // * Skip normal/benign/invalid values
        if (!value || valueLower === "nan" || value === "-" || valueLower === "normal" || valueLower === "benign") {
          return
        }
        // * Normalize the category name
        const normalized = normalizeAttackCategory(value)
        tally.set(normalized, (tally.get(normalized) ?? 0) + 1)
      })
      if (tally.size >= 2) {
        chosenField = field
        counts = tally
        break
      }
      if (!counts || tally.size > counts.size) {
        if (tally.size > 0) {
          chosenField = field
          counts = tally
        }
      }
    }

    if (!counts || counts.size === 0 || !chosenField) {
      return null
    }

    const labels = Array.from(counts.keys())
    const values = labels.map((label) => counts?.get(label) ?? 0)
    const total = values.reduce((sum, val) => sum + val, 0)
    return { field: chosenField, labels, values, total }
  }, [predictions])

  const attackPolarData = useMemo(() => {
    if (!attackDistribution) {
      return null
    }
    const palette = ["#ec4899", "#6366f1", "#22c55e", "#f97316", "#38bdf8", "#facc15", "#8b5cf6", "#ef4444"]
    const backgroundColor = attackDistribution.values.map((_, idx) => palette[idx % palette.length])
    return {
      labels: attackDistribution.labels,
      datasets: [
        {
          data: attackDistribution.values,
          backgroundColor,
          borderColor: backgroundColor.map((hex) => `${hex}dd`),
          hoverBackgroundColor: backgroundColor.map((hex) => `${hex}f2`)
        }
      ]
    }
  }, [attackDistribution])

  const attackPolarOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: true,
      animation: {
        duration: 800,
        easing: "easeOutQuart" as const
      },
      plugins: {
        legend: {
          position: "bottom" as const,
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            padding: 8,
            font: {
              size: 11
            }
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx: any) => {
              const total = attackDistribution?.total ?? 0
              const value = ctx.parsed?.r ?? ctx.parsed ?? 0
              const pct = total ? ((value / total) * 100).toFixed(1) : "0.0"
              const label = ctx.label || ctx.chart.data.labels[ctx.dataIndex]
              return `${label}: ${value} (${pct}%)`
            }
          }
        }
      },
      scales: {
        r: {
          ticks: { 
            color: "#4b5563",
            font: { size: 10 }
          },
          angleLines: { color: "rgba(75, 85, 99, 0.12)" },
          grid: { color: "rgba(148, 163, 184, 0.18)" }
        }
      },
      onHover: handleHoverCursor,
      onClick: (event: any, elements: any[]) => {
        if (elements.length > 0 && attackDistribution) {
          const index = elements[0].index
          const attackType = attackDistribution.labels[index]
          handleChartClick('attackType', attackType)
        }
      }
    }),
    [attackDistribution, handleHoverCursor, handleChartClick]
  )

  const scoreBandData = useMemo(() => {
    if (!predictions || predictions.length === 0) {
      return null
    }

    const scored = predictions.filter((row) => typeof row.score === "number") as Array<
      PredictionRow & { score: number }
    >
    if (scored.length === 0) {
      return null
    }

    // Bucket probability scores into qualitative bands so the chart is easier to read at a glance.
    const bands = [
      { label: ">= 0.95 (Critical)", min: 0.95, max: 1.0001, color: "#ef4444" },
      { label: "0.80 - 0.95 (High)", min: 0.8, max: 0.95, color: "#f97316" },
      { label: "0.50 - 0.80 (Medium)", min: 0.5, max: 0.8, color: "#facc15" },
      { label: "< 0.50 (Low)", min: -0.001, max: 0.5, color: "#22c55e" }
    ]

    const counts = bands.map(
      (band) => scored.filter((row) => row.score >= band.min && row.score < band.max).length
    )

    return {
      dataset: {
        labels: bands.map((band) => band.label),
        datasets: [
          {
            label: "Flows",
            data: counts,
            backgroundColor: bands.map((band) => band.color),
            borderColor: bands.map((band) => `${band.color}dd`),
            borderWidth: 2,
            borderRadius: 14
          }
        ]
      },
      total: scored.length
    }
  }, [predictions])

  const scoreBandOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: true,
      animation: {
        duration: 850,
        easing: "easeOutQuart" as const
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: any) => `${ctx.parsed.y ?? ctx.parsed} flows`
          }
        }
      },
      scales: {
        x: {
          ticks: { 
            color: "#374151",
            font: { size: 10 }
          },
          grid: { color: "rgba(148, 163, 184, 0.2)" }
        },
        y: {
          beginAtZero: true,
          ticks: { 
            color: "#374151", 
            precision: 0,
            font: { size: 10 }
          },
          grid: { display: false }
        }
      },
      onHover: handleHoverCursor
    }),
    [handleHoverCursor]
  )

  const barData = useMemo(() => {
    // * Always recompute from predictions to respect active filters
    if (!predictions || predictions.length === 0) {
      return null
    }
    
    // * Count services from filtered predictions
    const serviceCounts = new Map<string, number>()
    predictions.forEach(row => {
      const service = row.data?.service
      if (service && service !== '-' && service.toLowerCase() !== 'nan') {
        serviceCounts.set(String(service), (serviceCounts.get(String(service)) ?? 0) + 1)
      }
    })
    
    if (serviceCounts.size === 0) {
      return null
    }
    
    // * Get top 10 services by count
    const sortedServices = Array.from(serviceCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
    
    const labels = sortedServices.map(([service]) => service)
    const data = sortedServices.map(([, count]) => count)
    
    const palette = [
      "#38bdf8",
      "#6366f1",
      "#8b5cf6",
      "#ec4899",
      "#f97316",
      "#22c55e",
      "#14b8a6",
      "#0ea5e9",
      "#facc15",
      "#f87171"
    ]
    return {
      labels,
      datasets: [
        {
          label: "Attacks",
          data,
          backgroundColor: data.map((_, idx) => palette[idx % palette.length]),
          hoverBackgroundColor: data.map((_, idx) => `${palette[idx % palette.length]}cc`),
          borderRadius: 10,
          barThickness: 18,
          maxBarThickness: 24
        }
      ]
    }
  }, [predictions])

  const barOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: true,
      indexAxis: "y" as const,
      interaction: {
        mode: "nearest" as const,
        axis: "y" as const,
        intersect: false
      },
      animation: {
        duration: 800,
        easing: "easeOutQuart" as const,
        delay: (ctx: any) => (ctx.dataIndex ?? 0) * 80
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: any) => `${ctx.parsed.x.toLocaleString()} attacks`
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            color: "#374151",
            precision: 0,
            font: { size: 10 }
          },
          grid: { color: "rgba(55, 65, 81, 0.08)" }
        },
        y: {
          ticks: { 
            color: "#111827",
            font: { size: 10 }
          },
          grid: { display: false }
        }
      },
      onHover: handleHoverCursor,
      onClick: (event: any, elements: any[]) => {
        if (elements.length > 0 && barData) {
          const index = elements[0].index
          const service = barData.labels[index]
          handleChartClick('service', service)
        }
      }
    }),
    [handleHoverCursor, handleChartClick, barData]
  )

  if (!hasCharts) {
    return (
      <section className="card-grid chart-grid">
        <article className="card chart-panel">
          <h3>Attack taxonomy mix</h3>
          <p>Attack category insights will appear once labelled data is present.</p>
        </article>
        <article className="card chart-panel">
          <h3>Anomaly score bands</h3>
          <p>Score distribution requires a model that exposes probabilities.</p>
        </article>
        <article className="card chart-panel">
          <h3>Top targeted services</h3>
          <p>Service insights will populate when data is uploaded.</p>
        </article>
        <article className="card chart-panel">
          <h3>Port × Attack Heatmap</h3>
          <p>Heatmap requires dataset with port numbers.</p>
        </article>
      </section>
    )
  }

  // * Recompute heatmap data from filtered predictions
  const heatmapData = useMemo(() => {
    if (!predictions || predictions.length === 0) {
      return null
    }
    
    // * Find port and attack columns
    const portCandidates = ['dst_port', 'dsport', 'dport', 'destination_port']
    const attackCandidates = ['attack_cat', 'attack_type', 'category']
    
    let portCol: string | null = null
    let attackCol: string | null = null
    
    // Check if any port column exists
    for (const col of portCandidates) {
      if (predictions[0]?.data?.[col] !== undefined) {
        portCol = col
        break
      }
    }
    
    // Check if any attack column exists
    for (const col of attackCandidates) {
      if (predictions[0]?.data?.[col] !== undefined) {
        attackCol = col
        break
      }
    }
    
    if (!portCol || !attackCol) {
      return null
    }
    
    // * Build crosstab of attack types × ports
    const crosstab = new Map<string, Map<number, number>>()
    const allPorts = new Set<number>()
    
    predictions.forEach(row => {
      const portVal = row.data?.[portCol]
      const attackVal = row.data?.[attackCol]
      
      if (!portVal || !attackVal) return
      
      const port = Number(portVal)
      const attack = String(attackVal).trim()
      const attackLower = attack.toLowerCase()
      
      // Skip invalid values
      if (isNaN(port) || port < 1 || port > 65535) return
      if (!attack || attackLower === 'normal' || attackLower === 'nan' || attackLower === 'benign' || attack === '-') return
      
      // * Normalize attack category name
      const normalizedAttack = normalizeAttackCategory(attack)
      
      allPorts.add(port)
      
      if (!crosstab.has(normalizedAttack)) {
        crosstab.set(normalizedAttack, new Map())
      }
      const attackRow = crosstab.get(normalizedAttack)!
      attackRow.set(port, (attackRow.get(port) ?? 0) + 1)
    })
    
    if (crosstab.size === 0 || allPorts.size === 0) {
      return null
    }
    
    // * Get top 15 ports by total attacks
    const portTotals = new Map<number, number>()
    allPorts.forEach(port => {
      let total = 0
      crosstab.forEach(attackRow => {
        total += attackRow.get(port) ?? 0
      })
      portTotals.set(port, total)
    })
    
    const topPorts = Array.from(portTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([port]) => port)
    
    if (topPorts.length === 0) {
      return null
    }
    
    // * Get attack types sorted by total activity
    const attackTotals = new Map<string, number>()
    crosstab.forEach((attackRow, attack) => {
      let total = 0
      topPorts.forEach(port => {
        total += attackRow.get(port) ?? 0
      })
      attackTotals.set(attack, total)
    })
    
    const sortedAttacks = Array.from(attackTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([attack]) => attack)
    
    // * Build matrix
    const matrix = sortedAttacks.map(attack => {
      const attackRow = crosstab.get(attack)!
      return topPorts.map(port => attackRow.get(port) ?? 0)
    })
    
    return {
      ports: topPorts,
      attack_types: sortedAttacks,
      matrix
    }
  }, [predictions])
  
  const hasHeatmap = heatmapData !== null

  return (
    <section className="card-grid chart-grid">
      <article className="card chart-panel">
        <h3>Attack taxonomy mix</h3>
        {attackPolarData ? (
          <div className="chart-shell">
            <PolarArea data={attackPolarData} options={attackPolarOptions} />
          </div>
        ) : (
          <p>Upload a dataset with attack labels to view taxonomy insights.</p>
        )}
      </article>
      <article className="card chart-panel">
        <h3>Anomaly score bands</h3>
        {scoreBandData ? (
          <div className="chart-shell">
            <Bar data={scoreBandData.dataset} options={scoreBandOptions} />
          </div>
        ) : (
          <p>Model scores are not available for this run.</p>
        )}
      </article>
      <article className="card chart-panel">
        <h3>Top targeted services</h3>
        {barData ? (
          <div className="chart-shell">
            <Bar data={barData} options={barOptions} />
          </div>
        ) : (
          <p>No service or port information available.</p>
        )}
      </article>
      <article className="card chart-panel">
        <h3>Port × Attack Heatmap</h3>
        {hasHeatmap ? (
          <div className="chart-shell" style={{ overflow: 'visible', minHeight: '320px' }}>
            <PortAttackHeatmap 
              data={heatmapData} 
              onCellClick={(port, attackType) => {
                handleChartClick('service', port.toString())
                handleChartClick('attackType', attackType)
              }}
            />
          </div>
        ) : (
          <p>Heatmap requires dataset with port numbers.</p>
        )}
      </article>
    </section>
  )
}

// Remove the separate PortHeatmapSection component export
export function PortHeatmapSection({ charts }: { charts: ChartsPayload | null }) {
  // This component is now deprecated - heatmap is integrated into the main grid
  return null
}
