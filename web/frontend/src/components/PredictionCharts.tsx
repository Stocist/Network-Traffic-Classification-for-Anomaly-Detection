import type { MouseEvent } from "react"
import { useCallback, useMemo, useRef } from "react"
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
import { Bar, Doughnut, PolarArea, getElementAtEvent } from "react-chartjs-2"
import "chartjs-adapter-date-fns"
import { useInferenceResults } from "../context/InferenceResultsContext"

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

const ATTACK_FIELDS = ["attack_type", "attack_cat", "category", "label", "label_family", "threat_type"]

export function PredictionCharts() {
	const {
		currentCharts: charts,
		filteredPredictions: predictions,
		toggleLabelFilter,
		togglePortFilter,
		activeFilters,
		hasActiveFilters
	} = useInferenceResults()

	const doughnutRef = useRef<ChartJS<"doughnut"> | null>(null)
	const portBarRef = useRef<ChartJS<"bar"> | null>(null)

	const handleHoverCursor = useCallback((_: unknown, elements: any[], chart: ChartJS | undefined) => {
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
				title: {
					display: true,
					text: "Click a segment to toggle prediction filters"
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
			onHover: handleHoverCursor
		}),
		[handleHoverCursor]
	)

	const handleDoughnutClick = useCallback(
		(event: MouseEvent<HTMLCanvasElement>) => {
			const chart = doughnutRef.current
			if (!chart) {
				return
			}
			const elements = getElementAtEvent(chart, event)
			if (!elements.length) {
				return
			}
			const index = elements[0].index
			const rawLabel = chart.data.labels?.[index]
			if (typeof rawLabel === "string") {
				toggleLabelFilter(rawLabel)
			}
		},
		[toggleLabelFilter]
	)

	const attackDistribution = useMemo(() => {
		if (!predictions || predictions.length === 0) {
			return null
		}

		let chosenField: string | null = null
		let counts: Map<string, number> | null = null

		for (const field of ATTACK_FIELDS) {
			const tally = new Map<string, number>()
			predictions.forEach((row) => {
				const raw = row.data?.[field]
				if (raw === undefined || raw === null) {
					return
				}
				const value = String(raw).trim()
				if (!value || value.toLowerCase() === "nan" || value === "-") {
					return
				}
				tally.set(value, (tally.get(value) ?? 0) + 1)
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
			animation: {
				duration: 800,
				easing: "easeOutQuart" as const
			},
			plugins: {
				legend: {
					position: "right" as const,
					labels: {
						boxWidth: 12,
						boxHeight: 12,
						usePointStyle: true,
						padding: 18
					}
				},
				tooltip: {
					callbacks: {
						label: (ctx: any) => {
							const total = attackDistribution?.total ?? 0
							const value = ctx.parsed ?? 0
							const pct = total ? ((value / total) * 100).toFixed(1) : "0.0"
							return `${ctx.label}: ${value} (${pct}%)`
						}
					}
				}
			},
			scales: {
				r: {
					ticks: { color: "#4b5563" },
					angleLines: { color: "rgba(75, 85, 99, 0.12)" },
					grid: { color: "rgba(148, 163, 184, 0.18)" }
				}
			},
			onHover: handleHoverCursor
		}),
		[attackDistribution, handleHoverCursor]
	)

	const scoreBandData = useMemo(() => {
		if (!predictions || predictions.length === 0) {
			return null
		}

		const scored = predictions.filter((row) => typeof row.score === "number") as Array<
			typeof predictions[number] & { score: number }
		>
		if (scored.length === 0) {
			return null
		}

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
					ticks: { color: "#374151" },
					grid: { color: "rgba(148, 163, 184, 0.2)" }
				},
				y: {
					beginAtZero: true,
					ticks: { color: "#374151", precision: 0 },
					grid: { display: false }
				}
			},
			onHover: handleHoverCursor
		}),
		[handleHoverCursor]
	)

	const barData = useMemo(() => {
		if (!charts || charts.top_destination_ports.length === 0) {
			return null
		}
		const labels = charts.top_destination_ports.map((entry) => entry.port)
		const data = charts.top_destination_ports.map((entry) => entry.count)
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
		const hasPortFilter = activeFilters.ports.length > 0
		const backgroundColor = labels.map((label, idx) => {
			const base = palette[idx % palette.length]
			if (!hasPortFilter) {
				return base
			}
			return activeFilters.ports.includes(label) ? base : `${base}55`
		})
		const borderColor = labels.map((label, idx) => {
			const base = palette[idx % palette.length]
			return activeFilters.ports.includes(label) ? "#111827" : `${base}dd`
		})

		return {
			labels,
			datasets: [
				{
					label: "Anomalies",
					data,
					backgroundColor,
					hoverBackgroundColor: labels.map((label, idx) => {
						const base = palette[idx % palette.length]
						return activeFilters.ports.includes(label) ? `${base}f2` : `${base}aa`
					}),
					borderRadius: 10,
					barThickness: 18,
					maxBarThickness: 24,
					borderColor,
					borderWidth: labels.map((label) => (activeFilters.ports.includes(label) ? 3 : 1))
				}
			]
		}
	}, [charts, activeFilters.ports])

	const barOptions = useMemo(
		() => ({
			responsive: true,
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
				title: {
					display: true,
					text: "Click a bar to toggle port filters"
				},
				tooltip: {
					callbacks: {
						label: (ctx: any) => `${ctx.parsed.x} anomalies`
					}
				}
			},
			scales: {
				x: {
					beginAtZero: true,
					ticks: {
						color: "#374151",
						precision: 0
					},
					grid: { color: "rgba(55, 65, 81, 0.08)" }
				},
				y: {
					ticks: { color: "#111827" },
					grid: { display: false }
				}
			},
			onHover: handleHoverCursor
		}),
		[handleHoverCursor]
	)

	const handlePortClick = useCallback(
		(event: MouseEvent<HTMLCanvasElement>) => {
			const chart = portBarRef.current
			if (!chart) {
				return
			}
			const elements = getElementAtEvent(chart, event)
			if (!elements.length) {
				return
			}
			const index = elements[0].index
			const label = chart.data.labels?.[index]
			if (typeof label === "string") {
				togglePortFilter(label)
			}
		},
		[togglePortFilter]
	)

	if (!charts) {
		return (
			<section className="card-grid chart-grid">
				<article className="card chart-panel">
					<h3>Prediction breakdown</h3>
					<p>Upload a dataset to explore interactive breakdowns.</p>
				</article>
				<article className="card chart-panel">
					<h3>Attack taxonomy mix</h3>
					<p>Attack category insights will appear once labelled data is present.</p>
				</article>
				<article className="card chart-panel">
					<h3>Anomaly score bands</h3>
					<p>Score distribution requires a model that exposes probabilities.</p>
				</article>
				<article className="card chart-panel">
					<h3>Top destination ports</h3>
					<p>Port insights will populate when anomalies are detected.</p>
				</article>
			</section>
		)
	}

	return (
		<section className="card-grid chart-grid">
			<article className="card chart-panel chart-panel--pie">
				<h3>Prediction breakdown</h3>
				{doughnutData ? (
					<div className="chart-shell">
						<Doughnut
							ref={doughnutRef}
							data={doughnutData}
							options={doughnutOptions}
							onClick={handleDoughnutClick}
						/>
					</div>
				) : (
					<p>No prediction counts available.</p>
				)}
			</article>
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
				<h3>Top destination ports</h3>
				{barData ? (
					<div className="chart-shell">
						<Bar ref={portBarRef} data={barData} options={barOptions} onClick={handlePortClick} />
						{hasActiveFilters && activeFilters.ports.length > 0 ? (
							<p className="chart-subtitle">Selected ports: {activeFilters.ports.join(", ")}</p>
						) : null}
					</div>
				) : (
					<p>No destination port information.</p>
				)}
			</article>
		</section>
	)
}
