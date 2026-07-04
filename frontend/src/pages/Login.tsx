import { useState } from 'react'
import { Snowflake } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { Spinner } from '../components/UI/Spinner'

export default function Login() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
    } catch (err: any) {
      setError(err.response?.data?.detail ?? 'Błąd logowania')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-2xl font-bold text-ink">
            <Snowflake size={26} className="text-accent" strokeWidth={2.25} />
            JawcoldMonitor
          </div>
          <p className="text-ink-muted text-sm mt-1">Monitoring sterowników chłodniczych</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-xl shadow-panel p-6 space-y-4">
          <div>
            <label className="block text-xs text-ink-muted mb-1.5">Nazwa użytkownika</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
              className="input"
              placeholder="użytkownik"
            />
          </div>
          <div>
            <label className="block text-xs text-ink-muted mb-1.5">Hasło</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
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
            Zaloguj
          </button>
        </form>
      </div>
    </div>
  )
}
