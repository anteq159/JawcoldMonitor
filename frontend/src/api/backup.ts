import api from './client'
import { downloadFile } from '../utils/download'

export const downloadBackup = () => downloadFile('/backup/download', 'jawcold-backup.json')

export interface RestoreSummary {
  profiles_created: number
  profiles_updated: number
  devices_created: number
  devices_updated: number
  sensors_created: number
  sensors_updated: number
  rules_created: number
  rules_updated: number
}

export const restoreBackup = (file: File): Promise<RestoreSummary> => {
  const fd = new FormData()
  fd.append('file', file)
  return api.post('/backup/restore', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
}
