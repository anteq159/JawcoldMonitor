import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, X, Settings2, BookOpen, ArrowUp, ArrowDown, RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getDeviceProfiles, createDeviceProfile, updateDeviceProfile, deleteDeviceProfile, resetDeviceProfile,
  type DeviceProfileDetail, type RegisterDefinitionInput,
} from '../api/deviceProfiles'
import { useAuthStore } from '../store/auth'
import { Badge } from '../components/UI/Badge'
import { Modal } from '../components/UI/Modal'
import { ConfirmDialog } from '../components/UI/ConfirmDialog'
import { EmptyState } from '../components/UI/EmptyState'
import { PageSpinner } from '../components/UI/Spinner'
import { registerCategory, plural, type RegisterCategory } from '../utils/registers'

const DATA_TYPES = ['uint16', 'int16', 'uint32', 'int32', 'float32']
const REGISTER_TYPES = [
  { value: 'holding', label: 'Holding (3)' },
  { value: 'input', label: 'Input (4, R/O)' },
  { value: 'coil', label: 'Coil (1)' },
  { value: 'discrete_input', label: 'Discrete (2, R/O)' },
]

const CATEGORY_COUNT_FORMS: Record<RegisterCategory, [string, string, string]> = {
  measurement: ['pomiar', 'pomiary', 'pomiarów'],
  setpoint: ['nastawa', 'nastawy', 'nastaw'],
  parameter: ['parametr', 'parametry', 'parametrów'],
  status: ['stan', 'stany', 'stanów'],
  alarm: ['alarm', 'alarmy', 'alarmów'],
}

const TABS = ['Carel', 'Danfoss', 'Eliwell', 'Schneider Electric', 'Inne'] as const
type Tab = typeof TABS[number]

function tabFor(p: DeviceProfileDetail): Tab {
  const m = p.manufacturer ?? ''
  if (m.startsWith('Carel')) return 'Carel'
  if (m.startsWith('Danfoss')) return 'Danfoss'
  if (m.startsWith('Eliwell')) return 'Eliwell'
  if (m.startsWith('Schneider')) return 'Schneider Electric'
  return 'Inne'
}

