import * as React from 'react'

import { cn } from '@ui/cn'
import type { VirtualGridLayout } from '@ui/virtual-grid'
import { CATALOG_KIND_LABELS, type CatalogEntry, type CatalogView } from '../types'
import { CatalogThumbnail } from './catalog-thumbnail'

export function CatalogCard({
  entry,
  selected,
  saleSelected,
  view,
  layout,
  onSelect,
  onToggleSale,
}: {
  entry: CatalogEntry
  selected: boolean
  saleSelected: boolean
  view: CatalogView
  layout: VirtualGridLayout
  onSelect: () => void
  onToggleSale: () => void
}): React.ReactElement {
  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-pkt border bg-pkt-panel text-left transition-colors',
        selected
          ? 'border-pkt-accent bg-pkt-accent/10'
          : 'border-pkt-border hover:border-pkt-accent/60',
        saleSelected && !selected && 'border-pkt-warn/70',
      )}
      style={{ width: layout.cardWidth, height: layout.cardHeight }}
    >
      <label
        className="absolute top-1.5 left-1.5 z-10 grid size-5 cursor-pointer place-items-center rounded border border-pkt-border bg-pkt-bg/90"
        title={saleSelected ? '取消卖货图选择' : '选入卖货图'}
      >
        <input
          type="checkbox"
          checked={saleSelected}
          onChange={onToggleSale}
          aria-label={`选择 ${entry.name} 加入卖货图`}
          className="size-3 accent-[var(--pkt-accent)]"
        />
      </label>
      <span className="absolute top-1.5 right-1.5 z-10 rounded bg-pkt-bg/85 px-1 py-0.5 text-[9px] text-pkt-text-mute">
        {CATALOG_KIND_LABELS[entry.kind]}
      </span>
      <button
        type="button"
        title={`${entry.name}\n${entry.code}`}
        onClick={onSelect}
        className="flex min-h-0 w-full flex-1 flex-col text-left"
      >
        <span className="pkt-checker grid min-h-0 w-full flex-1 place-items-center overflow-hidden">
          <CatalogThumbnail
            entry={entry}
            view={view}
            width={layout.thumbWidth}
            height={layout.thumbHeight}
          />
        </span>
        <span className="truncate border-t border-pkt-border/60 px-1.5 py-1 text-[10px] leading-none text-pkt-text">
          {entry.name}
        </span>
      </button>
    </div>
  )
}
