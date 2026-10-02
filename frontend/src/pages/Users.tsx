import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Plus, Trash2, UserCheck, UserX, Pencil } from 'lucide-react'
import { getUsers, createUser, updateUser, deleteUser } from '../api/users'
import { getRoles } from '../api/roles'
import { Modal } from '../components/UI/Modal'
import { ConfirmDialog } from '../components/UI/ConfirmDialog'
import { Badge } from '../components/UI/Badge'
import { PageSpinner } from '../components/UI/Spinner'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import type { User } from '../types/user'

export default function Users() {
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<{ id: number; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<User | null>(null)

  const load = async () => {
    const [u, r] = await Promise.all([getUsers(), getRoles()])
    setUsers(u)
    setRoles(r.map((role: any) => ({ id: role.id, name: role.name })))
  }

  useEffect(() => { load().finally(() => setLoading(false)) }, [])

  const [editUser, setEditUser] = useState<User | null>(null)

  const toggleActive = async (u: User) => {
    try {
      await updateUser(u.id, { is_active: !u.is_active })
      toast.success(u.is_active ? `Dezaktywowano „${u.username}”` : `Aktywowano „${u.username}”`)
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Nie udało się zmienić konta')
    }
  }

  const del = async (id: number) => {
    try {
      await deleteUser(id)
      setUsers(us => us.filter(u => u.id !== id))
      toast.success('Użytkownik usunięty')
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Nie udało się usunąć użytkownika')
    }
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
              <button onClick={() => setEditUser(u)} className="text-ink-muted hover:text-accent transition-colors" title="Edytuj (rola, e-mail, reset hasła)">
                <Pencil size={16} />
              </button>
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
      {editUser && <EditUserModal user={editUser} roles={roles} onClose={() => setEditUser(null)} onSaved={load} />}

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
    try {
      await createUser({ username, password, email: email || undefined, role_ids: roleId ? [Number(roleId)] : [] })
      toast.success(`Utworzono konto „${username}” — przy pierwszym logowaniu ustawi własne hasło`)
      onAdded(); onClose()
      setUsername(''); setPassword(''); setEmail(''); setRoleId('')
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Nie udało się utworzyć konta')
    }
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
            <option value="">Bez roli (tylko podgląd)</option>
            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <Link to="/roles" className="inline-block text-xs text-accent hover:underline mt-1">Co może każda rola? Role i uprawnienia</Link>
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" className="flex-1 bg-accent hover:bg-accent-strong text-white text-sm py-2 rounded-lg">Dodaj</button>
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-ink-muted border border-border rounded-lg">Anuluj</button>
        </div>
      </form>
    </Modal>
  )
}

function EditUserModal({ user, roles, onClose, onSaved }: {
  user: User; roles: { id: number; name: string }[]; onClose: () => void; onSaved: () => void
}) {
  const [email, setEmail] = useState(user.email ?? '')
  const [roleId, setRoleId] = useState(user.roles[0] ? String(user.roles[0].id) : '')
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await updateUser(user.id, {
        email: email || undefined,
        role_ids: roleId ? [Number(roleId)] : [],
        ...(newPassword ? { new_password: newPassword } : {}),
      })
      toast.success(newPassword
        ? 'Zapisano. Nowe hasło jest tymczasowe — użytkownik zmieni je przy logowaniu.'
        : 'Zapisano zmiany')
      onSaved(); onClose()
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Nie udało się zapisać zmian')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Edytuj użytkownika — ${user.username}`}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-xs text-ink-muted mb-1">Rola</label>
          <select value={roleId} onChange={e => setRoleId(e.target.value)} className="input">
            <option value="">Bez roli (tylko podgląd)</option>
            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <Link to="/roles" className="inline-block text-xs text-accent hover:underline mt-1">Co może każda rola? Role i uprawnienia</Link>
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">E-mail</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input" />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">Nowe hasło (opcjonalnie)</label>
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength={6}
            placeholder="zostaw puste, aby nie zmieniać" className="input" autoComplete="new-password" />
          <p className="text-[11px] text-ink-muted mt-1">
            Np. gdy ktoś zapomniał hasła. Hasło będzie tymczasowe — przy logowaniu system poprosi o własne.
          </p>
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving} className="flex-1 bg-accent hover:bg-accent-strong disabled:opacity-50 text-white text-sm py-2 rounded-lg">
            {saving ? 'Zapisywanie…' : 'Zapisz'}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-ink-muted border border-border rounded-lg">Anuluj</button>
        </div>
      </form>
    </Modal>
  )
}
