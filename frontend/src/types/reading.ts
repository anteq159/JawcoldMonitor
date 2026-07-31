export interface ReadingPoint {
  timestamp: string
  value: number
}

export interface ParameterReadings {
  // Stable identity for a series, set by callers that rename parameters for
  // display (device aliases). Persisted chart settings key off this, not off
  // the label, so renaming a parameter doesn't lose its settings.
  id?: string
  parameter_name: string
  unit: string | null
  readings: ReadingPoint[]
}

export interface LatestReading {
  value: number
  unit: string | null
  timestamp: string
}
