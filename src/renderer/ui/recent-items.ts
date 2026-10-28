import * as React from 'react'

export interface RecentItem {
  key: string
  label: string
  image: string
  value: string
}

interface StoredRecentItem extends RecentItem {
  updatedAt: number
}

const LIMIT = 8
const PREFIX = 'pkt-recent:'

function storageKey(scope: string): string {
  return `${PREFIX}${scope}`
}

function read(scope: string): RecentItem[] {
  try {
    const raw = localStorage.getItem(storageKey(scope))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (item): item is StoredRecentItem =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof (item as StoredRecentItem).key === 'string' &&
          typeof (item as StoredRecentItem).label === 'string' &&
          typeof (item as StoredRecentItem).image === 'string' &&
          typeof (item as StoredRecentItem).value === 'string',
      )
      .map(({ key, label, image, value }) => ({ key, label, image, value }))
  } catch {
    return []
  }
}

/** 每个页面各自保存最近打开/穿戴的物品，供搜索框的历史记录展示图片。 */
export function useRecentItems(scope: string): {
  items: RecentItem[]
  remember: (item: RecentItem) => void
  clear: () => void
} {
  const [items, setItems] = React.useState<RecentItem[]>(() => read(scope))

  const remember = React.useCallback(
    (item: RecentItem): void => {
      if (!item.image) return
      setItems((current) => {
        const next = [item, ...current.filter((entry) => entry.key !== item.key)].slice(0, LIMIT)
        try {
          const stored: StoredRecentItem[] = next.map((entry) => ({
            ...entry,
            updatedAt: Date.now(),
          }))
          localStorage.setItem(storageKey(scope), JSON.stringify(stored))
        } catch {
          /* 存储不可用时只保留当前会话 */
        }
        return next
      })
    },
    [scope],
  )

  const clear = React.useCallback((): void => {
    setItems([])
    try {
      localStorage.removeItem(storageKey(scope))
    } catch {
      /* 忽略存储错误 */
    }
  }, [scope])

  return { items, remember, clear }
}
