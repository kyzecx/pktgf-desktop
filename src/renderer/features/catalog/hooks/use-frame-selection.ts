import * as React from 'react'

const EMPTY = new Set<string>()

/**
 * 帧选择按「物品 key -> 帧 key 集合」保存。
 * 切物品、切分类都不会丢；下载时再统一找物品。
 */
export function useFrameSelection(): {
  selections: Map<string, Set<string>>
  count: number
  get: (entryKey: string) => Set<string>
  toggle: (entryKey: string, key: string) => void
  setMany: (entryKey: string, keys: string[], checked: boolean) => void
  clear: (entryKey?: string) => void
} {
  const [selections, setSelections] = React.useState<Map<string, Set<string>>>(new Map())

  const get = React.useCallback(
    (entryKey: string): Set<string> => selections.get(entryKey) ?? EMPTY,
    [selections],
  )

  const toggle = React.useCallback((entryKey: string, key: string): void => {
    setSelections((current) => {
      const next = new Map(current)
      const frames = new Set(next.get(entryKey) ?? [])
      if (frames.has(key)) frames.delete(key)
      else frames.add(key)
      if (frames.size > 0) next.set(entryKey, frames)
      else next.delete(entryKey)
      return next
    })
  }, [])

  const setMany = React.useCallback((entryKey: string, keys: string[], checked: boolean): void => {
    setSelections((current) => {
      const next = new Map(current)
      const frames = new Set(next.get(entryKey) ?? [])
      for (const key of keys) {
        if (checked) frames.add(key)
        else frames.delete(key)
      }
      if (frames.size > 0) next.set(entryKey, frames)
      else next.delete(entryKey)
      return next
    })
  }, [])

  const clear = React.useCallback((entryKey?: string): void => {
    setSelections((current) => {
      if (!entryKey) return new Map()
      const next = new Map(current)
      next.delete(entryKey)
      return next
    })
  }, [])

  const count = React.useMemo(
    () => [...selections.values()].reduce((sum, frames) => sum + frames.size, 0),
    [selections],
  )

  return { selections, count, get, toggle, setMany, clear }
}
