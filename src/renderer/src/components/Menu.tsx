import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type MenuItem =
  | {
      label: string
      icon?: ReactNode
      shortcut?: string
      disabled?: boolean
      checked?: boolean
      onClick: () => void
    }
  | { sep: true }
  | { heading: string }

/** A Luna popup menu, positioned at a point and kept inside the window. */
export function PopupMenu({
  x,
  y,
  items,
  onClose,
  minWidth
}: {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
  minWidth?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - r.height - 4))
    })
  }, [x, y])
  return createPortal(
    <>
      <div className="ctx-backdrop" onMouseDown={onClose} onContextMenu={(e) => (e.preventDefault(), onClose())} />
      <div ref={ref} className="dropdown" style={{ ...pos, minWidth }} role="menu">
        {items.map((it, i) =>
          'sep' in it ? (
            <div key={i} className="sep" />
          ) : 'heading' in it ? (
            <div key={i} className="heading">
              {it.heading}
            </div>
          ) : (
            <button
              key={i}
              className="item"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                onClose()
                it.onClick()
              }}
            >
              <span className="ico-slot">{it.checked ? '✓' : it.icon}</span>
              <span>{it.label}</span>
              {it.shortcut && <span className="shortcut">{it.shortcut}</span>}
            </button>
          )
        )}
      </div>
    </>,
    document.body
  )
}

export interface MenuState {
  x: number
  y: number
  items: MenuItem[]
}

export function useMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const open = (e: { clientX: number; clientY: number }, items: MenuItem[]) =>
    setMenu({ x: e.clientX, y: e.clientY, items })
  const openBelow = (el: HTMLElement, items: MenuItem[]) => {
    const r = el.getBoundingClientRect()
    setMenu({ x: r.left, y: r.bottom, items })
  }
  const node = menu ? <PopupMenu {...menu} onClose={() => setMenu(null)} /> : null
  return { open, openBelow, node, close: () => setMenu(null) }
}
