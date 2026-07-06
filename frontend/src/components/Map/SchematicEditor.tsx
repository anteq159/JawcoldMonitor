import { useEffect, useRef, useState } from 'react'
import { Save, Trash2, Pencil, Type, MapPin, MousePointer2, Spline } from 'lucide-react'
import toast from 'react-hot-toast'
import { saveDrawing, savePositions, type FloorMap, type DrawingElement, type DrawingLine, type DrawingPoint } from '../../api/maps'
import { useAuthStore } from '../../store/auth'
import { useDeviceStore } from '../../store/devices'
import { DeviceStatusBadge } from '../Devices/DeviceStatusBadge'
import { ParamPickerPanel } from './ParamPickerPanel'
import { DevicePinsLayer, type PendingPosition } from './DevicePinsLayer'
import type { Device } from '../../types/device'

// Pipe colors follow refrigeration convention (and the backend whitelist
// in api/v1/maps.py - keep the two lists in sync).
const COLORS = [
  { hex: '#C23B3B', label: 'Tłoczenie' },
  { hex: '#2B6CB0', label: 'Ssanie' },
  { hex: '#C97C1B', label: 'Ciecz' },
  { hex: '#7D8E8A', label: 'Inne' },
]
const WIDTHS = [2, 3, 4]

// Fixed logical canvas: everything (lines, labels, pins) is laid out in
// this coordinate space and the WHOLE stage is scaled by one factor to
// fit the actual container. One scale factor for all content means the
// schematic is pixel-identical on every device/resolution - nothing
// shifts relative to anything else, it only zooms.
const BASE_W = 1000
const BASE_H = 625  // 16:10

type Mode = 'line' | 'label' | 'pin' | 'select'

interface ParamPickerState { device: Device; x: number; y: number; initialSelected: string[] }

