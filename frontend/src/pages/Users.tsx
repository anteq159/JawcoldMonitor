import { useEffect, useState } from 'react'
import { Plus, Trash2, UserCheck, UserX, Eye } from 'lucide-react'
import { getUsers, createUser, updateUser, deleteUser } from '../api/users'
import { getRoles } from '../api/roles'
import { getDevices } from '../api/devices'
import { getUserVisibility, setUserVisibility, type VisibilityEntry } from '../api/visibility'
import { Modal } from '../components/UI/Modal'
import { ConfirmDialog } from '../components/UI/ConfirmDialog'
import { Badge } from '../components/UI/Badge'
import { PageSpinner } from '../components/UI/Spinner'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import type { User } from '../types/user'
import type { Device } from '../types/device'

export default function Users() {
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<{ id: number; name: string }[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [visibilityUser, setVisibilityUser] = useState<User | null>(null)
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<User | null>(null)

  const load = async () => {
    const [u, d, r] = await Promise.all([getUsers(), getDevices(), getRoles()])
    setUsers(u)
    setDevices(d)
    setRoles(r.map((role: any) => ({ id: role.id, name: role.name })))
  }

  useEffect(() => { load().finally(() => setLoading(false)) }, [])

  const toggleActive = async (u: User) => {
    await updateUser(u.id, { is_active: !u.is_active })
    load()
  }

  const del = async (id: number) => {
    await deleteUser(id)
    setUsers(us => us.filter(u => u.id !== id))
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-muted">{users.length} użytkowników</p>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-accent hover:bg-accent-strong text-white text-sm px-4 py-2 rounded-lg">
          <Plus size={14} /> Dodaj użytkownika
        </button>
      </div>

      <div className="bg-surface border border-border rounded-xl shadow-panel divide-y divide-border">
        {users.map(u => (
          <div key={u.id} className="flex items-center justify-between px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-ink">{u.username}</p>
                {!u.is_active && <Badge variant="red">nieaktywny</Badge>}
                {u.must_change_password && <Badge variant="yellow">zmiana hasła</Badge>}
              </div>
              <p className="text-xs text-ink-muted mt-0.5">
                {u.email && `${u.email} · `}
                role: {u.roles.map(r => r.name).join(', ') || '—'}
              </p>
              {u.last_login && <p className="text-xs text-ink-muted">Ostatnie logowanie: {format(new Date(u.last_login), 'dd.MM.yyyy HH:mm')}</p>}
            </div>
            <div className="flex gap-2">
              {u.roles.some(r => r.name === 'Viewer') && (
                <button onClick={() => setVisibilityUser(u)} className="text-ink-muted hover:text-accent transition-colors" title="Widoczność parametrów">
                  <Eye size={16} />
                </button>
              )}
              <button onClick={() => toggleActive(u)} className="text-ink-muted hover:text-ink transition-colors" title={u.is_active ? 'Dezaktywuj' : 'Aktywuj'}>
                {u.is_active ? <UserX size={16} /> : <UserCheck size={16} />}
              </button>
              <button onClick={() => setConfirmDeleteUser(u)} className="text-ink-muted hover:text-crit transition-colors">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <AddUserModal open={showAdd} onClose={() => setShowAdd(false)} roles={roles} onAdded={load} />

      {visibilityUser && (
        <VisibilityModal
          user={visibilityUser}
          devices={devices}
          onClose={() => setVisibilityUser(null)}
        />
      )}

      <ConfirmDialog
        open={!!confirmDeleteUser}
        title="Usuń użytkownika"
        message={`Czy na pewno chcesz usunąć użytkownika „${confirmDeleteUser?.username}”? Tej operacji nie można cofnąć.`}
        confirmLabel="Usuń użytkownika"
        onConfirm={() => confirmDeleteUser && del(confirmDeleteUser.id)}
        onClose={() => setConfirmDeleteUser(null)}
      />
    </div>
  )
}

function AddUserModal({ open, onClose, roles, onAdded }: {
  open: boolean; onClose: () => void; roles: { id: number; name: string }[]; onAdded: () => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [roleId, setRoleId] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createUser({ username, password, email: email || undefined, role_ids: roleId ? [Number(roleId)] : [] })
    onAdded(); onClose()
    setUsername(''); setPassword(''); setEmail(''); setRoleId('')
  }

  return (
    <Modal open={open} onClose={onClose} title="Dodaj użytkownika">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-xs text-ink-muted mb-1">Nazwa użytkownika</label>
          <input value={username} onChange={e => setUsername(e.target.value)} required className="input" />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">Hasło</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="input" />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">Email (opcjonalnie)</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input" />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">Rola</label>
          <select value={roleId} onChange={e => setRoleId(e.target.value)} className="input">
            <option value="">Bez roli</option>
            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" className="flex-1 bg-accent hover:bg-accent-strong text-white text-sm py-2 rounded-lg">Dodaj</button>
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-ink-muted border border-border rounded-lg">Anuluj</button>
        </div>
      </form>
    </Modal>
  )
}

function VisibilityModal({ user, devices, onClose }: {
  user: User; devices: Device[]; onClose: () => void
}) {
  const [entries, setEntries] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [allAllowed, setAllAllowed] = useState(false)

  useEffect(() => {
    getUserVisibility(user.id).then(data => {
      if (data.length === 0) {
        setAllAllowed(true)
      } else {
        const map: Record<string, boolean> = {}
        data.forEach(e => { map[`${e.device_id}::${e.parameter_name}`] = e.visible })
        setEntries(map)
        setAllAllowed(false)
      }
    }).finally(() => setLoading(false))
  }, [user.id])

  const toggle = (deviceId: number, paramName: string) => {
    const key = `${deviceId}::${paramName}`
    setEntries(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const save = async () => {
    setSaving(true)
    try {
      if (allAllowed) {
        await setUserVisibility(user.id, [])
      } else {
        const vis: VisibilityEntry[] = []
        devices.forEach(d => {
          d.parameters.forEach(p => {
            vis.push({ device_id: d.id, parameter_name: p.name, visible: entries[`${d.id}::${p.name}`] ?? true })
          })
        })
        await setUserVisibility(user.id, vis)
      }
      toast.success('Widoczność zapisana')
      onClose()
    } catch {
      toast.error('Błąd zapisu')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Widoczność parametrów — ${user.username}`}>
      {loading ? (
        <div className="py-8 text-center text-ink-muted text-sm">Ładowanie…</div>
      ) : (
        <div className="space-y-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={allAllowed} onChange={e => setAllAllowed(e.target.checked)}
              className="rounded border-border-strong bg-surface-2 text-accent focus:ring-0" />
            <span className="text-sm text-ink">Widoczne wszystkie parametry (brak ograniczeń)</span>
          </label>

          {!allAllowed && (
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {devices.length === 0 && <p className="text-ink-muted text-sm">Brak urządzeń.</p>}
              {devices.map(d => (
                <div key={d.id}>
                  <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1.5">{d.name}</p>
                  {d.parameters.length === 0 ? (
                    <p className="text-xs text-ink-muted ml-2">Brak parametrów</p>
                  ) : (
                    <div className="space-y-1">
                      {d.parameters.map(p => {
                        const key = `${d.id}::${p.name}`
                        const checked = entries[key] ?? true
                        return (
                          <label key={p.id} className="flex items-center gap-2 ml-2 cursor-pointer">
                            <input type="checkbox" checked={checked} onChange={() => toggle(d.id, p.name)}
                              className="rounded border-border-strong bg-surface-2 text-accent focus:ring-0" />
                            <span className="text-sm text-ink-body">{p.name}{p.unit ? ` (${p.unit})` : ''}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3 pt-2 border-t border-border">
            <button onClick={save} disabled={saving}
              className="flex-1 bg-accent hover:bg-accent-strong disabled:opacity-50 text-white text-sm py-2 rounded-lg transition-colors">
              {saving ? 'Zapisywanie…' : 'Zapisz'}
            </button>
            <button onClick={onClose} className="px-4 py-2 text-sm text-ink-muted border border-border rounded-lg">
              Anuluj
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
