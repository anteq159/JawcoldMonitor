import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Mail, Send, MessageSquare, ServerCog, Radio } from 'lucide-react'
import {
  getRuntimeSettings, updateRuntimeSettings, getNotificationStatus, testNotification, checkModem, getSerialPorts,
  type RuntimeSetting, type NotificationStatus, type NotifyChannel, type ModemStatus,
} from '../../api/system'
import { Badge } from '../UI/Badge'
import { PageSpinner } from '../UI/Spinner'
import type { AlertRule } from '../../types/alert'

// Alerty > Powiadomienia: everything about messages leaving the panel in
// one place - per channel a switch, its settings, a status and a test
// button, plus which channels get the system alarms.
const CHANNELS: Array<{
  id: NotifyChannel
  title: string
  icon: typeof Mail
  category: string
  enabledKey: string
  help: string
}> = [
  {
    id: 'email', title: 'E-mail', icon: Mail, category: 'Powiadomienia e-mail', enabledKey: 'EMAIL_ENABLED',
    help: 'Serwer poczty wychodzącej (SMTP), zwykle port 587. Dla Gmaila użyj hasła aplikacji.',
  },
  {
    id: 'telegram', title: 'Telegram', icon: Send, category: 'Powiadomienia Telegram', enabledKey: 'TELEGRAM_ENABLED',
    help: 'Utwórz bota u @BotFather i wklej jego token. ID czatu: napisz do bota, potem otwórz api.telegram.org/bot<token>/getUpdates. Kilka czatów lub grup po przecinku.',
  },
  {
    id: 'sms', title: 'SMS', icon: MessageSquare, category: 'Powiadomienia SMS', enabledKey: 'SMS_ENABLED',
    help: '',
  },
]

// SMS fields per gateway - the rest of the SMS settings belong to the
// other gateways and would only confuse.
const SMS_FIELDS: Record<string, string[]> = {
  smsapi: ['SMS_API_TOKEN', 'SMS_SENDER'],
  twilio: ['SMS_API_TOKEN', 'SMS_ACCOUNT_SID', 'SMS_SENDER'],
  modem: ['SMS_MODEM_PORT', 'SMS_MODEM_BAUDRATE', 'SMS_MODEM_PIN'],
}
const SMS_PROVIDER_FIELDS = new Set(Object.values(SMS_FIELDS).flat())
const SMS_HELP: Record<string, string> = {
  smsapi: 'Token z panelu SMSAPI.pl (Ustawienia API). Nadawcę trzeba wcześniej zarejestrować w SMSAPI — puste pole = domyślny nadawca. Polskie znaki są zamieniane, żeby SMS był tańszy.',
  twilio: 'Account SID i Auth Token z konsoli Twilio, nadawca = numer kupiony w Twilio (+48… lub inny).',
  modem: 'Modem GSM/LTE z kartą SIM wpięty w USB Raspberry (np. SIM800, SIM7600, Huawei w trybie modemu). Działa bez internetu. Port modemu musi być inny niż port RS485; jeśli modem ma kilka portów, zwykle działa drugi lub trzeci (ttyUSB2). SMS idzie bez polskich znaków, maks. 160 znaków.',
}

const SYSTEM_CATEGORY = 'Alarmy systemowe'

