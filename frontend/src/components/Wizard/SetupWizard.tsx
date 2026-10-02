import toast from 'react-hot-toast'
import { useEffect, useState } from 'react'
import { Snowflake, Radio, Search, CheckCircle2, Cpu, Thermometer, ArrowRight } from 'lucide-react'
import { useDeviceStore } from '../../store/devices'
import { getSerialPorts, getRuntimeSettings, updateRuntimeSettings, powerAction } from '../../api/system'
import { getDevices } from '../../api/devices'
import { getSensors } from '../../api/sensors'
import { ManufacturerBadge } from '../Devices/ManufacturerBadge'
import type { Device } from '../../types/device'
import type { Sensor } from '../../types/sensor'

const COMPLETED_KEY = 'jawcold-wizard-completed'

export function isWizardCompleted(): boolean {
  try {
    return localStorage.getItem(COMPLETED_KEY) === '1'
  } catch {
    return true
  }
}

const STEPS = ['Witaj', 'Komunikacja', 'Wykrywanie', 'Podsumowanie'] as const

export function SetupWizard() {
  const open = useDeviceStore((s) => s.wizardOpen)
  const setOpen = useDeviceStore((s) => s.setWizardOpen)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (open) setStep(0)
  }, [open])

  const finish = () => {
    try { localStorage.setItem(COMPLETED_KEY, '1') } catch {}
    setOpen(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/50 p-4 animate-overlay-in">
      <div className="bg-surface border border-border rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-modal-in">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-border">
          <Snowflake size={18} className="text-accent" strokeWidth={2.25} />
          <span className="font-semibold text-ink text-sm">Kreator pierwszej konfiguracji</span>
        </div>

        <div className="flex px-6 pt-4 gap-1.5">
          {STEPS.map((label, i) => (
            <div key={label} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-surface-2'}`} />
          ))}
        </div>

        <div className="p-6 min-h-[280px] flex flex-col">
          {step === 0 && <WelcomeStep />}
          {step === 1 && <CommsStep />}
          {step === 2 && <DiscoveryStep />}
          {step === 3 && <SummaryStep />}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-border">
          <button onClick={finish} className="text-xs text-ink-muted hover:text-ink transition-colors">
            Pomiń kreator
          </button>
          <button
            onClick={() => (step === STEPS.length - 1 ? finish() : setStep((s) => s + 1))}
            className="flex items-center gap-2 bg-accent hover:bg-accent-strong text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            {step === STEPS.length - 1 ? 'Przejdź do pulpitu' : 'Dalej'}
            {step < STEPS.length - 1 && <ArrowRight size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}

function WelcomeStep() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
      <div className="p-3 bg-accent-soft rounded-xl">
        <Snowflake size={28} className="text-accent" />
      </div>
      <h2 className="text-lg font-bold text-ink">Witaj w JawcoldMonitor</h2>
      <p className="text-sm text-ink-muted max-w-sm">
        Ten kreator przeprowadzi Cię przez podstawową konfigurację komunikacji oraz pokaże wykryte urządzenia.
        Zajmie to mniej niż minutę.
      </p>
    </div>
  )
}

