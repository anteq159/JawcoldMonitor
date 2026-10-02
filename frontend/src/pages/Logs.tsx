import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getEventLogs, getLogins, setLoginLogging, type LoginEntry } from '../api/logs'
import { useAuthStore } from '../store/auth'
import toast from 'react-hot-toast'
import { LogIn, LogOut, ShieldX, KeyRound } from 'lucide-react'
import { useDeviceStore } from '../store/devices'
import { getDevices } from '../api/devices'
import { EmptyState } from '../components/UI/EmptyState'
import { PageSpinner } from '../components/UI/Spinner'
import { format } from 'date-fns'

import { eventText, EVENT_TYPES, TONE } from '../utils/eventTypes'

const PAGE = 100

const GROUPS: Array<{ label: string; types: string[] }> = [
  { label: 'Wszystkie', types: [] },
  { label: 'Alarmy', types: ['device_offline_alarm', 'hardware_alarm_triggered', 'hardware_alarm_resolved', 'device_offline_resolved', 'disk_alarm', 'sensor_offline'] },
  { label: 'Komunikacja', types: ['device_connected', 'device_disconnected', 'device_discovered', 'sensor_discovered', 'sensor_online', 'sensor_offline'] },
  { label: 'Zmiany nastaw', types: ['register_written'] },
  { label: 'System', types: ['settings_changed', 'power_action', 'update_applied', 'update_rolled_back', 'auto_backup', 'auto_backup_failed'] },
]

