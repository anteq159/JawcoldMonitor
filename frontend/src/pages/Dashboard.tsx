import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cpu, Thermometer, Bell, Activity, HardDrive, MemoryStick, Settings, Plus, X } from 'lucide-react'
import { StatCard } from '../components/UI/Card'
import { useDeviceStore } from '../store/devices'
import { getDashboard } from '../api/system'
import { getDevices } from '../api/devices'
import { getSensors } from '../api/sensors'
import { getDeviceReadings, type TimeRange } from '../api/readings'
import { DeviceStatusBadge } from '../components/Devices/DeviceStatusBadge'
import { TimeSeriesChart } from '../components/Charts/TimeSeriesChart'
import { PageSpinner } from '../components/UI/Spinner'
import { format } from 'date-fns'
import type { ParameterReadings } from '../types/reading'

const TILE_KEYS = ['devices_online', 'devices_offline', 'sensors', 'alerts', 'cpu', 'cpu_temp', 'ram', 'disk'] as const
type TileKey = typeof TILE_KEYS[number]

const TILE_LABELS: Record<TileKey, string> = {
  devices_online: 'Urządzenia online',
  devices_offline: 'Urządzenia offline',
  sensors: 'Czujniki Dallas',
  alerts: 'Aktywne alerty',
  cpu: 'CPU',
  cpu_temp: 'Temp. CPU',
  ram: 'RAM',
  disk: 'Dysk',
}

const STORAGE_KEY = 'jawcold-dashboard-tiles'

function loadTileConfig(): Record<TileKey, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return Object.fromEntries(TILE_KEYS.map(k => [k, true])) as Record<TileKey, boolean>
}

interface CompSeries {
  deviceId: number
  deviceName: string
  paramName: string
  data: ParameterReadings[]
}

const RANGES: { label: string; value: TimeRange }[] = [
  { label: '1h', value: '1h' },
  { label: '6h', value: '6h' },
  { label: '24h', value: '24h' },
  { label: '7d', value: '7d' },
]

