import ReactEChartsCore from 'echarts-for-react/lib/core'
import echarts from '../../utils/echarts'
import type { ParameterReadings } from '../../types/reading'
import type { ChartThreshold } from '../../api/readings'

interface Props {
  data: ParameterReadings[]
  height?: number
  title?: string
  // Series switched off, keyed by ParameterReadings.id when present and by
  // parameter_name otherwise. Hidden series stay in the chart's series list
  // and are dimmed via legend.selected rather than filtered out of `data` -
  // dropping them would shift every later series onto a different colour.
  hiddenSeries?: string[]
  // Horizontal reference lines (setpoint, alarm limits) - drawn as dashed
  // markLines rather than as flat series, so they never compete with the
  // probe curves for colours or legend space.
  thresholds?: ChartThreshold[]
}

const THRESHOLD_COLORS: Record<ChartThreshold['kind'], string> = {
  setpoint: '#3E4B48',
  alarm_low: '#C53030',
  alarm_high: '#C53030',
}

// Categorical theme: slots 1-2 are the app's own brand hues (accent blue, teal),
// slots 3-8 fill out an 8-hue fixed order validated for CVD separation
// (see dataviz skill: color-formula.md six checks). Never cycle/reorder per-chart.
const COLORS = ['#2B6CB0', '#0D9488', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834']

export function TimeSeriesChart({ data, height = 300, title, hiddenSeries = [], thresholds = [] }: Props) {
  if (!data.length || data.every((d) => !d.readings.length)) {
    return (
      <div className="flex items-center justify-center text-ink-muted text-sm" style={{ height }}>
        Brak danych w wybranym zakresie
      </div>
    )
  }

  const seriesName = (d: ParameterReadings) => d.parameter_name + (d.unit ? ` (${d.unit})` : '')
  // Controlled selection, so a toggle survives the option being rebuilt -
  // with `notMerge` an uncontrolled legend forgot what was switched off
  // every time the time range changed.
  const selected: Record<string, boolean> = {}
  data.forEach((d) => {
    selected[seriesName(d)] = !hiddenSeries.includes(d.id ?? d.parameter_name)
  })
  const anyHidden = Object.values(selected).some((v) => !v)

  // One value axis per unit: a 400 V supply on the same scale as 6 A and
  // 35 Hz flattened every other curve. The first two units get visible
  // axes (left, right); further units still get their own - hidden -
  // scale, their values stay readable in the tooltip.
  // Visible series' units first, so the two labelled axes belong to what
  // is actually drawn - not to a switched-off setpoint series.
  const visibleUnits = Array.from(new Set(data.filter((d) => selected[seriesName(d)]).map((d) => d.unit ?? '')))
  const units = Array.from(new Set([...visibleUnits, ...data.map((d) => d.unit ?? '')]))
  const axisOf = (d: ParameterReadings) => units.indexOf(d.unit ?? '')
  const thresholdAxis = Math.max(0, units.indexOf(thresholds[0]?.unit ?? units[0]))

  const series = data.map((d, i) => ({
    name: seriesName(d),
    type: 'line',
    yAxisIndex: axisOf(d),
    smooth: true,
    symbol: 'none',
    data: d.readings.map((r) => [new Date(r.timestamp).getTime(), r.value]),
    lineStyle: { color: COLORS[i % COLORS.length], width: 2, cap: 'round', join: 'round' },
    itemStyle: { color: COLORS[i % COLORS.length] },
  })) as any[]

  if (thresholds.length) {
    // Carrier series with no data of its own: markLines hang off a series,
    // and a probe series could be switched off in the legend.
    series.push({
      name: '__thresholds',
      type: 'line',
      yAxisIndex: thresholdAxis,
      data: [],
      markLine: {
        silent: true,
        symbol: 'none',
        animation: false,
        data: thresholds.map((t) => ({
          name: t.label,
          yAxis: t.value,
          lineStyle: { color: THRESHOLD_COLORS[t.kind], type: 'dashed', width: 1.5 },
          label: {
            formatter: `${t.label}: ${t.value}${t.unit ? ' ' + t.unit : ''}`,
            position: 'insideEndTop',
            color: THRESHOLD_COLORS[t.kind],
            fontSize: 10,
          },
        })),
      },
    })
  }
  const thresholdValues = thresholds.map((t) => t.value)

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
          params.filter((p: any) => p.seriesName !== '__thresholds').map((p: any) => `<div>${p.marker}${p.seriesName}: <b>${Number(Number(p.value[1]).toFixed(2))}</b></div>`).join('')
      },
    },
    legend: {
      // Also shown for a lone series when it is switched off - otherwise
      // there would be no way to bring it back.
      show: series.length > 1 || anyHidden,
      // One scrollable row: with many series a wrapping legend grew over
      // the plot area and covered the y-axis labels.
      type: 'scroll',
      selected,
      // Only series currently shown: hidden ones stay in `series` (stable
      // colours) but listing them greyed-out turned an 8-probe chart's
      // legend into five pages of switched-off setpoints. They are switched
      // back on from the series picker instead.
      data: hiddenSeries.length || thresholds.length ? data.filter((d) => selected[seriesName(d)]).map(seriesName) : undefined,
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
    grid: { left: 60, right: visibleUnits.length > 1 ? 60 : 20, top: series.length > 1 || anyHidden ? 48 : 16, bottom: 55 },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: '#DCE6E4' } },
      axisLabel: { color: '#7D8E8A', fontSize: 10 },
      splitLine: { show: false },
    },
    yAxis: units.map((unit, i) => ({
      type: 'value',
      show: i < Math.min(2, visibleUnits.length || 1),
      position: i === 0 ? 'left' : 'right',
      name: visibleUnits.length > 1 && i < 2 ? unit : undefined,
      nameTextStyle: { color: '#7D8E8A', fontSize: 10 },
      scale: visibleUnits.length > 1,
      // Lines outside the data range would otherwise be drawn off-chart.
      ...(i === thresholdAxis && thresholdValues.length ? {
        min: (v: { min: number }) => Math.floor(Math.min(v.min, ...thresholdValues) - 1),
        max: (v: { max: number }) => Math.ceil(Math.max(v.max, ...thresholdValues) + 1),
      } : {}),
      axisLine: { lineStyle: { color: '#DCE6E4' } },
      axisLabel: { color: '#7D8E8A', fontSize: 10 },
      splitLine: { show: i === 0, lineStyle: { color: '#EEF3F2' } },
    })),
    series,
  }

  return <ReactEChartsCore echarts={echarts} option={option} style={{ height }} notMerge />
}
