import * as React from 'react'

import { cn } from './cn'

export interface VirtualGridSize {
  /** 窗口再窄也至少保留的卡片宽度 */
  minWidth: number
  /** 自动列数时使用的目标宽度 */
  autoWidth: number
  autoHeight: number
  autoThumbWidth: number
  autoThumbHeight: number
  gap: number
}

export interface VirtualGridLayout {
  columns: number
  cardWidth: number
  cardHeight: number
  thumbWidth: number
  thumbHeight: number
  gap: number
}

/**
 * 滚动虚拟网格：只渲染视口附近的几行。
 *
 * 搭配页和所有图鉴分类共用这一套布局/滚动逻辑，
 * 因此列表都是滚动加载，不依赖「加载更多」按钮。
 */
export function VirtualGrid<T>({
  items,
  size,
  columnsSetting = 0,
  itemKey,
  renderItem,
  empty,
  resetKey,
  className,
}: {
  items: T[]
  size: VirtualGridSize
  /** 0 = 自动按可用宽度排 */
  columnsSetting?: number
  itemKey: (item: T) => string
  renderItem: (item: T, layout: VirtualGridLayout) => React.ReactNode
  empty?: React.ReactNode
  resetKey?: string
  className?: string
}): React.ReactElement {
  const scrollRef = React.useRef<HTMLDivElement | null>(null)
  const [viewport, setViewport] = React.useState({ width: 0, height: 0, scrollTop: 0 })

  React.useEffect(() => {
    const element = scrollRef.current
    if (!element) return

    const update = (): void =>
      setViewport({
        width: element.clientWidth,
        height: element.clientHeight,
        scrollTop: element.scrollTop,
      })

    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    element.addEventListener('scroll', update, { passive: true })
    return () => {
      observer.disconnect()
      element.removeEventListener('scroll', update)
    }
  }, [])

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [resetKey])

  const isAuto = columnsSetting === 0
  const autoColumns = Math.max(
    1,
    Math.floor((viewport.width + size.gap) / (size.autoWidth + size.gap)),
  )
  const maxColumns = Math.max(
    1,
    Math.floor((viewport.width + size.gap) / (size.minWidth + size.gap)),
  )
  const columns = Math.max(1, Math.min(isAuto ? autoColumns : columnsSetting, maxColumns))
  const cardWidth = Math.max(
    size.minWidth,
    (viewport.width - size.gap * Math.max(0, columns - 1)) / columns,
  )
  const cardHeight = isAuto ? size.autoHeight : Math.round(cardWidth * 1.12) + 18
  const thumbHeight = isAuto ? size.autoThumbHeight : Math.max(24, cardHeight - 18 - 8)
  const thumbWidth = isAuto ? size.autoThumbWidth : Math.max(16, Math.round((thumbHeight * 2) / 3))
  const layout: VirtualGridLayout = {
    columns,
    cardWidth,
    cardHeight,
    thumbWidth,
    thumbHeight,
    gap: size.gap,
  }

  const rows = Math.ceil(items.length / columns)
  const totalHeight = rows * (cardHeight + layout.gap)

  const rawFirstRow = Math.max(0, Math.floor(viewport.scrollTop / (cardHeight + layout.gap)) - 1)
  // 切换列数/显示模式时内容高度会骤变，先夹住首行，避免空一帧。
  const firstRow = Math.min(rawFirstRow, Math.max(0, rows - 1))
  const rowsVisible = Math.ceil(viewport.height / (cardHeight + layout.gap)) + 2
  const lastRow = Math.min(rows, firstRow + rowsVisible)

  const start = firstRow * columns
  const end = Math.min(items.length, lastRow * columns)
  const visible = items.slice(start, end)

  return (
    <div
      ref={scrollRef}
      className={cn('pkt-scroll relative h-full overflow-y-auto overflow-x-hidden', className)}
    >
      {items.length === 0 ? (
        <div className="grid h-full place-items-center text-xs text-pkt-text-mute">
          {empty ?? '没有匹配的物品'}
        </div>
      ) : (
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div
            className="absolute inset-x-0 top-0"
            style={{
              transform: `translateY(${firstRow * (cardHeight + layout.gap)}px)`,
              display: 'grid',
              gridTemplateColumns: `repeat(${columns}, ${cardWidth}px)`,
              gap: layout.gap,
            }}
          >
            {visible.map((item) => (
              <React.Fragment key={itemKey(item)}>{renderItem(item, layout)}</React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
