import { createContext, useCallback, useContext, useMemo, useState } from "react"
import type {
  ChartsPayload,
  PredictionResponse,
  PredictionRow,
  ValidationReport
} from "../types/inference"

type InferenceState = {
  resultId: string | null
  predictions: PredictionRow[]
  columns: string[]
  charts: ChartsPayload | null
  validation: ValidationReport | null
}

type TimeRangeFilter = { start: number; end: number }

type ActiveFilters = {
  labels: string[]
  ports: string[]
  timeRange: TimeRangeFilter | null
}

type InferenceResultsContextValue = {
  state: InferenceState
  submitDataset: (file: File) => Promise<PredictionResponse>
  isLoading: boolean
  error: string | null
  clearError: () => void
  getDownloadUrl: () => string | null
  filteredPredictions: PredictionRow[]
  activeFilters: ActiveFilters
  hasActiveFilters: boolean
  toggleLabelFilter: (label: string) => void
  togglePortFilter: (port: string) => void
  setTimeRangeFilter: (range: TimeRangeFilter | null) => void
  resetFilters: () => void
  currentCharts: ChartsPayload | null
}

// Allow the backend origin to be swapped via environment for local vs deployed builds.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"

const initialState: InferenceState = {
  resultId: null,
  predictions: [],
  columns: [],
  charts: null,
  validation: null
}

const defaultFilters: ActiveFilters = {
  labels: [],
  ports: [],
  timeRange: null
}

const TIMESTAMP_KEYS = ["timestamp", "time", "event_time", "datetime", "capture_time"]

const findColumnKey = (candidates: string[], source: Set<string>): string | null => {
  const lookup = new Map<string, string>()
  source.forEach((key) => lookup.set(key.toLowerCase(), key))
  for (const candidate of candidates) {
    const match = lookup.get(candidate)
    if (match) {
      return match
    }
  }
  return null
}

