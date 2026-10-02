import { useEffect, useState } from 'react'
import { Cpu, Thermometer, Bell, Download } from 'lucide-react'
import { downloadComparisonCsv } from '../utils/comparisonCsv'
import { StatCard, Card } from '../components/UI/Card'
import { useDeviceStore } from '../store/devices'
import { getDashboard } from '../api/system'
import { getDevices } from '../api/devices'
import { getSensors } from '../api/sensors'
import { SiteOverviewWidget } from '../components/Dashboard/widgets/SiteOverviewWidget'
import { deviceSummary } from '../utils/registers'
import { ComparisonPicker } from '../components/Charts/ComparisonPicker'
import { PageSpinner } from '../components/UI/Spinner'
import { RpiMonitorWidget } from '../components/Dashboard/widgets/RpiMonitorWidget'
import { RecentEventsWidget } from '../components/Dashboard/widgets/RecentEventsWidget'
import { useAuthStore } from '../store/auth'
import { FavoriteParametersWidget } from '../components/Dashboard/widgets/FavoriteParametersWidget'
import { useComparisonSeries } from '../hooks/useComparisonSeries'
import type { TimeRange } from '../api/readings'

const RANGES: { label: string; value: TimeRange }[] = [
  { label: '1h', value: '1h' },
  { label: '6h', value: '6h' },
  { label: '24h', value: '24h' },
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: '90d', value: '90d' },
  { label: '1 rok', value: '1y' },
]

// Fixed layout, not a drag/resize grid: right column (recent events, Raspberry
// actions) is narrow and utility-focused, left column (2/3 width) is the
// main monitoring content - favorite parameters, a multi-series parameter
// chart, then the controller list. On narrow screens the columns stack,
// left column first.
export default function Dashboard() {
  // Per-field selectors: destructuring the store subscribes to every change,
  // so each incoming reading re-rendered the dashboard and its charts.
  const setDevices = useDeviceStore((s) => s.setDevices)
  const setSensors = useDeviceStore((s) => s.setSensors)
  const devices = useDeviceStore((s) => s.devices)
  const sensors = useDeviceStore((s) => s.sensors)
  const canReadLogs = useAuthStore((s) => s.can('log:read'))
  // Selector returns a number, so the page re-renders only when the count
  // changes - not on every incoming reading.
  const liveAlarmFlags = useDeviceStore((s) =>
    s.devices.reduce((n, d) => n + deviceSummary(d, s.liveReadings[d.id] ?? {}).activeAlarms.length, 0))
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

  // Live controller alarm flags (sensor fault, LO/HI, alarm relay) plus
  // ongoing threshold-rule alarms - the same alarms "Stan obiektu" lists.
  const activeAlarms = (dashboard?.active_rule_alarms ?? 0) + liveAlarmFlags
  const devicesOnline = devices.filter((d) => d.status === 'online').length
  const devicesOffline = devices.filter((d) => d.status === 'offline').length

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Urządzenia online" value={devicesOnline} color="green" icon={<Cpu size={20} />} to="/devices" />
        <StatCard label="Urządzenia offline" value={devicesOffline} color={devicesOffline ? 'red' : 'green'} icon={<Cpu size={20} />} to="/devices" />
        <StatCard label="Czujniki" value={sensors.length} color="blue" icon={<Thermometer size={20} />} to="/sensors" />
        <StatCard label="Aktywne alarmy" value={activeAlarms} color={activeAlarms ? 'red' : 'green'} icon={<Bell size={20} />} to="/alerts" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">
          <SiteOverviewWidget devices={devices} />

          <FavoriteParametersWidget />

          {/* Took over from the removed Trendy page: same picker, ranges up
              to a year and CSV export of the compared series. */}
          <Card
            title="Porównanie parametrów"
            action={comparison.series.length > 0 && (
              <button onClick={() => downloadComparisonCsv(comparison.series, comparison.range)}
                className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink border border-border px-2.5 py-1 rounded-lg transition-colors">
                <Download size={13} /> CSV
              </button>
            )}
          >
            {/* Grows with content - the fixed 360 px left a big empty box
                until the first series was added. */}
            <div className="p-3">
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
        </div>

        <div className="space-y-4">
          {canReadLogs && <RecentEventsWidget />}
          <RpiMonitorWidget />
        </div>
      </div>
    </div>
  )
}
