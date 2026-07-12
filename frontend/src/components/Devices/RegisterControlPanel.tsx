import { useState } from 'react'
import { Pencil, Check, X, Lock, Star, Eye, EyeOff, Tag } from 'lucide-react'
import toast from 'react-hot-toast'
import { useDeviceStore } from '../../store/devices'
import { useAuthStore } from '../../store/auth'
import { writeDeviceRegister } from '../../api/devices'
import { useFavoriteParameters } from '../../hooks/useFavoriteParameters'
import type { RegisterDefinition } from '../../api/deviceProfiles'

interface Props {
  deviceId: number
  registers: RegisterDefinition[]
  profileName: string
  hiddenNames: string[]
  aliases: Record<string, string>
  units: Record<string, string>
  editingVisibility: boolean
  onToggleHidden: (name: string) => void
  onRename: (realName: string, alias: string) => void
  onSetUnit: (realName: string, unit: string) => void
}

const REGISTER_TYPE_LABELS: Record<string, string> = {
  input: 'Input Register',
  coil: 'Coil',
  discrete_input: 'Discrete Input',
}

// Every register from the device's profile, live - not just the curated
// device.parameters subset - with inline editing for the ones marked
// writable (setpoints, differentials). Supersedes the old static,
// read-only "Mapa rejestrow" reference table.
// Quick unit choices for probe inputs whose physical meaning depends on the
// controller's own configuration (MPXPRO S6/S7: NTC temperature probe or
// 0-5V pressure probe on the same register). "(profil)" restores the default.
const UNIT_CHOICES = ['bar', '\u00b0C', 'K', 'kPa', '%']

