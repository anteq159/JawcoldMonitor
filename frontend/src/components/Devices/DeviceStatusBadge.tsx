import { Badge } from '../UI/Badge'

export function DeviceStatusBadge({ status }: { status: string }) {
  const map: Record<string, 'green' | 'red' | 'gray'> = {
    online: 'green',
    offline: 'red',
    unknown: 'gray',
  }
  const labels: Record<string, string> = {
    online: 'online',
    offline: 'offline',
    unknown: 'nieznany',
  }
  return <Badge variant={map[status] ?? 'gray'}>{labels[status] ?? status}</Badge>
}
