import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <p className="text-4xl font-bold text-border-strong">404</p>
      <p className="text-ink-muted">Strona nie znaleziona</p>
      <Link to="/" className="text-accent hover:underline text-sm">Wróć do dashboardu</Link>
    </div>
  )
}
