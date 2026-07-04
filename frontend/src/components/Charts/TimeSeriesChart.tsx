import ReactECharts from 'echarts-for-react'
import type { ParameterReadings } from '../../types/reading'

interface Props {
  data: ParameterReadings[]
  height?: number
  title?: string
}

// Categorical theme: slots 1-2 are the app's own brand hues (accent blue, teal),
// slots 3-8 fill out an 8-hue fixed order validated for CVD separation
// (see dataviz skill: color-formula.md six checks). Never cycle/reorder per-chart.
const COLORS = ['#2B6CB0', '#0D9488', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834']

export function TimeSeriesChart({ data, height = 300, title }: Props) {
  if (!data.length || data.every((d) => !d.readings.length)) {
    return (
      <div className="flex items-center justify-center text-ink-muted text-sm" style={{ height }}>
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
    lineStyle: { color: COLORS[i % COLORS.length], width: 2, cap: 'round', join: 'round' },
    itemStyle: { color: COLORS[i % COLORS.length] },
  }))

  const option = {
    backgroundColor: 'transparent',
    title: title ? { text: title, textStyle: { color: '#3E4B48', fontSize: 13, fontWeight: 600 } } : undefined,
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#FFFFFF',
      borderColor: '#DCE6E4',
      textStyle: { color: '#1B2624', fontSize: 12 },
      extraCssText: 'box-shadow: 0 4px 12px rgba(27,38,36,0.08);',
      formatter: (params: any[]) => {
        const time = new Date(params[0].axisValue).toLocaleString('pl-PL')
        return `<div style="font-size:11px;color:#7D8E8A;margin-bottom:4px">${time}</div>` +
          params.map((p: any) => `<div>${p.marker}${p.seriesName}: <b>${Number(p.value[1]).toFixed(2)}</b></div>`).join('')
      },
    },
    legend: {
      show: series.length > 1,
      textStyle: { color: '#7D8E8A', fontSize: 11 },
      top: 0,
    },
    dataZoom: [
      { type: 'inside', start: 0, end: 100 },
      {
        type: 'slider',
        height: 20,
        bottom: 0,
        borderColor: '#DCE6E4',
        backgroundColor: '#EEF3F2',
        dataBackground: { areaStyle: { color: '#C3D2CF' } },
        fillerColor: 'rgba(43,108,176,0.12)',
        textStyle: { color: '#7D8E8A' },
      },
    ],
    grid: { left: 60, right: 20, top: series.length > 1 ? 40 : 16, bottom: 55 },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: '#DCE6E4' } },
      axisLabel: { color: '#7D8E8A', fontSize: 10 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: '#DCE6E4' } },
      axisLabel: { color: '#7D8E8A', fontSize: 10 },
      splitLine: { lineStyle: { color: '#EEF3F2' } },
    },
    series,
  }

  return <ReactECharts option={option} style={{ height }} notMerge />
}
