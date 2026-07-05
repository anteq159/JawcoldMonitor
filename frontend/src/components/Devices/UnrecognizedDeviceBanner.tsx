import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Search, Settings2, Link2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { lookupManufacturer, updateDevice } from '../../api/devices'
import { getDeviceProfiles, type DeviceProfileDetail } from '../../api/deviceProfiles'
import { useAuthStore } from '../../store/auth'
import type { Device } from '../../types/device'

interface Props {
  device: Device
  onResolved: () => void
}

export function UnrecognizedDeviceBanner({ device, onResolved }: Props) {
  const canWrite = useAuthStore((s) => s.can('device:write'))
  const [looking, setLooking] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [profiles, setProfiles] = useState<DeviceProfileDetail[]>([])
  const [assignId, setAssignId] = useState('')
  const [assigning, setAssigning] = useState(false)

  useEffect(() => {
    getDeviceProfiles().then(setProfiles).catch(() => {})
  }, [])

  const runLookup = async () => {
    setLooking(true)
    try {
      const res = await lookupManufacturer(device.id)
      setResult(`${res.message} ${res.suggested_next_step}`)
    } catch {
      toast.error('Błąd wyszukiwania')
    } finally {
      setLooking(false)
    }
  }

  const assign = async () => {
    if (!assignId) return
    setAssigning(true)
    try {
      await updateDevice(device.id, { profile_id: Number(assignId) })
      toast.success('Profil przypisany')
      onResolved()
    } catch {
      toast.error('Błąd przypisania profilu')
    } finally {
      setAssigning(false)
    }
  }

  return (
    <div className="bg-warn-bg border border-warn/30 rounded-xl p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="text-warn shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-ink">Nierozpoznany sterownik</h3>
          <p className="text-sm text-ink-body mt-1">
            To urządzenie odpowiada na magistrali, ale zgłoszony producent
            {device.detected_manufacturer && <> (<span className="font-mono">{device.detected_manufacturer}</span>)</>}
            {' '}nie ma jeszcze zarejestrowanego sterownika ani mapy rejestrów w jawcold — odczyty poniżej są surowe i nieskalibrowane.
          </p>

          {result && (
            <p className="text-sm text-ink-body mt-3 bg-surface border border-border rounded-lg p-3">{result}</p>
          )}

          {canWrite && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {!result && (
                <button
                  onClick={runLookup}
                  disabled={looking}
                  className="flex items-center gap-1.5 text-xs bg-accent hover:bg-accent-strong disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Search size={13} /> {looking ? 'Wyszukiwanie…' : 'Wyszukaj profil producenta'}
                </button>
              )}
              <Link
                to="/configuration"
                className="flex items-center gap-1.5 text-xs border border-border text-ink-muted hover:text-ink px-3 py-1.5 rounded-lg transition-colors"
              >
                <Settings2 size={13} /> Dodaj profil ręcznie
              </Link>
            </div>
          )}

          {canWrite && profiles.length > 0 && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-warn/20">
              <select
                value={assignId}
                onChange={(e) => setAssignId(e.target.value)}
                className="w-56 bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-colors"
              >
                <option value="">Przypisz istniejący profil…</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button
                onClick={assign}
                disabled={!assignId || assigning}
                className="flex items-center gap-1.5 text-xs border border-border text-ink-muted hover:text-ink disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Link2 size={13} /> {assigning ? 'Przypisywanie…' : 'Przypisz'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
