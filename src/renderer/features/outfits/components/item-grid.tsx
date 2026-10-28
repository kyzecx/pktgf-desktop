import * as React from 'react'

import type { CatalogItem } from '@shared/contract'
import { cn } from '@ui/cn'
import { useThumbnail, type ThumbnailMode } from '../hooks/use-thumbnail'

interface CardSettings {
  /** 窗口再窄也至少保留的卡片宽度 */
  minWidth: number
  /** 自动列数时使用的目标宽度 */
  autoWidth: number
  autoHeight: number
  autoThumbWidth: number
  autoThumbHeight: number
  gap: number
  labelClass: string
}

interface CardLayout {
  columns: number
  cardWidth: number
  cardHeight: number
  thumbWidth: number
  thumbHeight: number
  gap: number
  labelClass: string
}

const SIZES: Record<ThumbnailMode, CardSettings> = {
  large: {
    minWidth: 56,
    autoWidth: 84,
    autoHeight: 104,
    autoThumbWidth: 48,
    autoThumbHeight: 72,
    gap: 8,
    labelClass: 'text-[10px]',
  },
  small: {
    minWidth: 44,
    autoWidth: 64,
    autoHeight: 86,
    autoThumbWidth: 40,
    autoThumbHeight: 60,
    gap: 6,
    labelClass: 'text-[9px]',
  },
}

/**
 * 物品网格。
 *
 * 卡片宽度按可用宽度等分撑满，避免右侧留出一条空列。
 * 「每行数量」可以固定列数；列数越少，卡片和缩略图越大。
 */
export function ItemGrid({
  items,
  selectedCode,
  display,
  columnsSetting,
  onSelect,
}: {
  items: CatalogItem[]
  selectedCode: string | null
  display: ThumbnailMode
  /** 0 = 自动 */
  columnsSetting: number
  onSelect: (item: CatalogItem) => void
}): React.ReactElement {
  const scrollRef = React.useRef<HTMLDivElement | null>(null)
  const [viewport, setViewport] = React.useState({ width: 0, height: 0, scrollTop: 0 })
  const settings = SIZES[display]

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
  }, [display])

  const isAuto = columnsSetting === 0
  const autoColumns = Math.max(
    1,
    Math.floor((viewport.width + settings.gap) / (settings.autoWidth + settings.gap)),
  )
  const maxColumns = Math.max(
    1,
    Math.floor((viewport.width + settings.gap) / (settings.minWidth + settings.gap)),
  )
  const columns = Math.max(1, Math.min(isAuto ? autoColumns : columnsSetting, maxColumns))
  const cardWidth = Math.max(
    settings.minWidth,
    (viewport.width - settings.gap * Math.max(0, columns - 1)) / columns,
  )
  const cardHeight = isAuto ? settings.autoHeight : Math.round(cardWidth * 1.12) + 18
  const thumbHeight = isAuto ? settings.autoThumbHeight : Math.max(24, cardHeight - 18 - 8)
  const thumbWidth = isAuto
    ? settings.autoThumbWidth
    : Math.max(16, Math.round((thumbHeight * 2) / 3))
  const layout: CardLayout = {
    columns,
    cardWidth,
    cardHeight,
    thumbWidth,
    thumbHeight,
    gap: settings.gap,
    labelClass: settings.labelClass,
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
    <div ref={scrollRef} className="pkt-scroll relative h-full overflow-y-auto overflow-x-hidden">
      {items.length === 0 ? (
        <div className="grid h-full place-items-center text-xs text-pkt-text-mute">
          没有匹配的物品
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
              <ItemCard
                key={`${item.code}-${item.type}`}
                item={item}
                layout={layout}
                display={display}
                selected={item.code === selectedCode}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ItemCard({
  item,
  layout,
  display,
  selected,
  onSelect,
}: {
  item: CatalogItem
  layout: CardLayout
  display: ThumbnailMode
  selected: boolean
  onSelect: (item: CatalogItem) => void
}): React.ReactElement {
  const thumbnail = useThumbnail(item, display)

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      title={`${item.name}\n${item.code}`}
      className={cn(
        'pkt-no-drag group relative flex flex-col overflow-hidden rounded-pkt border bg-pkt-panel/60 text-left transition-colors',
        selected
          ? 'border-pkt-accent bg-pkt-accent/10'
          : 'border-pkt-border hover:border-pkt-border-strong hover:bg-pkt-panel-hover',
      )}
      style={{ width: layout.cardWidth, height: layout.cardHeight }}
    >
      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-[radial-gradient(circle_at_50%_40%,rgba(255,255,255,0.06),transparent_65%)]">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            draggable={false}
            className="pkt-pixelated object-contain"
            style={{ width: layout.thumbWidth, height: layout.thumbHeight }}
          />
        ) : (
          <span className="size-4 animate-pulse rounded-sm bg-pkt-panel-active" />
        )}
        {item.motion ? (
          <span className="absolute top-1 right-1 rounded-sm bg-pkt-panel-active px-1 text-[9px] leading-3 text-pkt-text-mute">
            动
          </span>
        ) : null}
      </div>
      <span
        className={cn(
          'truncate border-t border-pkt-border/60 px-1.5 py-1 leading-none text-pkt-text-dim',
          layout.labelClass,
        )}
      >
        {item.name}
      </span>
    </button>
  )
}
