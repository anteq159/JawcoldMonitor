import { Modal } from './Modal'

interface Props {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Potwierdź', danger = true, onConfirm, onClose }: Props) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm text-ink-body mb-5">{message}</p>
      <div className="flex gap-3">
        <button
          onClick={() => { onConfirm(); onClose() }}
          className={`flex-1 text-white text-sm py-2 rounded-lg transition-colors ${danger ? 'bg-crit hover:bg-crit/90' : 'bg-accent hover:bg-accent-strong'}`}
        >
          {confirmLabel}
        </button>
        <button onClick={onClose} className="px-4 py-2 text-sm text-ink-muted border border-border rounded-lg hover:bg-surface-2 transition-colors">
          Anuluj
        </button>
      </div>
    </Modal>
  )
}
