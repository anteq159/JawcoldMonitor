import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Upload, Trash2, MapPin, Save, Plus, Workflow, Image as ImageIcon } from 'lucide-react'
import { getMaps, uploadMap, savePositions, deleteMap, getMapFileBlobUrl, createSchematic, type FloorMap, type MapPosition } from '../api/maps'
import { getDevices } from '../api/devices'
import { useDeviceStore } from '../store/devices'
import { useAuthStore } from '../store/auth'
import { DeviceStatusBadge } from '../components/Devices/DeviceStatusBadge'
import { Modal } from '../components/UI/Modal'
import { ConfirmDialog } from '../components/UI/ConfirmDialog'
import { EmptyState } from '../components/UI/EmptyState'
import { PageSpinner, Spinner } from '../components/UI/Spinner'
import { ParamPickerPanel } from '../components/Map/ParamPickerPanel'
import { DevicePinsLayer, type PendingPosition } from '../components/Map/DevicePinsLayer'
import { SchematicEditor } from '../components/Map/SchematicEditor'
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
  const [showNewSchematic, setShowNewSchematic] = useState(false)
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
              className={`flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg border transition-colors ${activeMap?.id === m.id ? 'bg-accent border-accent text-white' : 'border-border text-ink-muted hover:text-ink'}`}>
              {m.kind === 'schematic' ? <Workflow size={13} /> : <ImageIcon size={13} />}
              {m.name}
            </button>
          ))}
        </div>
        {canConfigure && (
          <div className="flex gap-2 shrink-0">
            <button onClick={() => setShowNewSchematic(true)}
              className="flex items-center gap-2 border border-border text-ink-muted hover:text-ink text-sm px-4 py-2 rounded-lg transition-colors">
              <Workflow size={14} /> Nowy schemat
            </button>
            <button onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 bg-accent hover:bg-accent-strong text-white text-sm px-4 py-2 rounded-lg">
              <Plus size={14} /> Wgraj mapę
            </button>
          </div>
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
      ) : activeMap.kind === 'schematic' ? (
        <SchematicEditor
          key={activeMap.id}
          floorMap={activeMap}
          devices={devices}
          onDelete={() => setConfirmDeleteOpen(true)}
          onSaved={updated => { setActiveMap(updated); load() }}
        />
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
      <NewSchematicModal open={showNewSchematic} onClose={() => setShowNewSchematic(false)} onCreated={m => { setMaps(prev => [...prev, m]); setActiveMap(m); setShowNewSchematic(false) }} />

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

// PendingPosition moved to components/Map/DevicePinsLayer (shared with
// SchematicEditor); ParamPickerPanel moved to components/Map/ParamPickerPanel.

interface ParamPickerState { device: Device; x: number; y: number; initialSelected: string[] }

// Fixed logical stage width for image maps - the image renders at this
// width and the whole stage (image + pins) scales by ONE factor to fit
// the screen, so pin tiles keep identical size and placement relative to
// the map on every device/resolution.
const MAP_STAGE_W = 1000

function MapEditor({ floorMap, devices, onDelete, onSaved }: {
  floorMap: FloorMap; devices: Device[]; onDelete: () => void; onSaved: (m: FloorMap) => void
}) {
  const imgRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const liveReadings = useDeviceStore(s => s.liveReadings)
  const canEdit = useAuthStore((s) => s.can('config:write'))

  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const [imgError, setImgError] = useState(false)
  const [natSize, setNatSize] = useState<{ w: number; h: number } | null>(null)
  const [scale, setScale] = useState(0)

  // natSize in deps: the observed container only exists after the image's
  // intrinsic size is known, so attach the observer once it renders.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      setScale(entries[0].contentRect.width / MAP_STAGE_W)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [natSize])

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    setImgSrc(null)
    setImgError(false)
    if (!floorMap.filename) { setImgError(true); return }
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

      {imgError ? (
        <div className="p-8 text-center text-sm text-crit">Nie udało się wczytać pliku mapy z serwera.</div>
      ) : !imgSrc || !natSize ? (
        <div className="p-12 flex justify-center">
          <Spinner className="text-accent w-8 h-8" />
          {/* hidden probe: reads the image's intrinsic size before the
              scaled stage can be laid out */}
          {imgSrc && (
            <img src={imgSrc} alt="" className="hidden"
              onLoad={(e) => setNatSize({ w: e.currentTarget.naturalWidth || 1, h: e.currentTarget.naturalHeight || 1 })}
              onError={() => setImgError(true)} />
          )}
        </div>
      ) : (
        <div
          ref={containerRef}
          className="relative w-full select-none overflow-hidden"
          style={{ aspectRatio: `${natSize.w} / ${natSize.h}`, cursor: editMode ? 'crosshair' : 'default' }}
          onClick={handleMapClick}
        >
          {/* One uniformly scaled stage (image + pins): identical pin size
              and placement relative to the map on every resolution. */}
          {scale > 0 && (
            <div
              className="absolute top-0 left-0 pointer-events-none"
              style={{
                width: MAP_STAGE_W,
                height: MAP_STAGE_W * (natSize.h / natSize.w),
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
            >
              <img ref={imgRef} src={imgSrc} alt={floorMap.name}
                className="w-full h-full block" draggable={false} onError={() => setImgError(true)} />
              <DevicePinsLayer
                positions={positions}
                devices={devices}
                editMode={editMode}
                onEditParams={editParams}
                onRemove={removePosition}
              />
            </div>
          )}
        </div>
      )}

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

function NewSchematicModal({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: (m: FloorMap) => void
}) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      const m = await createSchematic(name.trim())
      onCreated(m)
      toast.success('Schemat utworzony — kliknij „Edytuj schemat", aby rysować')
      setName('')
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Błąd tworzenia schematu')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nowy schemat obiegu">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">Nazwa schematu</label>
          <input value={name} onChange={e => setName(e.target.value)} required autoFocus
            placeholder="np. Agregat CO2" className="input" />
        </div>
        <p className="text-xs text-ink-muted">
          Schemat rysuje się bezpośrednio w przeglądarce: kolorowe rury (tłoczenie/ssanie/ciecz)
          ze strzałkami, etykiety tekstowe i kafelki urządzeń z żywymi odczytami.
        </p>
        <div className="flex gap-3">
          <button type="submit" disabled={loading || !name.trim()}
            className="flex-1 bg-accent hover:bg-accent-strong disabled:opacity-40 text-white text-sm py-2 rounded-lg transition-colors">
            {loading ? 'Tworzenie…' : 'Utwórz schemat'}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-ink-muted border border-border rounded-lg">
            Anuluj
          </button>
        </div>
      </form>
    </Modal>
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
