import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { getDevices } from '../api/devices'
import { useComparisonSeries, type CompSeries } from '../hooks/useComparisonSeries'
import { ComparisonPicker } from '../components/Charts/ComparisonPicker'
import { Card } from '../components/UI/Card'
import { PageSpinner } from '../components/UI/Spinner'
import type { Device } from '../types/device'
import type { TimeRange } from '../api/readings'

const RANGES: { label: string; value: TimeRange }[] = [
  { label: '1h', value: '1h' },
  { label: '6h', value: '6h' },
  { label: '24h', value: '24h' },
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
]

function toCsv(series: CompSeries[]): string {
  // Wide format: one column per series, rows aligned by the union of
  // timestamps. Devices poll independently, so most rows will have gaps in
  // some columns - that's an honest reflection of async multi-device data,
  // not resampled/interpolated.
  const timestamps = new Set<string>()
  series.forEach((s) => s.data.forEach((d) => d.readings.forEach((r) => timestamps.add(r.timestamp))))
  const sortedTs = Array.from(timestamps).sort()

  const columns = series.flatMap((s) =>
    s.data.map((d) => ({
      key: `${s.deviceName} · ${d.parameter_name}`,
      byTs: new Map(d.readings.map((r) => [r.timestamp, r.value])),
    }))
  )

  const header = ['timestamp', ...columns.map((c) => c.key)]
  const lines = [header.join(',')]
  for (const ts of sortedTs) {
    lines.push([ts, ...columns.map((c) => c.byTs.get(ts) ?? '')].join(','))
  }
  return lines.join('\n')
}

export default function Trends() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const comparison = useComparisonSeries('24h')

  useEffect(() => {
    getDevices().then(setDevices).finally(() => setLoading(false))
  }, [])

  const exportCsv = () => {
    if (comparison.series.length === 0) return
    const csv = toCsv(comparison.series)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trendy_${comparison.range}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-ink-muted">Porównaj dowolne parametry wielu urządzeń na jednym wykresie.</p>
        <button
          onClick={exportCsv}
          disabled={comparison.series.length === 0}
          className="flex items-center gap-2 text-ink-muted hover:text-ink border border-border disabled:opacity-40 text-sm px-3 py-2 rounded-lg transition-colors"
        >
          <Download size={14} /> Eksportuj CSV
        </button>
      </div>

      <Card>
        <div className="p-5" style={{ minHeight: 520 }}>
          <ComparisonPicker
            devices={devices}
            series={comparison.series}
            range={comparison.range}
            ranges={RANGES}
            onRangeChange={comparison.changeRange}
            onAdd={comparison.addSeries}
            onRemove={comparison.removeSeries}
            height={460}
          />
        </div>
      </Card>
    </div>
  )
}
