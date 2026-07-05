export interface ReadingPoint {
  timestamp: string
  value: number
}

export interface ParameterReadings {
  parameter_name: string
  unit: string | null
  readings: ReadingPoint[]
}

export interface LatestReading {
  value: number
  unit: string | null
  timestamp: string
}
