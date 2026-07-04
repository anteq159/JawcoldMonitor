import { useEffect, useRef, useState } from 'react'
import { Upload, Trash2, MapPin, X, Save, Plus } from 'lucide-react'
import { getMaps, uploadMap, savePositions, deleteMap, type FloorMap, type MapPosition } from '../api/maps'
import { getDevices } from '../api/devices'
import { useDeviceStore } from '../store/devices'
import { DeviceStatusBadge } from '../components/Devices/DeviceStatusBadge'
import { Modal } from '../components/UI/Modal'
import { PageSpinner } from '../components/UI/Spinner'
import toast from 'react-hot-toast'
import type { Device } from '../types/device'

export default function Map() {
  const [maps, setMaps] = useState<FloorMap[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [activeMap, setActiveMap] = useState<FloorMap | null>(null)
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)

  const load = async () => {
    const [m, d] = await Promise.all([getMaps(), getDevices()])
    setMaps(m); setDevices(d)
    if (m.length > 0 && !activeMap) setActiveMap(m[0])
  }

  useEffect(() => { load().finally(() => setLoading(false)) }, [])

  const handleDelete = async (id: number) => {
    if (!confirm('Usunąć mapę?')) return
    await deleteMap(id)
    const newMaps = maps.filter(m => m.id !== id)
    setMaps(newMaps)
    if (activeMap?.id === id) setActiveMap(newMaps[0] ?? null)
    toast.success('Mapa usunięta')
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {maps.map(m => (
            <button key={m.id} onClick={() => setActiveMap(m)}
              className={`px-4 py-1.5 text-sm rounded-lg border transition-colors ${activeMap?.id === m.id ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-700 text-gray-400 hover:text-white'}`}>
              {m.name}
            </button>
          ))}
        </div>
        <button onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg shrink-0">
          <Plus size={14} /> Wgraj mapę
        </button>
      </div>

      {!activeMap ? (
        <div className="bg-gray-900 border border-gray-800 border-dashed rounded-xl p-16 text-center">
          <Upload size={40} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 text-sm mb-4">Brak map. Wgraj rzut kondygnacji lub schemat instalacji.</p>
          <button onClick={() => setShowUpload(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-6 py-2 rounded-lg">
            Wgraj pierwszą mapę
          </button>
        </div>
      ) : (
        <MapEditor
          key={activeMap.id}
          floorMap={activeMap}
          devices={devices}
          onDelete={() => handleDelete(activeMap.id)}
          onSaved={updated => { setActiveMap(updated); load() }}
        />
      )}

      <UploadModal open={showUpload} onClose={() => setShowUpload(false)} onUploaded={m => { setMaps(prev => [...prev, m]); setActiveMap(m); setShowUpload(false) }} />
    </div>
  )
}

interface PendingPosition extends MapPosition { deviceName: string }

function MapEditor({ floorMap, devices, onDelete, onSaved }: {
  floorMap: FloorMap; devices: Device[]; onDelete: () => void; onSaved: (m: FloorMap) => void
}) {
  const imgRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const liveReadings = useDeviceStore(s => s.liveReadings)

  const [positions, setPositions] = useState<PendingPosition[]>(() =>
    floorMap.positions.map(p => ({
      device_id: p.device_id, x_percent: p.x_percent, y_percent: p.y_percent,
      deviceName: devices.find(d => d.id === p.device_id)?.name ?? `#${p.device_id}`
    }))
  )
  const [editMode, setEditMode] = useState(false)
  const [pendingClick, setPendingClick] = useState<{ x: number; y: number } | null>(null)
  const [saving, setSaving] = useState(false)

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!editMode) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setPendingClick({ x, y })
  }

  const addDevice = (device: Device) => {
    if (!pendingClick) return
    setPositions(prev => {
      const filtered = prev.filter(p => p.device_id !== device.id)
      return [...filtered, { device_id: device.id, x_percent: pendingClick.x, y_percent: pendingClick.y, deviceName: device.name }]
    })
    setPendingClick(null)
  }

  const removePosition = (deviceId: number) => {
    setPositions(prev => prev.filter(p => p.device_id !== deviceId))
  }

  const save = async () => {
    setSaving(true)
    try {
      const updated = await savePositions(floorMap.id, positions.map(p => ({ device_id: p.device_id, x_percent: p.x_percent, y_percent: p.y_percent })))
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
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
        <span className="text-sm font-medium text-white">{floorMap.name}</span>
        <div className="flex items-center gap-2">
          {editMode ? (
            <>
              <span className="text-xs text-blue-400">Kliknij mapę aby dodać urządzenie</span>
              <button onClick={save} disabled={saving}
                className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded-lg">
                <Save size={12} /> {saving ? 'Zapis…' : 'Zapisz'}
              </button>
              <button onClick={() => { setEditMode(false); setPendingClick(null) }}
                className="text-gray-400 hover:text-white text-xs px-3 py-1.5 border border-gray-700 rounded-lg">
                Anuluj
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditMode(true)}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 px-3 py-1.5 rounded-lg">
                <MapPin size={12} /> Edytuj pozycje
              </button>
              <button onClick={onDelete} className="text-gray-400 hover:text-red-400 transition-colors p-1.5">
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      <div ref={containerRef} className="relative w-full select-none" style={{ cursor: editMode ? 'crosshair' : 'default' }} onClick={handleMapClick}>
        <img ref={imgRef} src={`/api/v1/maps/file/${floorMap.filename}`} alt={floorMap.name}
          className="w-full h-auto block" draggable={false} />

        {positions.map(pos => {
          const device = devices.find(d => d.id === pos.device_id)
          const readings = liveReadings[pos.device_id] ?? {}
          const firstReading = Object.entries(readings)[0]

          return (
            <div key={pos.device_id}
              className="absolute -translate-x-1/2 -translate-y-full pointer-events-auto"
              style={{ left: `${pos.x_percent}%`, top: `${pos.y_percent}%` }}>
              <div className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-xs shadow-lg min-w-max">
                <div className="flex items-center gap-1.5">
                  <MapPin size={10} className={device?.status === 'online' ? 'text-green-400' : 'text-gray-500'} />
                  <span className="text-white font-medium">{pos.deviceName}</span>
                  {editMode && (
                    <button onClick={(e) => { e.stopPropagation(); removePosition(pos.device_id) }}
                      className="text-gray-500 hover:text-red-400 ml-1">
                      <X size={10} />
                    </button>
                  )}
                </div>
                {firstReading && (
                  <div className="text-blue-400 font-bold mt-0.5">
                    {firstReading[1].value.toFixed(1)} {firstReading[1].unit}
                  </div>
                )}
              </div>
              <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-700 mx-auto" />
            </div>
          )
        })}
      </div>

      {pendingClick && editMode && (
        <div className="px-5 py-3 border-t border-gray-800">
          <p className="text-xs text-gray-400 mb-2">Wybierz urządzenie do umieszczenia ({availableDevices.length} dostępnych):</p>
          <div className="flex flex-wrap gap-2">
            {availableDevices.map(d => (
              <button key={d.id} onClick={() => addDevice(d)}
                className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white px-3 py-1.5 rounded-lg transition-colors">
                <DeviceStatusBadge status={d.status} />
                {d.name}
              </button>
            ))}
            {availableDevices.length === 0 && <p className="text-xs text-gray-500">Wszystkie urządzenia są już na mapie.</p>}
            <button onClick={() => setPendingClick(null)} className="text-xs text-gray-500 hover:text-white px-2">Anuluj</button>
          </div>
        </div>
      )}
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
          <label className="block text-xs text-gray-400 mb-1.5">Nazwa mapy</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="np. Piętro 1" className="input" />
        </div>
        <div
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${drag ? 'border-blue-500 bg-blue-950' : 'border-gray-700 hover:border-gray-600'}`}>
          {file ? (
            <div>
              <p className="text-sm text-white">{file.name}</p>
              <p className="text-xs text-gray-500 mt-1">{(file.size / 1024).toFixed(0)} KB</p>
              <button type="button" onClick={() => setFile(null)} className="text-xs text-red-400 hover:text-red-300 mt-2">Usuń</button>
            </div>
          ) : (
            <div>
              <Upload size={28} className="text-gray-500 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Przeciągnij plik lub</p>
              <label className="text-sm text-blue-400 cursor-pointer hover:text-blue-300">
                {' '}kliknij aby wybrać
                <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); if (!name) setName(f.name.replace(/\.[^.]+$/, '')) } }} />
              </label>
              <p className="text-xs text-gray-600 mt-1">PNG, JPG, SVG, WEBP · max 20 MB</p>
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <button type="submit" disabled={!file || loading}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm py-2 rounded-lg transition-colors">
            {loading ? 'Wgrywanie…' : 'Wgraj'}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 border border-gray-700 rounded-lg">
            Anuluj
          </button>
        </div>
      </form>
    </Modal>
  )
}
