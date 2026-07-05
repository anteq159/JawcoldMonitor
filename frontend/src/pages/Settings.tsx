import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { Download, Upload, RefreshCw, RotateCcw, Wand2, Bell } from 'lucide-react'
import { Card } from '../components/UI/Card'
import { ConfirmDialog } from '../components/UI/ConfirmDialog'
import { downloadReadings, downloadAlerts } from '../api/export'
import { downloadBackup, restoreBackup } from '../api/backup'
import { getUpdateInfo, uploadUpdate, rollbackUpdate, getServicesStatus, type UpdateInfo } from '../api/system'
import { useDeviceStore } from '../store/devices'
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

  return (
    <div className="space-y-6 max-w-2xl">
      <NotificationsSection />
      <ExportCard title="Eksport odczytów" download={downloadReadings} />
      <ExportCard title="Eksport alarmów" download={downloadAlerts} />
      <BackupSection />
      <UpdatesSection />

      <Card title="Informacje o systemie">
        <div className="p-5 space-y-3 text-sm text-ink-muted">
          <p>Swagger API: <a href="/api/v1/docs" target="_blank" rel="noreferrer" className="text-accent hover:underline">/api/v1/docs</a></p>
          <p>Stack: FastAPI + React + PostgreSQL + Redis</p>
          <button
            onClick={() => setWizardOpen(true)}
            className="flex items-center gap-2 text-ink-muted hover:text-ink border border-border text-sm px-4 py-2 rounded-lg transition-colors"
          >
            <Wand2 size={14} /> Uruchom kreator pierwszej konfiguracji ponownie
          </button>
        </div>
      </Card>
    </div>
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
  const [confirmFile, setConfirmFile] = useState<File | null>(null)
  const [confirmRollback, setConfirmRollback] = useState(false)
  const [busy, setBusy] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { getUpdateInfo().then(setInfo).catch(() => {}) }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setConfirmFile(file)
    e.target.value = ''
  }

  // The backend process exits itself right after responding so Docker's
  // restart policy loads the new code - there's a real few-second gap
  // where it won't answer, so poll until it does rather than guessing a
  // fixed delay.
  const waitForRestart = () => {
    setRestarting(true)
    let attempts = 0
    const poll = setInterval(async () => {
      attempts += 1
      try {
        await getServicesStatus()
        clearInterval(poll)
        window.location.reload()
      } catch {
        if (attempts >= 30) {
          clearInterval(poll)
          setRestarting(false)
          toast.error('Aplikacja nie odpowiada po restarcie — sprawdź kontener ręcznie (docker compose logs backend)')
        }
      }
    }, 2000)
  }

  const doUpload = async () => {
    if (!confirmFile) return
    setBusy(true)
    try {
      const result = await uploadUpdate(confirmFile)
      toast.success(`${result.message} (${result.from_version} → ${result.to_version})`)
      setConfirmFile(null)
      waitForRestart()
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Błąd instalacji aktualizacji')
      setConfirmFile(null)
    } finally {
      setBusy(false)
    }
  }

  const doRollback = async () => {
    setBusy(true)
    try {
      const result = await rollbackUpdate()
      toast.success(`${result.message} (${result.from_version} → ${result.to_version})`)
      setConfirmRollback(false)
      waitForRestart()
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Błąd przywracania poprzedniej wersji')
      setConfirmRollback(false)
    } finally {
      setBusy(false)
    }
  }

  if (restarting) {
    return (
      <Card title="Aktualizacje">
        <div className="p-5 flex items-center gap-3">
          <RefreshCw size={16} className="animate-spin text-accent shrink-0" />
          <p className="text-sm text-ink-body">Aplikacja się restartuje — strona odświeży się automatycznie za chwilę…</p>
        </div>
      </Card>
    )
  }

  return (
    <Card title="Aktualizacje">
      <div className="p-5 space-y-4">
        <div>
          <p className="text-sm text-ink-muted">
            Bieżąca wersja: <span className="text-ink font-medium">{info?.current_version ?? '—'}</span>
          </p>
          {info?.last_update && (
            <p className="text-xs text-ink-muted mt-1">
              Ostatni{info.last_update.action === 'rollback' ? 'e wycofanie' : 'a aktualizacja'}: {info.last_update.from_version} → {info.last_update.to_version}
              {' '}({format(new Date(info.last_update.applied_at), 'd MMM yyyy, HH:mm')})
            </p>
          )}
        </div>

        <div>
          <p className="text-sm text-ink-body mb-2">
            Wgraj plik aktualizacji (.zip) — aplikacja zostanie zaktualizowana i sama się zrestartuje.
          </p>
          <input ref={fileInputRef} type="file" accept=".zip" className="hidden" onChange={handleFileSelect} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-2 bg-accent hover:bg-accent-strong disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            <Upload size={14} /> Wgraj plik aktualizacji
          </button>
        </div>

        {info?.rollback_available && (
          <div className="pt-4 border-t border-border">
            <p className="text-sm text-ink-body mb-2">
              Zachowana jest kopia sprzed ostatniej aktualizacji — możesz ją przywrócić, jeśli coś nie działa poprawnie.
            </p>
            <button
              onClick={() => setConfirmRollback(true)}
              disabled={busy}
              className="flex items-center gap-2 text-warn hover:text-warn/80 border border-border disabled:opacity-50 text-sm px-4 py-2 rounded-lg transition-colors"
            >
              <RotateCcw size={14} /> Wycofaj ostatnią aktualizację
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmFile}
        title="Zainstalować aktualizację?"
        message={`Aplikacja zostanie zaktualizowana z pliku „${confirmFile?.name}” i automatycznie zrestartowana. Bieżąca wersja zostanie zachowana jako kopia zapasowa na wypadek problemów.`}
        confirmLabel="Zainstaluj"
        onConfirm={doUpload}
        onClose={() => setConfirmFile(null)}
      />
      <ConfirmDialog
        open={confirmRollback}
        title="Wycofać aktualizację?"
        message="Aplikacja wróci do wersji sprzed ostatniej aktualizacji i zostanie zrestartowana."
        confirmLabel="Wycofaj"
        onConfirm={doRollback}
        onClose={() => setConfirmRollback(false)}
      />
    </Card>
  )
}
