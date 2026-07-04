import type { DeviceProfile } from '../../types/device'

// Distinct hues from the app's own categorical chart palette (see
// TimeSeriesChart.tsx) - deliberately NOT the good/warn/crit status colors,
// since manufacturer identity and operational status must never share hues.
const COLORS: Record<string, string> = {
  Danfoss: 'text-[#4a3aa7] bg-[#4a3aa7]/10 border-[#4a3aa7]/25',
  Carel: 'text-[#0D9488] bg-[#0D9488]/10 border-[#0D9488]/25',
  Eliwell: 'text-[#eb6834] bg-[#eb6834]/10 border-[#eb6834]/25',
}

const GENERIC = 'text-ink-muted bg-surface-2 border-border-strong'

export function ManufacturerBadge({ profile }: { profile: DeviceProfile | null | undefined }) {
  const manufacturer = profile?.manufacturer
  const color = manufacturer ? (COLORS[manufacturer] ?? GENERIC) : GENERIC

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${color}`}>
      {manufacturer ?? 'Generyczny'}
    </span>
  )
}
