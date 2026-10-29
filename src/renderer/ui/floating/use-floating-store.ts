import { create } from 'zustand'

/**
 * 全局浮窗管理。
 *
 * 任何功能都可以注册自己的浮窗 id：位置、层级、开关状态统一在这里，
 * 后续建造/家具页复用同一套行为，不用各写一份拖拽逻辑。
 */

export interface FloatingPosition {
  x: number
  y: number
}

const POSITION_KEY = 'pkt-floating-positions'

type Positions = Record<string, FloatingPosition>

function readPositions(): Positions {
  try {
    const raw = localStorage.getItem(POSITION_KEY)
    return raw ? (JSON.parse(raw) as Positions) : {}
  } catch {
    return {}
  }
}

function persist(positions: Positions): void {
  localStorage.setItem(POSITION_KEY, JSON.stringify(positions))
}

interface FloatingState {
  open: Record<string, boolean>
  positions: Positions
  /** 栈底在前，栈顶在后；用于点击置顶与 z-index */
  order: string[]

  toggle: (id: string) => void
  openWindow: (id: string) => void
  close: (id: string) => void
  moveTo: (id: string, position: FloatingPosition) => void
  focus: (id: string) => void
}

export const useFloatingStore = create<FloatingState>((set, get) => ({
  open: {},
  positions: readPositions(),
  order: [],

  toggle: (id) => {
    const isOpen = get().open[id]
    if (isOpen) get().close(id)
    else get().openWindow(id)
  },

  openWindow: (id) =>
    set((state) => ({
      open: { ...state.open, [id]: true },
      order: [...state.order.filter((entry) => entry !== id), id],
    })),

  close: (id) => set((state) => ({ open: { ...state.open, [id]: false } })),

  moveTo: (id, position) => {
    const positions = { ...get().positions, [id]: position }
    persist(positions)
    set({ positions })
  },

  focus: (id) =>
    set((state) => ({
      order:
        state.order[state.order.length - 1] === id
          ? state.order
          : [...state.order.filter((entry) => entry !== id), id],
    })),
}))
