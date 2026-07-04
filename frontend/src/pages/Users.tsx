import { useEffect, useState } from 'react'
import { Plus, Trash2, UserCheck, UserX, Eye } from 'lucide-react'
import { getUsers, createUser, updateUser, deleteUser } from '../api/users'
import { getRoles } from '../api/roles'
import { getDevices } from '../api/devices'
import { getUserVisibility, setUserVisibility, type VisibilityEntry } from '../api/visibility'
import { Modal } from '../components/UI/Modal'
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
    if (!confirm('Usunąć użytkownika?')) return
    await deleteUser(id)
    setUsers(us => us.filter(u => u.id !== id))
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">{users.length} użytkowników</p>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg">
          <Plus size={14} /> Dodaj użytkownika
        </button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
        {users.map(u => (
          <div key={u.id} className="flex items-center justify-between px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-white">{u.username}</p>
                {!u.is_active && <Badge variant="red">nieaktywny</Badge>}
                {u.must_change_password && <Badge variant="yellow">zmiana hasła</Badge>}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {u.email && `${u.email} · `}
                role: {u.roles.map(r => r.name).join(', ') || '—'}
              </p>
              {u.last_login && <p className="text-xs text-gray-600">Ostatnie logowanie: {format(new Date(u.last_login), 'dd.MM.yyyy HH:mm')}</p>}
            </div>
            <div className="flex gap-2">
              {u.roles.some(r => r.name === 'Viewer') && (
                <button onClick={() => setVisibilityUser(u)} className="text-gray-400 hover:text-blue-400 transition-colors" title="Widoczność parametrów">
                  <Eye size={16} />
                </button>
              )}
              <button onClick={() => toggleActive(u)} className="text-gray-400 hover:text-white transition-colors" title={u.is_active ? 'Dezaktywuj' : 'Aktywuj'}>
                {u.is_active ? <UserX size={16} /> : <UserCheck size={16} />}
              </button>
              <button onClick={() => del(u.id)} className="text-gray-400 hover:text-red-400 transition-colors">
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
          <label className="block text-xs text-gray-400 mb-1">Nazwa użytkownika</label>
          <input value={username} onChange={e => setUsername(e.target.value)} required className="input" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Hasło</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="input" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Email (opcjonalnie)</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Rola</label>
          <select value={roleId} onChange={e => setRoleId(e.target.value)} className="input">
            <option value="">Bez roli</option>
            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 rounded-lg">Dodaj</button>
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 border border-gray-700 rounded-lg">Anuluj</button>
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
        <div className="py-8 text-center text-gray-500 text-sm">Ładowanie…</div>
      ) : (
        <div className="space-y-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={allAllowed} onChange={e => setAllAllowed(e.target.checked)}
              className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-0" />
            <span className="text-sm text-white">Widoczne wszystkie parametry (brak ograniczeń)</span>
          </label>

          {!allAllowed && (
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {devices.length === 0 && <p className="text-gray-500 text-sm">Brak urządzeń.</p>}
              {devices.map(d => (
                <div key={d.id}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{d.name}</p>
                  {d.parameters.length === 0 ? (
                    <p className="text-xs text-gray-600 ml-2">Brak parametrów</p>
                  ) : (
                    <div className="space-y-1">
                      {d.parameters.map(p => {
                        const key = `${d.id}::${p.name}`
                        const checked = entries[key] ?? true
                        return (
                          <label key={p.id} className="flex items-center gap-2 ml-2 cursor-pointer">
                            <input type="checkbox" checked={checked} onChange={() => toggle(d.id, p.name)}
                              className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-0" />
                            <span className="text-sm text-gray-300">{p.name}{p.unit ? ` (${p.unit})` : ''}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3 pt-2 border-t border-gray-800">
            <button onClick={save} disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm py-2 rounded-lg transition-colors">
              {saving ? 'Zapisywanie…' : 'Zapisz'}
            </button>
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 border border-gray-700 rounded-lg">
              Anuluj
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
