import * as React from 'react'

import type { Catalog, CatalogAssets } from '@shared/contract'
import { loadSaleArt, type SaleArt } from './art'
import { saleSubjectArtKey, type SaleSubject, type SaleTemplate } from './model'

export interface UseSaleArtsInput {
  subjects: SaleSubject[]
  catalog: Catalog
  assets: CatalogAssets
  template: SaleTemplate
}

/**
 * 按条目加载卖货图立绘。
 *
 * 名称/价格编辑不会改变 subjects 的“图片指纹”，effect 因此不会重算立绘；
 * 最新 subjects 通过 ref 读取，避免把数组引用放进依赖里。
 */
export function useSaleArts({ subjects, catalog, assets, template }: UseSaleArtsInput): {
  arts: Record<string, SaleArt>
  error: string | null
} {
  const signature = subjects.map(saleSubjectArtKey).join('|')
  const latestSubjects = React.useRef(subjects)
  latestSubjects.current = subjects
  const [arts, setArts] = React.useState<Record<string, SaleArt>>({})
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    const list = latestSubjects.current
    setArts({})
    setError(null)
    if (list.length === 0) return

    void Promise.all(
      list.map(
        async (subject) =>
          [subject.key, await loadSaleArt(subject, catalog, assets, template)] as const,
      ),
    )
      .then((pairs) => {
        if (!cancelled) setArts(Object.fromEntries(pairs))
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught))
      })

    return () => {
      cancelled = true
    }
  }, [signature, catalog, assets, template])

  return { arts, error }
}
