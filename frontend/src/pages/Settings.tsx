import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Download, Upload, RefreshCw, Wand2 } from 'lucide-react'
import { Card } from '../components/UI/Card'
import { ConfirmDialog } from '../components/UI/ConfirmDialog'
import { downloadReadings, downloadAlerts } from '../api/export'
import { downloadBackup, restoreBackup } from '../api/backup'
import { getUpdateCheck, type UpdateCheck } from '../api/system'
import { useDeviceStore } from '../store/devices'

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
      <ExportCard title="Eksport odczytów" download={downloadReadings} />
      <ExportCard title="Eksport alarmów" download={downloadAlerts} />
      <BackupSection />
      <UpdatesSection />

      <Card title="Informacje o systemie">
        <div className="p-5 space-y-3 text-sm text-ink-muted">
          <p>Swagger API: <a href="/api/v1/docs" target="_blank" rel="noreferrer" className="text-accent hover:underline">/api/v1/docs</a></p>
          <p>Wersja: 1.0.0</p>
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
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<UpdateCheck | null>(null)

  const check = async () => {
    setChecking(true)
    try {
      setResult(await getUpdateCheck())
    } catch {
      toast.error('Błąd sprawdzania aktualizacji')
    } finally {
      setChecking(false)
    }
  }

  return (
    <Card title="Aktualizacje">
      <div className="p-5 space-y-3">
        <p className="text-sm text-ink-muted">Bieżąca wersja: <span className="text-ink font-medium">1.0.0</span></p>
        <button
          onClick={check}
          disabled={checking}
          className="flex items-center gap-2 bg-accent hover:bg-accent-strong disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          <RefreshCw size={14} className={checking ? 'animate-spin' : ''} /> {checking ? 'Sprawdzanie…' : 'Sprawdź aktualizacje'}
        </button>
        {result && (
          <div className="bg-surface-2 border border-border rounded-lg p-3 text-sm">
            {result.up_to_date ? (
              <p className="text-good">System jest aktualny (wersja {result.current_version}).</p>
            ) : (
              <p className="text-warn">Dostępna nowa wersja: {result.latest_version}</p>
            )}
            {result.changelog.map((c) => (
              <p key={c.version} className="text-xs text-ink-muted mt-1">{c.version}: {c.notes}</p>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}
