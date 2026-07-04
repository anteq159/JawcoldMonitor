import ReactECharts from 'echarts-for-react'
import type { ParameterReadings } from '../../types/reading'

interface Props {
  data: ParameterReadings[]
  height?: number
  title?: string
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316']

export function TimeSeriesChart({ data, height = 300, title }: Props) {
  if (!data.length || data.every((d) => !d.readings.length)) {
    return (
      <div className="flex items-center justify-center text-gray-500 text-sm" style={{ height }}>
        Brak danych w wybranym zakresie
      </div>
    )
  }

  const series = data.map((d, i) => ({
    name: d.parameter_name + (d.unit ? ` (${d.unit})` : ''),
    type: 'line',
    smooth: true,
    symbol: 'none',
    data: d.readings.map((r) => [new Date(r.timestamp).getTime(), r.value]),
    lineStyle: { color: COLORS[i % COLORS.length], width: 2 },
    itemStyle: { color: COLORS[i % COLORS.length] },
  }))

  const option = {
    backgroundColor: 'transparent',
    title: title ? { text: title, textStyle: { color: '#d1d5db', fontSize: 13 } } : undefined,
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1f2937',
      borderColor: '#374151',
      textStyle: { color: '#f9fafb', fontSize: 12 },
      formatter: (params: any[]) => {
        const time = new Date(params[0].axisValue).toLocaleString('pl-PL')
        return `<div style="font-size:11px;color:#9ca3af;margin-bottom:4px">${time}</div>` +
          params.map((p: any) => `<div>${p.marker}${p.seriesName}: <b>${Number(p.value[1]).toFixed(2)}</b></div>`).join('')
      },
    },
    legend: {
      textStyle: { color: '#9ca3af', fontSize: 11 },
      top: 0,
    },
    dataZoom: [
      { type: 'inside', start: 0, end: 100 },
      { type: 'slider', height: 20, bottom: 0, borderColor: '#374151', backgroundColor: '#111827', dataBackground: { areaStyle: { color: '#1e3a5f' } }, fillerColor: 'rgba(59,130,246,0.2)', textStyle: { color: '#6b7280' } },
    ],
    grid: { left: 60, right: 20, top: 40, bottom: 55 },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: '#374151' } },
      axisLabel: { color: '#6b7280', fontSize: 10 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: '#374151' } },
      axisLabel: { color: '#6b7280', fontSize: 10 },
      splitLine: { lineStyle: { color: '#1f2937' } },
    },
    series,
  }

  return <ReactECharts option={option} style={{ height }} notMerge />
}
