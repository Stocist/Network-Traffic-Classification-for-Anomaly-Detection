export type PredictionRow = {
  row_index: number
  prediction: string
  score?: number | null
  data: Record<string, unknown>
}

export type ValidationReport = {
  missing_columns: string[]
  extra_columns: string[]
  row_count: number
  max_rows_exceeded: boolean
  downsampled: boolean
  original_row_count?: number | null
  sampling_fraction?: number | null
}

export type LabelBreakdown = {
  counts: Record<string, number>
}

export type TimelinePoint = {
  timestamp: string
  count: number
}

export type PortCount = {
  port: string
  count: number
}

export type PortAttackHeatmap = {
  ports: number[]
  attack_types: string[]
  matrix: number[][]
}

export type ChartsPayload = {
  label_breakdown: LabelBreakdown
  attack_taxonomy: Record<string, number>
  port_attack_heatmap: PortAttackHeatmap
  anomalies_over_time: TimelinePoint[]
  top_destination_ports: PortCount[]
}

export type PredictionResponse = {
  result_id: string
  validation: ValidationReport
  columns: string[]
  predictions: PredictionRow[]
  charts: ChartsPayload
}
