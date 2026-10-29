import * as React from 'react'

import { readSymbolImage } from '@engine/index'
import type { Catalog, CatalogFurniture } from '@shared/contract'
import { resourceUrl } from '@/services/assets'
import { openBundle } from '@engine/index'

/**
 * 家具缩略图：直接取包里的 `<code>s`（43×43 背包图标），
 * 没有就退回 `<code>_3_01` 主图。
 */

const cache = new Map<string, Promise<string | null>>()

/** 非 Hook 版本：面板记录搜索历史时需要拿到缩略图。 */
export function getFurniThumb(item: CatalogFurniture): Promise<string | null> {
  return loadThumb(item)
}

export function useFurniThumb(catalog: Catalog | null, item: CatalogFurniture): string | null {
  const [src, setSrc] = React.useState<string | null>(null)
  void catalog

  React.useEffect(() => {
    let cancelled = false
    void loadThumb(item)
      .then((value) => {
        if (!cancelled) setSrc(value)
      })
      .catch(() => {
        if (!cancelled) setSrc(null)
      })
    return () => {
      cancelled = true
    }
  }, [item])

  return src
}

function loadThumb(item: CatalogFurniture): Promise<string | null> {
  const key = `${item.zip}:${item.md5}`
  const cached = cache.get(key)
  if (cached) return cached

  const promise = (async () => {
    const response = await fetch(resourceUrl(item.zip, item.md5))
    if (!response.ok) return null
    const bundle = openBundle(new Uint8Array(await response.arrayBuffer()))
    const names = [...bundle.symbols.keys()]
    const lower = (value: string): string => value.toLowerCase()
    const icon =
      names.find((name) => lower(name) === lower(`${item.code}s`)) ??
      names.find((name) => lower(name) === lower(`${item.code}_3_01`)) ??
      names.find((name) => lower(name).startsWith(lower(`${item.code}_`))) ??
      null
    if (!icon) return null
    const image = readSymbolImage(bundle, icon)
    if (!image) return null
    return toDataUrl(image)
  })().catch(() => null)

  cache.set(key, promise)
  return promise
}

function toDataUrl(image: { width: number; height: number; data: Uint8ClampedArray }): string {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.putImageData(
    new ImageData(new Uint8ClampedArray(image.data), image.width, image.height),
    0,
    0,
  )
  return canvas.toDataURL('image/png')
}
