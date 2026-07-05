import { downloadFile } from '../utils/download'

export const downloadReadings = (format: string, range: string) =>
  downloadFile(`/export/readings?format=${format}&range=${range}`, `readings_${range}.${format}`)

export const downloadAlerts = (format: string, range: string) =>
  downloadFile(`/export/alerts?format=${format}&range=${range}`, `alerts_${range}.${format}`)
