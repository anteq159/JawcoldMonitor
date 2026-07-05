import { useEffect, useState } from 'react'
import { getRoles, getPermissions } from '../api/roles'
import { Badge } from '../components/UI/Badge'
import { PageSpinner } from '../components/UI/Spinner'
import type { Role, Permission } from '../types/user'

export default function Roles() {
  const [roles, setRoles] = useState<Role[]>([])
  const [perms, setPerms] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getRoles(), getPermissions()]).then(([r, p]) => { setRoles(r); setPerms(p) }).finally(() => setLoading(false))
  }, [])

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">Role systemowe i niestandardowe</p>
      <div className="grid sm:grid-cols-2 gap-4">
        {roles.map((r) => (
          <div key={r.id} className="bg-surface border border-border rounded-xl shadow-panel p-5">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="font-semibold text-ink">{r.name}</h3>
              {r.is_custom && <Badge variant="blue">niestandardowa</Badge>}
            </div>
            {r.description && <p className="text-xs text-ink-muted mb-3">{r.description}</p>}
            <div className="flex flex-wrap gap-1.5">
              {(r.permissions || []).map((p) => (
                <Badge key={p.id} variant="gray">{p.name}</Badge>
              ))}
              {(!r.permissions || r.permissions.length === 0) && <span className="text-xs text-ink-muted">Brak uprawnień</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-surface border border-border rounded-xl shadow-panel p-5">
        <h3 className="font-semibold text-ink mb-3 text-sm">Dostępne uprawnienia</h3>
        <div className="grid sm:grid-cols-2 gap-2">
          {perms.map((p) => (
            <div key={p.id} className="flex items-start gap-2">
              <Badge variant="blue">{p.name}</Badge>
              {p.description && <span className="text-xs text-ink-muted">{p.description}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
