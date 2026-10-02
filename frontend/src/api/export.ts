import { downloadFile } from '../utils/download'

const deviceParam = (deviceId?: number) => (deviceId ? `&device_id=${deviceId}` : '')

export const downloadReadings = (format: string, range: string, deviceId?: number) =>
  downloadFile(`/export/readings?format=${format}&range=${range}${deviceParam(deviceId)}`, `readings_${range}.${format}`)

export const downloadAlerts = (format: string, range: string, deviceId?: number) =>
  downloadFile(`/export/alerts?format=${format}&range=${range}${deviceParam(deviceId)}`, `alerts_${range}.${format}`)
