import type { RoomSaveData } from '@engine/room'

/**
 * 存档页 → 房间页的一次性交接。
 *
 * 存档页只拿到 `SaveRecord`，页面卸载后再进房间，所以用模块级变量传递：
 * 房间页挂载时 `take` 一次，取完即清空。
 */
let pending: RoomSaveData | null = null

export function setPendingRoomSave(data: RoomSaveData): void {
  pending = data
}

export function takePendingRoomSave(): RoomSaveData | null {
  const value = pending
  pending = null
  return value
}

export function isRoomSaveData(data: unknown): data is RoomSaveData {
  const value = data as Partial<RoomSaveData> | null
  return Boolean(value && typeof value === 'object' && value.room && Array.isArray(value.furni))
}
