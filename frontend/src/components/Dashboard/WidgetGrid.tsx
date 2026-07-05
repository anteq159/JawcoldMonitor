import { useState } from 'react'
import { ResponsiveGridLayout, useContainerWidth, type Layout, type LayoutItem, type ResponsiveLayouts } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'

export interface WidgetDef {
  id: string
  label: string
  repeatable?: boolean
  defaultLayout: { x: number; y: number; w: number; h: number; minW?: number; minH?: number }
}

export interface WidgetInstance {
  instanceId: string
  type: string
}

// Two breakpoints, not three: "lg" gets the hand-tuned multi-column desktop
// arrangement, everything narrower collapses to a single robust stacked
// column. Container width (not window width) drives this - the sidebar
// (256px) eats real estate on desktop, so a plain 1024px window-width
// threshold under-triggers "lg" for completely normal laptop sizes.
type Breakpoint = 'lg' | 'sm'
const BREAKPOINTS: Record<Breakpoint, number> = { lg: 900, sm: 0 }
const COLS: Record<Breakpoint, number> = { lg: 12, sm: 1 }

const INSTANCES_KEY_SUFFIX = '-instances'

function makeInstanceId(type: string): string {
  return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function layoutItemFor(instanceId: string, def: WidgetDef, breakpoint: Breakpoint, stackY: number): LayoutItem {
  if (breakpoint === 'sm') {
    return { i: instanceId, x: 0, y: stackY, w: 1, h: def.defaultLayout.h, minW: 1, minH: def.defaultLayout.minH }
  }
  return {
    i: instanceId, x: def.defaultLayout.x, y: def.defaultLayout.y, w: def.defaultLayout.w, h: def.defaultLayout.h,
    minW: def.defaultLayout.minW, minH: def.defaultLayout.minH,
  }
}

function buildDefaultLayouts(
  instances: WidgetInstance[],
  widgetDefs: Record<string, WidgetDef>
): Record<Breakpoint, LayoutItem[]> {
  let smY = 0
  const lg: LayoutItem[] = []
  const sm: LayoutItem[] = []
  for (const inst of instances) {
    const def = widgetDefs[inst.type]
    if (!def) continue
    lg.push(layoutItemFor(inst.instanceId, def, 'lg', 0))
    sm.push(layoutItemFor(inst.instanceId, def, 'sm', smY))
    smY += def.defaultLayout.h
  }
  return { lg, sm }
}

function defaultInstances(widgets: WidgetDef[]): WidgetInstance[] {
  return widgets.map((w) => ({ instanceId: w.id, type: w.id }))
}

// Fills in a default position for any instance missing from a saved layout
// array - covers both a brand new widget type shipping after a user already
// has saved data, and an old/incompatible saved format that happens to
// parse but match nothing (in which case every instance is "missing").
function fillMissing(
  saved: LayoutItem[],
  instances: WidgetInstance[],
  widgetDefs: Record<string, WidgetDef>,
  breakpoint: Breakpoint
): LayoutItem[] {
  const presentIds = new Set(saved.map((l) => l.i))
  const missing = instances.filter((i) => !presentIds.has(i.instanceId))
  if (missing.length === 0) return saved
  let y = Math.max(0, ...saved.map((l) => l.y + l.h), 0)
  const extra: LayoutItem[] = []
  for (const inst of missing) {
    const def = widgetDefs[inst.type]
    if (!def) continue
    extra.push(layoutItemFor(inst.instanceId, def, breakpoint, y))
    y += def.defaultLayout.h
  }
  return [...saved, ...extra]
}

export function useWidgetLayout(storageKey: string, widgets: WidgetDef[]) {
  const widgetDefs: Record<string, WidgetDef> = Object.fromEntries(widgets.map((w) => [w.id, w]))
  const instancesKey = storageKey + INSTANCES_KEY_SUFFIX

  const [instances, setInstancesState] = useState<WidgetInstance[]>(() => {
    try {
      const raw = localStorage.getItem(instancesKey)
      if (raw) {
        const saved: WidgetInstance[] = JSON.parse(raw)
        return saved.filter((s) => widgetDefs[s.type])
      }
    } catch {}
    return defaultInstances(widgets)
  })

  const [layouts, setLayoutsState] = useState<Record<Breakpoint, LayoutItem[]>>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const saved: Record<Breakpoint, LayoutItem[]> = JSON.parse(raw)
        const knownIds = new Set(instances.map((i) => i.instanceId))
        const lg = (saved.lg ?? []).filter((l) => knownIds.has(l.i))
        const sm = (saved.sm ?? []).filter((l) => knownIds.has(l.i))
        return {
          lg: fillMissing(lg, instances, widgetDefs, 'lg'),
          sm: fillMissing(sm, instances, widgetDefs, 'sm'),
        }
      }
    } catch {}
    return buildDefaultLayouts(instances, widgetDefs)
  })

  const persistInstances = (next: WidgetInstance[]) => {
    setInstancesState(next)
    try { localStorage.setItem(instancesKey, JSON.stringify(next)) } catch {}
  }
  const persistLayouts = (next: Record<Breakpoint, LayoutItem[]>) => {
    setLayoutsState(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch {}
  }

  const setLayouts = (lg: LayoutItem[], sm: LayoutItem[]) => persistLayouts({ lg, sm })

  const resetLayout = () => {
    const def = defaultInstances(widgets)
    persistInstances(def)
    persistLayouts(buildDefaultLayouts(def, widgetDefs))
  }

  const addInstance = (type: string) => {
    const def = widgetDefs[type]
    if (!def) return
    const instanceId = makeInstanceId(type)
    const nextInstances = [...instances, { instanceId, type }]
    const maxLgY = Math.max(0, ...layouts.lg.map((l) => l.y + l.h))
    const maxSmY = Math.max(0, ...layouts.sm.map((l) => l.y + l.h))
    const nextLg = [...layouts.lg, { ...def.defaultLayout, i: instanceId, x: 0, y: maxLgY }]
    const nextSm = [...layouts.sm, layoutItemFor(instanceId, def, 'sm', maxSmY)]
    persistInstances(nextInstances)
    persistLayouts({ lg: nextLg, sm: nextSm })
  }

  const removeInstance = (instanceId: string) => {
    persistInstances(instances.filter((i) => i.instanceId !== instanceId))
    persistLayouts({
      lg: layouts.lg.filter((l) => l.i !== instanceId),
      sm: layouts.sm.filter((l) => l.i !== instanceId),
    })
  }

  const setVisible = (type: string, visible: boolean) => {
    const existing = instances.find((i) => i.type === type)
    if (visible && !existing) addInstance(type)
    else if (!visible && existing) removeInstance(existing.instanceId)
  }

  // Used by widgets whose content determines their own height (e.g.
  // favorite-parameters growing/shrinking with the favorites list) rather
  // than a fixed size the user drags.
  const setInstanceHeight = (instanceId: string, h: number) => {
    persistLayouts({
      lg: layouts.lg.map((l) => (l.i === instanceId ? { ...l, h } : l)),
      sm: layouts.sm.map((l) => (l.i === instanceId ? { ...l, h } : l)),
    })
  }

  return { instances, layouts, setLayouts, resetLayout, addInstance, removeInstance, setVisible, setInstanceHeight }
}

