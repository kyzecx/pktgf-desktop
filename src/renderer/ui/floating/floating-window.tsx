import { CloseButtonRoot } from '@heroui/react'
import * as React from 'react'

import { cn } from '../cn'
import { useFloatingStore, type FloatingPosition } from './use-floating-store'

export interface FloatingWindowProps {
  id: string
  title: React.ReactNode
  /** 子元素可以是函数，拿到关闭方法做按钮。 */
  children: React.ReactNode | ((close: () => void) => React.ReactNode)
  width?: number
  className?: string
  defaultPosition?: FloatingPosition
}

/**
 * 可拖动浮窗（页面内，不脱离窗口）。
 *
 * - 标题栏拖动，位置按 id 持久化
 * - 点击任意处自动置顶
 * - 关闭后位置保留，下次打开还在原处
 */
export function FloatingWindow({
  id,
  title,
  children,
  width = 340,
  className,
  defaultPosition,
}: FloatingWindowProps): React.ReactElement | null {
  const isOpen = useFloatingStore((state) => state.open[id] ?? false)
  const stored = useFloatingStore((state) => state.positions[id])
  const order = useFloatingStore((state) => state.order)
  const moveTo = useFloatingStore((state) => state.moveTo)
  const focus = useFloatingStore((state) => state.focus)
  const close = useFloatingStore((state) => state.close)

  const position = stored ?? defaultPosition ?? { x: 120, y: 120 }
  const dragRef = React.useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null)
  const dragPositionRef = React.useRef<FloatingPosition | null>(null)
  const [dragPosition, setDragPosition] = React.useState<FloatingPosition | null>(null)

  React.useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close(id)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, close, id])

  if (!isOpen) return null

  const current = dragPosition ?? position
  const depth = Math.max(0, order.indexOf(id))
  const zIndex = 40 + depth
  const maxX = Math.max(8, window.innerWidth - width - 8)

  return (
    <div
      role="dialog"
      aria-label={typeof title === 'string' ? title : undefined}
      aria-modal="false"
      className={cn(
        'pkt-no-drag pkt-fade-in fixed flex flex-col overflow-hidden rounded-xl border border-border/80 bg-surface/95 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.75)] backdrop-blur-md',
        className,
      )}
      style={{ left: current.x, top: current.y, width, maxHeight: '76vh', zIndex }}
      onPointerDown={() => focus(id)}
    >
      <div
        onPointerDown={(event) => {
          if (event.button !== 0) return
          const rect = event.currentTarget.parentElement?.getBoundingClientRect()
          if (!rect) return
          event.currentTarget.setPointerCapture(event.pointerId)
          dragRef.current = {
            pointerId: event.pointerId,
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top,
          }
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current
          if (!drag || drag.pointerId !== event.pointerId) return
          const next: FloatingPosition = {
            x: Math.min(Math.max(8, event.clientX - drag.offsetX), maxX),
            y: Math.min(Math.max(48, event.clientY - drag.offsetY), window.innerHeight - 96),
          }
          dragPositionRef.current = next
          setDragPosition(next)
        }}
        onPointerUp={(event) => {
          if (!dragRef.current) return
          dragRef.current = null
          try {
            event.currentTarget.releasePointerCapture(event.pointerId)
          } catch {
            /* 已释放 */
          }
          const final = dragPositionRef.current
          dragPositionRef.current = null
          setDragPosition(null)
          if (final) moveTo(id, final)
        }}
        className="flex h-10 shrink-0 cursor-grab items-center gap-2 border-b border-border/70 bg-gradient-to-b from-surface-secondary/90 to-surface/60 px-2.5 active:cursor-grabbing"
      >
        <span aria-hidden className="grid shrink-0 grid-cols-2 gap-[3px] opacity-40">
          {Array.from({ length: 6 }, (_, index) => (
            <span key={index} className="size-[2px] rounded-full bg-current" />
          ))}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold tracking-wide text-pkt-text-dim">
          {title}
        </span>
        <span onPointerDown={(event) => event.stopPropagation()}>
          <CloseButtonRoot aria-label="收起" onPress={() => close(id)} className="size-5 min-w-0" />
        </span>
      </div>

      <div className="pkt-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
        {typeof children === 'function' ? children(() => close(id)) : children}
      </div>
    </div>
  )
}
