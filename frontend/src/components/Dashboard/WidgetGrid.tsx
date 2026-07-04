import { useState } from 'react'
import { ResponsiveGridLayout, useContainerWidth, type Layout, type LayoutItem } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'

export interface WidgetDef {
  id: string
  label: string
  defaultLayout: { x: number; y: number; w: number; h: number; minW?: number; minH?: number }
}

const BREAKPOINTS = { lg: 1024, md: 768, sm: 0 }
const COLS = { lg: 12, md: 8, sm: 4 }

function buildDefaultLayout(widgets: WidgetDef[]): LayoutItem[] {
  return widgets.map((w) => ({ i: w.id, ...w.defaultLayout }))
}

export function useWidgetLayout(storageKey: string, widgets: WidgetDef[]) {
  const [layout, setLayoutState] = useState<LayoutItem[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const saved: LayoutItem[] = JSON.parse(raw)
        const savedIds = new Set(saved.map((s) => s.i))
        const known = new Set(widgets.map((w) => w.id))
        const merged = saved.filter((s) => known.has(s.i))
        widgets.forEach((w) => {
          if (!savedIds.has(w.id)) merged.push({ i: w.id, ...w.defaultLayout })
        })
        return merged
      }
    } catch {}
    return buildDefaultLayout(widgets)
  })

  const setLayout = (next: LayoutItem[]) => {
    setLayoutState(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch {}
  }

  const resetLayout = () => {
    const def = buildDefaultLayout(widgets)
    setLayoutState(def)
    try { localStorage.removeItem(storageKey) } catch {}
  }

  return { layout, setLayout, resetLayout }
}

interface GridProps {
  layout: LayoutItem[]
  onLayoutChange: (l: LayoutItem[]) => void
  children: React.ReactNode
}

export function WidgetGrid({ layout, onLayoutChange, children }: GridProps) {
  const { width, containerRef, mounted } = useContainerWidth()

  return (
    <div ref={containerRef as React.RefObject<HTMLDivElement>}>
      {mounted && (
        <ResponsiveGridLayout
          width={width}
          layouts={{ lg: layout, md: layout, sm: layout }}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          rowHeight={44}
          margin={[16, 16]}
          containerPadding={[0, 0]}
          dragConfig={{ handle: '.widget-drag-handle' }}
          onLayoutChange={(current: Layout) => onLayoutChange([...current])}
        >
          {children}
        </ResponsiveGridLayout>
      )}
    </div>
  )
}
