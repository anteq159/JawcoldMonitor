import type { CompSeries } from '../hooks/useComparisonSeries'

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

export function downloadComparisonCsv(series: CompSeries[], range: string) {
  if (series.length === 0) return
  const blob = new Blob([toCsv(series)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `porownanie_${range}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
