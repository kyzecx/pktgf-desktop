import { create } from 'zustand'

/**
 * 自定义角色包。
 *
 * 与「自定义家具」同一套存法（dataURL in localStorage）。
 * 格式约定（尽量贴近官方 NPC 的符号规则，便于和引擎对接）：
 * - 一帧 40×60（高度其它值也接受，按图高算）
 * - `dir3` 是正面原图，`dir5` 由镜像得到
 * - 若导入第二组（背面），则作为 `dir7`，`dir1` 由镜像得到
 * - 每组是**横向帧条**：`N` 帧等分，`frameCount` 由用户确认
 */
export interface CustomActor {
  id: string
  name: string
  /** 正面帧条（dir3） */
  front: string
  /** 背面帧条（dir7），可选 */
  back?: string
  frameCount: number
  /** 每帧时长（ms），用于走/待机循环 */
  frameDuration: number
  createdAt: number
}

const STORAGE_KEY = 'pkt-custom-actors'
export const MAX_CUSTOM_ACTOR_BYTES = 4 * 1024 * 1024

function read(): CustomActor[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CustomActor[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item) => item?.id && item?.front)
      .map((item) => ({
        ...item,
        frameCount: Math.max(1, Math.round(Number(item.frameCount) || 1)),
        frameDuration: Math.max(40, Math.round(Number(item.frameDuration) || 160)),
      }))
  } catch {
    return []
  }
}

function write(items: CustomActor[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    throw new Error('自定义角色存储已满，请先删除一些再导入')
  }
}

interface CustomActorState {
  items: CustomActor[]
  add: (item: CustomActor) => void
  remove: (id: string) => void
}

export const useCustomActorStore = create<CustomActorState>((set, get) => ({
  items: read(),

  add: (item) => {
    const next = [...get().items, item]
    write(next)
    set({ items: next })
  },

  remove: (id) => {
    const next = get().items.filter((item) => item.id !== id)
    write(next)
    set({ items: next })
  },
}))

/** 取某朝向的帧条；没有背面时用正面镜像。 */
export function customActorStrip(
  actor: CustomActor,
  dir: 1 | 3 | 5 | 7,
): { strip: string; mirrored: boolean } {
  const useBack = (dir === 7 || dir === 1) && actor.back
  return {
    strip: useBack ? actor.back! : actor.front,
    mirrored: dir === 1 || dir === 5,
  }
}

/** 当前时间该取第几帧（循环）。 */
export function customActorFrameIndex(actor: CustomActor, timeMs: number): number {
  const count = Math.max(1, actor.frameCount)
  const step = Math.floor(timeMs / actor.frameDuration)
  return ((step % count) + count) % count
}