// Simple SCADA-style circuit schematic editor: orthogonal colored pipes
// with optional arrowheads, text labels, and the same live device
// parameter tiles as image maps. Coordinates are stored in percent; the
// SVG renders in pixels (container measured via ResizeObserver) so stroke
// widths and arrowheads stay undistorted at any size.
export function SchematicEditor({ floorMap, devices, onDelete, onSaved }: {
  floorMap: FloorMap; devices: Device[]; onDelete: () => void; onSaved: (m: FloorMap) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canEdit = useAuthStore((s) => s.can('config:write'))
  const liveReadings = useDeviceStore(s => s.liveReadings)

  const [scale, setScale] = useState(0)
  const [elements, setElements] = useState<DrawingElement[]>(floorMap.drawing ?? [])
  const [positions, setPositions] = useState<PendingPosition[]>(() =>
    floorMap.positions.map(p => ({
      device_id: p.device_id, x_percent: p.x_percent, y_percent: p.y_percent, selected_params: p.selected_params ?? [],
      deviceName: devices.find(d => d.id === p.device_id)?.name ?? `#${p.device_id}`,
    }))
  )

  const [editMode, setEditMode] = useState(false)
  const [mode, setMode] = useState<Mode>('line')
  const [color, setColor] = useState(COLORS[0].hex)
  const [lineWidth, setLineWidth] = useState(3)
  const [arrowEnd, setArrowEnd] = useState(true)
  const [draft, setDraft] = useState<DrawingPoint[]>([])
  const [cursor, setCursor] = useState<DrawingPoint | null>(null)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [labelDraft, setLabelDraft] = useState<{ x: number; y: number; text: string } | null>(null)
  const [pendingClick, setPendingClick] = useState<{ x: number; y: number } | null>(null)
  const [paramPicker, setParamPicker] = useState<ParamPickerState | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      setScale(entries[0].contentRect.width / BASE_W)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Percent -> logical stage pixels (fixed base, independent of screen).
  const toPx = (p: DrawingPoint) => ({ x: (p.x / 100) * BASE_W, y: (p.y / 100) * BASE_H })

  const eventToPercent = (e: React.MouseEvent): DrawingPoint => {
    const rect = containerRef.current!.getBoundingClientRect()
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100)),
    }
  }

  // Snap each new segment to the nearest of 8 directions (every 45°):
  // horizontal/vertical pipe runs plus 45° diagonals, computed in logical
  // stage pixels so angles are true regardless of screen size.
  const snap = (prev: DrawingPoint, pt: DrawingPoint): DrawingPoint => {
    const a = toPx(prev)
    const b = toPx(pt)
    const dx = b.x - a.x
    const dy = b.y - a.y
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
    const len = dx * Math.cos(angle) + dy * Math.sin(angle)  // projection onto the snapped direction
    const sx = a.x + len * Math.cos(angle)
    const sy = a.y + len * Math.sin(angle)
    return {
      x: Math.min(100, Math.max(0, (sx / BASE_W) * 100)),
      y: Math.min(100, Math.max(0, (sy / BASE_H) * 100)),
    }
  }

  const finishLine = () => {
    if (draft.length >= 2) {
      setElements(prev => [...prev, { type: 'line', points: draft, color, width: lineWidth, arrow_end: arrowEnd }])
    }
    setDraft([])
  }

  const commitLabel = () => {
    if (labelDraft && labelDraft.text.trim()) {
      setElements(prev => [...prev, { type: 'label', x: labelDraft.x, y: labelDraft.y, text: labelDraft.text.trim().slice(0, 64), size: 'sm' }])
    }
    setLabelDraft(null)
  }

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!editMode) return
    const pt = eventToPercent(e)
    if (mode === 'line') {
      setDraft(prev => prev.length === 0 ? [pt] : [...prev, snap(prev[prev.length - 1], pt)])
    } else if (mode === 'label') {
      if (labelDraft) commitLabel()
      else setLabelDraft({ x: pt.x, y: pt.y, text: '' })
    } else if (mode === 'pin') {
      setPendingClick(pt)
    } else {
      setSelectedIdx(null)
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!editMode || mode !== 'line' || draft.length === 0) return
    setCursor(snap(draft[draft.length - 1], eventToPercent(e)))
  }

  // Keyboard shortcuts while editing: Enter ends the line, Backspace
  // removes its last point, Escape abandons it, Delete removes selection.
  useEffect(() => {
    if (!editMode) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'Enter') finishLine()
      if (e.key === 'Escape') { setDraft([]); setSelectedIdx(null) }
      if (e.key === 'Backspace') setDraft(prev => prev.slice(0, -1))
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdx !== null && draft.length === 0) {
        setElements(prev => prev.filter((_, i) => i !== selectedIdx))
        setSelectedIdx(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editMode, draft, selectedIdx, color, lineWidth, arrowEnd])

  const pickDevice = (device: Device) => {
    if (!pendingClick) return
    setParamPicker({ device, x: pendingClick.x, y: pendingClick.y, initialSelected: [] })
    setPendingClick(null)
  }

  const confirmParams = (selected: string[]) => {
    if (!paramPicker) return
    const { device, x, y } = paramPicker
    setPositions(prev => [
      ...prev.filter(p => p.device_id !== device.id),
      { device_id: device.id, x_percent: x, y_percent: y, selected_params: selected, deviceName: device.name },
    ])
    setParamPicker(null)
  }

  const save = async () => {
    setSaving(true)
    try {
      await saveDrawing(floorMap.id, elements)
      const updated = await savePositions(floorMap.id, positions.map(p => ({
        device_id: p.device_id, x_percent: p.x_percent, y_percent: p.y_percent, selected_params: p.selected_params,
      })))
      onSaved(updated)
      setEditMode(false)
      setDraft([])
      setSelectedIdx(null)
      toast.success('Schemat zapisany')
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? 'Błąd zapisu schematu')
    } finally {
      setSaving(false)
    }
  }

  const cancel = () => {
    setEditMode(false)
    setDraft([])
    setSelectedIdx(null)
    setLabelDraft(null)
    setPendingClick(null)
    setElements(floorMap.drawing ?? [])
  }

  // Arrowhead polygon at the end of the last segment, sized to the stroke.
  const arrowHead = (line: DrawingLine) => {
    const pts = line.points
    if (pts.length < 2) return null
    const a = toPx(pts[pts.length - 2])
    const b = toPx(pts[pts.length - 1])
    const angle = Math.atan2(b.y - a.y, b.x - a.x)
    const len = 6 + line.width * 2
    const spread = Math.PI / 7
    const p1 = { x: b.x - len * Math.cos(angle - spread), y: b.y - len * Math.sin(angle - spread) }
    const p2 = { x: b.x - len * Math.cos(angle + spread), y: b.y - len * Math.sin(angle + spread) }
    return `${b.x},${b.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`
  }

  const placedIds = new Set(positions.map(p => p.device_id))
  const availableDevices = devices.filter(d => !placedIds.has(d.id))

  const MODES: { value: Mode; icon: React.ReactNode; label: string }[] = [
    { value: 'line', icon: <Spline size={12} />, label: 'Linia' },
    { value: 'label', icon: <Type size={12} />, label: 'Tekst' },
    { value: 'pin', icon: <MapPin size={12} />, label: 'Urządzenie' },
    { value: 'select', icon: <MousePointer2 size={12} />, label: 'Zaznacz' },
  ]

  return (
    <div className="bg-surface border border-border rounded-xl shadow-panel overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-wrap gap-2">
        <span className="text-sm font-medium text-ink">{floorMap.name}</span>
        <div className="flex items-center gap-2 flex-wrap">
          {editMode ? (
            <>
              <div className="flex gap-1 bg-surface-2 rounded-lg p-0.5">
                {MODES.map(m => (
                  <button key={m.value} onClick={() => { setMode(m.value); setDraft([]); setSelectedIdx(null) }}
                    title={m.label}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors ${mode === m.value ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink'}`}>
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>
              {mode === 'line' && (
                <>
                  <div className="flex gap-1">
                    {COLORS.map(c => (
                      <button key={c.hex} onClick={() => setColor(c.hex)} title={c.label}
                        className={`w-5 h-5 rounded-full border-2 transition-transform ${color === c.hex ? 'border-ink scale-110' : 'border-transparent'}`}
                        style={{ backgroundColor: c.hex }} />
                    ))}
                  </div>
                  <select value={lineWidth} onChange={e => setLineWidth(Number(e.target.value))}
                    className="text-xs bg-surface border border-border rounded px-1 py-0.5 text-ink">
                    {WIDTHS.map(w => <option key={w} value={w}>{w}px</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-xs text-ink-muted">
                    <input type="checkbox" checked={arrowEnd} onChange={e => setArrowEnd(e.target.checked)}
                      className="rounded border-border-strong bg-surface text-accent focus:ring-0" />
                    strzałka
                  </label>
                </>
              )}
              {selectedIdx !== null && (
                <button onClick={() => { setElements(prev => prev.filter((_, i) => i !== selectedIdx)); setSelectedIdx(null) }}
                  className="flex items-center gap-1 text-xs text-crit border border-crit/40 px-2 py-1 rounded-lg hover:bg-crit hover:text-white transition-colors">
                  <Trash2 size={11} /> Usuń element
                </button>
              )}
              <button onClick={save} disabled={saving}
                className="flex items-center gap-1.5 bg-good hover:bg-good/90 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
                <Save size={12} /> {saving ? 'Zapis…' : 'Zapisz'}
              </button>
              <button onClick={cancel}
                className="text-ink-muted hover:text-ink text-xs px-3 py-1.5 border border-border rounded-lg transition-colors">
                Anuluj
              </button>
            </>
          ) : canEdit ? (
            <>
              <button onClick={() => setEditMode(true)}
                className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink border border-border px-3 py-1.5 rounded-lg transition-colors">
                <Pencil size={12} /> Edytuj schemat
              </button>
              <button onClick={onDelete} className="text-ink-muted hover:text-crit transition-colors p-1.5">
                <Trash2 size={14} />
              </button>
            </>
          ) : null}
        </div>
      </div>

      {editMode && mode === 'line' && (
        <div className="px-5 py-1.5 border-b border-border bg-surface-2/50">
          <p className="text-[11px] text-ink-muted">
            Klikaj, aby dodawać punkty (linie łamią się co 45°: poziomo, pionowo lub po skosie) · Enter lub podwójny klik kończy linię · Backspace cofa punkt · Esc anuluje
          </p>
        </div>
      )}

      <div
        ref={containerRef}
        className="relative w-full select-none bg-surface-2/60 overflow-hidden"
        style={{ aspectRatio: `${BASE_W} / ${BASE_H}`, cursor: editMode && mode !== 'select' ? 'crosshair' : 'default' }}
        onClick={handleCanvasClick}
        onDoubleClick={(e) => { e.preventDefault(); if (editMode && mode === 'line') finishLine() }}
        onMouseMove={handleMouseMove}
      >
        {/* Fixed logical stage scaled as one unit: identical layout on
            every device, content only zooms. pointer-events-none lets
            canvas clicks land on the container; interactive children
            (select targets, labels, pins) opt back in individually. */}
        {scale > 0 && (
        <div
          className="absolute top-0 left-0 pointer-events-none"
          style={{ width: BASE_W, height: BASE_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        >
          <svg className="absolute inset-0" width={BASE_W} height={BASE_H} style={{ pointerEvents: 'none' }}>
            {elements.map((el, i) => {
              if (el.type === 'line') {
                const pts = el.points.map(toPx).map(p => `${p.x},${p.y}`).join(' ')
                const selected = selectedIdx === i
                return (
                  <g key={i}>
                    {/* fat invisible stroke = easy click target in select mode */}
                    {editMode && mode === 'select' && (
                      <polyline points={pts} fill="none" stroke="transparent" strokeWidth={14}
                        style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                        onClick={(e) => { e.stopPropagation(); setSelectedIdx(i) }} />
                    )}
                    <polyline points={pts} fill="none" stroke={el.color} strokeWidth={el.width}
                      strokeLinejoin="round" strokeLinecap="square"
                      opacity={selected ? 0.6 : 1} pointerEvents="none" />
                    {selected && (
                      <polyline points={pts} fill="none" stroke={el.color} strokeWidth={el.width + 6}
                        opacity={0.25} pointerEvents="none" />
                    )}
                    {el.arrow_end && arrowHead(el) && (
                      <polygon points={arrowHead(el)!} fill={el.color} pointerEvents="none" />
                    )}
                  </g>
                )
              }
              return null
            })}
            {/* draft line being drawn */}
            {draft.length > 0 && (
              <polyline
                points={[...draft, ...(cursor ? [cursor] : [])].map(toPx).map(p => `${p.x},${p.y}`).join(' ')}
                fill="none" stroke={color} strokeWidth={lineWidth} strokeDasharray="6 4"
                strokeLinejoin="round" pointerEvents="none" />
            )}
          </svg>

          {/* text labels as HTML for easy styling/selection */}
          {elements.map((el, i) => el.type === 'label' ? (
            <div key={`label-${i}`}
              className={`absolute -translate-x-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded border text-ink bg-surface/90 pointer-events-auto ${el.size === 'md' ? 'text-sm' : 'text-xs'} ${selectedIdx === i ? 'border-accent ring-2 ring-accent/30' : 'border-border'} ${editMode && mode === 'select' ? 'cursor-pointer' : ''}`}
              style={{ left: `${el.x}%`, top: `${el.y}%` }}
              onClick={(e) => { if (editMode && mode === 'select') { e.stopPropagation(); setSelectedIdx(i) } }}>
              {el.text}
            </div>
          ) : null)}

          {/* inline label input */}
          {labelDraft && (
            <input
              autoFocus
              value={labelDraft.text}
              onChange={e => setLabelDraft({ ...labelDraft, text: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') setLabelDraft(null) }}
              onBlur={commitLabel}
              onClick={e => e.stopPropagation()}
              placeholder="Tekst…"
              className="absolute -translate-x-1/2 -translate-y-1/2 w-36 bg-surface border border-accent rounded px-1.5 py-0.5 text-xs text-ink focus:outline-none pointer-events-auto"
              style={{ left: `${labelDraft.x}%`, top: `${labelDraft.y}%` }}
            />
          )}

          <DevicePinsLayer
            positions={positions}
            devices={devices}
            editMode={editMode && mode === 'pin'}
            onEditParams={(pos) => {
              const device = devices.find(d => d.id === pos.device_id)
              if (device) setParamPicker({ device, x: pos.x_percent, y: pos.y_percent, initialSelected: pos.selected_params })
            }}
            onRemove={(deviceId) => setPositions(prev => prev.filter(p => p.device_id !== deviceId))}
          />
        </div>
        )}
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
            {availableDevices.length === 0 && <p className="text-xs text-ink-muted">Wszystkie urządzenia są już na schemacie.</p>}
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
