import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, Pencil, Trash2, Copy, Check, Eye, ShieldAlert } from 'lucide-react'
import { getRoles, getPermissions, createRole, updateRole, deleteRole } from '../api/roles'
import { Badge } from '../components/UI/Badge'
import { Modal } from '../components/UI/Modal'
import { ConfirmDialog } from '../components/UI/ConfirmDialog'
import { PageSpinner } from '../components/UI/Spinner'
import { useAuthStore } from '../store/auth'
import { plural } from '../utils/registers'
import type { Role, Permission } from '../types/user'

// Short names and grouping for the permission editor. The backend's
// description (one sentence per permission) is shown under each name.
const PERMISSION_LABELS: Record<string, string> = {
  'device:write': 'Sterowniki i nastawy',
  'alert:acknowledge': 'Potwierdzanie alarmów',
  'alert:manage': 'Reguły alarmowe',
  'log:read': 'Logi zdarzeń',
  'export:any': 'Eksport danych',
  'config:write': 'Profile sterowników i mapy',
  'settings:write': 'Ustawienia systemu',
  'user:manage': 'Użytkownicy i role',
  'system:manage': 'Raspberry i kopie zapasowe',
}

const GROUPS: { label: string; names: string[] }[] = [
  { label: 'Obsługa', names: ['device:write', 'alert:acknowledge', 'alert:manage'] },
  { label: 'Dane', names: ['log:read', 'export:any'] },
  { label: 'Administracja', names: ['config:write', 'settings:write', 'user:manage', 'system:manage'] },
]

// Whoever holds these can reach every other permission (assign roles,
// restore a backup with other accounts) - flagged in the editor.
const ADMIN_LEVEL = new Set(['user:manage', 'system:manage'])

const label = (p: Permission) => PERMISSION_LABELS[p.name] ?? p.name

function groupPermissions(perms: Permission[]) {
  const known = new Set(GROUPS.flatMap((g) => g.names))
  const byName = new Map(perms.map((p) => [p.name, p]))
  const groups = GROUPS.map((g) => ({
    label: g.label,
    items: g.names.map((n) => byName.get(n)).filter(Boolean) as Permission[],
  }))
  const other = perms.filter((p) => !known.has(p.name))
  if (other.length) groups.push({ label: 'Inne', items: other })
  return groups.filter((g) => g.items.length)
}

