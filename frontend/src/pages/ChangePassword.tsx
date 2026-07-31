import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Spinner } from '../components/UI/Spinner'
import { ShieldCheck } from 'lucide-react'

export default function ChangePassword() {
  const { user, changePassword } = useAuth()
  // Forced first change: the factory password was just used to log in, so
  // asking for it again here is pure friction. A voluntary change still
  // asks - the backend enforces the same rule.
  const forced = user?.must_change_password ?? false
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
      await changePassword(forced ? null : current, next)
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
          <p className="text-ink-muted text-sm mt-1">
            {forced ? 'Ustaw własne hasło zamiast fabrycznego' : 'Zmiana hasła konta'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-xl shadow-panel p-6 space-y-4">
          {!forced && (
            <div>
              <label className="block text-xs text-ink-muted mb-1.5">Bieżące hasło</label>
              <input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
                autoComplete="current-password"
                className="input"
                placeholder="••••••••"
              />
            </div>
          )}
          <div>
            <label className="block text-xs text-ink-muted mb-1.5">Nowe hasło</label>
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              autoFocus
              autoComplete="new-password"
              className="input"
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className="block text-xs text-ink-muted mb-1.5">Potwierdź nowe hasło</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              className="input"
              placeholder="••••••••"
            />
          </div>
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
