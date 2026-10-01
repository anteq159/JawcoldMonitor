import { useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
import { useDeviceStore } from '../../store/devices'
import { useSeedLatestReadings } from '../../hooks/useSeedLatestReadings'
import { Card } from '../UI/Card'
import type { RegisterDefinition } from '../../api/deviceProfiles'
import { registerCategory, formatValue, isProbeMissing, type RegisterCategory } from '../../utils/registers'

interface Props {
  deviceId: number
  registers: RegisterDefinition[]
  hiddenNames: string[]
  aliases: Record<string, string>
  units: Record<string, string>
}

interface Item {
  name: string
  label: string
  value: number
  unit: string
  scale?: number
  category: RegisterCategory
}

// Live state of one controller, split by what a value means: process
// measurements first and large, then on/off status and alarm flags as
// badges, then setpoints/parameters folded away (they are edited in
// "Zmienne sterownika" anyway). The old grid showed all 31 MPXPRO
// registers as identical "0.00" tiles, sensor-fault flags among the
// temperatures.
export function LiveOverview({ deviceId, registers, hiddenNames, aliases, units }: Props) {
  const readings = useDeviceStore((s) => s.liveReadings[deviceId])
  const [showSettings, setShowSettings] = useState(false)

  // Seed from the last stored values - live readings otherwise only appear
  // with the next WebSocket scan, leaving the page empty for up to a cycle.
  useSeedLatestReadings(deviceId)

  const byName = new Map(registers.map((r) => [r.name, r]))
  const order = new Map(registers.map((r, i) => [r.name, i]))
  const items: Item[] = Object.entries(readings ?? {})
    .filter(([name]) => !hiddenNames.includes(name))
    .map(([name, r]) => {
      const reg = byName.get(name)
      return {
        name,
        label: aliases[name] ?? name,
        value: r.value,
        unit: units[name] ?? r.unit ?? reg?.unit ?? '',
        scale: reg?.scale_factor,
        category: reg ? registerCategory(reg) : 'measurement',
      }
    })
    .sort((a, b) => (order.get(a.name) ?? 999) - (order.get(b.name) ?? 999))

  const measurements = items.filter((i) => i.category === 'measurement')
  const flags = items.filter((i) => i.category === 'status' || i.category === 'alarm')
  const settings = items.filter((i) => i.category === 'setpoint' || i.category === 'parameter')
  const activeAlarms = flags.filter((f) => f.category === 'alarm' && f.value !== 0)

  if (!items.length) {
    return (
      <Card title="Pomiary">
        <p className="p-5 text-ink-muted text-sm">Brak odczytów — oczekiwanie na dane…</p>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <Card
        title="Pomiary"
        action={activeAlarms.length > 0 ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-crit">
            <AlertTriangle size={14} /> {activeAlarms.length === 1 ? '1 aktywny alarm' : `${activeAlarms.length} aktywne alarmy`}
          </span>
        ) : flags.length > 0 ? (
          <span className="flex items-center gap-1.5 text-xs text-good"><CheckCircle2 size={14} /> bez alarmów</span>
        ) : undefined}
      >
        <div className="p-5">
          {measurements.length ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {measurements.map((m) => {
                const missing = isProbeMissing(m.value, m.unit)
                return (
                  <div key={m.name} className="bg-surface-2 border border-border rounded-lg p-3">
                    <p className="text-xs text-ink-muted mb-1 truncate" title={m.label}>{m.label}</p>
                    {missing ? (
                      <p className="text-sm text-ink-muted py-1" title={`Odczyt ${m.value} — wejście bez podłączonej sondy`}>brak sondy</p>
                    ) : (
                      <p className="text-2xl font-bold text-ink tabular-nums">
                        {formatValue(m.value, m.scale)}
                        {m.unit && <span className="text-sm font-normal text-ink-muted ml-1">{m.unit}</span>}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">Profil nie ma zmiennych typu „pomiar”.</p>
          )}

          {settings.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowSettings((v) => !v)}
                className="flex items-center gap-1 text-xs text-ink-muted hover:text-accent transition-colors"
              >
                {showSettings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                Nastawy i parametry ({settings.length})
              </button>
              {showSettings && (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1">
                  {settings.map((s) => (
                    <div key={s.name} className="flex justify-between gap-3 text-sm py-1 border-b border-border/60">
                      <span className="text-ink-muted truncate" title={s.label}>{s.label}</span>
                      <span className="text-ink font-medium tabular-nums shrink-0">
                        {formatValue(s.value, s.scale)}{s.unit && <span className="text-ink-muted font-normal ml-1">{s.unit}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {flags.length > 0 && (
        <Card title="Stan i alarmy">
          <div className="p-5 flex flex-wrap gap-2">
            {[...flags]
              .sort((a, b) => Number(b.value !== 0) - Number(a.value !== 0))
              .map((f) => <FlagBadge key={f.name} item={f} />)}
          </div>
        </Card>
      )}
    </div>
  )
}

function FlagBadge({ item }: { item: Item }) {
  const on = item.value !== 0
  const style = item.category === 'alarm'
    ? (on ? 'bg-crit/10 border-crit/40 text-crit' : 'bg-good/5 border-good/30 text-ink-body')
    : (on ? 'bg-accent/10 border-accent/40 text-accent' : 'bg-surface-2 border-border text-ink-muted')
  const state = item.category === 'alarm' ? (on ? 'AKTYWNY' : 'OK') : (on ? 'WŁ.' : 'WYŁ.')
  return (
    <span className={`inline-flex items-center gap-2 border rounded-lg px-3 py-1.5 text-xs ${style}`} title={item.name}>
      <span className={`w-2 h-2 rounded-full ${item.category === 'alarm' ? (on ? 'bg-crit' : 'bg-good') : (on ? 'bg-accent' : 'bg-ink-muted/40')}`} />
      {item.label}
      <span className="font-semibold">{state}</span>
    </span>
  )
}