const coerceDate = (value: unknown): Date | null => {
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

const InferenceResultsContext = createContext<InferenceResultsContextValue | undefined>(undefined)

export function InferenceResultsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<InferenceState>(initialState)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<ActiveFilters>(defaultFilters)

  const submitDataset = useCallback(async (file: File) => {
    const formData = new FormData()
    formData.append("file", file)

    setIsLoading(true)
    setError(null)
    try {
      // POST the raw CSV; backend handles validation and feature engineering.
      const response = await fetch(`${API_BASE_URL}/api/predict`, {
        method: "POST",
        body: formData
      })

      if (!response.ok) {
        let message = "Failed to process dataset."
        try {
          const payload = (await response.json()) as { detail?: string }
          if (payload?.detail) {
            message = payload.detail
          }
        } catch (parseError) {
          message = await response.text()
        }
        setError(message)
        throw new Error(message)
      }

      const payload = (await response.json()) as PredictionResponse
      setState({
        resultId: payload.result_id,
        predictions: payload.predictions,
        columns: payload.columns,
        charts: payload.charts,
        validation: payload.validation
      })
      setFilters(defaultFilters)
      return payload
    } finally {
      setIsLoading(false)
    }
  }, [])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const getDownloadUrl = useCallback(() => {
    if (!state.resultId) {
      return null
    }
    // The backend keeps enriched results in memory; expose a stable link for the current run.
    return `${API_BASE_URL}/api/results/${state.resultId}/download`
  }, [state.resultId])

  const datasetKeys = useMemo(() => {
    const keys = new Set<string>()
    state.predictions.forEach((row) => {
      Object.keys(row.data).forEach((key) => keys.add(key))
    })
    return keys
  }, [state.predictions])

  const timestampKey = useMemo(() => findColumnKey(TIMESTAMP_KEYS, datasetKeys), [datasetKeys])

  const portKeys = useMemo(() => {
    const keys = new Set<string>()
    state.predictions.forEach((row) => {
      Object.keys(row.data).forEach((key) => {
        if (key.toLowerCase().includes("port")) {
          keys.add(key)
        }
      })
    })
    return Array.from(keys)
  }, [state.predictions])

  const filteredPredictions = useMemo(() => {
    if (state.predictions.length === 0) {
      return []
    }
    const hasLabelFilter = filters.labels.length > 0
    const hasPortFilter = filters.ports.length > 0
    const hasTimeFilter = Boolean(filters.timeRange && timestampKey)

    if (!hasLabelFilter && !hasPortFilter && !hasTimeFilter) {
      return state.predictions
    }

    return state.predictions.filter((row) => {
      if (hasLabelFilter && !filters.labels.includes(row.prediction)) {
        return false
      }
      if (hasPortFilter) {
        const matchesPort = filters.ports.some((port) =>
          portKeys.some((key) => String(row.data[key] ?? "").trim() === port)
        )
        if (!matchesPort) {
          return false
        }
      }
      if (hasTimeFilter && filters.timeRange && timestampKey) {
        const candidate = coerceDate(row.data[timestampKey])
        if (!candidate) {
          return false
        }
        const time = candidate.getTime()
        if (time < filters.timeRange.start || time > filters.timeRange.end) {
          return false
        }
      }
      return true
    })
  }, [state.predictions, filters, timestampKey, portKeys])

  const hasActiveFilters = useMemo(() => {
    return (
      filters.labels.length > 0 || filters.ports.length > 0 || (filters.timeRange != null && timestampKey != null)
    )
  }, [filters.labels.length, filters.ports.length, filters.timeRange, timestampKey])

  const derivedCharts = useMemo<ChartsPayload | null>(() => {
    // If no data at all, return null
    if (!state.charts && state.predictions.length === 0) {
      return null
    }

    // When filters are active, recompute charts from filtered data; otherwise use backend charts
    const source = hasActiveFilters ? filteredPredictions : state.predictions
    
    // If no source data, return empty charts with baseline timeline
    if (!source || source.length === 0) {
      return {
        label_breakdown: { counts: {} },
        anomalies_over_time: state.charts?.anomalies_over_time ?? [],
        top_destination_ports: []
      }
    }

    // When filters are active, recompute all charts from filtered predictions
    if (hasActiveFilters) {
      const labelCounts = source.reduce<Record<string, number>>((acc, row) => {
        const key = row.prediction ?? "Unknown"
        acc[key] = (acc[key] ?? 0) + 1
        return acc
      }, {})

      const portCounts = new Map<string, number>()
      source.forEach((row) => {
        for (const key of portKeys) {
          const value = row.data[key]
          if (value == null) {
            continue
          }
          const asString = String(value).trim()
          if (!asString) {
            continue
          }
          portCounts.set(asString, (portCounts.get(asString) ?? 0) + 1)
        }
      })

      const topPorts = Array.from(portCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([port, count]) => ({ port, count }))

      return {
        label_breakdown: { counts: labelCounts },
        anomalies_over_time: state.charts?.anomalies_over_time ?? [],
        top_destination_ports: topPorts
      }
    }

    // No filters: use backend charts as-is
    return state.charts
  }, [state.charts, state.predictions, hasActiveFilters, filteredPredictions, portKeys])

  const toggleLabelFilter = useCallback((label: string) => {
    setFilters((prev) => {
      const exists = prev.labels.includes(label)
      return {
        ...prev,
        labels: exists ? prev.labels.filter((item) => item !== label) : [...prev.labels, label]
      }
    })
  }, [])

  const togglePortFilter = useCallback((port: string) => {
    setFilters((prev) => {
      const exists = prev.ports.includes(port)
      return {
        ...prev,
        ports: exists ? prev.ports.filter((item) => item !== port) : [...prev.ports, port]
      }
    })
  }, [])

  const setTimeRangeFilter = useCallback((range: TimeRangeFilter | null) => {
    setFilters((prev) => ({
      ...prev,
      timeRange: range
    }))
  }, [])

  const resetFilters = useCallback(() => {
    setFilters(defaultFilters)
  }, [])

  const value = useMemo<InferenceResultsContextValue>(
    () => ({
      state,
      submitDataset,
      isLoading,
      error,
      clearError,
      getDownloadUrl,
      filteredPredictions,
      activeFilters: filters,
      hasActiveFilters,
      toggleLabelFilter,
      togglePortFilter,
      setTimeRangeFilter,
      resetFilters,
      currentCharts: derivedCharts
    }),
    [
      state,
      submitDataset,
      isLoading,
      error,
      clearError,
      getDownloadUrl,
      filteredPredictions,
      filters,
      hasActiveFilters,
      toggleLabelFilter,
      togglePortFilter,
      setTimeRangeFilter,
      resetFilters,
      derivedCharts
    ]
  )

  return <InferenceResultsContext.Provider value={value}>{children}</InferenceResultsContext.Provider>
}

export function useInferenceResults() {
  const ctx = useContext(InferenceResultsContext)
  if (!ctx) {
    throw new Error("useInferenceResults must be used within InferenceResultsProvider")
  }
  return ctx
}
