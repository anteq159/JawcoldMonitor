// Where a controller variable belongs on screen - mirrors
// backend/app/services/register_category.py. An explicit category from the
// profile wins; otherwise it is derived from the Modbus object type and the
// writable flag, which is right for every built-in profile.

export type RegisterCategory = 'measurement' | 'setpoint' | 'parameter' | 'status' | 'alarm'

export const CATEGORY_LABELS: Record<RegisterCategory, string> = {
  measurement: 'Pomiar',
  setpoint: 'Nastawa',
  parameter: 'Parametr',
  status: 'Stan',
  alarm: 'Alarm',
}

interface RegisterLike {
  category?: RegisterCategory | null
  register_type?: string
  writable?: boolean
  is_alarm_register?: boolean
}

export function registerCategory(reg: RegisterLike): RegisterCategory {
  if (reg.category) return reg.category
  if (reg.is_alarm_register) return 'alarm'
  if (reg.register_type === 'coil' || reg.register_type === 'discrete_input') return 'status'
  if (reg.writable) return 'setpoint'
  return 'measurement'
}

export const isBinaryCategory = (c: RegisterCategory) => c === 'status' || c === 'alarm'

// Only live process values are plotted by default - setpoints are flat
// lines that squash the interesting curves, and on/off flags read as 0/1
// noise on a temperature axis.
export const isChartedByDefault = (c: RegisterCategory) => c === 'measurement'

// Decimal places from the register's resolution: a value scaled by 0.1 is
// shown as 4.2, not 4.20; raw integers (timers, counters) without decimals.
export function decimalsFor(scale?: number | null): number {
  if (!scale || scale >= 1) return 0
  return Math.min(3, Math.max(0, Math.ceil(-Math.log10(scale) - 1e-9)))
}

export function formatValue(value: number, scale?: number | null): string {
  const d = scale === undefined ? (Number.isInteger(value) ? 0 : 1) : decimalsFor(scale)
  return value.toFixed(d)
}

// Carel and others report an unplugged probe as a physically impossible
// value (MPXPRO: -204.8 / -806.4 / -812.8 °C) rather than as an error code.
export const isProbeMissing = (value: number, unit?: string | null) =>
  (unit === '°C' || unit === 'K') && value <= -200

interface DeviceLike {
  hidden_parameters: string[]
  card_parameters: string[]
  profile?: { registers?: Array<RegisterLike & { name: string; scale_factor?: number }> } | null
}

// What a one-line device summary shows (device list tile, dashboard): the
// picked card parameters, else the first measurements in profile order,
// plus the alarm flags that are currently active.
export function deviceSummary(
  device: DeviceLike,
  live: Record<string, { value: number; unit: string | null }>,
  maxValues = 3,
) {
  const registers = device.profile?.registers ?? []
  const byName = new Map(registers.map((r) => [r.name, r]))
  const categoryOf = (name: string): RegisterCategory => {
    const reg = byName.get(name)
    return reg ? registerCategory(reg) : 'measurement'
  }
  const visible = (name: string) => !device.hidden_parameters.includes(name)
  const picked = device.card_parameters.filter((n) => visible(n) && live[n])
  const names = picked.length
    ? picked
    : registers.length
      ? registers.filter((r) => registerCategory(r) === 'measurement' && visible(r.name) && live[r.name]).map((r) => r.name)
      // No profile: whatever the device reports, as before categories existed.
      : Object.keys(live).filter(visible)
  const values = names.slice(0, maxValues).map((name) => ({
    name,
    value: live[name].value,
    unit: live[name].unit,
    scale: byName.get(name)?.scale_factor,
    category: categoryOf(name),
  }))
  const activeAlarms = Object.entries(live)
    .filter(([name, r]) => visible(name) && categoryOf(name) === 'alarm' && r.value !== 0)
    .map(([name]) => name)
  return { values, activeAlarms, categoryOf }
}

// Polish plural: plural(5, 'alarm', 'alarmy', 'alarmów') -> "5 alarmów".
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  const word = n === 1 ? one : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many
  return `${n} ${word}`
}
