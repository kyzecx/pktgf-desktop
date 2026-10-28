import { create } from 'zustand'

import type { Part } from '@shared/contract'

/** 用户导入的素材：静态 700×840 sheet，动态素材再带 100×150 帧条。 */
export interface CustomAsset {
  id: string
  name: string
  part: Part
  /** 700×840 静态 sheet */
  dataUrl: string
  /** 是否动态；真实依据是 animateDataUrl 是否存在 */
  dynamic: boolean
  /** 100×150 横向帧条 */
  animateDataUrl?: string
  /** 帧条帧数，用于预览和 GIF 导出 */
  frameCount: number
}

const STORAGE_KEY = 'pkt-custom-assets'

function read(): CustomAsset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CustomAsset[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item) => item?.id && item?.dataUrl)
      .map((item) => ({
        ...item,
        dynamic: Boolean(item.dynamic && item.animateDataUrl),
        animateDataUrl: item.dynamic ? item.animateDataUrl : undefined,
        frameCount: Math.max(1, Number(item.frameCount) || 1),
      }))
  } catch {
    return []
  }
}

function write(assets: CustomAsset[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(assets))
}

interface CustomState {
  assets: CustomAsset[]
  add: (asset: CustomAsset) => void
  remove: (id: string) => void
}

export const useCustomStore = create<CustomState>((set, get) => ({
  assets: read(),
  add: (asset) => {
    const next = [...get().assets, asset]
    write(next)
    set({ assets: next })
  },
  remove: (id) => {
    const next = get().assets.filter((item) => item.id !== id)
    write(next)
    set({ assets: next })
  },
}))
