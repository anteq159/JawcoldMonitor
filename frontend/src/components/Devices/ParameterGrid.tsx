import { useDeviceStore } from '../../store/devices'

interface Props { deviceId: number }

export function ParameterGrid({ deviceId }: Props) {
  const readings = useDeviceStore((s) => s.liveReadings[deviceId] || {})

  if (Object.keys(readings).length === 0) {
    return <p className="text-ink-muted text-sm">Brak odczytów — oczekiwanie na dane...</p>
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {Object.entries(readings).map(([name, r]) => (
        <div key={name} className="bg-surface-2 border border-border rounded-lg p-3">
          <p className="text-xs text-ink-muted mb-1 truncate">{name}</p>
          <p className="text-xl font-bold text-ink">
            {r.value.toFixed(2)}
            {r.unit && <span className="text-sm font-normal text-ink-muted ml-1">{r.unit}</span>}
          </p>
        </div>
      ))}
    </div>
  )
}
