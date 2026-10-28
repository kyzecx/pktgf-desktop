import * as React from 'react'

import type { CatalogAssets, Part } from '@shared/contract'
import { getPartIconUrls } from '@/services/assets'

/**
 * 分类图标按资源包惰性加载。
 *
 * 图标缺失不是致命错误：分类栏会退回文字，页面其余功能不受影响。
 */
export function usePartIcons(uiIcons: CatalogAssets['uiIcons']): Partial<Record<Part, string>> {
  const [icons, setIcons] = React.useState<Partial<Record<Part, string>>>({})

  React.useEffect(() => {
    if (!uiIcons) return

    let alive = true
    void getPartIconUrls(uiIcons)
      .then((next) => {
        if (alive) setIcons(next)
      })
      .catch((error: unknown) => {
        console.warn('[outfits] 分类图标加载失败，回退到文字', error)
      })

    return () => {
      alive = false
    }
  }, [uiIcons])

  return icons
}
