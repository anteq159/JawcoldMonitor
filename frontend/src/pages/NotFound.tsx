import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <p className="text-4xl font-bold text-gray-700">404</p>
      <p className="text-gray-400">Strona nie znaleziona</p>
      <Link to="/" className="text-blue-400 hover:underline text-sm">Wróć do dashboardu</Link>
    </div>
  )
}
