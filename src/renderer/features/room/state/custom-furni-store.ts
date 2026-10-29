import { create } from 'zustand'

import type { CatalogFurniture } from '@shared/contract'
import { DEFAULT_CUSTOM_META, synthesizeFurniDef, type CustomFurniMeta } from '@engine/room'

/**
 * 自定义家具存储。
 *
 * 和「自建服饰」保持一致的做法：图片以 dataURL 存在 localStorage，
 * 简单、无需 IPC、离线可用；单件上限 2MB，超出在导入时提示。
 *
 * 渲染层通过 `def.zip === 'custom/<id>'` 认出这是自定义件，走自己的位图来源，
 * 其余（命中/排序/编辑/交互）与官方家具完全一致。
 */

const STORAGE_KEY = 'pkt-custom-furni'
export const MAX_CUSTOM_BYTES = 2 * 1024 * 1024

export interface CustomFurni {
  id: string
  meta: CustomFurniMeta
  /** 主图（PNG，dataURL）；`zip` 导入时是从包里抽出的 `_3_01` */
  image: string
  createdAt: number
}

function read(): CustomFurni[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CustomFurni[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item) => item?.id && item?.image)
      .map((item) => ({ ...item, meta: { ...DEFAULT_CUSTOM_META, ...item.meta } }))
  } catch {
    return []
  }
}

function write(items: CustomFurni[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // localStorage 满了：抛给调用方提示
    throw new Error('自定义家具存储已满，请先删除一些再导入')
  }
}

interface CustomFurniState {
  items: CustomFurni[]
  add: (item: CustomFurni) => void
  update: (id: string, patch: Partial<CustomFurni>) => void
  remove: (id: string) => void
}

export const useCustomFurniStore = create<CustomFurniState>((set, get) => ({
  items: read(),

  add: (item) => {
    const next = [...get().items, item]
    write(next)
    set({ items: next })
  },

  update: (id, patch) => {
    const next = get().items.map((item) => (item.id === id ? { ...item, ...patch } : item))
    write(next)
    set({ items: next })
  },

  remove: (id) => {
    const next = get().items.filter((item) => item.id !== id)
    write(next)
    set({ items: next })
  },
}))

/** 自定义家具 → 目录条目（供家具库/渲染/命中统一使用）。 */
export function customFurniToCatalog(item: CustomFurni): CatalogFurniture {
  return synthesizeFurniDef(item.id, item.meta)
}

/** 把自定义家具合并进目录列表（官方条目在前，自定义在后）。 */
export function withCustomFurniture(
  furniture: CatalogFurniture[],
  items: CustomFurni[],
): CatalogFurniture[] {
  if (items.length === 0) return furniture
  return [...furniture, ...items.map((item) => customFurniToCatalog(item))]
}
