import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, Pencil, Trash2, Cable, AlertTriangle } from 'lucide-react'
import { Card } from '../UI/Card'
import { Badge } from '../UI/Badge'
import { Modal } from '../UI/Modal'
import { ConfirmDialog } from '../UI/ConfirmDialog'
import { getSerialPorts } from '../../api/system'
import { getLines, createLine, updateLine, deleteLine, BAUDRATES, type BusLine, type BusLineIn } from '../../api/lines'

// Ustawienia > Konfiguracja: the RS485 lines. One line per adapter port;
// controllers that need a different speed or frame (Eliwell IDPlus at
// 9600 next to MPXPRO at 19200 8N2) go on separate lines, which are
// polled in parallel. Changes apply at once, without a restart.
export function BusLinesCard() {
  const [lines, setLines] = useState<BusLine[]>([])
  const [ports, setPorts] = useState<string[]>([])
  const [editing, setEditing] = useState<BusLine | 'new' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<BusLine | null>(null)

  const load = () => getLines().then(setLines).catch(() => {})
  useEffect(() => {
    load()
    getSerialPorts().then((r) => setPorts(r.ports)).catch(() => {})
  }, [])

  const remove = async (line: BusLine) => {
    try {
      await deleteLine(line.id)
      toast.success(`Usunięto linię „${line.name}”`)
      load()
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Nie udało się usunąć linii')
    }
  }

  const usedPorts = new Set(lines.map((l) => l.port))

  return (
    <Card title="Linie RS485">
      <div className="p-5 space-y-3">
        <p className="text-xs text-ink-muted">
          Każda linia to osobny port adaptera z własną prędkością i formatem ramki. Sterowniki, które nie mogą pracować
          razem (np. Eliwell IDPlus — tylko 9600 b/s — i Carel MPXPRO — 19200 8N2), podłącz do różnych portów i dodaj
          dla nich osobne linie. Linie są odczytywane równolegle; zmiany działają od razu.
        </p>
        <div className="divide-y divide-border border border-border rounded-lg">
          {lines.length === 0 && <p className="px-4 py-3 text-sm text-ink-muted">Brak linii — dodaj pierwszą.</p>}
          {lines.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <Cable size={16} className={l.enabled ? 'text-accent' : 'text-ink-muted'} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">{l.name}</span>
                  <Badge variant="gray">{l.frame}</Badge>
                  {!l.enabled && <Badge variant="yellow">wyłączona</Badge>}
                  {l.enabled && !l.port_present && <Badge variant="red">brak portu</Badge>}
                </div>
                <p className="text-xs text-ink-muted break-all">{l.port}</p>
                <p className="text-xs text-ink-muted">
                  {l.device_count ? `${l.devices_online} online · ${l.devices_offline} offline` : 'brak sterowników'}
                  {l.is_default && ' · nowe sterowniki bez wybranej linii trafiają tutaj'}
                </p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setEditing(l)} className="p-2 rounded-lg text-ink-muted hover:text-accent hover:bg-surface-2" title="Edytuj linię" aria-label="Edytuj linię">
                  <Pencil size={15} />
                </button>
                <button onClick={() => setConfirmDelete(l)} className="p-2 rounded-lg text-ink-muted hover:text-crit hover:bg-surface-2" title="Usuń linię" aria-label="Usuń linię">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => setEditing('new')}
          className="flex items-center gap-2 border border-border text-sm text-ink-body hover:border-accent hover:text-accent px-4 py-2 rounded-lg transition-colors">
          <Plus size={14} /> Dodaj linię
        </button>
      </div>

      {editing && (
        <LineModal
          line={editing === 'new' ? null : editing}
          ports={ports.filter((p) => !usedPorts.has(p) || (editing !== 'new' && editing.port === p))}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
      <ConfirmDialog
        open={!!confirmDelete}
        title="Usuń linię"
        message={`Usunąć linię „${confirmDelete?.name}” (${confirmDelete?.port})? Linię z sterownikami trzeba najpierw opróżnić.`}
        confirmLabel="Usuń linię"
        onConfirm={() => confirmDelete && remove(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
      />
    </Card>
  )
}

function LineModal({ line, ports, onClose, onSaved }: {
  line: BusLine | null; ports: string[]; onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState<BusLineIn>({
    name: line?.name ?? '',
    port: line?.port ?? '',
    baudrate: line?.baudrate ?? 9600,
    parity: line?.parity ?? 'N',
    stopbits: line?.stopbits ?? 1,
    enabled: line?.enabled ?? true,
  })
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof BusLineIn>(key: K, value: BusLineIn[K]) => setForm((f) => ({ ...f, [key]: value }))

  // One click for the frames the supported controllers use.
  const PRESETS: Array<{ label: string; baudrate: number; parity: BusLineIn['parity']; stopbits: BusLineIn['stopbits'] }> = [
    { label: 'Eliwell (9600 8N1)', baudrate: 9600, parity: 'N', stopbits: 1 },
    { label: 'Carel MPXPRO / EVD (19200 8N2)', baudrate: 19200, parity: 'N', stopbits: 2 },
    { label: 'Danfoss / Schneider (19200 8E1)', baudrate: 19200, parity: 'E', stopbits: 1 },
  ]

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (line) await updateLine(line.id, form)
      else await createLine(form)
      toast.success(line ? 'Zapisano linię — działa od razu' : 'Dodano linię — sterowniki na niej zostaną wyszukane przy najbliższym skanowaniu')
      onSaved()
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Nie udało się zapisać linii')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={line ? `Linia — ${line.name}` : 'Nowa linia RS485'}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-xs text-ink-muted mb-1">Nazwa</label>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} required maxLength={64}
            placeholder="np. Eliwell — chłodnie" className="input" autoFocus />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">Port</label>
          <input value={form.port} onChange={(e) => set('port', e.target.value)} required list="line-ports"
            placeholder="/dev/serial/by-id/…" className="input" />
          <datalist id="line-ports">{ports.map((p) => <option key={p} value={p} />)}</datalist>
          <p className="text-[11px] text-ink-muted mt-1">Wybierz z listy — ścieżki /dev/serial/by-id/… nie zmieniają się po odłączeniu adaptera.</p>
        </div>
        <div>
          <span className="block text-xs text-ink-muted mb-1">Gotowe ustawienia</span>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.label} type="button"
                onClick={() => setForm((f) => ({ ...f, baudrate: p.baudrate, parity: p.parity, stopbits: p.stopbits }))}
                className="text-xs border border-border rounded-md px-2 py-1 text-ink-muted hover:text-accent hover:border-accent">
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-ink-muted mb-1">Prędkość</label>
            <select value={form.baudrate} onChange={(e) => set('baudrate', Number(e.target.value))} className="input">
              {BAUDRATES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-ink-muted mb-1">Parzystość</label>
            <select value={form.parity} onChange={(e) => set('parity', e.target.value as BusLineIn['parity'])} className="input">
              <option value="N">brak (N)</option>
              <option value="E">parzysta (E)</option>
              <option value="O">nieparzysta (O)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-ink-muted mb-1">Bity stopu</label>
            <select value={form.stopbits} onChange={(e) => set('stopbits', Number(e.target.value) as 1 | 2)} className="input">
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-body">
          <input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)}
            className="rounded border-border-strong text-accent focus:ring-0" />
          Linia włączona (wyłączona = jej sterowniki nie są odczytywane)
        </label>
        {line && line.device_count > 0 && (form.baudrate !== line.baudrate || form.parity !== line.parity || form.stopbits !== line.stopbits) && (
          <p className="flex gap-2 text-xs text-warn bg-warn-bg border border-warn/20 rounded-lg px-3 py-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            Na tej linii są sterowniki ({line.device_count}) — po zmianie formatu odpowiedzą tylko te, które mają ustawiony taki sam.
          </p>
        )}
        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={saving} className="flex-1 bg-accent hover:bg-accent-strong disabled:opacity-50 text-white text-sm py-2 rounded-lg">
            {saving ? 'Zapisywanie…' : line ? 'Zapisz' : 'Dodaj linię'}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-ink-muted border border-border rounded-lg">Anuluj</button>
        </div>
      </form>
    </Modal>
  )
}