export function NotificationChannels({ rules }: { rules: AlertRule[] }) {
  const [settings, setSettings] = useState<RuntimeSetting[]>([])
  const [status, setStatus] = useState<NotificationStatus | null>(null)
  const [dirty, setDirty] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [ports, setPorts] = useState<string[]>([])
  const [modem, setModem] = useState<ModemStatus | null>(null)

  const load = () => Promise.all([getRuntimeSettings(), getNotificationStatus()])
    .then(([s, st]) => { setSettings(s); setStatus(st) })
  useEffect(() => {
    load().finally(() => setLoading(false))
    getSerialPorts().then((r) => setPorts(r.ports)).catch(() => {})
  }, [])

  const runModemCheck = async () => {
    setBusy('modem')
    setModem(null)
    try {
      setModem(await checkModem())
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Nie udało się połączyć z modemem', { duration: 10000 })
    } finally {
      setBusy(null)
    }
  }

  const byKey = (key: string) => settings.find((s) => s.key === key)
  const value = (key: string) => dirty[key] ?? byKey(key)?.value ?? ''
  const setValue = (key: string, v: string) => setDirty((d) => ({ ...d, [key]: v }))
  const dirtyIn = (keys: string[]) => keys.filter((k) => dirty[k] !== undefined)

  const save = async (keys: string[], what: string) => {
    const values = Object.fromEntries(dirtyIn(keys).map((k) => [k, dirty[k]]))
    if (!Object.keys(values).length) return
    setBusy(what)
    try {
      await updateRuntimeSettings(values)
      setDirty((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !(k in values))))
      await load()
      toast.success('Zapisano')
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Nie udało się zapisać')
    } finally {
      setBusy(null)
    }
  }

  const setEnabled = async (key: string, on: boolean) => {
    setBusy(key)
    try {
      await updateRuntimeSettings({ [key]: on ? 'true' : 'false' })
      await load()
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Nie udało się zmienić')
    } finally {
      setBusy(null)
    }
  }

  const test = async (ch: NotifyChannel) => {
    setBusy(`test-${ch}`)
    try {
      const r = await testNotification(ch)
      toast.success(`${r.message} — sprawdź ${ch === 'email' ? 'skrzynkę' : ch === 'sms' ? 'telefon' : 'Telegram'}`)
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Nie udało się wysłać wiadomości testowej', { duration: 10000 })
    } finally {
      setBusy(null)
    }
  }

  if (loading || !status) return <PageSpinner />

  const systemKeys = settings.filter((s) => s.category === SYSTEM_CATEGORY).map((s) => s.key)
  const systemList = value('NOTIFY_SYSTEM_CHANNELS').split(',').map((x) => x.trim()).filter(Boolean)

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted max-w-3xl">
        Wiadomości wysyłane poza panel, gdy coś się dzieje. Reguły alarmowe wybierają kanały w swoich ustawieniach,
        a alarmy systemowe (brak komunikacji, alarmy sterowników, pełny dysk) — w karcie poniżej.
      </p>

      <div className="bg-surface border border-border rounded-xl shadow-panel p-5 space-y-3">
        <div className="flex items-center gap-2">
          <ServerCog size={16} className="text-accent" />
          <h3 className="font-semibold text-ink text-sm">Alarmy systemowe</h3>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <span className="text-sm text-ink-muted">Wysyłaj przez:</span>
          {CHANNELS.map((c) => {
            const on = systemList.includes(c.id)
            return (
              <label key={c.id} className="flex items-center gap-1.5 text-sm text-ink-body">
                <input type="checkbox" checked={on}
                  onChange={() => setValue('NOTIFY_SYSTEM_CHANNELS', (on ? systemList.filter((x) => x !== c.id) : [...systemList, c.id]).join(','))}
                  className="rounded border-border-strong text-accent focus:ring-0" />
                {c.title}
              </label>
            )
          })}
        </div>
        <div className="grid sm:grid-cols-2 gap-3 max-w-xl">
          {['OFFLINE_ALARM_MINUTES', 'DISK_ALARM_PERCENT'].map((k) => byKey(k) && (
            <Field key={k} setting={byKey(k)!} value={value(k)} onChange={(v) => setValue(k, v)} />
          ))}
        </div>
        <SaveButton dirty={dirtyIn(systemKeys).length} busy={busy === 'system'} onClick={() => save(systemKeys, 'system')} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {CHANNELS.map((c) => {
          const st = status.channels[c.id]
          const fields = settings.filter((s) => s.category === c.category && s.key !== c.enabledKey)
          const keys = fields.map((f) => f.key)
          const pending = dirtyIn(keys).length
          const usedBy = rules.filter((r) => r.notify_channels?.includes(c.id)).length
          const inSystem = (status.system_channels ?? []).includes(c.id)
          const Icon = c.icon
          return (
            <div key={c.id} className="bg-surface border border-border rounded-xl shadow-panel p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Icon size={16} className="text-accent" />
                  <h3 className="font-semibold text-ink">{c.title}</h3>
                  {!st.enabled ? <Badge variant="gray">wyłączony</Badge>
                    : st.configured ? <Badge variant="green">gotowy</Badge>
                    : <Badge variant="yellow">do uzupełnienia</Badge>}
                </div>
                <Switch on={st.enabled} disabled={busy === c.enabledKey} label={`Kanał ${c.title}`}
                  onChange={(on) => setEnabled(c.enabledKey, on)} />
              </div>
              <p className="text-xs text-ink-muted">
                {usedBy || inSystem
                  ? [usedBy ? `${usedBy} ${usedBy === 1 ? 'reguła' : usedBy < 5 ? 'reguły' : 'reguł'}` : null, inSystem ? 'alarmy systemowe' : null].filter(Boolean).join(' + ')
                  : 'Nie jest jeszcze używany przez żadną regułę ani alarmy systemowe'}
                {c.id === 'sms' && ` · dziś wysłano ${status.sms_sent_today}${status.sms_daily_limit ? ` z ${status.sms_daily_limit}` : ''}`}
              </p>

              <div className={`space-y-3 ${st.enabled ? '' : 'opacity-60'}`}>
                {fields
                  .filter((f) => !SMS_PROVIDER_FIELDS.has(f.key) || SMS_FIELDS[value('SMS_PROVIDER') || 'smsapi']?.includes(f.key))
                  .map((f) => (
                    <Field key={f.key} setting={f} value={value(f.key)} onChange={(v) => setValue(f.key, v)}
                      list={f.key === 'SMS_MODEM_PORT' ? 'modem-ports' : undefined} />
                  ))}
              </div>
              <p className="text-[11px] leading-snug text-ink-muted">{c.id === 'sms' ? SMS_HELP[value('SMS_PROVIDER') || 'smsapi'] : c.help}</p>
              {c.id === 'sms' && value('SMS_PROVIDER') === 'modem' && (
                <div className="space-y-2">
                  <button onClick={runModemCheck} disabled={busy !== null || pending > 0}
                    title={pending ? 'Najpierw zapisz zmiany' : 'Sprawdza SIM, zasięg i operatora — bez wysyłania SMS'}
                    className="flex items-center gap-1.5 border border-border text-sm text-ink-body hover:border-accent hover:text-accent disabled:opacity-50 px-3 py-2 rounded-lg transition-colors">
                    <Radio size={13} /> {busy === 'modem' ? 'Sprawdzanie…' : 'Sprawdź modem'}
                  </button>
                  {modem && (
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs bg-surface-2 rounded-lg p-3">
                      <dt className="text-ink-muted">Modem</dt><dd className="text-ink">{modem.model ?? '—'}</dd>
                      <dt className="text-ink-muted">Karta SIM</dt><dd className="text-ink">{modem.sim}</dd>
                      <dt className="text-ink-muted">Sieć</dt>
                      <dd className={modem.registered ? 'text-good' : 'text-crit'}>{modem.network}{modem.operator ? ` · ${modem.operator}` : ''}</dd>
                      <dt className="text-ink-muted">Zasięg</dt>
                      <dd className={modem.signal_percent == null ? 'text-ink-muted' : modem.signal_percent < 20 ? 'text-warn' : 'text-ink'}>
                        {modem.signal_percent == null ? 'nieznany' : `${modem.signal_percent}%`}
                      </dd>
                    </dl>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2 mt-auto pt-1">
                <SaveButton dirty={pending} busy={busy === c.id} onClick={() => save(keys, c.id)} />
                <button onClick={() => test(c.id)} disabled={busy !== null || pending > 0}
                  title={pending ? 'Najpierw zapisz zmiany' : undefined}
                  className="flex items-center gap-1.5 border border-border text-sm text-ink-body hover:border-accent hover:text-accent disabled:opacity-50 px-3 py-2 rounded-lg transition-colors">
                  <Send size={13} /> {busy === `test-${c.id}` ? 'Wysyłanie…' : 'Wyślij test'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
      <datalist id="modem-ports">
        {ports.map((p) => <option key={p} value={p} />)}
      </datalist>
    </div>
  )
}

function Field({ setting: s, value, onChange, list }: { setting: RuntimeSetting; value: string; onChange: (v: string) => void; list?: string }) {
  return (
    <div>
      <label className="block text-xs text-ink-muted mb-1">{s.label}</label>
      {s.key === 'SMS_PROVIDER' ? (
        <select value={value || 'smsapi'} onChange={(e) => onChange(e.target.value)} className="input">
          <option value="smsapi">SMSAPI.pl</option>
          <option value="twilio">Twilio</option>
          <option value="modem">Modem GSM w Raspberry (USB)</option>
        </select>
      ) : s.type === 'bool' ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className="input">
          <option value="true">Tak</option>
          <option value="false">Nie</option>
        </select>
      ) : (
        <input
          type={s.secret ? 'password' : s.type === 'int' || s.type === 'float' ? 'number' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={s.secret ? (s.is_set ? '••••••• (ustawione — wpisz, aby zmienić)' : 'nie ustawione') : undefined}
          autoComplete="off"
          list={list}
          className="input"
        />
      )}
    </div>
  )
}

function SaveButton({ dirty, busy, onClick }: { dirty: number; busy: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={busy || dirty === 0}
      className="bg-accent hover:bg-accent-strong disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg transition-colors">
      {busy ? 'Zapisywanie…' : dirty ? `Zapisz (${dirty})` : 'Zapisz'}
    </button>
  )
}

function Switch({ on, disabled, label, onChange }: { on: boolean; disabled?: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative w-10 h-6 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-accent' : 'bg-border-strong'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : ''}`} />
    </button>
  )
}
