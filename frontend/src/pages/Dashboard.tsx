import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cpu, Thermometer, Bell, Settings, Plus, X, RotateCcw } from 'lucide-react'
import { StatCard } from '../components/UI/Card'
import { useDeviceStore } from '../store/devices'
import { getDashboard } from '../api/system'
import { getDevices } from '../api/devices'
import { getSensors } from '../api/sensors'
import { getDeviceReadings, type TimeRange } from '../api/readings'
import { DeviceStatusBadge } from '../components/Devices/DeviceStatusBadge'
import { TimeSeriesChart } from '../components/Charts/TimeSeriesChart'
import { PageSpinner } from '../components/UI/Spinner'
import { WidgetGrid, useWidgetLayout, type WidgetDef } from '../components/Dashboard/WidgetGrid'
import { WidgetCard } from '../components/Dashboard/WidgetCard'
import { FavoritesWidget } from '../components/Dashboard/widgets/FavoritesWidget'
import { QuickActionsWidget } from '../components/Dashboard/widgets/QuickActionsWidget'
import { MapWidget } from '../components/Dashboard/widgets/MapWidget'
import { RpiMonitorWidget } from '../components/Dashboard/widgets/RpiMonitorWidget'
import { AlarmHistoryWidget } from '../components/Dashboard/widgets/AlarmHistoryWidget'
import { format } from 'date-fns'
import type { ParameterReadings } from '../types/reading'

const WIDGETS: WidgetDef[] = [
  { id: 'comparison', label: 'Porównanie urządzeń', defaultLayout: { x: 0, y: 0, w: 8, h: 8, minW: 4, minH: 4 } },
  { id: 'rpi-monitor', label: 'Raspberry Pi i komunikacja', defaultLayout: { x: 8, y: 0, w: 4, h: 8, minW: 3, minH: 5 } },
  { id: 'quick-actions', label: 'Szybkie akcje', defaultLayout: { x: 0, y: 8, w: 4, h: 4, minW: 3, minH: 3 } },
  { id: 'favorites', label: 'Ulubione urządzenia', defaultLayout: { x: 4, y: 8, w: 4, h: 6, minW: 3, minH: 3 } },
  { id: 'alarm-history', label: 'Historia alarmów', defaultLayout: { x: 8, y: 8, w: 4, h: 6, minW: 3, minH: 3 } },
  { id: 'devices', label: 'Lista urządzeń', defaultLayout: { x: 0, y: 12, w: 6, h: 6, minW: 3, minH: 3 } },
  { id: 'readings', label: 'Ostatnie odczyty', defaultLayout: { x: 6, y: 14, w: 6, h: 6, minW: 3, minH: 3 } },
  { id: 'map', label: 'Mapa urządzeń', defaultLayout: { x: 0, y: 20, w: 12, h: 8, minW: 4, minH: 4 } },
]

const VISIBILITY_KEY = 'jawcold-dashboard-widgets'
const LAYOUT_KEY = 'jawcold-dashboard-layout'

