import * as React from 'react'

import { cn } from '@ui/cn'
import type { VirtualGridLayout } from '@ui/virtual-grid'
import { CATALOG_KIND_LABELS, type CatalogEntry, type CatalogView } from '../types'
import { CatalogThumbnail } from './catalog-thumbnail'

export function CatalogCard({
  entry,
  selected,
  view,
  layout,
  onSelect,
}: {
  entry: CatalogEntry
  selected: boolean
  view: CatalogView
  layout: VirtualGridLayout
  onSelect: () => void
}): React.ReactElement {
  return (
    <button
      type="button"
      title={`${entry.name}\n${entry.code}`}
      onClick={onSelect}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-pkt border bg-pkt-panel text-left transition-colors',
        selected
          ? 'border-pkt-accent bg-pkt-accent/10'
          : 'border-pkt-border hover:border-pkt-accent/60',
      )}
      style={{ width: layout.cardWidth, height: layout.cardHeight }}
    >
      <span className="absolute top-1.5 right-1.5 z-10 rounded bg-pkt-bg/85 px-1 py-0.5 text-[9px] text-pkt-text-mute">
        {CATALOG_KIND_LABELS[entry.kind]}
      </span>
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
  )
}
