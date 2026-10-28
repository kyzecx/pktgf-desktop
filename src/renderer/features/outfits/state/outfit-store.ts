import { create } from 'zustand'

import type { CatalogItem, Part } from '@shared/contract'

export const PART_ORDER: Part[] = [
  'hair',
  'cset',
  'hats',
  'mask',
  'glas',
  'clot',
  'pant',
  'coat',
  'bear',
  'wing',
]

export const PART_LABELS: Record<Part, string> = {
  hair: '发型',
  cset: '连身',
  hats: '头饰',
  mask: '面具',
  glas: '眼镜',
  clot: '上衣',
  pant: '裤子',
  coat: '外套',
  bear: '背饰',
  wing: '翅膀',
}

export type CategoryLayout = 'vertical' | 'horizontal'
export type ItemDisplay = 'large' | 'small'
export type ItemSort = 'newest' | 'oldest' | 'name'
export type PreviewMode = 'large' | 'small' | 'both'

/** 0 = 自动按可用宽度排；其余为每行固定数量。 */
export const LIST_COLUMN_OPTIONS = [0, 3, 4, 5, 6, 7, 8, 9, 10, 12] as const
export type ListColumns = (typeof LIST_COLUMN_OPTIONS)[number]

export type SmallView = 'front' | 'back'
export interface SmallViews {
  front: boolean
  back: boolean
}

const CATEGORY_LAYOUT_KEY = 'pkt-outfit-category-layout'
const ITEM_DISPLAY_KEY = 'pkt-outfit-item-display'
const PREVIEW_MODE_KEY = 'pkt-outfit-preview-mode'
const ITEM_SORT_KEY = 'pkt-outfit-item-sort'
const LIST_COLUMNS_KEY = 'pkt-outfit-list-columns'
const SMALL_VIEWS_KEY = 'pkt-outfit-small-views'

function readChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return allowed.includes(value as T) ? (value as T) : fallback
  } catch {
    return fallback
  }
}

function persistChoice(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* 隐私模式/存储不可用时只影响下次启动的默认值 */
  }
}

function readSmallViews(): SmallViews {
  try {
    const raw = localStorage.getItem(SMALL_VIEWS_KEY)
    if (!raw) return { front: true, back: true }
    const parsed = JSON.parse(raw) as Partial<SmallViews>
    const next = { front: parsed.front !== false, back: parsed.back !== false }
    return next.front || next.back ? next : { front: true, back: true }
  } catch {
    return { front: true, back: true }
  }
}

function persistSmallViews(views: SmallViews): void {
  try {
    localStorage.setItem(SMALL_VIEWS_KEY, JSON.stringify(views))
  } catch {
    /* 隐私模式/存储不可用时只影响下次启动的默认值 */
  }
}

function readNumberChoice<T extends number>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = Number(localStorage.getItem(key)) as T
    return allowed.includes(value) ? value : fallback
  } catch {
    return fallback
  }
}

export interface OutfitState {
  sex: 1 | 2
  part: Part
  search: string
  scale: 2 | 3 | 4
  /** 进入搭配页时按预览区空间自动选缩放；手动点 2x/3x/4x 会关掉 */
  autoScale: boolean
  transparent: boolean
  worn: Partial<Record<Part, CatalogItem>>
  faceCode: string | null
  /** 是否播放动态物品（眼镜/帽子/连身的逐帧动画） */
  playing: boolean
  /** 分类栏排布：竖排侧栏 / 横排顶栏 */
  categoryLayout: CategoryLayout
  /** 物品列表缩略图：大模型（100×150）/ 小模型（40×60） */
  itemDisplay: ItemDisplay
  /** 预览区显示：只有大图 / 只有小图 / 两张一起 */
  previewMode: PreviewMode
  /** 物品列表排序；默认最新（serial 从大到小） */
  itemSort: ItemSort
  /** 列表每行数量；0 = 自动 */
  listColumns: ListColumns
  /** 小模型显示正面/背面；至少保留一面 */
  smallViews: SmallViews

