import { useDeviceStore } from '../../store/devices'
import { useNavigate } from 'react-router-dom'
import { X, Cpu } from 'lucide-react'

export function NewDeviceModal() {
  const { newDeviceCandidate, setNewDeviceCandidate } = useDeviceStore()
  const navigate = useNavigate()

  if (!newDeviceCandidate) return null

  const device = newDeviceCandidate

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 animate-overlay-in">
      <div role="dialog" aria-modal="true" className="bg-surface border border-border rounded-xl p-6 w-full max-w-md shadow-xl animate-modal-in">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent-soft rounded-lg">
              <Cpu size={20} className="text-accent" />
            </div>
            <h2 className="font-semibold text-ink">Wykryto nowe urządzenie</h2>
          </div>
          <button onClick={() => setNewDeviceCandidate(null)} className="text-ink-muted hover:text-ink" aria-label="Zamknij">
            <X size={18} />
          </button>
        </div>

        <div className="bg-surface-2 rounded-lg p-4 mb-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-ink-muted">Nazwa</span>
            <span className="text-ink font-medium">{device.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-muted">Adres Modbus</span>
            <span className="text-ink">{device.modbus_address}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-muted">Status</span>
            <span className="text-good">online</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => {
              setNewDeviceCandidate(null)
              navigate(`/devices/${device.id}`)
            }}
            className="flex-1 bg-accent hover:bg-accent-strong text-white text-sm py-2 px-4 rounded-lg transition-colors font-medium"
          >
            Konfiguruj urządzenie
          </button>
          <button
            onClick={() => setNewDeviceCandidate(null)}
            className="px-4 py-2 text-sm text-ink-muted hover:text-ink border border-border rounded-lg transition-colors"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  )
}
