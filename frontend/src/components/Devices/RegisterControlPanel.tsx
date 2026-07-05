import { useState } from 'react'
import { Pencil, Check, X, Lock, Star } from 'lucide-react'
import toast from 'react-hot-toast'
import { useDeviceStore } from '../../store/devices'
import { writeDeviceRegister } from '../../api/devices'
import { useFavoriteParameters } from '../../hooks/useFavoriteParameters'
import type { RegisterDefinition } from '../../api/deviceProfiles'

interface Props {
  deviceId: number
  registers: RegisterDefinition[]
  profileName: string
}

// Every register from the device's profile, live - not just the curated
// device.parameters subset - with inline editing for the ones marked
// writable (setpoints, differentials). Supersedes the old static,
// read-only "Mapa rejestrow" reference table.
export function RegisterControlPanel({ deviceId, registers, profileName }: Props) {
  const liveReadings = useDeviceStore((s) => s.liveReadings[deviceId] || {})
  const [editing, setEditing] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [saving, setSaving] = useState(false)
  const { isFavorite, toggleFavorite } = useFavoriteParameters()

  const startEdit = (register: RegisterDefinition) => {
    const current = liveReadings[register.name]?.value
    setInputValue(current !== undefined ? String(current) : '')
    setEditing(register.name)
  }

  const cancelEdit = () => setEditing(null)

  const save = async (register: RegisterDefinition) => {
    const value = parseFloat(inputValue)
    if (Number.isNaN(value)) {
      toast.error('Nieprawidłowa wartość')
      return
    }
    setSaving(true)
    try {
      await writeDeviceRegister(deviceId, register.name, value)
      toast.success(`Zapisano „${register.name}” = ${value}`)
      setEditing(null)
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Błąd zapisu')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="px-5 py-2 text-xs font-semibold text-ink-muted uppercase tracking-wide"></th>
            <th className="px-3 py-2 text-xs font-semibold text-ink-muted uppercase tracking-wide">Adres</th>
            <th className="px-3 py-2 text-xs font-semibold text-ink-muted uppercase tracking-wide">Nazwa</th>
            <th className="px-3 py-2 text-xs font-semibold text-ink-muted uppercase tracking-wide">Wartość</th>
            <th className="px-3 py-2 text-xs font-semibold text-ink-muted uppercase tracking-wide">Typ danych</th>
            <th className="px-5 py-2 text-xs font-semibold text-ink-muted uppercase tracking-wide"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {registers.map((r) => {
            const live = liveReadings[r.name]
            const isEditing = editing === r.name
            const favorite = isFavorite('device', deviceId, r.name)
            return (
              <tr key={r.id}>
                <td className="px-5 py-2 align-top">
                  <button
                    onClick={() => toggleFavorite('device', deviceId, r.name)}
                    className={favorite ? 'text-warn hover:text-warn/80' : 'text-ink-muted/40 hover:text-ink-muted'}
                    title={favorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
                  >
                    <Star size={14} fill={favorite ? 'currentColor' : 'none'} />
                  </button>
                </td>
                <td className="px-3 py-2 font-mono text-ink-muted align-top">{r.address}</td>
                <td className="px-3 py-2 text-ink align-top">
                  {r.name}
                  {r.description && <p className="text-xs text-ink-muted font-normal">{r.description}</p>}
                </td>
                <td className="px-3 py-2 align-top">
                  {isEditing ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="any"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') save(r); if (e.key === 'Escape') cancelEdit() }}
                        autoFocus
                        className="w-24 bg-surface-2 border border-accent rounded-md px-2 py-1 text-ink text-sm focus:outline-none"
                      />
                      <button onClick={() => save(r)} disabled={saving} className="text-good hover:text-good/80 transition-colors" title="Zapisz">
                        <Check size={15} />
                      </button>
                      <button onClick={cancelEdit} className="text-ink-muted hover:text-ink transition-colors" title="Anuluj">
                        <X size={15} />
                      </button>
                    </div>
                  ) : (
                    <span className="text-ink font-medium">
                      {live ? live.value.toFixed(2) : '—'} {r.unit ?? live?.unit ?? ''}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-ink-muted align-top">
                  {r.data_type}{r.scale_factor !== 1 ? ` ×${r.scale_factor}` : ''}
                </td>
                <td className="px-5 py-2 text-right align-top">
                  {r.writable ? (
                    !isEditing && (
                      <button onClick={() => startEdit(r)} className="text-ink-muted hover:text-accent transition-colors" title="Zmień wartość">
                        <Pencil size={14} />
                      </button>
                    )
                  ) : (
                    <span title="Tylko do odczytu" className="text-ink-muted/50 inline-flex">
                      <Lock size={13} />
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="px-5 py-3 text-xs text-ink-muted border-t border-border">
        Profil {profileName} — reprezentatywna mapa rejestrów producenta. Wartości edytowalne (ikona ołówka) symulują
        zapis nastawy sterownika; zweryfikuj z oficjalną dokumentacją modelu przed użyciem z rzeczywistym urządzeniem.
      </p>
    </div>
  )
}
