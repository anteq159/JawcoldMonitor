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
