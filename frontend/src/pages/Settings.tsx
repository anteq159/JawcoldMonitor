import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useSearchParams } from 'react-router-dom'
import { Download, Upload, Wand2, Bell } from 'lucide-react'
import { Card } from '../components/UI/Card'
import { ConfirmDialog } from '../components/UI/ConfirmDialog'
import { downloadReadings, downloadAlerts } from '../api/export'
import { downloadBackup, restoreBackup } from '../api/backup'
import { getUpdateInfo, getRuntimeSettings, getSerialPorts, updateRuntimeSettings, powerAction, type UpdateInfo, type RuntimeSetting, type PowerAction } from '../api/system'
import { useDeviceStore } from '../store/devices'
import { useAuthStore } from '../store/auth'
import { isNotificationSupported, getNotificationPermission, requestNotificationPermission } from '../utils/notifications'

const FORMATS = [
  { value: 'csv', label: 'CSV' },
  { value: 'json', label: 'JSON' },
  { value: 'xlsx', label: 'Excel (.xlsx)' },
  { value: 'pdf', label: 'PDF' },
]
const RANGES = ['1h', '6h', '24h', '7d', '30d']

export default function Settings() {
  const setWizardOpen = useDeviceStore((s) => s.setWizardOpen)
  const canExport = useAuthStore((s) => s.can('export:any'))
  const isAdmin = useAuthStore((s) => s.isAdmin())

  // One long page of unrelated forms became tabs; the active one lives in
  // the URL (?tab=) so a link or a reload lands on the same section.
  const [params, setParams] = useSearchParams()
  const tabs = [
    isAdmin && { id: 'system', label: 'Konfiguracja' },
    { id: 'notifications', label: 'Powiadomienia' },
    canExport && { id: 'export', label: 'Eksport danych' },
    isAdmin && { id: 'backup', label: 'Kopie zapasowe' },
    { id: 'about', label: isAdmin ? 'Aktualizacje i Raspberry' : 'O systemie' },
  ].filter(Boolean) as Array<{ id: string; label: string }>
  const tab = tabs.find((t) => t.id === params.get('tab'))?.id ?? tabs[0].id

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setParams({ tab: t.id }, { replace: true })}
            className={`px-3 py-2 text-sm -mb-px border-b-2 transition-colors ${tab === t.id ? 'border-accent text-accent font-medium' : 'border-transparent text-ink-muted hover:text-ink'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'system' && <SystemSettingsSection />}
      {tab === 'notifications' && <NotificationsSection />}
      {tab === 'export' && (
        <>
          <ExportCard title="Eksport odczytów" download={downloadReadings} />
          <ExportCard title="Eksport alarmów" download={downloadAlerts} />
        </>
      )}
      {tab === 'backup' && <BackupSection />}
      {tab === 'about' && isAdmin && <UpdatesSection />}
      {tab === 'about' && isAdmin && <PowerSection />}

      {tab === 'about' && <Card title="Informacje o systemie">
        <div className="p-5 space-y-3 text-sm text-ink-muted">
          <p>Stack: FastAPI + React + PostgreSQL/TimescaleDB</p>
          <button
            onClick={() => setWizardOpen(true)}
            className="flex items-center gap-2 text-ink-muted hover:text-ink border border-border text-sm px-4 py-2 rounded-lg transition-colors"
          >
            <Wand2 size={14} /> Uruchom kreator pierwszej konfiguracji ponownie
          </button>
        </div>
      </Card>}
    </div>
  )
}

function SystemSettingsSection() {
  const [settings, setSettings] = useState<RuntimeSetting[]>([])
  const [dirty, setDirty] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [ports, setPorts] = useState<string[]>([])
  const load = () => getRuntimeSettings().then(setSettings).finally(() => setLoading(false))
  useEffect(() => {
    load()
    getSerialPorts().then((r) => setPorts(r.ports)).catch(() => {})
  }, [])

  const currentValue = (s: RuntimeSetting) => dirty[s.key] !== undefined ? dirty[s.key] : s.value
  const setValue = (key: string, value: string) => setDirty((d) => ({ ...d, [key]: value }))

  const save = async () => {
    if (Object.keys(dirty).length === 0) return
    setSaving(true)
    try {
      const res = await updateRuntimeSettings(dirty)
      setDirty({})
      await load()
      toast.success(res.compose_apply_required
        ? 'Zapisano. Nowy port panelu zadziała po „~/JawcoldMonitor/scripts/jawcold apply" na Raspberry (lub ponownym uruchomieniu install.sh).'
        : res.restart_required
        ? 'Zapisano. Zmiany portu RS485 zadziałają po restarcie aplikacji.'
        : 'Ustawienia zapisane i zastosowane')
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Błąd zapisu ustawień')
    } finally {
      setSaving(false)
    }
  }

  const categories = [...new Set(settings.map((s) => s.category))]

  return (
    <Card title="Konfiguracja systemu">
      <div className="p-5 space-y-5">
        <p className="text-xs text-ink-muted">
          Wartości z .env są punktem startowym — zmiany zapisane tutaj mają pierwszeństwo
          i działają od razu (pola oznaczone „restart" po ponownym uruchomieniu).
        </p>
        {loading ? <p className="text-sm text-ink-muted">Ładowanie…</p> : categories.map((cat) => (
          <div key={cat}>
            <h4 className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">{cat}</h4>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {settings.filter((s) => s.category === cat).map((s) => (
                <div key={s.key}>
                  <label className="block text-xs text-ink-muted mb-1">
                    {s.label}
                    {s.restart_required && <span className="ml-1 text-warn">(restart)</span>}
                  </label>
                  {s.key === 'NOTIFY_SYSTEM_CHANNELS' ? (
                    // Was a free-text "email,telegram" field.
                    <div className="flex gap-4 py-2">
                      {[['email', 'E-mail'], ['telegram', 'Telegram']].map(([ch, label]) => {
                        const list = currentValue(s).split(',').map((x) => x.trim()).filter(Boolean)
                        const on = list.includes(ch)
                        return (
                          <label key={ch} className="flex items-center gap-1.5 text-sm text-ink-body">
                            <input type="checkbox" checked={on}
                              onChange={() => setValue(s.key, (on ? list.filter((x) => x !== ch) : [...list, ch]).join(','))}
                              className="rounded border-border-strong text-accent focus:ring-0" />
                            {label}
                          </label>
                        )
                      })}
                    </div>
                  ) : s.type === 'bool' ? (
                    <select value={currentValue(s)} onChange={(e) => setValue(s.key, e.target.value)} className="input">
                      <option value="true">Tak</option>
                      <option value="false">Nie</option>
                    </select>
                  ) : (
                    <input
                      type={s.secret ? 'password' : (s.type === 'int' || s.type === 'float') ? 'number' : 'text'}
                      step={s.type === 'float' ? 'any' : undefined}
                      value={currentValue(s)}
                      onChange={(e) => setValue(s.key, e.target.value)}
                      placeholder={s.secret ? (s.is_set ? '••••••• (ustawione — wpisz aby zmienić)' : 'nie ustawione') : undefined}
                      list={s.key === 'RS485_PORTS' ? 'rs485-ports' : undefined}
                      className="input"
                    />
                  )}
                  {s.hint && <p className="mt-1 text-[11px] leading-snug text-ink-muted">{s.hint}</p>}
                </div>
              ))}
            </div>
          </div>
        ))}
        {/* Detected adapters as suggestions for "Port RS485" - stable
            /dev/serial/by-id names first; any path can still be typed. */}
        <datalist id="rs485-ports">
          {ports.map((p) => <option key={p} value={p} />)}
        </datalist>
        <button
          onClick={save}
          disabled={saving || Object.keys(dirty).length === 0}
          className="bg-accent hover:bg-accent-strong disabled:opacity-40 text-white text-sm px-5 py-2 rounded-lg transition-colors"
        >
          {saving ? 'Zapisywanie…' : `Zapisz zmiany${Object.keys(dirty).length ? ` (${Object.keys(dirty).length})` : ''}`}
        </button>
      </div>
    </Card>
  )
}

function PowerSection() {
  const [confirm, setConfirm] = useState<PowerAction | null>(null)
  const [busy, setBusy] = useState(false)

  const ACTIONS: { action: PowerAction; label: string; description: string; danger: boolean }[] = [
    { action: 'restart-app', label: 'Restart aplikacji', description: 'Restartuje sam JawcoldMonitor (kilkanaście sekund przerwy). Stosowane też po zmianie portu RS485.', danger: false },
    { action: 'reboot', label: 'Restart Raspberry', description: 'Ponowne uruchomienie całego urządzenia.', danger: true },
    { action: 'shutdown', label: 'Wyłącz Raspberry', description: 'Bezpieczne wyłączenie — ponowne włączenie wymaga fizycznego odłączenia i podłączenia zasilania.', danger: true },
  ]

  const run = async (action: PowerAction) => {
    setBusy(true)
    try {
      const res = await powerAction(action)
      toast.success(res.message, { duration: 8000 })
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Operacja nie powiodła się', { duration: 10000 })
    } finally {
      setBusy(false)
    }
  }

  const current = ACTIONS.find((a) => a.action === confirm)

  return (
    <Card title="Zarządzanie urządzeniem">
      <div className="p-5 space-y-3">
        {ACTIONS.map((a) => (
          <div key={a.action} className="flex items-center justify-between gap-4">
            <p className="text-xs text-ink-muted flex-1">{a.description}</p>
            <button
              onClick={() => setConfirm(a.action)}
              disabled={busy}
              className={`shrink-0 text-sm px-4 py-2 rounded-lg border transition-colors disabled:opacity-40 ${
                a.danger
                  ? 'border-crit/40 text-crit hover:bg-crit hover:text-white'
                  : 'border-border text-ink-muted hover:text-ink hover:bg-surface-2'
              }`}
            >
              {a.label}
            </button>
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={confirm !== null}
        title={current?.label ?? ''}
        message={`Czy na pewno wykonać: ${current?.label.toLowerCase()}? ${current?.danger ? 'Monitoring będzie niedostępny do ponownego uruchomienia.' : ''}`}
        confirmLabel="Wykonaj"
        danger={current?.danger ?? false}
        onConfirm={() => { if (confirm) run(confirm) }}
        onClose={() => setConfirm(null)}
      />
    </Card>
  )
}

function NotificationsSection() {
  const supported = isNotificationSupported()
  const [permission, setPermission] = useState(getNotificationPermission())

  const enable = async () => {
    const result = await requestNotificationPermission()
    setPermission(result)
    if (result === 'granted') {
      toast.success('Powiadomienia przeglądarkowe włączone')
      new Notification('JawcoldMonitor', { body: 'Powiadomienia są teraz włączone.' })
    } else if (result === 'denied') {
      toast.error('Powiadomienia zablokowane w ustawieniach przeglądarki')
    }
  }

  return (
    <Card title="Powiadomienia przeglądarkowe">
      <div className="p-5 space-y-3">
        {!supported ? (
          <p className="text-sm text-ink-muted">Ta przeglądarka nie obsługuje powiadomień systemowych.</p>
        ) : permission === 'granted' ? (
          <p className="text-sm text-good">
            Powiadomienia są włączone — gdy karta nie jest aktywna, nowy alarm wyśle powiadomienie systemowe.
          </p>
        ) : permission === 'denied' ? (
          <p className="text-sm text-crit">
            Powiadomienia są zablokowane dla tej strony. Odblokuj je w ustawieniach przeglądarki, aby je włączyć.
          </p>
        ) : (
          <>
            <p className="text-sm text-ink-muted">
              Otrzymuj powiadomienie systemowe, gdy w aplikacji wyzwoli się nowy alarm, nawet gdy ta karta nie jest aktywna.
            </p>
            <button
              onClick={enable}
              className="flex items-center gap-2 bg-accent hover:bg-accent-strong text-white text-sm px-4 py-2 rounded-lg transition-colors"
            >
              <Bell size={14} /> Włącz powiadomienia
            </button>
          </>
        )}
      </div>
    </Card>
  )
}

function ExportCard({ title, download }: { title: string; download: (format: string, range: string) => Promise<void> }) {
  const [fmt, setFmt] = useState('csv')
  const [range, setRange] = useState('24h')
  const [downloading, setDownloading] = useState(false)

  const run = async () => {
    setDownloading(true)
    try {
      await download(fmt, range)
    } catch {
      toast.error('Błąd pobierania pliku')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Card title={title}>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-ink-muted mb-1.5">Format</label>
            <select value={fmt} onChange={(e) => setFmt(e.target.value)} className="input">
              {FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-ink-muted mb-1.5">Zakres czasowy</label>
            <select value={range} onChange={(e) => setRange(e.target.value)} className="input">
              {RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <button
          onClick={run}
          disabled={downloading}
          className="flex items-center gap-2 bg-accent hover:bg-accent-strong disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          <Download size={14} /> {downloading ? 'Pobieranie…' : `Pobierz ${fmt.toUpperCase()}`}
        </button>
      </div>
    </Card>
  )
}

function BackupSection() {
  const [downloading, setDownloading] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [confirmFile, setConfirmFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const download = async () => {
    setDownloading(true)
    try {
      await downloadBackup()
      toast.success('Kopia zapasowa pobrana')
    } catch {
      toast.error('Błąd pobierania kopii zapasowej')
    } finally {
      setDownloading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setConfirmFile(file)
    e.target.value = ''
  }

  const doRestore = async () => {
    if (!confirmFile) return
    setRestoring(true)
    try {
      const s = await restoreBackup(confirmFile)
      const total = s.profiles_created + s.profiles_updated + s.devices_created + s.devices_updated
        + s.sensors_created + s.sensors_updated + s.rules_created + s.rules_updated
      toast.success(`Przywrócono konfigurację (${total} pozycji)`)
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Błąd przywracania kopii zapasowej')
    } finally {
      setRestoring(false)
      setConfirmFile(null)
    }
  }

  return (
    <Card title="Kopie zapasowe">
      <div className="p-5 space-y-4">
        <div>
          <p className="text-sm text-ink-body mb-2">
            Kopia zapasowa obejmuje sterowniki, profile producentów, mapy rejestrów, czujniki i reguły alarmowe.
            Nie obejmuje kont użytkowników ani historii odczytów.
          </p>
          <button
            onClick={download}
            disabled={downloading}
            className="flex items-center gap-2 bg-accent hover:bg-accent-strong disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            <Download size={14} /> {downloading ? 'Pobieranie…' : 'Pobierz kopię zapasową'}
          </button>
        </div>
        <div className="pt-4 border-t border-border">
          <p className="text-sm text-ink-body mb-2">
            Przywróć konfigurację z pliku kopii zapasowej. Istniejące pozycje (dopasowane po adresie/nazwie) zostaną zaktualizowane, nowe zostaną dodane.
          </p>
          <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleFileSelect} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={restoring}
            className="flex items-center gap-2 text-ink-muted hover:text-ink border border-border disabled:opacity-50 text-sm px-4 py-2 rounded-lg transition-colors"
          >
            <Upload size={14} /> Wybierz plik do przywrócenia
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmFile}
        title="Przywróć kopię zapasową"
        message={`Czy na pewno chcesz przywrócić konfigurację z pliku „${confirmFile?.name}”? Istniejące sterowniki, czujniki i reguły o pasujących identyfikatorach zostaną nadpisane.`}
        confirmLabel="Przywróć"
        onConfirm={doRestore}
        onClose={() => setConfirmFile(null)}
      />
    </Card>
  )
}

function UpdatesSection() {
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  useEffect(() => { getUpdateInfo().then(setInfo).catch(() => {}) }, [])

  return (
    <Card title="Aktualizacje">
      <div className="p-5 space-y-3">
        <p className="text-sm text-ink-muted">
          Bieżąca wersja: <span className="text-ink font-medium">{info?.current_version ?? '—'}</span>
          {info?.latest_version && (
            <> · najnowsza: <span className="text-ink font-medium">{info.latest_version}</span></>
          )}
        </p>
        {info?.update_available ? (
          <p className="text-sm text-warn font-medium">Dostępna jest nowa wersja.</p>
        ) : info?.latest_version ? (
          <p className="text-sm text-good">Masz najnowszą wersję.</p>
        ) : null}
        <div>
          <p className="text-sm text-ink-body mb-1.5">
            Aktualizacja (interfejs i backend naraz) — na Raspberry przez SSH:
          </p>
          <code className="block bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs text-ink font-mono select-all">
            {info?.update_command ?? '~/JawcoldMonitor/scripts/jawcold update'}
          </code>
          <p className="text-xs text-ink-muted mt-1.5">
            Powrót do poprzedniej wersji: to samo polecenie z „rollback” zamiast „update”. Dane i ustawienia
            pozostają nienaruszone.
          </p>
        </div>
      </div>
    </Card>
  )
}
