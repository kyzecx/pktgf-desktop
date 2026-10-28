import * as React from 'react'

import type { CatalogItem } from '@shared/contract'
import { cn } from '@ui/cn'
import { LIST_SIZES } from '@features/shared/list-settings'
import { VirtualGrid, type VirtualGridLayout } from '@ui/virtual-grid'
import { useThumbnail, type ThumbnailMode } from '../hooks/use-thumbnail'

/**
 * 物品网格。
 *
 * 布局和滚动虚拟化与图鉴共用 VirtualGrid；这里只负责物品卡片。
 */
export function ItemGrid({
  items,
  selectedCodes,
  display,
  columnsSetting,
  onSelect,
}: {
  items: CatalogItem[]
  selectedCodes: ReadonlySet<string>
  display: ThumbnailMode
  /** 0 = 自动 */
  columnsSetting: number
  onSelect: (item: CatalogItem) => void
}): React.ReactElement {
  return (
    <VirtualGrid
      items={items}
      size={LIST_SIZES[display]}
      columnsSetting={columnsSetting}
      itemKey={(item) => `${item.code}-${item.type}`}
      resetKey={display}
      empty="没有匹配的物品"
      renderItem={(item, layout) => (
        <ItemCard
          item={item}
          layout={layout}
          display={display}
          selected={selectedCodes.has(item.code)}
          onSelect={onSelect}
        />
      )}
    />
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
  layout: VirtualGridLayout
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
      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-[radial-gradient(circle_at_50%_40%,var(--pkt-glow),transparent_65%)]">
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
          display === 'small' ? 'text-[9px]' : 'text-[10px]',
        )}
      >
        {item.name}
      </span>
    </button>
  )
}
