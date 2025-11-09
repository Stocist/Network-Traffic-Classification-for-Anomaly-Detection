import { useMemo } from "react"
import { useInferenceResults } from "../context/InferenceResultsContext"

function formatRange(start: number, end: number) {
  const startDate = new Date(start)
  const endDate = new Date(end)
  return `${startDate.toLocaleString()} to ${endDate.toLocaleString()}`
}

export function ActiveFiltersSummary({ className }: { className?: string }) {
  const {
    activeFilters,
    hasActiveFilters,
    toggleLabelFilter,
    togglePortFilter,
    setTimeRangeFilter,
    resetFilters
  } = useInferenceResults()

  const chips = useMemo(() => {
    if (!hasActiveFilters) {
      return []
    }
    const items: Array<{ key: string; label: string; onRemove: () => void }> = []
    activeFilters.labels.forEach((label) => {
      items.push({ key: `label-${label}`, label: `Prediction: ${label}`, onRemove: () => toggleLabelFilter(label) })
    })
    activeFilters.ports.forEach((port) => {
      items.push({ key: `port-${port}`, label: `Dest port: ${port}`, onRemove: () => togglePortFilter(port) })
    })
    if (activeFilters.timeRange) {
      const { start, end } = activeFilters.timeRange
      items.push({
        key: `time-${start}-${end}`,
        label: `Window: ${formatRange(start, end)}`,
        onRemove: () => setTimeRangeFilter(null)
      })
    }
    return items
  }, [activeFilters, hasActiveFilters, toggleLabelFilter, togglePortFilter, setTimeRangeFilter])

  if (!hasActiveFilters || chips.length === 0) {
    return null
  }

  return (
    <div className={`active-filters ${className ?? ""}`.trim()}>
      <span className="active-filters__title">Active filters:</span>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          className="active-filter-chip"
          onClick={chip.onRemove}
          aria-label={`Remove ${chip.label}`}
        >
          <span>{chip.label}</span>
          <span aria-hidden="true">&times;</span>
        </button>
      ))}
      <button type="button" className="active-filters__reset" onClick={resetFilters}>
        Reset
      </button>
    </div>
  )
}
