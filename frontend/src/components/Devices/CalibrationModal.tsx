import { useState } from 'react'
import { Modal } from '../UI/Modal'
import { updateSensor } from '../../api/sensors'
import toast from 'react-hot-toast'
import type { Sensor } from '../../types/sensor'

interface Props {
  sensor: Sensor
  currentTemp: number | null
  onClose: () => void
  onSaved: (offset: number) => void
}

export function CalibrationModal({ sensor, currentTemp, onClose, onSaved }: Props) {
  const [offset, setOffset] = useState(sensor.calibration_offset)
  const [saving, setSaving] = useState(false)

  // currentTemp already includes the sensor's existing calibration_offset
  // (applied server-side at read time) - back it out to show the raw
  // reading, then preview what the new offset would produce.
  const rawValue = currentTemp != null ? currentTemp - sensor.calibration_offset : null
  const previewValue = rawValue != null ? rawValue + offset : null

  const save = async () => {
    setSaving(true)
    try {
      await updateSensor(sensor.id, { calibration_offset: offset })
      onSaved(offset)
      toast.success('Kalibracja zapisana')
      onClose()
    } catch {
      toast.error('Błąd zapisu kalibracji')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Kalibracja — ${sensor.name}`}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="bg-surface-2 border border-border rounded-lg p-3">
            <p className="text-xs text-ink-muted mb-1">Odczyt surowy</p>
            <p className="text-lg font-bold text-ink">{rawValue != null ? rawValue.toFixed(2) : '—'} °C</p>
          </div>
          <div className="bg-surface-2 border border-border rounded-lg p-3">
            <p className="text-xs text-ink-muted mb-1">Po kalibracji</p>
            <p className="text-lg font-bold text-accent">{previewValue != null ? previewValue.toFixed(2) : '—'} °C</p>
          </div>
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1.5">Przesunięcie kalibracji (°C)</label>
          <input
            type="number"
            step="0.1"
            value={offset}
            onChange={(e) => setOffset(Number(e.target.value))}
            className="input"
          />
          <p className="text-xs text-ink-muted mt-1.5">Dodawane do każdego surowego odczytu czujnika przed zapisem.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 bg-accent hover:bg-accent-strong disabled:opacity-50 text-white text-sm py-2 rounded-lg transition-colors"
          >
            {saving ? 'Zapisywanie…' : 'Zapisz kalibrację'}
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm text-ink-muted border border-border rounded-lg">
            Anuluj
          </button>
        </div>
      </div>
    </Modal>
  )
}