export default function Roles() {
  const [roles, setRoles] = useState<Role[]>([])
  const [perms, setPerms] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  // 'new' | role to edit | { copyOf: role } for "Utwórz kopię"
  const [editing, setEditing] = useState<null | 'new' | Role | { copyOf: Role }>(null)
  const [confirmDelete, setConfirmDelete] = useState<Role | null>(null)

  const load = () =>
    Promise.all([getRoles(), getPermissions()])
      .then(([r, p]) => { setRoles(r); setPerms(p) })
      .finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  const remove = async (role: Role) => {
    try {
      await deleteRole(role.id)
      toast.success(`Usunięto rolę „${role.name}”`)
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Nie udało się usunąć roli')
    }
  }

  if (loading) return <PageSpinner />

  const groups = groupPermissions(perms)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-ink-muted max-w-2xl">
          Rola decyduje, co użytkownik może <strong className="text-ink-body font-medium">zmieniać</strong>.
          Podgląd sterowników, wykresów, mapy i alarmów ma każde zalogowane konto. Rolę przypisujesz w zakładce Użytkownicy.
        </p>
        <button
          onClick={() => setEditing('new')}
          className="flex items-center gap-2 bg-accent hover:bg-accent-strong text-white text-sm px-4 py-2 rounded-lg transition-colors shrink-0"
        >
          <Plus size={14} /> Nowa rola
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {roles.map((r) => {
          const has = new Set((r.permissions ?? []).map((p) => p.name))
          return (
            <div key={r.id} className="bg-surface border border-border rounded-xl shadow-panel p-5 flex flex-col">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="font-semibold text-ink truncate">{r.name}</h3>
                <Badge variant={r.is_custom ? 'gray' : 'blue'}>{r.is_custom ? 'własna' : 'systemowa'}</Badge>
              </div>
              {r.description && <p className="text-xs text-ink-muted mb-1">{r.description}</p>}
              <p className="text-xs text-ink-muted mb-3">
                {r.user_count ? plural(r.user_count, 'użytkownik', 'użytkowników', 'użytkowników') : 'nikt nie ma tej roli'}
              </p>
              <ul className="space-y-1 mb-4 flex-1">
                {groups.flatMap((g) => g.items).map((p) => (
                  <li key={p.id} className={`flex items-center gap-2 text-xs ${has.has(p.name) ? 'text-ink-body' : 'text-ink-muted/60'}`}>
                    {has.has(p.name)
                      ? <Check size={13} className="text-good shrink-0" />
                      : <span className="w-[13px] text-center shrink-0">–</span>}
                    {label(p)}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                {r.is_custom ? (
                  <>
                    <button onClick={() => setEditing(r)}
                      className="flex items-center gap-1.5 text-xs border border-border text-ink-muted hover:text-ink px-3 py-1.5 rounded-lg transition-colors">
                      <Pencil size={12} /> Edytuj
                    </button>
                    <button onClick={() => setConfirmDelete(r)}
                      className="flex items-center gap-1.5 text-xs border border-border text-ink-muted hover:text-crit px-3 py-1.5 rounded-lg transition-colors">
                      <Trash2 size={12} /> Usuń
                    </button>
                  </>
                ) : (
                  <button onClick={() => setEditing({ copyOf: r })}
                    title="Role systemowe są stałe - kopię możesz dowolnie zmienić"
                    className="flex items-center gap-1.5 text-xs border border-border text-ink-muted hover:text-ink px-3 py-1.5 rounded-lg transition-colors">
                    <Copy size={12} /> Utwórz kopię do edycji
                  </button>
                )}
              </div>
            </div>
          )
        })}

        <div className="border border-dashed border-border-strong rounded-xl p-5 text-xs text-ink-muted">
          <div className="flex items-center gap-2 mb-1 text-sm font-semibold text-ink">
            <Eye size={15} /> Bez roli
          </div>
          Tylko podgląd: dashboard, sterowniki, wykresy, mapa, czujniki i lista alarmów - bez żadnych zmian.
        </div>
      </div>

      {editing && (
        <RoleEditor
          role={editing === 'new' || 'copyOf' in editing ? null : editing}
          copyOf={editing !== 'new' && 'copyOf' in editing ? editing.copyOf : null}
          groups={groups}
          existingNames={roles.map((r) => r.name)}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Usuń rolę"
        message={`Usunąć rolę „${confirmDelete?.name}”? Użytkownicy muszą mieć wcześniej przypisaną inną rolę.`}
        confirmLabel="Usuń rolę"
        onConfirm={() => confirmDelete && remove(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  )
}

function RoleEditor({ role, copyOf, groups, existingNames, onClose, onSaved }: {
  role: Role | null
  copyOf: Role | null
  groups: { label: string; items: Permission[] }[]
  existingNames: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const source = role ?? copyOf
  const [name, setName] = useState(role?.name ?? (copyOf ? `${copyOf.name} (kopia)` : ''))
  const [description, setDescription] = useState(source?.description ?? '')
  const can = useAuthStore((s) => s.can)
  // A copy starts with only what you are allowed to hand out (copying
  // Admin as a non-admin user manager gives the grantable subset).
  const [selected, setSelected] = useState<Set<number>>(new Set(
    (source?.permissions ?? []).filter((p) => role || can(p.name)).map((p) => p.id)))
  const [saving, setSaving] = useState(false)

  const nameTaken = existingNames.some((n) => n.toLowerCase() === name.trim().toLowerCase() && n !== role?.name)
  const toggle = (id: number) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const allPerms = groups.flatMap((g) => g.items)
  const adminLevel = allPerms.filter((p) => selected.has(p.id) && ADMIN_LEVEL.has(p.name))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || nameTaken) return
    setSaving(true)
    const body = { name: name.trim(), description: description.trim(), permission_ids: [...selected] }
    try {
      if (role) await updateRole(role.id, body)
      else await createRole(body)
      toast.success(role ? `Zapisano rolę „${body.name}”` : `Utworzono rolę „${body.name}”`)
      onSaved()
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Nie udało się zapisać roli')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={role ? `Edytuj rolę — ${role.name}` : 'Nowa rola'}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-ink-muted mb-1">Nazwa</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={64} autoFocus
              placeholder="np. Kierownik sklepu" className="input" />
            {nameTaken && <p className="text-xs text-crit mt-1">Rola o tej nazwie już istnieje</p>}
          </div>
          <div>
            <label className="block text-xs text-ink-muted mb-1">Opis (opcjonalnie)</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={256}
              placeholder="Do czego służy rola" className="input" />
          </div>
        </div>

        <div className="space-y-3">
          {allPerms.some((p) => !can(p.name)) && (
            <p className="text-xs text-ink-muted">Wyszarzonych uprawnień nie możesz nadać, bo sam ich nie masz.</p>
          )}
          {groups.map((g) => {
            const ids = g.items.filter((p) => can(p.name)).map((p) => p.id)
            const all = ids.length > 0 && ids.every((id) => selected.has(id))
            return (
              <fieldset key={g.label} className="border border-border rounded-lg">
                <legend className="sr-only">{g.label}</legend>
                <div className="flex items-center justify-between px-3 py-2 bg-surface-2 rounded-t-lg border-b border-border">
                  <span className="text-xs font-semibold text-ink uppercase tracking-wide">{g.label}</span>
                  {ids.length > 1 && (
                    <button type="button" className="text-xs text-accent hover:underline"
                      onClick={() => setSelected((prev) => {
                        const next = new Set(prev)
                        ids.forEach((id) => (all ? next.delete(id) : next.add(id)))
                        return next
                      })}>
                      {all ? 'Odznacz wszystkie' : 'Zaznacz wszystkie'}
                    </button>
                  )}
                </div>
                <div className="divide-y divide-border">
                  {g.items.map((p) => {
                    // Only permissions you hold can be handed out (the
                    // backend enforces the same rule).
                    const allowed = can(p.name)
                    return (
                      <label key={p.id}
                        className={`flex items-start gap-3 px-3 py-2.5 ${allowed ? 'cursor-pointer hover:bg-surface-2' : 'opacity-50 cursor-not-allowed'}`}
                        title={allowed ? undefined : 'Nie posiadasz tego uprawnienia, więc nie możesz go nadać'}>
                        <input type="checkbox" className="mt-0.5 accent-accent" disabled={!allowed}
                          checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                        <span className="min-w-0">
                          <span className="block text-sm text-ink">{label(p)}</span>
                          {p.description && <span className="block text-xs text-ink-muted">{p.description}</span>}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            )
          })}
        </div>

        {adminLevel.length > 0 && (
          <p className="flex items-start gap-2 text-xs text-warn bg-warn-bg border border-warn/20 rounded-lg px-3 py-2">
            <ShieldAlert size={14} className="shrink-0 mt-0.5" />
            {adminLevel.length === 1
              ? `„${label(adminLevel[0])}” to uprawnienie administracyjne - pozwala nadawać dostęp innym (lub przywrócić kopię z innymi kontami). Nadaj je tylko zaufanym osobom.`
              : `„${adminLevel.map(label).join('” i „')}” to uprawnienia administracyjne - pozwalają nadawać dostęp innym (lub przywrócić kopię z innymi kontami). Nadaj je tylko zaufanym osobom.`}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={saving || !name.trim() || nameTaken}
            className="flex-1 bg-accent hover:bg-accent-strong disabled:opacity-50 text-white text-sm py-2 rounded-lg">
            {role ? 'Zapisz zmiany' : 'Utwórz rolę'}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-ink-muted border border-border rounded-lg">Anuluj</button>
        </div>
        {selected.size === 0 && (
          <p className="text-xs text-ink-muted -mt-2">Bez zaznaczonych uprawnień rola daje tylko podgląd.</p>
        )}
      </form>
    </Modal>
  )
}
