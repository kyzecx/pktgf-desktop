import * as React from 'react'

import type { Catalog, CatalogPayload, ResourceVersionStatus } from '@shared/contract'

interface CatalogState {
  catalog: Catalog | null
  meta: CatalogPayload['meta'] | null
  assets: CatalogPayload['assets'] | null
  version: ResourceVersionStatus | null
  error: string | null
}

const CatalogContext = React.createContext<CatalogState>({
  catalog: null,
  meta: null,
  assets: null,
  version: null,
  error: null,
})

/**
 * 目录只加载一次，全局共享。
 *
 * 传输格式是 JSON 字符串（主进程不解码），这里解析一次并缓存在内存里；
 * 14k 条数据解析约 30ms。
 */
export function CatalogProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [state, setState] = React.useState<CatalogState>({
    catalog: null,
    meta: null,
    assets: null,
    version: null,
    error: null,
  })

  React.useEffect(() => {
    let cancelled = false

    async function bootstrap(): Promise<void> {
      try {
        const payload = await window.pkt.getCatalog()
        if (cancelled) return
        const catalog = JSON.parse(payload.json) as Catalog
        setState((previous) => ({
          ...previous,
          catalog,
          meta: payload.meta,
          assets: payload.assets,
          error: null,
        }))

        const version = await window.pkt.getResourceVersion().catch(() => null)
        if (!cancelled && version) setState((previous) => ({ ...previous, version }))
      } catch (error) {
        if (cancelled) return
        setState((previous) => ({
          ...previous,
          error: error instanceof Error ? error.message : String(error),
        }))
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  return <CatalogContext.Provider value={state}>{children}</CatalogContext.Provider>
}

export function useCatalog(): CatalogState {
  return React.useContext(CatalogContext)
}
