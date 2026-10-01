import { memo } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, WifiOff } from 'lucide-react'
import { Card } from '../../UI/Card'
import { useDeviceStore } from '../../../store/devices'
import { useSeedLatestReadings } from '../../../hooks/useSeedLatestReadings'
import { deviceSummary, formatValue, isProbeMissing, plural } from '../../../utils/registers'
import type { Device } from '../../../types/device'

// The first thing a technician needs on opening the panel: every
// controller's current temperatures and whether anything is wrong. Devices
// with an active alarm come first, then offline ones, then the rest.
export function SiteOverviewWidget({ devices }: { devices: Device[] }) {
  const liveReadings = useDeviceStore((s) => s.liveReadings)
  const rank = (d: Device) => {
    if (deviceSummary(d, liveReadings[d.id] ?? {}).activeAlarms.length) return 0
    return d.status === 'offline' ? 1 : 2
  }
  const sorted = [...devices].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'pl'))

  return (
    <Card title="Stan obiektu" action={<Link to="/devices" className="text-xs text-accent hover:text-accent-strong shrink-0">Wszystkie sterowniki</Link>}>
      {devices.length === 0 ? (
        <p className="px-5 py-4 text-sm text-ink-muted">Brak urządzeń — skaner RS485 szuka sterowników…</p>
      ) : (
        <div className="divide-y divide-border">
          {sorted.map((d) => <DeviceRow key={d.id} device={d} />)}
        </div>
      )}
    </Card>
  )
}

const DeviceRow = memo(function DeviceRow({ device }: { device: Device }) {
  useSeedLatestReadings(device.id)
  const live = useDeviceStore((s) => s.liveReadings[device.id]) ?? {}
  const { values, activeAlarms } = deviceSummary(device, live)
  const offline = device.status === 'offline'

  return (
    <Link
      to={`/devices/${device.id}`}
      // Stacked on phones: three values next to the name left no room for it.
      className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-5 py-3 hover:bg-surface-2 transition-colors ${activeAlarms.length ? 'bg-crit/5' : ''}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink truncate">{device.name}</p>
        {activeAlarms.length > 0 ? (
          <p className="text-xs text-crit flex items-center gap-1 truncate" title={activeAlarms.map((n) => device.parameter_aliases[n] ?? n).join(', ')}>
            <AlertTriangle size={12} className="shrink-0" />
            {activeAlarms.length === 1
              ? (device.parameter_aliases[activeAlarms[0]] ?? activeAlarms[0])
              : plural(activeAlarms.length, 'aktywny alarm', 'aktywne alarmy', 'aktywnych alarmów')}
          </p>
        ) : offline ? (
          <p className="text-xs text-crit flex items-center gap-1"><WifiOff size={12} /> brak komunikacji</p>
        ) : (
          <p className="text-xs text-good">w porządku</p>
        )}
      </div>
      <div className={`flex gap-4 shrink-0 ${offline ? 'opacity-40' : ''}`}>
        {values.map((v) => (
          <div key={v.name} className="sm:text-right min-w-[3.5rem]">
            <p className="text-lg font-bold text-ink tabular-nums leading-tight">
              {isProbeMissing(v.value, v.unit) ? '—' : formatValue(v.value, v.scale)}
              <span className="text-xs font-normal text-ink-muted ml-0.5">{device.parameter_units[v.name] ?? v.unit}</span>
            </p>
            <p className="text-[11px] text-ink-muted truncate max-w-[6rem]" title={v.name}>{device.parameter_aliases[v.name] ?? v.name}</p>
          </div>
        ))}
      </div>
    </Link>
  )
})