export default function Configuration() {
  const canConfigure = useAuthStore((s) => s.can('config:write'))
  const [profiles, setProfiles] = useState<DeviceProfileDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('Carel')
  const [editing, setEditing] = useState<DeviceProfileDetail | 'new' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<DeviceProfileDetail | null>(null)
  const [confirmReset, setConfirmReset] = useState<DeviceProfileDetail | null>(null)

  const reset = async (profile: DeviceProfileDetail) => {
    try {
      await resetDeviceProfile(profile.id)
      await load()
      toast.success('Przywrócono fabryczną mapę rejestrów')
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Błąd przywracania profilu')
    } finally {
      setConfirmReset(null)
    }
  }

  const load = () => getDeviceProfiles().then(setProfiles)

  useEffect(() => { load().finally(() => setLoading(false)) }, [])

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { Carel: 0, Danfoss: 0, Eliwell: 0, 'Schneider Electric': 0, Inne: 0 }
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
        {canConfigure && (
          <button
            onClick={() => setEditing('new')}
            className="flex items-center gap-2 bg-accent hover:bg-accent-strong text-white text-sm px-4 py-2 rounded-lg transition-colors shrink-0"
          >
            <Plus size={14} /> Dodaj profil
          </button>
        )}
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
                  {p.customized && <Badge variant="yellow">zmieniony</Badge>}
                </div>
              </div>
              {p.description && <p className="text-xs text-ink-muted mb-3">{p.description}</p>}
              <p className="text-xs text-ink-muted mb-3">
                {(['measurement', 'setpoint', 'parameter', 'status', 'alarm'] as RegisterCategory[])
                  .map((c) => [c, p.registers.filter((r) => registerCategory(r) === c).length] as const)
                  .filter(([, n]) => n > 0)
                  .map(([c, n]) => plural(n, ...CATEGORY_COUNT_FORMS[c]))
                  .join(' · ') || 'brak zmiennych'}
              </p>
              {canConfigure && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditing(p)}
                    className="flex items-center gap-1.5 text-xs border border-border text-ink-muted hover:text-ink px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Pencil size={12} /> Edytuj
                  </button>
                  {p.source === 'builtin' && p.customized && (
                    <button
                      onClick={() => setConfirmReset(p)}
                      className="flex items-center gap-1.5 text-xs border border-border text-ink-muted hover:text-ink px-3 py-1.5 rounded-lg transition-colors"
                      title="Przywróć fabryczną mapę rejestrów tego profilu"
                    >
                      <RotateCcw size={12} /> Przywróć domyślne
                    </button>
                  )}
                  {/* Built-in profiles are re-created on every start, so
                      deleting one only looked like it worked. */}
                  {p.source !== 'builtin' && <button
                    onClick={() => setConfirmDelete(p)}
                    className="flex items-center gap-1.5 text-xs border border-border text-ink-muted hover:text-crit px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Trash2 size={12} /> Usuń
                  </button>}
                </div>
              )}
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
      <ConfirmDialog
        open={!!confirmReset}
        title="Przywrócić profil fabryczny?"
        message={`Wszystkie zmiany w profilu „${confirmReset?.name}” (nazwy, kolejność, dodane rejestry) zostaną zastąpione fabryczną mapą rejestrów. Ustawienia poszczególnych urządzeń (aliasy, jednostki, ukryte zmienne) zostają.`}
        confirmLabel="Przywróć"
        onConfirm={() => confirmReset && reset(confirmReset)}
        onClose={() => setConfirmReset(null)}
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
        <li><b>Zapis</b> — zaznacz, jeśli zmienna ma być zapisywalna (np. nastawa temperatury), zostaw odznaczone dla odczytów (temperatury, stany wyjść).</li>
      </ul>
      <p className="text-sm text-ink-body mb-3">
        Zmienne dodaje się w zakładce odpowiadającej ich znaczeniu — <b>Pomiary</b>, <b>Nastawy</b>, <b>Parametry</b>,
        <b> Stany</b> lub <b>Alarmy</b>. Od tego zależy, gdzie pojawią się na stronie sterownika i czy trafią na wykres.
      </p>
      <p className="text-sm text-ink-muted">
        Utworzony profil pojawi się w zakładce „Inne”, dopóki nazwa producenta nie zacznie się od Carel/Danfoss/Eliwell/Schneider —
        wtedy trafi do właściwej zakładki automatycznie.
      </p>
    </div>
  )
}

interface RegisterRow extends RegisterDefinitionInput {
  key: string
}

let rowKeySeq = 0

// Tabs of the register editor, in the order registers are saved (the device
// page shows them in the same groups).
const EDITOR_TABS: Array<{ category: RegisterCategory; label: string; hint: string }> = [
  { category: 'measurement', label: 'Pomiary', hint: 'Wartości procesowe: sondy temperatury, ciśnienia. Pokazywane na pierwszym kafelku i domyślnie na wykresie.' },
  { category: 'setpoint', label: 'Nastawy', hint: 'Wartości robocze ustawiane przez użytkownika (St, różnice, progi alarmów). Z zaznaczonym „zapis” można je zmieniać z panelu.' },
  { category: 'parameter', label: 'Parametry', hint: 'Konfiguracja zmieniana rzadko: czasy, tryby pracy, przełączniki.' },
  { category: 'status', label: 'Stany', hint: 'Flagi WŁ./WYŁ. (wyjścia, tryby). Pokazywane jako plakietki, nie trafiają na wykres.' },
  { category: 'alarm', label: 'Alarmy', hint: 'Flagi alarmów i błędów czujników — plakietki OK / AKTYWNY, każda aktywna flaga to alarm sterownika (log + powiadomienie). Flaga może być rejestrem Coil albo pojedynczym bitem słowa statusu (kolumna Bit). „Zbiorczy” = rejestr z kodem alarmu dekodowanym przez sterownik.' },
]

