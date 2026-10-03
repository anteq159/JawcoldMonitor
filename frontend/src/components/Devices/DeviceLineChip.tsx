import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Cable, AlertTriangle } from 'lucide-react'
import { getLines, getBusRequirements, lineMismatch, type BusLine, type BusRequirement } from '../../api/lines'
import { updateDevice } from '../../api/devices'
import type { Device } from '../../types/device'

// Which RS485 line a controller is on - next to its address on the device
// page. Only shown once there is more than one line; device:write users
// can move the controller to another line from here.
export function DeviceLineChip({ device, canWrite, onChanged }: { device: Device; canWrite: boolean; onChanged: (d: Device) => void }) {
  const [lines, setLines] = useState<BusLine[]>([])
  const [requirements, setRequirements] = useState<Record<string, BusRequirement>>({})
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    getLines().then(setLines).catch(() => {})
    getBusRequirements().then(setRequirements).catch(() => {})
  }, [])

  const current = lines.find((l) => l.id === device.line_id) ?? lines.find((l) => l.is_default)
  const requirement = device.profile?.manufacturer ? requirements[device.profile.manufacturer] : undefined
  const mismatch = lineMismatch(requirement, current)
  if (lines.length < 2 && !mismatch) return null

  const move = async (lineId: number) => {
    setSaving(true)
    try {
      onChanged(await updateDevice(device.id, { line_id: lineId }))
      toast.success('Przeniesiono sterownik na inną linię')
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Nie udało się zmienić linii')
    } finally {
      setSaving(false)
    }
  }

  return (
    <span className="flex items-center gap-1 text-xs text-ink-muted">
      <Cable size={11} />
      {canWrite && lines.length > 1 ? (
        <select value={current?.id ?? ''} disabled={saving} onChange={(e) => move(Number(e.target.value))}
          className="w-auto max-w-[18rem] bg-transparent border-0 py-0 pl-0 pr-6 text-xs text-ink-muted hover:text-accent focus:ring-0 cursor-pointer"
          title="Linia RS485 tego sterownika">
          {lines.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.frame})</option>)}
        </select>
      ) : (
        <span>{current ? `${current.name} (${current.frame})` : '—'}</span>
      )}
      {mismatch && (
        <span title={mismatch} className="text-warn"><AlertTriangle size={12} /></span>
      )}
    </span>
  )
}
