import { useDeviceStore } from '../../store/devices'
import { useNavigate } from 'react-router-dom'
import { X, Cpu } from 'lucide-react'

export function NewDeviceModal() {
  const { newDeviceCandidate, setNewDeviceCandidate } = useDeviceStore()
  const navigate = useNavigate()

  if (!newDeviceCandidate) return null

  const device = newDeviceCandidate

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/20 rounded-lg">
              <Cpu size={20} className="text-blue-400" />
            </div>
            <h2 className="font-semibold text-white">Wykryto nowe urządzenie</h2>
          </div>
          <button onClick={() => setNewDeviceCandidate(null)} className="text-gray-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="bg-gray-800 rounded-lg p-4 mb-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Nazwa</span>
            <span className="text-white font-medium">{device.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Adres Modbus</span>
            <span className="text-white">{device.modbus_address}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Status</span>
            <span className="text-green-400">online</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => {
              setNewDeviceCandidate(null)
              navigate(`/devices/${device.id}`)
            }}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 px-4 rounded-lg transition-colors font-medium"
          >
            Konfiguruj urządzenie
          </button>
          <button
            onClick={() => setNewDeviceCandidate(null)}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg transition-colors"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  )
}