function loadVisibility(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(VISIBILITY_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return Object.fromEntries(WIDGETS.map((w) => [w.id, true]))
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
  const { setDevices, setSensors } = useDeviceStore()
  const devices = useDeviceStore((s) => s.devices)
  const sensors = useDeviceStore((s) => s.sensors)
  const [dashboard, setDashboard] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const [visibility, setVisibility] = useState<Record<string, boolean>>(loadVisibility)
  const [showConfig, setShowConfig] = useState(false)
  const { layout, setLayout, resetLayout } = useWidgetLayout(LAYOUT_KEY, WIDGETS)

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

  const toggleWidget = (id: string) => {
    const next = { ...visibility, [id]: !visibility[id] }
    setVisibility(next)
    localStorage.setItem(VISIBILITY_KEY, JSON.stringify(next))
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

  const devicesOnline = devices.filter((d) => d.status === 'online').length
  const devicesOffline = devices.filter((d) => d.status === 'offline').length
  const mergedChart: ParameterReadings[] = compSeries.flatMap(s => s.data)
  const visibleWidgets = WIDGETS.filter((w) => visibility[w.id] !== false)

  return (
    <div className="space-y-6">
      {/* Fixed KPI strip - always visible, not part of the draggable canvas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Urządzenia online" value={devicesOnline} color="green" icon={<Cpu size={20} />} />
        <StatCard label="Urządzenia offline" value={devicesOffline} color="red" icon={<Cpu size={20} />} />
        <StatCard label="Czujniki" value={sensors.length} color="blue" icon={<Thermometer size={20} />} />
        <StatCard label="Aktywne alerty" value={dashboard?.active_alerts ?? 0} color={dashboard?.active_alerts ? 'red' : 'green'} icon={<Bell size={20} />} />
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={resetLayout}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-ink-muted hover:text-ink hover:border-border-strong transition-colors"
        >
          <RotateCcw size={13} />
          Resetuj układ
        </button>
        <button
          onClick={() => setShowConfig(!showConfig)}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${showConfig ? 'bg-accent-soft border-accent/30 text-accent-strong' : 'border-border text-ink-muted hover:text-ink hover:border-border-strong'}`}
        >
          <Settings size={13} />
          Konfiguruj widżety
        </button>
      </div>

      {showConfig && (
        <div className="bg-surface border border-border rounded-xl shadow-panel p-4">
          <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3">Widoczne widżety (przeciągnij i zmień rozmiar na pulpicie)</p>
          <div className="flex flex-wrap gap-2">
            {WIDGETS.map(w => (
              <label key={w.id} className="flex items-center gap-2 cursor-pointer bg-surface-2 border border-border rounded-lg px-3 py-1.5">
                <input
                  type="checkbox"
                  checked={visibility[w.id] !== false}
                  onChange={() => toggleWidget(w.id)}
                  className="rounded border-border-strong bg-surface text-accent focus:ring-0"
                />
                <span className="text-sm text-ink-body">{w.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <WidgetGrid layout={layout.filter((l) => visibility[l.i] !== false)} onLayoutChange={setLayout}>
        {visibleWidgets.map((w) => (
          <div key={w.id}>
            {w.id === 'comparison' && (
              <WidgetCard
                title="Porównanie urządzeń"
                action={
                  <div className="flex items-center gap-2">
                    {compSeries.length > 0 && (
                      <div className="flex gap-1">
                        {RANGES.map(r => (
                          <button key={r.value} onClick={() => refreshChart(r.value)}
                            className={`text-xs px-2 py-0.5 rounded-md transition-colors ${compRange === r.value ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink'}`}>
                            {r.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => { setShowAddSeries(true); setPickDevice(null) }}
                      className="flex items-center gap-1 text-xs bg-accent hover:bg-accent-strong text-white px-2 py-1 rounded-lg transition-colors"
                    >
                      <Plus size={12} /> Dodaj
                    </button>
                  </div>
                }
              >
                <div className="p-3 h-full flex flex-col">
                  {showAddSeries && (
                    <div className="mb-3 space-y-2 shrink-0">
                      <div>
                        <p className="text-xs text-ink-muted mb-1.5">1. Wybierz urządzenie:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {devices.map(d => (
                            <button key={d.id} onClick={() => setPickDevice(d.id)}
                              className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${pickDevice === d.id ? 'bg-accent border-accent text-white' : 'border-border text-ink-muted hover:text-ink'}`}>
                              {d.name}
                            </button>
                          ))}
                        </div>
                      </div>
                      {pickDevice !== null && (() => {
                        const dev = devices.find(d => d.id === pickDevice)
                        return dev && dev.parameters.length > 0 ? (
                          <div>
                            <p className="text-xs text-ink-muted mb-1.5">2. Wybierz parametr:</p>
                            <div className="flex flex-wrap gap-1.5">
                              {dev.parameters.map(p => (
                                <button key={p.id} onClick={() => addSeries(pickDevice, p.name)}
                                  className="text-xs px-2.5 py-1 rounded-lg border border-border text-ink-body hover:text-ink hover:border-border-strong transition-colors">
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
                    <div className="mb-2 flex flex-wrap gap-1.5 shrink-0">
                      {compSeries.map((s, i) => (
                        <span key={i} className="flex items-center gap-1.5 text-xs bg-surface-2 border border-border rounded-full px-2.5 py-0.5">
                          <span className="text-ink-body">{s.deviceName} · {s.paramName}</span>
                          <button onClick={() => removeSeries(i)} className="text-ink-muted hover:text-crit"><X size={10} /></button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex-1 min-h-0">
                    {mergedChart.length > 0 ? (
                      <TimeSeriesChart data={mergedChart} height={220} />
                    ) : (
                      <div className="h-full flex items-center justify-center text-sm text-ink-muted text-center px-4">
                        Kliknij "Dodaj" aby wybrać urządzenie i parametr do porównania
                      </div>
                    )}
                  </div>
                </div>
              </WidgetCard>
            )}

            {w.id === 'rpi-monitor' && <RpiMonitorWidget />}
            {w.id === 'quick-actions' && <QuickActionsWidget />}
            {w.id === 'favorites' && <FavoritesWidget />}
            {w.id === 'alarm-history' && <AlarmHistoryWidget />}
            {w.id === 'map' && <MapWidget />}

            {w.id === 'devices' && (
              <WidgetCard title="Sterowniki" action={<Link to="/devices" className="text-xs text-accent hover:text-accent-strong shrink-0">Zobacz wszystkie</Link>}>
                <div className="divide-y divide-border">
                  {devices.slice(0, 8).map((d) => (
                    <Link key={d.id} to={`/devices/${d.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-surface-2 transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm text-ink truncate">{d.name}</p>
                        <p className="text-xs text-ink-muted">Adres {d.modbus_address}</p>
                      </div>
                      <DeviceStatusBadge status={d.status} />
                    </Link>
                  ))}
                  {devices.length === 0 && (
                    <p className="px-4 py-4 text-sm text-ink-muted">Brak urządzeń — skaner RS485 pracuje...</p>
                  )}
                </div>
              </WidgetCard>
            )}

            {w.id === 'readings' && (
              <WidgetCard title="Ostatnie odczyty">
                <div className="divide-y divide-border">
                  {(dashboard?.recent_readings ?? []).map((r: any, i: number) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2">
                      <div className="min-w-0">
                        <p className="text-xs text-ink truncate">{r.parameter_name}</p>
                        <p className="text-xs text-ink-muted">{r.device_id ? `Urządzenie #${r.device_id}` : `Czujnik #${r.sensor_id}`}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-accent">{r.value.toFixed(2)} {r.unit}</p>
                        <p className="text-xs text-ink-muted">{format(new Date(r.timestamp), 'HH:mm:ss')}</p>
                      </div>
                    </div>
                  ))}
                  {(!dashboard?.recent_readings?.length) && (
                    <p className="px-4 py-4 text-sm text-ink-muted">Oczekiwanie na pierwsze odczyty...</p>
                  )}
                </div>
              </WidgetCard>
            )}
          </div>
        ))}
      </WidgetGrid>
    </div>
  )
}
