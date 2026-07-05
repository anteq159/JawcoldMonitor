import ReactECharts from 'echarts-for-react'
import type { ReadingPoint } from '../../types/reading'

interface Props {
  data: ReadingPoint[]
  unit?: string | null
  color?: string
  height?: number
}

// Compact trend view for dashboard tiles - no axes/zoom slider (that's what
// TimeSeriesChart is for), just a clean line with a faint area fill and an
// emphasized endpoint marker, plus a minimal hover tooltip.
export function Sparkline({ data, unit, color = '#2B6CB0', height = 90 }: Props) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center text-xs text-ink-muted" style={{ height }}>
        Zbieranie danych trendu...
      </div>
    )
  }

  const points = data.map((r): [number, number] => [new Date(r.timestamp).getTime(), r.value])

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#FFFFFF',
      borderColor: '#DCE6E4',
      textStyle: { color: '#1B2624', fontSize: 11 },
      extraCssText: 'box-shadow: 0 4px 12px rgba(27,38,36,0.08); padding: 6px 9px;',
      formatter: (params: any[]) => {
        const p = params.find((x) => x.seriesType === 'line') ?? params[0]
        const time = new Date(p.axisValue ?? p.value[0]).toLocaleTimeString('pl-PL')
        return `${time}: <b>${Number(p.value[1]).toFixed(2)}</b>${unit ? ' ' + unit : ''}`
      },
    },
    grid: { left: 4, right: 4, top: 8, bottom: 4 },
    xAxis: { type: 'time', show: false },
    yAxis: { type: 'value', show: false, scale: true },
    series: [
      {
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: points,
        lineStyle: { color, width: 2 },
        areaStyle: { color, opacity: 0.12 },
      },
      {
        type: 'scatter',
        data: [points[points.length - 1]],
        symbolSize: 7,
        itemStyle: { color, borderColor: '#FFFFFF', borderWidth: 1.5 },
        tooltip: { show: false },
      },
    ],
  }

  return <ReactECharts option={option} style={{ height }} notMerge />
}