interface GridProps {
  layouts: Record<Breakpoint, LayoutItem[]>
  onLayoutChange: (lg: LayoutItem[], sm: LayoutItem[]) => void
  children: React.ReactNode
}

export function WidgetGrid({ layouts, onLayoutChange, children }: GridProps) {
  const { width, containerRef, mounted } = useContainerWidth()
  // The drag handle alone has select-none, but resizing drags the mouse
  // across the widget BODY (not just the header), which has no such
  // protection - that's what was getting highlighted as text. Rather than
  // permanently killing text selection inside every tile (breaking the
  // legitimate case of copying a value out of one), only suppress it for
  // the duration of an actual drag/resize gesture.
  const [interacting, setInteracting] = useState(false)
  const startInteracting = () => setInteracting(true)
  const stopInteracting = () => setInteracting(false)

  return (
    <div ref={containerRef as React.RefObject<HTMLDivElement>} className={interacting ? 'select-none' : ''}>
      {mounted && (
        <ResponsiveGridLayout
          width={width}
          layouts={layouts as unknown as ResponsiveLayouts<Breakpoint>}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          rowHeight={44}
          margin={[16, 16]}
          containerPadding={[0, 0]}
          resizeConfig={{ enabled: true, handles: ['se', 's', 'e'] }}
          dragConfig={{ handle: '.widget-drag-handle' }}
          onDragStart={startInteracting}
          onDragStop={stopInteracting}
          onResizeStart={startInteracting}
          onResizeStop={stopInteracting}
          onLayoutChange={(_current: Layout, all: ResponsiveLayouts<Breakpoint>) =>
            onLayoutChange([...(all.lg ?? [])], [...(all.sm ?? [])])
          }
        >
          {children}
        </ResponsiveGridLayout>
      )}
    </div>
  )
}
