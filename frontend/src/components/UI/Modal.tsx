import { X } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  className?: string
  // 'xl' for editors that need room (profile register maps).
  size?: 'md' | 'xl'
}

export function Modal({ open, onClose, title, children, className = '', size = 'md' }: Props) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 animate-overlay-in">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`bg-surface border border-border rounded-xl shadow-xl w-full max-h-[92vh] flex flex-col ${size === 'xl' ? 'max-w-5xl' : 'max-w-lg'} animate-modal-in ${className}`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink transition-colors" aria-label="Zamknij">
            <X size={18} />
          </button>
        </div>
        {/* Scrolls inside the dialog so a long form stays reachable on a phone. */}
        <div className="p-5 overflow-y-auto min-h-0">{children}</div>
      </div>
    </div>
  )
}
