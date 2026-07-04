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
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex p-3 bg-accent-soft rounded-xl mb-3">
            <ShieldCheck size={24} className="text-accent" />
          </div>
          <h1 className="text-xl font-bold text-ink">Zmień hasło</h1>
          <p className="text-ink-muted text-sm mt-1">Wymagana zmiana hasła przy pierwszym logowaniu</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-xl shadow-panel p-6 space-y-4">
          {(['Bieżące hasło', 'Nowe hasło', 'Potwierdź nowe hasło'] as const).map((label, i) => {
            const values = [current, next, confirm]
            const setters = [setCurrent, setNext, setConfirm]
            return (
              <div key={label}>
                <label className="block text-xs text-ink-muted mb-1.5">{label}</label>
                <input
                  type="password"
                  value={values[i]}
                  onChange={(e) => setters[i](e.target.value)}
                  required
                  className="input"
                  placeholder="••••••••"
                />
              </div>
            )
          })}
          {error && <p className="text-sm text-crit">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-strong disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Spinner />}
            Zmień hasło
          </button>
        </form>
      </div>
    </div>
  )
}