function CommsStep() {
  const [ports, setPorts] = useState<string[]>([])
  const [selected, setSelected] = useState('')
  const [baudrate, setBaudrate] = useState('9600')
  const [stopbits, setStopbits] = useState('1')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    // Current values first, so the step shows what is configured now.
    getRuntimeSettings().then((all) => {
      const v = (k: string) => all.find((x) => x.key === k)?.value
      if (v('RS485_PORTS')) setSelected(v('RS485_PORTS')!)
      if (v('RS485_BAUDRATE')) setBaudrate(v('RS485_BAUDRATE')!)
      if (v('RS485_STOPBITS')) setStopbits(v('RS485_STOPBITS')!)
    }).catch(() => {})
    getSerialPorts().then(({ ports: p }) => {
      setPorts(p)
      setSelected((cur) => cur || p[0] || '')
    }).catch(() => {})
  }, [])

  // Used to be a preview only - nothing was saved. Now it writes the same
  // runtime settings as Ustawienia -> RS485 and offers the restart they need.
  const save = async () => {
    setSaving(true)
    try {
      await updateRuntimeSettings({ RS485_PORTS: selected, RS485_BAUDRATE: baudrate, RS485_STOPBITS: stopbits })
      setSaved(true)
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Nie udało się zapisać ustawień RS485')
    } finally {
      setSaving(false)
    }
  }

  const restart = async () => {
    try {
      await powerAction('restart-app')
      toast.success('Aplikacja uruchamia się ponownie — odśwież stronę za kilka sekund')
    } catch {
      toast.error('Nie udało się zrestartować aplikacji')
    }
  }

  return (
    <div className="flex-1 space-y-4">
      <div className="flex items-center gap-2">
        <Radio size={16} className="text-accent" />
        <h2 className="text-sm font-semibold text-ink">Komunikacja RS485 / Modbus</h2>
      </div>
      <p className="text-sm text-ink-muted">Wybierz port podłączonego adaptera RS485 i parametry magistrali.</p>
      <div className="flex flex-wrap gap-2">
        {ports.map((p) => (
          <button
            key={p}
            onClick={() => { setSelected(p); setSaved(false) }}
            title={p}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors max-w-full truncate ${selected === p ? 'bg-accent border-accent text-white' : 'border-border text-ink-muted hover:text-ink'}`}
          >
            {p.replace('/dev/serial/by-id/', '')}
          </button>
        ))}
        {!ports.length && <p className="text-xs text-ink-muted">Nie wykryto adaptera — podłącz go i otwórz kreator ponownie.</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">Prędkość (baud)</label>
          <select value={baudrate} onChange={(e) => { setBaudrate(e.target.value); setSaved(false) }} className="input">
            {[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].map((b) => (
              <option key={b} value={String(b)}>{b}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">Bity stopu</label>
          <select value={stopbits} onChange={(e) => { setStopbits(e.target.value); setSaved(false) }} className="input">
            <option value="1">1</option>
            <option value="2">2 (np. Carel MPXPRO)</option>
          </select>
        </div>
      </div>
      {saved ? (
        <div className="text-xs bg-good-bg border border-good/30 text-ink-body rounded-lg p-3 flex flex-wrap items-center gap-3">
          <span className="flex-1">Zapisano. Nowe ustawienia portu zadziałają po ponownym uruchomieniu aplikacji.</span>
          <button onClick={restart} className="text-xs bg-accent hover:bg-accent-strong text-white px-3 py-1.5 rounded-lg">Uruchom ponownie</button>
        </div>
      ) : (
        <button onClick={save} disabled={saving || !selected}
          className="text-sm bg-accent hover:bg-accent-strong disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors">
          {saving ? 'Zapisywanie…' : 'Zapisz ustawienia magistrali'}
        </button>
      )}
    </div>
  )
}

function DiscoveryStep() {
  const [scanning, setScanning] = useState(true)
  const [devices, setDevices] = useState<Device[]>([])
  const [sensors, setSensors] = useState<Sensor[]>([])

  useEffect(() => {
    const timer = setTimeout(() => {
      Promise.all([getDevices(), getSensors()]).then(([d, s]) => {
        setDevices(d)
        setSensors(s)
        setScanning(false)
      })
    }, 1500)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="flex-1 space-y-4">
      <div className="flex items-center gap-2">
        <Search size={16} className="text-accent" />
        <h2 className="text-sm font-semibold text-ink">Wykrywanie urządzeń</h2>
      </div>
      {scanning ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-10">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-ink-muted">Skanowanie magistrali RS485 i 1-Wire…</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-52 overflow-y-auto">
          {devices.map((d) => (
            <div key={d.id} className="flex items-center justify-between bg-surface-2 border border-border rounded-lg px-3 py-2">
              <span className="text-sm text-ink flex items-center gap-2"><Cpu size={13} className="text-ink-muted" /> {d.name}</span>
              <ManufacturerBadge profile={d.profile} />
            </div>
          ))}
          {sensors.map((s) => (
            <div key={`s${s.id}`} className="flex items-center justify-between bg-surface-2 border border-border rounded-lg px-3 py-2">
              <span className="text-sm text-ink flex items-center gap-2"><Thermometer size={13} className="text-ink-muted" /> {s.name}</span>
              <span className="text-xs text-ink-muted">{s.sensor_type}</span>
            </div>
          ))}
          {devices.length === 0 && sensors.length === 0 && (
            <p className="text-sm text-ink-muted text-center py-6">Brak wykrytych urządzeń — skaner nadal pracuje w tle.</p>
          )}
        </div>
      )}
    </div>
  )
}

function SummaryStep() {
  const devices = useDeviceStore((s) => s.devices)
  const sensors = useDeviceStore((s) => s.sensors)

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
      <div className="p-3 bg-good-bg rounded-xl">
        <CheckCircle2 size={28} className="text-good" />
      </div>
      <h2 className="text-lg font-bold text-ink">Konfiguracja zakończona</h2>
      <p className="text-sm text-ink-muted max-w-sm">
        Wykryto {devices.length} sterowników i {sensors.length} czujników. Możesz je dalej skonfigurować
        w zakładkach Sterowniki i Czujniki, a w razie potrzeby uruchomić ten kreator ponownie z Ustawień.
      </p>
    </div>
  )
}
