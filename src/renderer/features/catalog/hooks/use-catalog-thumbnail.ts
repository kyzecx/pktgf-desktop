import * as React from 'react'

import { getEntryThumbnail } from '../services'
import type { CatalogEntry, PetView } from '../types'

/** 图鉴卡片缩略图；按 key 缓存，列表换页时不会重复请求。 */
export function useCatalogThumbnail(
  entry: CatalogEntry,
  petView: PetView = 'pet',
  furnitureMode: 'frame' | 'icon' = 'icon',
): {
  src: string | null
  loading: boolean
} {
  const [src, setSrc] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    setSrc(null)
    setLoading(true)
    void getEntryThumbnail(entry, petView, furnitureMode)
      .then((value) => {
        if (!cancelled) setSrc(value)
      })
      .catch(() => {
        if (!cancelled) setSrc(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [entry, petView, furnitureMode])

  return { src, loading }
}