// Sensible starting point for a register added in a given tab.
function newRow(category: RegisterCategory): RegisterRow {
  const base = { key: `r${rowKeySeq++}`, address: 0, name: '', description: '', category }
  switch (category) {
    case 'measurement':
      return { ...base, unit: '°C', data_type: 'int16', scale_factor: 0.1, writable: false, register_type: 'holding' }
    case 'setpoint':
      return { ...base, unit: '°C', data_type: 'int16', scale_factor: 0.1, writable: true, register_type: 'holding' }
    case 'parameter':
      return { ...base, unit: '', data_type: 'uint16', scale_factor: 1, writable: false, register_type: 'holding' }
    default:
      return { ...base, unit: '', data_type: 'uint16', scale_factor: 1, writable: false, register_type: 'coil' }
  }
}

const cellInput = 'w-full bg-surface border border-border rounded px-1.5 py-1 text-xs text-ink focus:outline-none focus:border-accent'

function ProfileModal({ profile, onClose, onSaved }: {
  profile: DeviceProfileDetail | null; onClose: () => void; onSaved: () => void
}) {
  const [name, setName] = useState(profile?.name ?? '')
  const [manufacturer, setManufacturer] = useState(profile?.manufacturer ?? '')
  const [model, setModel] = useState(profile?.model ?? '')
  const [description, setDescription] = useState(profile?.description ?? '')
  const [rows, setRows] = useState<RegisterRow[]>(
    (profile?.registers ?? []).map((r) => ({ ...r, key: `r${rowKeySeq++}`, unit: r.unit ?? '', description: r.description ?? '' }))
  )
  const [tab, setTab] = useState<'general' | RegisterCategory>('general')
  const [saving, setSaving] = useState(false)

  const categoryOf = (r: RegisterRow) => registerCategory(r)
  const counts = Object.fromEntries(
    EDITOR_TABS.map(({ category }) => [category, rows.filter((r) => categoryOf(r) === category).length]),
  ) as Record<RegisterCategory, number>

  // Same Modbus object listed twice reads the same value under two names -
  // almost always a copy/paste slip worth pointing at.
  const locationCount = new Map<string, number>()
  rows.forEach((r) => {
    const k = `${r.register_type ?? 'holding'}:${r.address}:${r.bit ?? ''}`
    locationCount.set(k, (locationCount.get(k) ?? 0) + 1)
  })
  // Bits of one status word share an address legitimately.
  const isDuplicate = (r: RegisterRow) => (locationCount.get(`${r.register_type ?? 'holding'}:${r.address}:${r.bit ?? ''}`) ?? 0) > 1

  const updateRow = (key: string, patch: Partial<RegisterRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const removeRow = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key))
  const addRow = (category: RegisterCategory) => setRows((rs) => [...rs, newRow(category)])
  // Moves within the current tab: swaps with the nearest row of the same
  // category in the full list.
  const moveRow = (key: string, dir: -1 | 1) =>
    setRows((rs) => {
      const i = rs.findIndex((r) => r.key === key)
      const cat = categoryOf(rs[i])
      let j = i + dir
      while (j >= 0 && j < rs.length && categoryOf(rs[j]) !== cat) j += dir
      if (j < 0 || j >= rs.length) return rs
      const next = [...rs]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setTab('general')
      toast.error('Podaj nazwę profilu')
      return
    }
    const unnamed = rows.find((r) => !r.name.trim())
    if (unnamed) {
      setTab(categoryOf(unnamed))
      toast.error('Każda zmienna musi mieć nazwę')
      return
    }
    // Saved grouped by tab, so the profile order matches what is edited here.
    const registers: RegisterDefinitionInput[] = EDITOR_TABS.flatMap(({ category }) =>
      rows.filter((r) => categoryOf(r) === category),
    ).map(({ key, ...r }) => ({ ...r, unit: r.unit || undefined, description: r.description || undefined }))
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

  const activeTab = EDITOR_TABS.find((t) => t.category === tab)
  const tabRows = activeTab ? rows.filter((r) => categoryOf(r) === activeTab.category) : []
  const isFlagTab = tab === 'status' || tab === 'alarm'

  return (
    <Modal open size="xl" onClose={onClose} title={profile ? `Edytuj profil — ${profile.name}` : 'Dodaj profil sterownika'}>
      <form onSubmit={submit} className="space-y-4">
        {/* Pinned while the register table scrolls (modal body is the scroller, p-5). */}
        <div className="sticky -top-5 z-10 bg-surface -mx-5 px-5 pt-2 flex flex-wrap gap-1 border-b border-border -mt-2">
          <TabButton active={tab === 'general'} onClick={() => setTab('general')}>Ogólne</TabButton>
          {EDITOR_TABS.map((t) => (
            <TabButton key={t.category} active={tab === t.category} onClick={() => setTab(t.category)}>
              {t.label} <span className="text-[11px] opacity-70">({counts[t.category]})</span>
            </TabButton>
          ))}
        </div>

        {tab === 'general' && (
          <div className="space-y-4">
            {profile?.source === 'builtin' && (
              <p className="text-xs text-ink-muted bg-surface-2 border border-border rounded-lg px-3 py-2">
                To profil wbudowany. Twoje zmiany zostaną zachowane także po restarcie — fabryczną mapę rejestrów
                przywrócisz przyciskiem „Przywróć domyślne” na karcie profilu.
              </p>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs text-ink-muted mb-1">Nazwa profilu</label>
                <input value={name} onChange={(e) => setName(e.target.value)} required className="input" />
              </div>
              <div>
                <label className="block text-xs text-ink-muted mb-1">Producent</label>
                <input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} className="input" placeholder="np. Carel" />
              </div>
              <div>
                <label className="block text-xs text-ink-muted mb-1">Model</label>
                <input value={model} onChange={(e) => setModel(e.target.value)} className="input" placeholder="np. MPXPRO" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-ink-muted mb-1">Opis</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="input" />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {EDITOR_TABS.map((t) => (
                <button key={t.category} type="button" onClick={() => setTab(t.category)}
                  className="text-left bg-surface-2 border border-border rounded-lg px-3 py-2 hover:border-accent transition-colors">
                  <p className="text-xl font-bold text-ink">{counts[t.category]}</p>
                  <p className="text-xs text-ink-muted">{t.label}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab && (
          <div className="space-y-3">
            <p className="text-xs text-ink-muted">{activeTab.hint}</p>
            {tabRows.length === 0 ? (
              <p className="text-sm text-ink-muted py-6 text-center border border-dashed border-border rounded-lg">
                Brak zmiennych w tej grupie.
              </p>
            ) : (
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-surface-2 text-ink-muted">
                    <tr className="text-left">
                      <th className="px-2 py-2 w-8"></th>
                      <th className="px-2 py-2 min-w-[180px]">Nazwa</th>
                      <th className="px-2 py-2 w-20">Adres</th>
                      <th className="px-2 py-2 w-32">Typ rejestru</th>
                      {isFlagTab && <th className="px-2 py-2 w-20" title="Numer bitu w rejestrze Holding/Input (0–15). Puste = cały rejestr albo Coil.">Bit</th>}
                      {!isFlagTab && <th className="px-2 py-2 w-24">Typ danych</th>}
                      {!isFlagTab && <th className="px-2 py-2 w-20">Skala</th>}
                      {!isFlagTab && <th className="px-2 py-2 w-20">Jedn.</th>}
                      <th className="px-2 py-2 w-16 text-center">{tab === 'alarm' ? 'Zbiorczy' : 'Zapis'}</th>
                      <th className="px-2 py-2 w-28">Przenieś do</th>
                      <th className="px-2 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {tabRows.map((r, i) => (
                      <tr key={r.key} className="align-top">
                        <td className="px-2 py-1.5">
                          <div className="flex flex-col">
                            <button type="button" onClick={() => moveRow(r.key, -1)} disabled={i === 0}
                              className="text-ink-muted hover:text-accent disabled:opacity-25" title="Wyżej"><ArrowUp size={12} /></button>
                            <button type="button" onClick={() => moveRow(r.key, 1)} disabled={i === tabRows.length - 1}
                              className="text-ink-muted hover:text-accent disabled:opacity-25" title="Niżej"><ArrowDown size={12} /></button>
                          </div>
                        </td>
                        <td className="px-2 py-1.5 space-y-1">
                          <input value={r.name} onChange={(e) => updateRow(r.key, { name: e.target.value })}
                            placeholder="Nazwa zmiennej" className={`${cellInput} ${!r.name.trim() ? 'border-crit' : ''}`} />
                          <input value={r.description ?? ''} onChange={(e) => updateRow(r.key, { description: e.target.value })}
                            placeholder="Opis (opcjonalnie)" className={`${cellInput} text-ink-muted`} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" min={0} value={r.address} onChange={(e) => updateRow(r.key, { address: Number(e.target.value) })}
                            className={`${cellInput} ${isDuplicate(r) ? 'border-warn' : ''}`}
                            title={isDuplicate(r) ? 'Ten sam rejestr występuje w profilu więcej niż raz' : undefined} />
                        </td>
                        <td className="px-2 py-1.5">
                          <select value={r.register_type ?? 'holding'}
                            onChange={(e) => updateRow(r.key, { register_type: e.target.value as RegisterDefinitionInput['register_type'] })}
                            className={cellInput}>
                            {REGISTER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                        </td>
                        {isFlagTab && (
                          <td className="px-2 py-1.5">
                            <input type="number" min={0} max={15} value={r.bit ?? ''} placeholder="—"
                              disabled={r.register_type === 'coil' || r.register_type === 'discrete_input'}
                              onChange={(e) => updateRow(r.key, { bit: e.target.value === '' ? null : Number(e.target.value) })}
                              className={`${cellInput} disabled:opacity-30`} />
                          </td>
                        )}
                        {!isFlagTab && (
                          <td className="px-2 py-1.5">
                            <select value={r.data_type} onChange={(e) => updateRow(r.key, { data_type: e.target.value })} className={cellInput}>
                              {DATA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </td>
                        )}
                        {!isFlagTab && (
                          <td className="px-2 py-1.5">
                            <input type="number" step="any" value={r.scale_factor}
                              onChange={(e) => updateRow(r.key, { scale_factor: Number(e.target.value) })} className={cellInput} />
                          </td>
                        )}
                        {!isFlagTab && (
                          <td className="px-2 py-1.5">
                            <input value={r.unit ?? ''} onChange={(e) => updateRow(r.key, { unit: e.target.value })} className={cellInput} />
                          </td>
                        )}
                        <td className="px-2 py-1.5 text-center">
                          {tab === 'alarm' ? (
                            <input type="checkbox" checked={!!r.is_alarm_register}
                              onChange={(e) => updateRow(r.key, { is_alarm_register: e.target.checked })}
                              className="rounded border-border-strong text-accent focus:ring-0 mt-1.5" />
                          ) : (
                            <input type="checkbox" checked={r.writable}
                              onChange={(e) => updateRow(r.key, { writable: e.target.checked })}
                              disabled={r.register_type !== 'holding' && r.register_type !== undefined}
                              title={r.register_type && r.register_type !== 'holding' ? 'Zapis obsługiwany tylko dla rejestrów Holding' : 'Wartość można zmieniać z panelu'}
                              className="rounded border-border-strong text-accent focus:ring-0 mt-1.5 disabled:opacity-30" />
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <select value={categoryOf(r)}
                            onChange={(e) => updateRow(r.key, { category: e.target.value as RegisterCategory })}
                            className={cellInput}>
                            {EDITOR_TABS.map((t) => <option key={t.category} value={t.category}>{t.label}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <button type="button" onClick={() => removeRow(r.key)} className="text-ink-muted hover:text-crit mt-1" title="Usuń zmienną">
                            <X size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button type="button" onClick={() => addRow(activeTab.category)}
              className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-strong">
              <Plus size={13} /> Dodaj zmienną do „{activeTab.label}”
            </button>
          </div>
        )}

        <div className="sticky -bottom-5 z-10 bg-surface -mx-5 px-5 pb-5 -mb-5 flex gap-3 pt-3 border-t border-border">
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

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-3 py-2 text-sm -mb-px border-b-2 transition-colors ${active ? 'border-accent text-accent font-medium' : 'border-transparent text-ink-muted hover:text-ink'}`}>
      {children}
    </button>
  )
}