  setSex: (sex: 1 | 2) => void
  setPart: (part: Part) => void
  setSearch: (search: string) => void
  setScale: (scale: 2 | 3 | 4) => void
  setAutoScale: (autoScale: boolean) => void
  applyAutoScale: (scale: 2 | 3 | 4) => void
  setTransparent: (transparent: boolean) => void
  setFace: (code: string | null) => void
  togglePlaying: () => void
  toggleCategoryLayout: () => void
  setItemDisplay: (display: ItemDisplay) => void
  setPreviewMode: (mode: PreviewMode) => void
  setItemSort: (sort: ItemSort) => void
  setListColumns: (columns: ListColumns) => void
  setSmallView: (view: SmallView, enabled: boolean) => void
  /** 已穿着则脱下，否则穿上。 */
  toggle: (item: CatalogItem) => void
  unequip: (part: Part) => void
  clear: () => void
  /** 从存档恢复：按部位替换已穿戴列表。 */
  applySaved: (input: {
    sex: 1 | 2
    faceCode: string | null
    worn: Partial<Record<Part, CatalogItem>>
  }) => void
}

export const useOutfitStore = create<OutfitState>((set) => ({
  sex: 2,
  part: 'hair',
  search: '',
  scale: 2,
  autoScale: true,
  transparent: true,
  worn: {},
  faceCode: null,
  playing: true,
  categoryLayout: readChoice(CATEGORY_LAYOUT_KEY, ['vertical', 'horizontal'] as const, 'horizontal'),
  itemDisplay: readChoice(ITEM_DISPLAY_KEY, ['large', 'small'] as const, 'large'),
  previewMode: readChoice(PREVIEW_MODE_KEY, ['large', 'small', 'both'] as const, 'both'),
  itemSort: readChoice(ITEM_SORT_KEY, ['newest', 'oldest', 'name'] as const, 'newest'),
  listColumns: readNumberChoice(LIST_COLUMNS_KEY, LIST_COLUMN_OPTIONS, 0),
  smallViews: readSmallViews(),

  setSex: (sex) => set({ sex }),
  setPart: (part) => set({ part }),
  setSearch: (search) => set({ search }),
  setScale: (scale) => set({ scale, autoScale: false }),
  setAutoScale: (autoScale) => set({ autoScale }),
  applyAutoScale: (scale) => set({ scale }),
  setTransparent: (transparent) => set({ transparent }),
  setFace: (faceCode) => set({ faceCode }),
  togglePlaying: () => set((state) => ({ playing: !state.playing })),
  toggleCategoryLayout: () =>
    set((state) => {
      const categoryLayout: CategoryLayout =
        state.categoryLayout === 'vertical' ? 'horizontal' : 'vertical'
      persistChoice(CATEGORY_LAYOUT_KEY, categoryLayout)
      return { categoryLayout }
    }),
  setItemDisplay: (itemDisplay) => {
    persistChoice(ITEM_DISPLAY_KEY, itemDisplay)
    set({ itemDisplay })
  },
  setPreviewMode: (previewMode) => {
    persistChoice(PREVIEW_MODE_KEY, previewMode)
    set({ previewMode })
  },
  setItemSort: (itemSort) => {
    persistChoice(ITEM_SORT_KEY, itemSort)
    set({ itemSort })
  },
  setListColumns: (listColumns) => {
    persistChoice(LIST_COLUMNS_KEY, String(listColumns))
    set({ listColumns })
  },
  setSmallView: (view, enabled) =>
    set((state) => {
      const smallViews: SmallViews = { ...state.smallViews, [view]: enabled }
      // 必须保留一面，另一面关闭的请求直接忽略。
      if (!smallViews.front && !smallViews.back) return state
      persistSmallViews(smallViews)
      return { smallViews }
    }),

  toggle: (item) =>
    set((state) => {
      const current = state.worn[item.part]
      if (current?.code === item.code) {
        const worn = { ...state.worn }
        delete worn[item.part]
        return { worn }
      }
      return { worn: { ...state.worn, [item.part]: item } }
    }),

  unequip: (part) =>
    set((state) => {
      const worn = { ...state.worn }
      delete worn[part]
      return { worn }
    }),

  clear: () => set({ worn: {}, faceCode: null }),

  applySaved: ({ sex, faceCode, worn }) => set({ sex, faceCode, worn }),
}))
