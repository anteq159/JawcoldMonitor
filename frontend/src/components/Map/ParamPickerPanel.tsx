import { useState } from 'react'
import toast from 'react-hot-toast'
import { MAX_MAP_PIN_PARAMS } from '../../api/maps'
import type { Device } from '../../types/device'

// Moved out of pages/Map.tsx - shared by MapEditor (image maps),
// SchematicEditor (drawn circuit schematics) and the device tiles in the
// Sterowniki list. `max` and `labels` were added for that third caller;
// the map editors pass MAX_MAP_PIN_PARAMS and no labels, as before.
export function ParamPickerPanel({
  device, availableParams, initialSelected, onConfirm, onCancel,
  max = MAX_MAP_PIN_PARAMS, labels, title,
}: {
  device: Device; availableParams: string[]; initialSelected: string[]
  onConfirm: (selected: string[]) => void; onCancel: () => void
  max?: number; labels?: Record<string, string>; title?: string
}) {
  const [selected, setSelected] = useState<string[]>(initialSelected.filter(p => availableParams.includes(p)))

  const toggle = (name: string) => {
    setSelected(prev => {
      if (prev.includes(name)) return prev.filter(p => p !== name)
      if (prev.length >= max) {
        toast.error(`Można wybrać maksymalnie ${max} ${max === 3 ? 'wartości' : 'parametry'}`)
        return prev
      }
      return [...prev, name]
    })
  }

  return (
    <div className="px-5 py-3 border-t border-border">
      <p className="text-xs text-ink-muted mb-2">
        {title ?? `Parametry do wyświetlenia dla „${device.name}”`} ({selected.length}/{max}):
      </p>
      {availableParams.length === 0 ? (
        <p className="text-xs text-ink-muted">Brak dostępnych odczytów dla tego urządzenia.</p>
      ) : (
        <div className="flex flex-wrap gap-2 mb-3">
          {availableParams.map(name => {
            const active = selected.includes(name)
            return (
              <button key={name} onClick={() => toggle(name)}
                title={labels?.[name] ? name : undefined}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${active ? 'bg-accent border-accent text-white' : 'bg-surface-2 border-border text-ink hover:border-border-strong'}`}>
                {labels?.[name] ?? name}
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
