import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cpu, Thermometer, Bell } from 'lucide-react'
import { StatCard, Card } from '../components/UI/Card'
import { useDeviceStore } from '../store/devices'
import { getDashboard } from '../api/system'
import { getDevices } from '../api/devices'
import { getSensors } from '../api/sensors'
import { DeviceStatusBadge } from '../components/Devices/DeviceStatusBadge'
import { ComparisonPicker } from '../components/Charts/ComparisonPicker'
import { PageSpinner } from '../components/UI/Spinner'
import { RpiMonitorWidget } from '../components/Dashboard/widgets/RpiMonitorWidget'
import { QuickActionsWidget } from '../components/Dashboard/widgets/QuickActionsWidget'
import { FavoriteParametersWidget } from '../components/Dashboard/widgets/FavoriteParametersWidget'
import { useComparisonSeries } from '../hooks/useComparisonSeries'
import type { TimeRange } from '../api/readings'

const RANGES: { label: string; value: TimeRange }[] = [
  { label: '1h', value: '1h' },
  { label: '6h', value: '6h' },
  { label: '24h', value: '24h' },
  { label: '7d', value: '7d' },
]

// Fixed layout, not a drag/resize grid: right column (Raspberry Pi, Quick
// actions) is narrow and utility-focused, left column (2/3 width) is the
// main monitoring content - favorite parameters, a multi-series parameter
// chart, then the controller list. On narrow screens the columns stack,
// left column first.
export default function Dashboard() {
  const { setDevices, setSensors } = useDeviceStore()
  const devices = useDeviceStore((s) => s.devices)
  const sensors = useDeviceStore((s) => s.sensors)
  const [dashboard, setDashboard] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const comparison = useComparisonSeries('1h')

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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Urządzenia online" value={devicesOnline} color="green" icon={<Cpu size={20} />} />
        <StatCard label="Urządzenia offline" value={devicesOffline} color="red" icon={<Cpu size={20} />} />
        <StatCard label="Czujniki" value={sensors.length} color="blue" icon={<Thermometer size={20} />} />
        <StatCard label="Aktywne alerty" value={dashboard?.active_alerts ?? 0} color={dashboard?.active_alerts ? 'red' : 'green'} icon={<Bell size={20} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">
          <FavoriteParametersWidget />

          <Card title="Podgląd parametru">
            <div className="p-3" style={{ minHeight: 360 }}>
              <ComparisonPicker
                devices={devices}
                series={comparison.series}
                range={comparison.range}
                ranges={RANGES}
                onRangeChange={comparison.changeRange}
                onAdd={comparison.addSeries}
                onRemove={comparison.removeSeries}
                height={300}
              />
            </div>
          </Card>

          <Card title="Sterowniki" action={<Link to="/devices" className="text-xs text-accent hover:text-accent-strong shrink-0">Zobacz wszystkie</Link>}>
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
          </Card>
        </div>

        <div className="space-y-4">
          <RpiMonitorWidget />
          <QuickActionsWidget />
        </div>
      </div>
    </div>
  )
}
