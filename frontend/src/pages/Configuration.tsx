import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, X, Settings2, BookOpen } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getDeviceProfiles, createDeviceProfile, updateDeviceProfile, deleteDeviceProfile,
  type DeviceProfileDetail, type RegisterDefinitionInput,
} from '../api/deviceProfiles'
import { Badge } from '../components/UI/Badge'
import { Modal } from '../components/UI/Modal'
import { ConfirmDialog } from '../components/UI/ConfirmDialog'
import { EmptyState } from '../components/UI/EmptyState'
import { PageSpinner } from '../components/UI/Spinner'

const DATA_TYPES = ['uint16', 'int16', 'uint32', 'int32', 'float32']
const REGISTER_TYPES = [
  { value: 'holding', label: 'Holding (3)' },
  { value: 'input', label: 'Input (4, R/O)' },
  { value: 'coil', label: 'Coil (1)' },
  { value: 'discrete_input', label: 'Discrete (2, R/O)' },
]

const TABS = ['Carel', 'Danfoss', 'Eliwell', 'Inne'] as const
type Tab = typeof TABS[number]

function tabFor(p: DeviceProfileDetail): Tab {
  const m = p.manufacturer ?? ''
  if (m.startsWith('Carel')) return 'Carel'
  if (m.startsWith('Danfoss')) return 'Danfoss'
  if (m.startsWith('Eliwell')) return 'Eliwell'
  return 'Inne'
}

