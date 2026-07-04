import { GripVertical } from 'lucide-react'

interface Props {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}

// Dragging is restricted to the header (see WidgetGrid's draggableHandle) so
// clicks/links/buttons inside widget bodies keep working normally.
export function WidgetCard({ title, children, action }: Props) {
  return (
    <div className="h-full flex flex-col bg-surface border border-border rounded-xl shadow-panel overflow-hidden">
      <div className="widget-drag-handle flex items-center gap-2 px-4 py-2.5 border-b border-border cursor-move shrink-0 select-none">
        <GripVertical size={14} className="text-ink-muted/50 shrink-0" />
        <h3 className="font-semibold text-ink text-sm flex-1 truncate">{title}</h3>
        {action}
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {children}
      </div>
    </div>
  )
}