export function RegisterControlPanel({
  deviceId, registers, profileName, hiddenNames, aliases, units, editingVisibility, onToggleHidden, onRename, onSetUnit,
}: Props) {
  const liveReadings = useDeviceStore((s) => s.liveReadings[deviceId] || {})
  const canWrite = useAuthStore((s) => s.can('device:write'))
  const [editing, setEditing] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameInput, setRenameInput] = useState('')
  const { isFavorite, toggleFavorite } = useFavoriteParameters()

  const startRename = (register: RegisterDefinition) => {
    setRenameInput(aliases[register.name] ?? register.name)
    setRenaming(register.name)
  }
  const cancelRename = () => setRenaming(null)
  const saveRename = (realName: string) => {
    const trimmed = renameInput.trim()
    onRename(realName, trimmed === realName ? '' : trimmed)
    setRenaming(null)
  }

  // Outside edit mode, hidden registers are fully absent from the table -
  // that's the display filter this whole feature exists for. Edit mode
  // shows everything (dimmed for hidden ones) so a hidden register can be
  // found again and restored.
  const visibleRegisters = editingVisibility ? registers : registers.filter((r) => !hiddenNames.includes(r.name))

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
            {editingVisibility && <th className="px-5 py-2 text-xs font-semibold text-ink-muted uppercase tracking-wide"></th>}
            <th className="px-5 py-2 text-xs font-semibold text-ink-muted uppercase tracking-wide"></th>
            <th className="px-3 py-2 text-xs font-semibold text-ink-muted uppercase tracking-wide">Adres</th>
            <th className="px-3 py-2 text-xs font-semibold text-ink-muted uppercase tracking-wide">Nazwa</th>
            <th className="px-3 py-2 text-xs font-semibold text-ink-muted uppercase tracking-wide">Wartość</th>
            <th className="px-3 py-2 text-xs font-semibold text-ink-muted uppercase tracking-wide">Typ danych</th>
            <th className="px-5 py-2 text-xs font-semibold text-ink-muted uppercase tracking-wide"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {visibleRegisters.map((r) => {
            const live = liveReadings[r.name]
            const isEditing = editing === r.name
            const favorite = isFavorite('device', deviceId, r.name)
            const isHidden = hiddenNames.includes(r.name)
            return (
              <tr key={r.id} className={isHidden ? 'opacity-40' : undefined}>
                {editingVisibility && (
                  <td className="px-5 py-2 align-top">
                    <button
                      onClick={() => onToggleHidden(r.name)}
                      className="text-ink-muted hover:text-accent transition-colors"
                      title={isHidden ? 'Pokaż zmienną' : 'Ukryj zmienną'}
                    >
                      {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </td>
                )}
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
                  {renaming === r.name ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        value={renameInput}
                        onChange={(e) => setRenameInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveRename(r.name); if (e.key === 'Escape') cancelRename() }}
                        autoFocus
                        className="w-32 bg-surface-2 border border-accent rounded-md px-2 py-1 text-ink text-sm focus:outline-none"
                      />
                      <button onClick={() => saveRename(r.name)} className="text-good hover:text-good/80 transition-colors" title="Zapisz nazwę">
                        <Check size={15} />
                      </button>
                      <button onClick={cancelRename} className="text-ink-muted hover:text-ink transition-colors" title="Anuluj">
                        <X size={15} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span>
                        {aliases[r.name] ?? r.name}
                        {aliases[r.name] && <span className="block text-[10px] text-ink-muted/70 font-normal">{r.name}</span>}
                      </span>
                      {editingVisibility && (
                        <button onClick={() => startRename(r)} className="text-ink-muted hover:text-accent transition-colors shrink-0" title="Zmień nazwę (tylko to urządzenie)">
                          <Tag size={12} />
                        </button>
                      )}
                    </div>
                  )}
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
                      {live ? live.value.toFixed(2) : '—'} {units[r.name] ?? r.unit ?? live?.unit ?? ''}
                      {editingVisibility && (r.unit || units[r.name]) && (
                        <select
                          value={units[r.name] ?? ''}
                          onChange={(e) => onSetUnit(r.name, e.target.value)}
                          className="ml-2 bg-surface-2 border border-border rounded-md px-1 py-0.5 text-xs text-ink focus:outline-none focus:border-accent"
                          title="Jednostka dla tego urządzenia (np. sonda ciśnieniowa na S6/S7: bar)"
                        >
                          <option value="">{r.unit ? `${r.unit} (profil)` : '(profil)'}</option>
                          {UNIT_CHOICES.filter((u) => u !== r.unit).map((u) => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                          {units[r.name] && !UNIT_CHOICES.includes(units[r.name]) && (
                            <option value={units[r.name]}>{units[r.name]}</option>
                          )}
                        </select>
                      )}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-ink-muted align-top">
                  {r.data_type}{r.scale_factor !== 1 ? ` ×${r.scale_factor}` : ''}
                  {r.register_type && r.register_type !== 'holding' && (
                    <span className="block text-ink-muted/70">{REGISTER_TYPE_LABELS[r.register_type]}</span>
                  )}
                </td>
                <td className="px-5 py-2 text-right align-top">
                  {r.writable && canWrite ? (
                    !isEditing && (
                      <button onClick={() => startEdit(r)} className="text-ink-muted hover:text-accent transition-colors" title="Zmień wartość">
                        <Pencil size={14} />
                      </button>
                    )
                  ) : (
                    <span title={r.writable ? 'Brak uprawnienia do zapisu' : 'Tylko do odczytu'} className="text-ink-muted/50 inline-flex">
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
        Tryb edycji (ikona ołówka w nagłówku karty) pozwala ukrywać zmienne oraz zmieniać ich nazwy i jednostki
        wyłącznie dla tego urządzenia — inne urządzenia z tym samym profilem i sam profil w Konfiguracji pozostają
        bez zmian. Zmiana jednostki (np. °C → bar dla sondy ciśnieniowej na wejściu S6/S7 MPXPRO) obowiązuje od
        następnego cyklu skanowania i obejmuje nowe odczyty, wykresy i dashboard.
      </p>
    </div>
  )
}
