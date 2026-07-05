import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Upload, Trash2, MapPin, X, Save, Plus } from 'lucide-react'
import { getMaps, uploadMap, savePositions, deleteMap, getMapFileBlobUrl, MAX_MAP_PIN_PARAMS, type FloorMap, type MapPosition } from '../api/maps'
import { getDevices } from '../api/devices'
import { useDeviceStore } from '../store/devices'
import { useAuthStore } from '../store/auth'
import { DeviceStatusBadge } from '../components/Devices/DeviceStatusBadge'
import { Modal } from '../components/UI/Modal'
import { ConfirmDialog } from '../components/UI/ConfirmDialog'
import { EmptyState } from '../components/UI/EmptyState'
import { PageSpinner, Spinner } from '../components/UI/Spinner'
import toast from 'react-hot-toast'
import type { Device } from '../types/device'

export default function Map() {
  const [searchParams] = useSearchParams()
  const canConfigure = useAuthStore((s) => s.can('config:write'))
  const [maps, setMaps] = useState<FloorMap[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [activeMap, setActiveMap] = useState<FloorMap | null>(null)
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(searchParams.get('upload') === '1' && useAuthStore.getState().can('config:write'))
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  const load = async () => {
    const [m, d] = await Promise.all([getMaps(), getDevices()])
    setMaps(m); setDevices(d)
    if (m.length > 0 && !activeMap) setActiveMap(m[0])
  }

  useEffect(() => { load().finally(() => setLoading(false)) }, [])

  const confirmDelete = async () => {
    if (!activeMap) return
    await deleteMap(activeMap.id)
    const newMaps = maps.filter(m => m.id !== activeMap.id)
    setMaps(newMaps)
    setActiveMap(newMaps[0] ?? null)
    toast.success('Mapa usunięta')
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {maps.map(m => (
            <button key={m.id} onClick={() => setActiveMap(m)}
              className={`px-4 py-1.5 text-sm rounded-lg border transition-colors ${activeMap?.id === m.id ? 'bg-accent border-accent text-white' : 'border-border text-ink-muted hover:text-ink'}`}>
              {m.name}
            </button>
          ))}
        </div>
        {canConfigure && (
          <button onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 bg-accent hover:bg-accent-strong text-white text-sm px-4 py-2 rounded-lg shrink-0">
            <Plus size={14} /> Wgraj mapę
          </button>
        )}
      </div>

      {!activeMap ? (
        <div className="bg-surface border border-border border-dashed rounded-xl">
          <EmptyState
            icon={<Upload size={40} />}
            message="Brak map. Wgraj rzut kondygnacji lub schemat instalacji."
            action={canConfigure ? (
              <button onClick={() => setShowUpload(true)} className="bg-accent hover:bg-accent-strong text-white text-sm px-6 py-2 rounded-lg transition-colors">
                Wgraj pierwszą mapę
              </button>
            ) : undefined}
          />
        </div>
      ) : (
        <MapEditor
          key={activeMap.id}
          floorMap={activeMap}
          devices={devices}
          onDelete={() => setConfirmDeleteOpen(true)}
          onSaved={updated => { setActiveMap(updated); load() }}
        />
      )}

      <UploadModal open={showUpload} onClose={() => setShowUpload(false)} onUploaded={m => { setMaps(prev => [...prev, m]); setActiveMap(m); setShowUpload(false) }} />

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Usuń mapę"
        message={`Czy na pewno chcesz usunąć mapę „${activeMap?.name}”? Rozmieszczenie urządzeń na niej zostanie utracone.`}
        confirmLabel="Usuń mapę"
        onConfirm={confirmDelete}
        onClose={() => setConfirmDeleteOpen(false)}
      />
    </div>
  )
}

interface PendingPosition extends MapPosition { deviceName: string }

interface ParamPickerState { device: Device; x: number; y: number; initialSelected: string[] }

function MapEditor({ floorMap, devices, onDelete, onSaved }: {
  floorMap: FloorMap; devices: Device[]; onDelete: () => void; onSaved: (m: FloorMap) => void
}) {
  const imgRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const liveReadings = useDeviceStore(s => s.liveReadings)
  const canEdit = useAuthStore((s) => s.can('config:write'))

  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    setImgSrc(null)
    setImgError(false)
    getMapFileBlobUrl(floorMap.filename)
      .then(url => {
        if (cancelled) { URL.revokeObjectURL(url); return }
        objectUrl = url
        setImgSrc(url)
      })
      .catch(() => { if (!cancelled) setImgError(true) })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [floorMap.filename])

  const [positions, setPositions] = useState<PendingPosition[]>(() =>
    floorMap.positions.map(p => ({
      device_id: p.device_id, x_percent: p.x_percent, y_percent: p.y_percent, selected_params: p.selected_params ?? [],
      deviceName: devices.find(d => d.id === p.device_id)?.name ?? `#${p.device_id}`
    }))
  )
  const [editMode, setEditMode] = useState(false)
  const [pendingClick, setPendingClick] = useState<{ x: number; y: number } | null>(null)
  const [paramPicker, setParamPicker] = useState<ParamPickerState | null>(null)
  const [saving, setSaving] = useState(false)

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!editMode) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setPendingClick({ x, y })
  }

  const pickDevice = (device: Device) => {
    if (!pendingClick) return
    setParamPicker({ device, x: pendingClick.x, y: pendingClick.y, initialSelected: [] })
    setPendingClick(null)
  }

  const editParams = (pos: PendingPosition) => {
    const device = devices.find(d => d.id === pos.device_id)
    if (!device) return
    setParamPicker({ device, x: pos.x_percent, y: pos.y_percent, initialSelected: pos.selected_params })
  }

  const confirmParams = (selected: string[]) => {
    if (!paramPicker) return
    const { device, x, y } = paramPicker
    setPositions(prev => {
      const filtered = prev.filter(p => p.device_id !== device.id)
      return [...filtered, { device_id: device.id, x_percent: x, y_percent: y, selected_params: selected, deviceName: device.name }]
    })
    setParamPicker(null)
  }

  const removePosition = (deviceId: number) => {
    setPositions(prev => prev.filter(p => p.device_id !== deviceId))
  }

  const save = async () => {
    setSaving(true)
    try {
      const updated = await savePositions(floorMap.id, positions.map(p => ({ device_id: p.device_id, x_percent: p.x_percent, y_percent: p.y_percent, selected_params: p.selected_params })))
      onSaved(updated)
      setEditMode(false)
      toast.success('Pozycje zapisane')
    } catch {
      toast.error('Błąd zapisu')
    } finally {
      setSaving(false)
    }
  }

  const placedIds = new Set(positions.map(p => p.device_id))
  const availableDevices = devices.filter(d => !placedIds.has(d.id))

  return (
    <div className="bg-surface border border-border rounded-xl shadow-panel overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <span className="text-sm font-medium text-ink">{floorMap.name}</span>
        <div className="flex items-center gap-2">
          {editMode ? (
            <>
              <span className="text-xs text-accent">Kliknij mapę aby dodać urządzenie</span>
              <button onClick={save} disabled={saving}
                className="flex items-center gap-1.5 bg-good hover:bg-good/90 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
                <Save size={12} /> {saving ? 'Zapis…' : 'Zapisz'}
              </button>
              <button onClick={() => { setEditMode(false); setPendingClick(null) }}
                className="text-ink-muted hover:text-ink text-xs px-3 py-1.5 border border-border rounded-lg transition-colors">
                Anuluj
              </button>
            </>
          ) : canEdit ? (
            <>
              <button onClick={() => setEditMode(true)}
                className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink border border-border px-3 py-1.5 rounded-lg transition-colors">
                <MapPin size={12} /> Edytuj pozycje
              </button>
              <button onClick={onDelete} className="text-ink-muted hover:text-crit transition-colors p-1.5">
                <Trash2 size={14} />
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div ref={containerRef} className="relative w-full select-none" style={{ cursor: editMode ? 'crosshair' : 'default' }} onClick={handleMapClick}>
        {imgError ? (
          <div className="p-8 text-center text-sm text-crit">Nie udało się wczytać pliku mapy z serwera.</div>
        ) : !imgSrc ? (
          <div className="p-12 flex justify-center"><Spinner className="text-accent w-8 h-8" /></div>
        ) : (
          <img ref={imgRef} src={imgSrc} alt={floorMap.name}
            className="w-full h-auto block" draggable={false} onError={() => setImgError(true)} />
        )}

        {positions.map(pos => {
          const device = devices.find(d => d.id === pos.device_id)
          const readings = liveReadings[pos.device_id] ?? {}
          const shown = pos.selected_params.length > 0
            ? pos.selected_params.map(name => [name, readings[name]] as const).filter(([, v]) => v)
            : Object.entries(readings).slice(0, 1)

          return (
            <div key={pos.device_id}
              className="absolute -translate-x-1/2 -translate-y-full pointer-events-auto"
              style={{ left: `${pos.x_percent}%`, top: `${pos.y_percent}%` }}>
              <div className="bg-surface border border-border rounded-lg px-2 py-1 text-xs shadow-lg min-w-max">
                <div className="flex items-center gap-1.5">
                  <MapPin size={10} className={device?.status === 'online' ? 'text-good' : 'text-ink-muted'} />
                  {editMode ? (
                    <button onClick={(e) => { e.stopPropagation(); editParams(pos) }}
                      className="text-ink font-medium hover:text-accent transition-colors" title="Wybierz parametry do wyświetlenia">
                      {pos.deviceName}
                    </button>
                  ) : (
                    <span className="text-ink font-medium">{pos.deviceName}</span>
                  )}
                  {editMode && (
                    <button onClick={(e) => { e.stopPropagation(); removePosition(pos.device_id) }}
                      className="text-ink-muted hover:text-crit ml-1">
                      <X size={10} />
                    </button>
                  )}
                </div>
                {shown.map(([name, reading]) => (
                  <div key={name} className="text-accent font-bold mt-0.5">
                    {reading.value.toFixed(1)} {reading.unit} <span className="text-ink-muted font-normal">{name}</span>
                  </div>
                ))}
              </div>
              <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-border-strong mx-auto" />
            </div>
          )
        })}
      </div>

      {pendingClick && editMode && (
        <div className="px-5 py-3 border-t border-border">
          <p className="text-xs text-ink-muted mb-2">Wybierz urządzenie do umieszczenia ({availableDevices.length} dostępnych):</p>
          <div className="flex flex-wrap gap-2">
            {availableDevices.map(d => (
              <button key={d.id} onClick={() => pickDevice(d)}
                className="flex items-center gap-1.5 text-xs bg-surface-2 hover:border-border-strong border border-border text-ink px-3 py-1.5 rounded-lg transition-colors">
                <DeviceStatusBadge status={d.status} />
                {d.name}
              </button>
            ))}
            {availableDevices.length === 0 && <p className="text-xs text-ink-muted">Wszystkie urządzenia są już na mapie.</p>}
            <button onClick={() => setPendingClick(null)} className="text-xs text-ink-muted hover:text-ink px-2">Anuluj</button>
          </div>
        </div>
      )}

      {paramPicker && (
        <ParamPickerPanel
          device={paramPicker.device}
          availableParams={Object.keys(liveReadings[paramPicker.device.id] ?? {})}
          initialSelected={paramPicker.initialSelected}
          onConfirm={confirmParams}
          onCancel={() => setParamPicker(null)}
        />
      )}
    </div>
  )
}

function ParamPickerPanel({ device, availableParams, initialSelected, onConfirm, onCancel }: {
  device: Device; availableParams: string[]; initialSelected: string[]
  onConfirm: (selected: string[]) => void; onCancel: () => void
}) {
  const [selected, setSelected] = useState<string[]>(initialSelected.filter(p => availableParams.includes(p)))

  const toggle = (name: string) => {
    setSelected(prev => {
      if (prev.includes(name)) return prev.filter(p => p !== name)
      if (prev.length >= MAX_MAP_PIN_PARAMS) {
        toast.error(`Można wybrać maksymalnie ${MAX_MAP_PIN_PARAMS} parametry`)
        return prev
      }
      return [...prev, name]
    })
  }

  return (
    <div className="px-5 py-3 border-t border-border">
      <p className="text-xs text-ink-muted mb-2">
        Parametry do wyświetlenia dla „{device.name}” ({selected.length}/{MAX_MAP_PIN_PARAMS}):
      </p>
      {availableParams.length === 0 ? (
        <p className="text-xs text-ink-muted">Brak dostępnych odczytów dla tego urządzenia.</p>
      ) : (
        <div className="flex flex-wrap gap-2 mb-3">
          {availableParams.map(name => {
            const active = selected.includes(name)
            return (
              <button key={name} onClick={() => toggle(name)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${active ? 'bg-accent border-accent text-white' : 'bg-surface-2 border-border text-ink hover:border-border-strong'}`}>
                {name}
              </button>
            )
          })}
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={() => onConfirm(selected)}
          className="text-xs bg-accent hover:bg-accent-strong text-white px-4 py-1.5 rounded-lg transition-colors">
          Zapisz wybór
        </button>
        <button onClick={onCancel} className="text-xs text-ink-muted hover:text-ink px-3 py-1.5">Anuluj</button>
      </div>
    </div>
  )
}

function UploadModal({ open, onClose, onUploaded }: {
  open: boolean; onClose: () => void; onUploaded: (m: FloorMap) => void
}) {
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [drag, setDrag] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    setLoading(true)
    try {
      const m = await uploadMap(name || file.name.replace(/\.[^.]+$/, ''), file)
      onUploaded(m)
      toast.success('Mapa wgrana')
      setName(''); setFile(null)
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Błąd wgrywania')
    } finally {
      setLoading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false)
    const f = e.dataTransfer.files[0]
    if (f) { setFile(f); if (!name) setName(f.name.replace(/\.[^.]+$/, '')) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Wgraj mapę">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">Nazwa mapy</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="np. Piętro 1" className="input" />
        </div>
        <div
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${drag ? 'border-accent bg-accent-soft' : 'border-border hover:border-border-strong'}`}>
          {file ? (
            <div>
              <p className="text-sm text-ink">{file.name}</p>
              <p className="text-xs text-ink-muted mt-1">{(file.size / 1024).toFixed(0)} KB</p>
              <button type="button" onClick={() => setFile(null)} className="text-xs text-crit hover:text-crit/80 mt-2">Usuń</button>
            </div>
          ) : (
            <div>
              <Upload size={28} className="text-ink-muted mx-auto mb-2" />
              <p className="text-sm text-ink-muted">Przeciągnij plik lub</p>
              <label className="text-sm text-accent cursor-pointer hover:text-accent-strong">
                {' '}kliknij aby wybrać
                <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); if (!name) setName(f.name.replace(/\.[^.]+$/, '')) } }} />
              </label>
              <p className="text-xs text-ink-muted mt-1">PNG, JPG, SVG, WEBP · max 20 MB</p>
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <button type="submit" disabled={!file || loading}
            className="flex-1 bg-accent hover:bg-accent-strong disabled:opacity-40 text-white text-sm py-2 rounded-lg transition-colors">
            {loading ? 'Wgrywanie…' : 'Wgraj'}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-ink-muted border border-border rounded-lg">
            Anuluj
          </button>
        </div>
      </form>
    </Modal>
  )
}
