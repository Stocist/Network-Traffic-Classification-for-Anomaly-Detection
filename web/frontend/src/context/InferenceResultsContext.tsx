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

type InferenceResultsContextValue = {
  state: InferenceState
  submitDataset: (file: File) => Promise<PredictionResponse>
  isLoading: boolean
  error: string | null
  clearError: () => void
  getDownloadUrl: () => string | null
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

const InferenceResultsContext = createContext<InferenceResultsContextValue | undefined>(undefined)

export function InferenceResultsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<InferenceState>(initialState)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const value = useMemo<InferenceResultsContextValue>(
    () => ({
      state,
      submitDataset,
      isLoading,
      error,
      clearError,
      getDownloadUrl
    }),
    [state, submitDataset, isLoading, error, clearError, getDownloadUrl]
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