export default function Dashboard() {
  const { systemStats, setDevices, setSensors } = useDeviceStore()
  const devices = useDeviceStore((s) => s.devices)
  const sensors = useDeviceStore((s) => s.sensors)
  const [dashboard, setDashboard] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Tile config
  const [tiles, setTiles] = useState<Record<TileKey, boolean>>(loadTileConfig)
  const [showConfig, setShowConfig] = useState(false)

  // Comparison chart
  const [compSeries, setCompSeries] = useState<CompSeries[]>([])
  const [compRange, setCompRange] = useState<TimeRange>('1h')
  const [showAddSeries, setShowAddSeries] = useState(false)
  const [pickDevice, setPickDevice] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([getDashboard(), getDevices(), getSensors()]).then(([dash, devs, sens]) => {
      setDashboard(dash)
      setDevices(devs)
      setSensors(sens)
    }).finally(() => setLoading(false))
  }, [])

  const toggleTile = (key: TileKey) => {
    const next = { ...tiles, [key]: !tiles[key] }
    setTiles(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  const addSeries = async (deviceId: number, paramName: string) => {
    const device = devices.find(d => d.id === deviceId)
    if (!device) return
    const data = await getDeviceReadings(deviceId, compRange, paramName)
    const labeled = data.map(r => ({ ...r, parameter_name: `${device.name} · ${r.parameter_name}` }))
    setCompSeries(prev => [...prev, { deviceId, deviceName: device.name, paramName, data: labeled }])
    setShowAddSeries(false)
    setPickDevice(null)
  }

  const removeSeries = (i: number) => setCompSeries(prev => prev.filter((_, idx) => idx !== i))

  const refreshChart = async (range: TimeRange) => {
    setCompRange(range)
    const updated = await Promise.all(
      compSeries.map(async s => {
        const data = await getDeviceReadings(s.deviceId, range, s.paramName)
        const labeled = data.map(r => ({ ...r, parameter_name: `${s.deviceName} · ${r.parameter_name}` }))
        return { ...s, data: labeled }
      })
    )
    setCompSeries(updated)
  }

  if (loading) return <PageSpinner />

  const stats = systemStats || dashboard?.system
  const devicesOnline = devices.filter((d) => d.status === 'online').length
  const devicesOffline = devices.filter((d) => d.status === 'offline').length

  const mergedChart: ParameterReadings[] = compSeries.flatMap(s => s.data)

  return (
    <div className="space-y-6">
      {/* Header with config button */}
      <div className="flex items-center justify-end">
        <button
          onClick={() => setShowConfig(!showConfig)}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${showConfig ? 'bg-accent-soft border-accent/30 text-accent-strong' : 'border-border text-ink-muted hover:text-ink hover:border-border-strong'}`}
        >
          <Settings size={13} />
          Konfiguruj kafelki
        </button>
      </div>

      {/* Tile config panel */}
      {showConfig && (
        <div className="bg-surface border border-border rounded-xl shadow-panel p-4">
          <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3">Widoczne kafelki</p>
          <div className="flex flex-wrap gap-2">
            {TILE_KEYS.map(key => (
              <label key={key} className="flex items-center gap-2 cursor-pointer bg-surface-2 border border-border rounded-lg px-3 py-1.5">
                <input
                  type="checkbox"
                  checked={tiles[key]}
                  onChange={() => toggleTile(key)}
                  className="rounded border-border-strong bg-surface text-accent focus:ring-0"
                />
                <span className="text-sm text-ink-body">{TILE_LABELS[key]}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Stat cards row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {tiles.devices_online && <StatCard label="Urządzenia online" value={devicesOnline} color="green" icon={<Cpu size={20} />} />}
        {tiles.devices_offline && <StatCard label="Urządzenia offline" value={devicesOffline} color="red" icon={<Cpu size={20} />} />}
        {tiles.sensors && <StatCard label="Czujniki Dallas" value={sensors.length} color="blue" icon={<Thermometer size={20} />} />}
        {tiles.alerts && <StatCard label="Aktywne alerty" value={dashboard?.active_alerts ?? 0} color={dashboard?.active_alerts ? 'red' : 'green'} icon={<Bell size={20} />} />}
      </div>

      {/* System stats row 2 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {tiles.cpu && <StatCard label="CPU" value={`${stats.cpu_percent.toFixed(0)}%`} icon={<Activity size={20} />} />}
          {tiles.cpu_temp && stats.cpu_temp && <StatCard label="Temp. CPU" value={`${stats.cpu_temp.toFixed(0)}°C`} color="yellow" icon={<Thermometer size={20} />} />}
          {tiles.ram && <StatCard label="RAM" value={`${stats.ram_percent.toFixed(0)}%`} sub={`${(stats.ram_used_mb / 1024).toFixed(1)} / ${(stats.ram_total_mb / 1024).toFixed(1)} GB`} color="purple" icon={<MemoryStick size={20} />} />}
          {tiles.disk && <StatCard label="Dysk" value={`${stats.disk_percent.toFixed(0)}%`} sub={`${stats.disk_used_gb.toFixed(1)} / ${stats.disk_total_gb.toFixed(1)} GB`} icon={<HardDrive size={20} />} />}
        </div>
      )}

      {/* Comparison chart */}
      <div className="bg-surface border border-border rounded-xl shadow-panel">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-ink text-sm">Porównanie urządzeń</h3>
          <div className="flex items-center gap-2">
            {compSeries.length > 0 && (
              <div className="flex gap-1">
                {RANGES.map(r => (
                  <button key={r.value} onClick={() => refreshChart(r.value)}
                    className={`text-xs px-2.5 py-1 rounded-md transition-colors ${compRange === r.value ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink'}`}>
                    {r.label}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => { setShowAddSeries(true); setPickDevice(null) }}
              className="flex items-center gap-1.5 text-xs bg-accent hover:bg-accent-strong text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus size={12} /> Dodaj serię
            </button>
          </div>
        </div>

        {showAddSeries && (
          <div className="px-5 py-4 border-b border-border space-y-3">
            <div>
              <p className="text-xs text-ink-muted mb-2">1. Wybierz urządzenie:</p>
              <div className="flex flex-wrap gap-2">
                {devices.map(d => (
                  <button key={d.id} onClick={() => setPickDevice(d.id)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${pickDevice === d.id ? 'bg-accent border-accent text-white' : 'border-border text-ink-muted hover:text-ink'}`}>
                    {d.name}
                  </button>
                ))}
              </div>
            </div>
            {pickDevice !== null && (() => {
              const dev = devices.find(d => d.id === pickDevice)
              return dev && dev.parameters.length > 0 ? (
                <div>
                  <p className="text-xs text-ink-muted mb-2">2. Wybierz parametr:</p>
                  <div className="flex flex-wrap gap-2">
                    {dev.parameters.map(p => (
                      <button key={p.id} onClick={() => addSeries(pickDevice, p.name)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-border text-ink-body hover:text-ink hover:border-border-strong transition-colors">
                        {p.name}{p.unit ? ` (${p.unit})` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-ink-muted">To urządzenie nie ma zdefiniowanych parametrów.</p>
              )
            })()}
            <button onClick={() => { setShowAddSeries(false); setPickDevice(null) }} className="text-xs text-ink-muted hover:text-ink">Anuluj</button>
          </div>
        )}

        {compSeries.length > 0 && (
          <div className="px-5 py-2 border-b border-border flex flex-wrap gap-2">
            {compSeries.map((s, i) => (
              <span key={i} className="flex items-center gap-1.5 text-xs bg-surface-2 border border-border rounded-full px-3 py-1">
                <span className="text-ink-body">{s.deviceName} · {s.paramName}</span>
                <button onClick={() => removeSeries(i)} className="text-ink-muted hover:text-crit"><X size={11} /></button>
              </span>
            ))}
          </div>
        )}

        <div className="p-4">
          {mergedChart.length > 0 ? (
            <TimeSeriesChart data={mergedChart} height={280} />
          ) : (
            <div className="h-40 flex items-center justify-center text-sm text-ink-muted">
              Kliknij "Dodaj serię" aby wybrać urządzenie i parametr do porównania
            </div>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Devices list */}
        <div className="bg-surface border border-border rounded-xl shadow-panel">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 className="font-semibold text-ink text-sm">Urządzenia RS485</h3>
            <Link to="/devices" className="text-xs text-accent hover:text-accent-strong">Zobacz wszystkie</Link>
          </div>
          <div className="divide-y divide-border">
            {devices.slice(0, 6).map((d) => (
              <Link key={d.id} to={`/devices/${d.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-surface-2 transition-colors">
                <div>
                  <p className="text-sm text-ink">{d.name}</p>
                  <p className="text-xs text-ink-muted">Adres {d.modbus_address}</p>
                </div>
                <DeviceStatusBadge status={d.status} />
              </Link>
            ))}
            {devices.length === 0 && (
              <p className="px-5 py-4 text-sm text-ink-muted">Brak urządzeń — skaner RS485 pracuje...</p>
            )}
          </div>
        </div>

        {/* Recent readings */}
        <div className="bg-surface border border-border rounded-xl shadow-panel">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="font-semibold text-ink text-sm">Ostatnie odczyty</h3>
          </div>
          <div className="divide-y divide-border max-h-80 overflow-y-auto">
            {(dashboard?.recent_readings ?? []).map((r: any, i: number) => (
              <div key={i} className="flex items-center justify-between px-5 py-2.5">
                <div>
                  <p className="text-xs text-ink">{r.parameter_name}</p>
                  <p className="text-xs text-ink-muted">{r.device_id ? `Urządzenie #${r.device_id}` : `Czujnik #${r.sensor_id}`}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-accent">{r.value.toFixed(2)} {r.unit}</p>
                  <p className="text-xs text-ink-muted">{format(new Date(r.timestamp), 'HH:mm:ss')}</p>
                </div>
              </div>
            ))}
            {(!dashboard?.recent_readings?.length) && (
              <p className="px-5 py-4 text-sm text-ink-muted">Oczekiwanie na pierwsze odczyty...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
