import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cpu, Thermometer, Bell, Settings, RotateCcw, Plus } from 'lucide-react'
import { StatCard } from '../components/UI/Card'
import { useDeviceStore } from '../store/devices'
import { getDashboard } from '../api/system'
import { getDevices } from '../api/devices'
import { getSensors } from '../api/sensors'
import { DeviceStatusBadge } from '../components/Devices/DeviceStatusBadge'
import { PageSpinner } from '../components/UI/Spinner'
import { WidgetGrid, useWidgetLayout, type WidgetDef } from '../components/Dashboard/WidgetGrid'
import { WidgetCard } from '../components/Dashboard/WidgetCard'
import { ParameterTileWidget } from '../components/Dashboard/widgets/ParameterTileWidget'
import { FavoriteParametersWidget } from '../components/Dashboard/widgets/FavoriteParametersWidget'
import { QuickActionsWidget } from '../components/Dashboard/widgets/QuickActionsWidget'
import { MapWidget } from '../components/Dashboard/widgets/MapWidget'
import { RpiMonitorWidget } from '../components/Dashboard/widgets/RpiMonitorWidget'
import { AlarmHistoryWidget } from '../components/Dashboard/widgets/AlarmHistoryWidget'
import { format } from 'date-fns'

const WIDGETS: WidgetDef[] = [
  { id: 'parameter-tile', label: 'Podgląd parametru', repeatable: true, defaultLayout: { x: 0, y: 0, w: 4, h: 6, minW: 3, minH: 4 } },
  { id: 'favorite-parameters', label: 'Ulubione parametry', defaultLayout: { x: 4, y: 8, w: 4, h: 6, minW: 3, minH: 3 } },
  { id: 'rpi-monitor', label: 'Raspberry Pi i komunikacja', defaultLayout: { x: 4, y: 0, w: 4, h: 8, minW: 3, minH: 5 } },
  { id: 'quick-actions', label: 'Szybkie akcje', defaultLayout: { x: 8, y: 0, w: 4, h: 4, minW: 3, minH: 3 } },
  { id: 'alarm-history', label: 'Historia alarmów', defaultLayout: { x: 8, y: 4, w: 4, h: 6, minW: 3, minH: 3 } },
  { id: 'devices', label: 'Lista urządzeń', defaultLayout: { x: 0, y: 6, w: 6, h: 6, minW: 3, minH: 3 } },
  { id: 'readings', label: 'Ostatnie odczyty', defaultLayout: { x: 6, y: 14, w: 6, h: 6, minW: 3, minH: 3 } },
  { id: 'map', label: 'Mapa urządzeń', defaultLayout: { x: 0, y: 20, w: 12, h: 8, minW: 4, minH: 4 } },
]
const WIDGET_DEFS = Object.fromEntries(WIDGETS.map((w) => [w.id, w]))

const LAYOUT_KEY = 'jawcold-dashboard-layout'

export default function Dashboard() {
  const { setDevices, setSensors } = useDeviceStore()
  const devices = useDeviceStore((s) => s.devices)
  const sensors = useDeviceStore((s) => s.sensors)
  const [dashboard, setDashboard] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showConfig, setShowConfig] = useState(false)

  const { instances, layouts, setLayouts, resetLayout, addInstance, removeInstance, setVisible, setInstanceHeight } =
    useWidgetLayout(LAYOUT_KEY, WIDGETS)

  useEffect(() => {
    Promise.all([getDashboard(), getDevices(), getSensors()]).then(([dash, devs, sens]) => {
      setDashboard(dash)
      setDevices(devs)
      setSensors(sens)
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <PageSpinner />

  const devicesOnline = devices.filter((d) => d.status === 'online').length
  const devicesOffline = devices.filter((d) => d.status === 'offline').length
  const singletonTypes = WIDGETS.filter((w) => !w.repeatable)
  const parameterTileCount = instances.filter((i) => i.type === 'parameter-tile').length

  return (
    <div className="space-y-6">
      {/* Fixed KPI strip - always visible, not part of the draggable canvas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Urządzenia online" value={devicesOnline} color="green" icon={<Cpu size={20} />} />
        <StatCard label="Urządzenia offline" value={devicesOffline} color="red" icon={<Cpu size={20} />} />
        <StatCard label="Czujniki" value={sensors.length} color="blue" icon={<Thermometer size={20} />} />
        <StatCard label="Aktywne alerty" value={dashboard?.active_alerts ?? 0} color={dashboard?.active_alerts ? 'red' : 'green'} icon={<Bell size={20} />} />
      </div>

      <div className="flex items-center justify-end gap-2 flex-wrap">
        <button
          onClick={() => addInstance('parameter-tile')}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-ink-muted hover:text-ink hover:border-border-strong transition-colors"
        >
          <Plus size={13} />
          Dodaj kafelek parametru
        </button>
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
            {singletonTypes.map((w) => {
              const visible = instances.some((i) => i.type === w.id)
              return (
                <label key={w.id} className="flex items-center gap-2 cursor-pointer bg-surface-2 border border-border rounded-lg px-3 py-1.5">
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={() => setVisible(w.id, !visible)}
                    className="rounded border-border-strong bg-surface text-accent focus:ring-0"
                  />
                  <span className="text-sm text-ink-body">{w.label}</span>
                </label>
              )
            })}
            <span className="flex items-center gap-2 bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-sm text-ink-body">
              Podgląd parametru: {parameterTileCount} aktywnych
            </span>
          </div>
        </div>
      )}

      <WidgetGrid layouts={layouts} onLayoutChange={setLayouts}>
        {instances.map((inst) => {
          const def = WIDGET_DEFS[inst.type]
          if (!def) return null
          return (
            <div key={inst.instanceId}>
              {inst.type === 'parameter-tile' && (
                <ParameterTileWidget instanceId={inst.instanceId} onRemove={() => removeInstance(inst.instanceId)} />
              )}
              {inst.type === 'favorite-parameters' && (
                <FavoriteParametersWidget onHeightChange={(h) => setInstanceHeight(inst.instanceId, h)} />
              )}
              {inst.type === 'rpi-monitor' && <RpiMonitorWidget />}
              {inst.type === 'quick-actions' && <QuickActionsWidget />}
              {inst.type === 'alarm-history' && <AlarmHistoryWidget />}
              {inst.type === 'map' && <MapWidget />}

              {inst.type === 'devices' && (
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

              {inst.type === 'readings' && (
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
          )
        })}
      </WidgetGrid>
    </div>
  )
}
