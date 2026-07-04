import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Spinner } from '../components/UI/Spinner'
import { ShieldCheck } from 'lucide-react'

export default function ChangePassword() {
  const { changePassword } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (next !== confirm) {
      setError('Hasła nie pasują do siebie')
      return
    }
    if (next.length < 6) {
      setError('Hasło musi mieć co najmniej 6 znaków')
      return
    }
    setLoading(true)
    try {
      await changePassword(current, next)
    } catch (err: any) {
      setError(err.response?.data?.detail ?? 'Błąd zmiany hasła')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex p-3 bg-blue-600/20 rounded-xl mb-3">
            <ShieldCheck size={24} className="text-blue-400" />
          </div>
          <h1 className="text-xl font-bold text-white">Zmień hasło</h1>
          <p className="text-gray-500 text-sm mt-1">Wymagana zmiana hasła przy pierwszym logowaniu</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          {(['Bieżące hasło', 'Nowe hasło', 'Potwierdź nowe hasło'] as const).map((label, i) => {
            const values = [current, next, confirm]
            const setters = [setCurrent, setNext, setConfirm]
            return (
              <div key={label}>
                <label className="block text-xs text-gray-400 mb-1.5">{label}</label>
                <input
                  type="password"
                  value={values[i]}
                  onChange={(e) => setters[i](e.target.value)}
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  placeholder="••••••••"
                />
              </div>
            )
          })}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Spinner />}
            Zmień hasło
          </button>
        </form>
      </div>
    </div>
  )
}