export default function Configuration() {
  const [profiles, setProfiles] = useState<DeviceProfileDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('Carel')
  const [editing, setEditing] = useState<DeviceProfileDetail | 'new' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<DeviceProfileDetail | null>(null)

  const load = () => getDeviceProfiles().then(setProfiles)

  useEffect(() => { load().finally(() => setLoading(false)) }, [])

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { Carel: 0, Danfoss: 0, Eliwell: 0, Inne: 0 }
    profiles.forEach((p) => { c[tabFor(p)] += 1 })
    return c
  }, [profiles])

  const visible = useMemo(() => profiles.filter((p) => tabFor(p) === tab), [profiles, tab])

  const del = async (profile: DeviceProfileDetail) => {
    try {
      await deleteDeviceProfile(profile.id)
      setProfiles((p) => p.filter((x) => x.id !== profile.id))
      toast.success('Profil usunięty')
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Błąd usuwania profilu')
    } finally {
      setConfirmDelete(null)
    }
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm rounded-lg border transition-colors ${tab === t ? 'bg-accent border-accent text-white' : 'border-border text-ink-muted hover:text-ink'}`}>
              {t} <span className="text-xs opacity-70">({counts[t]})</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setEditing('new')}
          className="flex items-center gap-2 bg-accent hover:bg-accent-strong text-white text-sm px-4 py-2 rounded-lg transition-colors shrink-0"
        >
          <Plus size={14} /> Dodaj profil
        </button>
      </div>

      {tab === 'Inne' && <ManualCreationHelp />}

      {visible.length === 0 ? (
        <EmptyState icon={<Settings2 size={28} />} message={`Brak profili w zakładce „${tab}”. Dodaj profil powyżej.`} />
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {visible.map((p) => (
            <div key={p.id} className="bg-surface border border-border rounded-xl shadow-panel p-5">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-ink truncate">{p.name}</h3>
                  <p className="text-xs text-ink-muted">{p.manufacturer ?? '—'} {p.model ? `· ${p.model}` : ''}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={p.source === 'builtin' ? 'blue' : 'gray'}>{p.source === 'builtin' ? 'wbudowany' : 'lokalny'}</Badge>
                </div>
              </div>
              {p.description && <p className="text-xs text-ink-muted mb-3">{p.description}</p>}
              <p className="text-xs text-ink-muted mb-3">{p.registers.length} zmiennych · {p.registers.filter((r) => r.writable).length} edytowalnych</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(p)}
                  className="flex items-center gap-1.5 text-xs border border-border text-ink-muted hover:text-ink px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Pencil size={12} /> Edytuj
                </button>
                <button
                  onClick={() => setConfirmDelete(p)}
                  className="flex items-center gap-1.5 text-xs border border-border text-ink-muted hover:text-crit px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Trash2 size={12} /> Usuń
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ProfileModal
          profile={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { load(); setEditing(null) }}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Usuń profil"
        message={`Czy na pewno chcesz usunąć profil „${confirmDelete?.name}”? Nie da się usunąć profilu przypisanego do urządzenia.`}
        confirmLabel="Usuń profil"
        onConfirm={() => confirmDelete && del(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  )
}

function ManualCreationHelp() {
  return (
    <div className="bg-surface border border-border rounded-xl shadow-panel p-5">
      <div className="flex items-center gap-2 mb-2">
        <BookOpen size={16} className="text-accent" />
        <h3 className="font-semibold text-ink">Tworzenie własnej konfiguracji</h3>
      </div>
      <p className="text-sm text-ink-body mb-3">
        Jeśli Twój sterownik nie pasuje do żadnego gotowego profilu, kliknij „Dodaj profil” i zbuduj mapę rejestrów ręcznie
        na podstawie dokumentacji Modbus producenta. Dla każdej zmiennej podaj:
      </p>
      <ul className="text-sm text-ink-body space-y-1.5 mb-3 list-disc list-inside">
        <li><b>Adres</b> — numer rejestru Modbus (z dokumentacji sterownika, zwykle „adres rejestru” lub „register address”).</li>
        <li><b>Typ danych</b> — <code>uint16</code>/<code>int16</code> dla większości wartości, <code>uint32</code>/<code>int32</code>/<code>float32</code> gdy dokumentacja mówi o wartości zajmującej dwa rejestry.</li>
        <li><b>Skala</b> — mnożnik odczytanej wartości surowej, np. <code>0.1</code> jeśli sterownik zwraca temperaturę jako liczbę całkowitą razy 10 (typowe dla wielu sterowników chłodniczych).</li>
        <li><b>R/W</b> — zaznacz, jeśli zmienna ma być zapisywalna (np. nastawa temperatury), zostaw odznaczone dla odczytów (temperatury, stany wyjść).</li>
      </ul>
      <p className="text-sm text-ink-muted">
        Utworzony profil pojawi się w zakładce „Inne”, dopóki nazwa producenta nie zacznie się od Carel/Danfoss/Eliwell —
        wtedy trafi do właściwej zakładki automatycznie.
      </p>
    </div>
  )
}

interface RegisterRow extends RegisterDefinitionInput {
  key: string
}

let rowKeySeq = 0
const newRow = (): RegisterRow => ({
  key: `r${rowKeySeq++}`, address: 0, name: '', unit: '', data_type: 'uint16', scale_factor: 1, writable: false, register_type: 'holding',
})

function ProfileModal({ profile, onClose, onSaved }: {
  profile: DeviceProfileDetail | null; onClose: () => void; onSaved: () => void
}) {
  const [name, setName] = useState(profile?.name ?? '')
  const [manufacturer, setManufacturer] = useState(profile?.manufacturer ?? '')
  const [model, setModel] = useState(profile?.model ?? '')
  const [description, setDescription] = useState(profile?.description ?? '')
  const [rows, setRows] = useState<RegisterRow[]>(
    profile && profile.registers.length > 0
      ? profile.registers.map((r) => ({ ...r, key: `r${rowKeySeq++}`, unit: r.unit ?? '' }))
      : [newRow()]
  )
  const [saving, setSaving] = useState(false)

  const updateRow = (key: string, patch: Partial<RegisterRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const removeRow = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key))
  const addRow = () => setRows((rs) => [...rs, newRow()])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const registers: RegisterDefinitionInput[] = rows
      .filter((r) => r.name.trim())
      .map(({ key, ...r }) => ({ ...r, unit: r.unit || undefined }))
    const payload = { name, manufacturer: manufacturer || undefined, model: model || undefined, description: description || undefined, registers }
    setSaving(true)
    try {
      if (profile) await updateDeviceProfile(profile.id, payload)
      else await createDeviceProfile(payload)
      toast.success(profile ? 'Profil zaktualizowany' : 'Profil utworzony')
      onSaved()
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Błąd zapisu profilu')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={profile ? `Edytuj profil — ${profile.name}` : 'Dodaj profil producenta'}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs text-ink-muted mb-1">Nazwa profilu</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required className="input" />
          </div>
          <div>
            <label className="block text-xs text-ink-muted mb-1">Producent</label>
            <input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} className="input" />
          </div>
          <div>
            <label className="block text-xs text-ink-muted mb-1">Model</label>
            <input value={model} onChange={(e) => setModel(e.target.value)} className="input" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-ink-muted mb-1">Opis</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className="input" />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-ink-muted">Mapa rejestrów</label>
            <button type="button" onClick={addRow} className="text-xs text-accent hover:text-accent-strong">+ Dodaj rejestr</button>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {rows.map((r) => (
              <div key={r.key} className="bg-surface-2 border border-border rounded-lg p-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <input
                    placeholder="Nazwa zmiennej" value={r.name}
                    onChange={(e) => updateRow(r.key, { name: e.target.value })}
                    className="flex-1 min-w-0 bg-surface border border-border rounded px-1.5 py-1 text-xs text-ink"
                  />
                  <button type="button" onClick={() => removeRow(r.key)} className="text-ink-muted hover:text-crit shrink-0">
                    <X size={14} />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    type="number" placeholder="Adres" value={r.address}
                    onChange={(e) => updateRow(r.key, { address: Number(e.target.value) })}
                    className="w-16 bg-surface border border-border rounded px-1.5 py-1 text-xs text-ink"
                  />
                  <input
                    placeholder="Jedn." value={r.unit ?? ''}
                    onChange={(e) => updateRow(r.key, { unit: e.target.value })}
                    className="w-14 bg-surface border border-border rounded px-1.5 py-1 text-xs text-ink"
                  />
                  <select
                    value={r.data_type} onChange={(e) => updateRow(r.key, { data_type: e.target.value })}
                    className="w-20 bg-surface border border-border rounded px-1 py-1 text-xs text-ink"
                  >
                    {DATA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input
                    type="number" step="any" placeholder="Skala" value={r.scale_factor}
                    onChange={(e) => updateRow(r.key, { scale_factor: Number(e.target.value) })}
                    className="w-14 bg-surface border border-border rounded px-1.5 py-1 text-xs text-ink"
                  />
                  <select
                    value={r.register_type ?? 'holding'} onChange={(e) => updateRow(r.key, { register_type: e.target.value as RegisterDefinitionInput['register_type'] })}
                    title="Typ rejestru Modbus"
                    className="w-28 bg-surface border border-border rounded px-1 py-1 text-xs text-ink"
                  >
                    {REGISTER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <label className="flex items-center gap-1 shrink-0 text-xs text-ink-muted" title="Edytowalny (do zapisu)">
                    <input
                      type="checkbox" checked={r.writable}
                      onChange={(e) => updateRow(r.key, { writable: e.target.checked })}
                      className="rounded border-border-strong bg-surface text-accent focus:ring-0"
                    />
                    R/W
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-2 border-t border-border">
          <button type="submit" disabled={saving} className="flex-1 bg-accent hover:bg-accent-strong disabled:opacity-50 text-white text-sm py-2 rounded-lg transition-colors">
            {saving ? 'Zapisywanie…' : profile ? 'Zapisz zmiany' : 'Utwórz profil'}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-ink-muted border border-border rounded-lg">
            Anuluj
          </button>
        </div>
      </form>
    </Modal>
  )
}
