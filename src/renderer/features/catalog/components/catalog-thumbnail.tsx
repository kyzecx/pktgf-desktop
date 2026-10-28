import { SpinnerRoot } from '@heroui/react'
import * as React from 'react'

import type { CatalogItem } from '@shared/contract'
import { useThumbnail } from '@features/outfits/hooks/use-thumbnail'
import { useCatalogThumbnail } from '../hooks/use-catalog-thumbnail'
import type { CatalogDisplay, CatalogEntry, CatalogView } from '../types'

/** 服饰复用搭配页的大/小模型缩略图，家具/宠物走资源包符号。 */
export function CatalogThumbnail({
  entry,
  view,
  width,
  height,
}: {
  entry: CatalogEntry
  view: CatalogView
  width?: number
  height?: number
}): React.ReactElement {
  if (entry.kind === 'outfit' && entry.item) {
    return (
      <OutfitThumbnail item={entry.item} display={view.display} width={width} height={height} />
    )
  }
  return (
    <ResourceThumbnail
      entry={entry}
      petView={view.petView}
      furnitureMode={entry.kind === 'furniture' && view.display === 'small' ? 'icon' : 'frame'}
      width={width}
      height={height}
    />
  )
}

function imageStyle(width?: number, height?: number): React.CSSProperties | undefined {
  if (!width || !height) return undefined
  return { width, height, maxWidth: '100%', maxHeight: '100%' }
}

function OutfitThumbnail({
  item,
  display,
  width,
  height,
}: {
  item: CatalogItem
  display: CatalogDisplay
  width?: number
  height?: number
}): React.ReactElement {
  const src = useThumbnail(item, display)
  return src ? (
    <img
      src={src}
      alt={item.name}
      loading="lazy"
      className="pkt-pixelated max-h-52 max-w-full object-contain"
      style={imageStyle(width, height)}
    />
  ) : (
    <span className="text-[10px] text-pkt-text-mute">载入中…</span>
  )
}

function ResourceThumbnail({
  entry,
  petView,
  furnitureMode,
  width,
  height,
}: {
  entry: CatalogEntry
  petView: CatalogView['petView']
  furnitureMode: 'frame' | 'icon'
  width?: number
  height?: number
}): React.ReactElement {
  const { src, loading } = useCatalogThumbnail(entry, petView, furnitureMode)
  if (loading) return <SpinnerRoot size="sm" color="accent" />
  if (!src) return <span className="px-2 text-center text-[10px] text-pkt-text-mute">暂无预览</span>
  return (
    <img
      src={src}
      alt={entry.name}
      loading="lazy"
      className="pkt-pixelated max-h-52 max-w-full object-contain"
      style={imageStyle(width, height)}
    />
  )
}