export default function Logs() {
  const devices = useDeviceStore((s) => s.devices)
  const setDevices = useDeviceStore((s) => s.setDevices)
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [group, setGroup] = useState(0)
  // Sign-in history lives in its own view (different data, user:manage).
  const canSeeLogins = useAuthStore((s) => s.can('user:manage'))
  const [showLogins, setShowLogins] = useState(() => new URLSearchParams(window.location.search).get('widok') === 'logowania')
  // ?urzadzenie=ID: opened from a device's "Historia zdarzeń".
  const [deviceId, setDeviceId] = useState(() => new URLSearchParams(window.location.search).get('urzadzenie') ?? '')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const params = () => ({
    limit: PAGE,
    event_type: GROUPS[group].types.join(',') || undefined,
    device_id: deviceId ? Number(deviceId) : undefined,
  })

  useEffect(() => {
    if (!devices.length) getDevices().then(setDevices).catch(() => {})
  }, [])

  useEffect(() => {
    if (showLogins) return
    setLoading(true)
    getEventLogs(params())
      .then((rows) => { setLogs(rows); setHasMore(rows.length === PAGE) })
      .finally(() => setLoading(false))
  }, [group, deviceId, showLogins])

  const loadMore = async () => {
    if (!logs.length) return
    setLoadingMore(true)
    try {
      const rows = await getEventLogs({ ...params(), before: logs[logs.length - 1].timestamp })
      setLogs((prev) => [...prev, ...rows])
      setHasMore(rows.length === PAGE)
    } finally {
      setLoadingMore(false)
    }
  }

  const deviceName = (id: number) => devices.find((d) => d.id === id)?.name ?? `Urządzenie #${id}`

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {GROUPS.map((g, i) => (
          <button key={g.label} onClick={() => { setGroup(i); setShowLogins(false) }}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${!showLogins && group === i ? 'bg-accent border-accent text-white' : 'border-border text-ink-muted hover:text-ink'}`}>
            {g.label}
          </button>
        ))}
        {canSeeLogins && (
          <button onClick={() => setShowLogins(true)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${showLogins ? 'bg-accent border-accent text-white' : 'border-border text-ink-muted hover:text-ink'}`}>
            Logowania
          </button>
        )}
        {!showLogins && (
          <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className="input !w-auto text-sm sm:ml-auto">
            <option value="">Wszystkie urządzenia</option>
            {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
      </div>

      {showLogins ? <LoginsView /> : loading ? <PageSpinner /> : (
        <div className="bg-surface border border-border rounded-xl shadow-panel divide-y divide-border">
          {logs.length === 0 && <EmptyState message="Brak wpisów dla wybranego filtra" />}
          {logs.map((l) => {
            const meta = EVENT_TYPES[l.event_type]
            return (
              <div key={l.id} className="flex items-start gap-4 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <span className={`text-xs font-medium ${TONE[meta?.tone ?? 'info']}`}>{meta?.label ?? l.event_type}</span>
                  <p className="text-sm text-ink-body mt-0.5 break-words">{l.device_id ? eventText(l.message, deviceName(l.device_id)) : l.message}</p>
                  {l.device_id && (
                    <Link to={`/devices/${l.device_id}`} className="text-xs text-accent hover:underline">{deviceName(l.device_id)}</Link>
                  )}
                </div>
                <p className="text-xs text-ink-muted whitespace-nowrap">{format(new Date(l.timestamp), 'dd.MM HH:mm:ss')}</p>
              </div>
            )
          })}
          {hasMore && (
            <div className="px-5 py-3 text-center">
              <button onClick={loadMore} disabled={loadingMore} className="text-sm text-accent hover:text-accent-strong disabled:opacity-50">
                {loadingMore ? 'Wczytywanie…' : 'Pokaż starsze'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const REASONS: Record<string, string> = {
  unknown_user: 'nie ma takiego konta',
  bad_password: 'złe hasło',
  inactive: 'konto zablokowane',
}

// "Chrome · Android" from a user-agent string - enough to tell the
// office PC from someone's phone without printing the whole header.
function browserLabel(agent: string | null): string {
  if (!agent) return ''
  const browser = /Edg\//.test(agent) ? 'Edge' : /OPR\//.test(agent) ? 'Opera' : /Firefox\//.test(agent) ? 'Firefox'
    : /Chrome\//.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : /curl|python|okhttp/i.test(agent) ? 'skrypt' : 'przeglądarka'
  const os = /Android/.test(agent) ? 'Android' : /iPhone|iPad/.test(agent) ? 'iOS' : /Windows/.test(agent) ? 'Windows'
    : /Mac OS X/.test(agent) ? 'macOS' : /Linux/.test(agent) ? 'Linux' : ''
  return os ? `${browser} · ${os}` : browser
}

function LoginsView() {
  const [items, setItems] = useState<LoginEntry[]>([])
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [failedOnly, setFailedOnly] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLoading(true)
    getLogins({ limit: PAGE, failed_only: failedOnly })
      .then((r) => { setItems(r.items); setEnabled(r.enabled); setHasMore(r.items.length === PAGE) })
      .finally(() => setLoading(false))
  }, [failedOnly])

  const loadMore = async () => {
    const r = await getLogins({ limit: PAGE, failed_only: failedOnly, before: items[items.length - 1].timestamp })
    setItems((prev) => [...prev, ...r.items])
    setHasMore(r.items.length === PAGE)
  }

  const toggle = async () => {
    setSaving(true)
    try {
      await setLoginLogging(!enabled)
      setEnabled(!enabled)
      toast.success(!enabled ? 'Logowania będą zapisywane' : 'Zapis logowań wyłączony')
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Nie udało się zmienić ustawienia')
    } finally {
      setSaving(false)
    }
  }

  const describe = (e: LoginEntry) => {
    switch (e.action) {
      case 'login': return { icon: <LogIn size={15} className="text-good" />, title: `${e.username} zalogował(a) się`, tone: 'text-ink-body' }
      case 'logout': return { icon: <LogOut size={15} className="text-ink-muted" />, title: `${e.username} wylogował(a) się`, tone: 'text-ink-body' }
      case 'change_password': return { icon: <KeyRound size={15} className="text-warn" />, title: `${e.username} zmienił(a) hasło`, tone: 'text-ink-body' }
      default: return {
        icon: <ShieldX size={15} className="text-crit" />,
        title: `Nieudane logowanie: „${e.username}” — ${REASONS[e.reason ?? ''] ?? 'odmowa'}`,
        tone: 'text-crit',
      }
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface border border-border rounded-xl shadow-panel px-5 py-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <button type="button" role="switch" aria-checked={enabled} onClick={toggle} disabled={saving}
            className={`relative w-10 h-6 shrink-0 rounded-full transition-colors disabled:opacity-50 ${enabled ? 'bg-accent' : 'bg-border-strong'}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : ''}`} />
          </button>
          <span className="text-sm text-ink">
            Zapisuj logowania użytkowników
            <span className="block text-xs text-ink-muted">Udane i nieudane logowania, wylogowania i zmiany hasła — z adresem IP i przeglądarką.</span>
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-body">
          <input type="checkbox" checked={failedOnly} onChange={(e) => setFailedOnly(e.target.checked)}
            className="rounded border-border-strong text-accent focus:ring-0" />
          Tylko nieudane
        </label>
      </div>

      {loading ? <PageSpinner /> : (
        <div className="bg-surface border border-border rounded-xl shadow-panel divide-y divide-border">
          {items.length === 0 && (
            <EmptyState message={enabled ? 'Brak zapisanych logowań' : 'Zapis logowań jest wyłączony'} />
          )}
          {items.map((e) => {
            const d = describe(e)
            return (
              <div key={e.id} className="flex items-start gap-3 px-5 py-3">
                <span className="mt-0.5">{d.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm break-words ${d.tone}`}>{d.title}</p>
                  <p className="text-xs text-ink-muted">
                    {[e.ip_address && `IP ${e.ip_address}`, browserLabel(e.user_agent)].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <p className="text-xs text-ink-muted whitespace-nowrap">{format(new Date(e.timestamp), 'dd.MM HH:mm:ss')}</p>
              </div>
            )
          })}
          {hasMore && (
            <div className="px-5 py-3 text-center">
              <button onClick={loadMore} className="text-sm text-accent hover:text-accent-strong">Pokaż starsze</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

