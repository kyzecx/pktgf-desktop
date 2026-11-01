import type { SaveRecord } from '@shared/contract'

/**
 * 存档页 → 图鉴卖货图的一次性交接。
 *
 * 存档页只拿到 `SaveRecord`，跳转到图鉴后页面才挂载；用模块级变量传递，
 * 图鉴页挂载时 take 一次，取完即清空。
 */
let pending: SaveRecord[] = []

export function setPendingSaleOutfits(saves: SaveRecord[]): void {
  pending = saves
}

export function takePendingSaleOutfits(): SaveRecord[] {
  const value = pending
  pending = []
  return value
}
