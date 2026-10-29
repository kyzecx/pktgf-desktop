import { create } from 'zustand'

import type { RoomDirection } from '@shared/contract'
import type { ActorInstance, FurniInstance, RoomSpec } from '@engine/room'

/**
 * 装修场景状态。
 *
 * 只存「用户可编辑的东西」（房间 + 家具 + 角色），派生数据（占用图、绘制顺序）
 * 在渲染时按需重算；历史记录用整表快照，200 件量级下足够快也足够简单。
 */

const HISTORY_LIMIT = 60

interface Snapshot {
  furni: FurniInstance[]
  actors: ActorInstance[]
}

export interface RoomSceneState {
  room: RoomSpec | null
  furni: FurniInstance[]
  actors: ActorInstance[]
  /** 主选中（第一件）；多选时它就是「锚点物件」 */
  selected: string | null
  /** 全部选中的家具 uid（含主选中），按点选顺序 */
  selection: string[]
  /** 当前选中的角色（点地板让它走过去） */
  selectedActor: string | null
  past: Snapshot[]
  future: Snapshot[]
}

interface RoomStore extends RoomSceneState {
  setRoom: (room: RoomSpec) => void
  addFurni: (instance: FurniInstance) => void
  moveFurni: (uid: string, x: number, y: number) => void
  rotateFurni: (uid: string) => void
  removeFurni: (uid: string) => void
  select: (uid: string | null) => void
  /** Shift 点选：在已选中/未选中之间切换 */
  toggleSelect: (uid: string) => void
  /** 批量选中（框选/图层面板） */
  selectMany: (uids: string[]) => void
  /** 方向上/下/左/右对齐；axis=both 时叠到主选中那一格 */
  alignSelection: (mode: 'left' | 'right' | 'top' | 'bottom' | 'center') => void
  /** 批量删除 / 批量旋转 */
  removeSelection: () => void
  rotateSelection: () => void
  /** 整体平移（多选拖动） */
  moveSelection: (dx: number, dy: number) => void
  addActor: (actor: ActorInstance) => void
  removeActor: (uid: string) => void
  selectActor: (uid: string | null) => void
  /** 走动后的落点：不记历史（行走过程由渲染层驱动） */
  placeActor: (uid: string, x: number, y: number, dir: RoomDirection) => void
  setActorClip: (uid: string, clipId: string | null) => void
  /** 家具状态（官方 furniState）：驱动开合/动画，随存档持久化 */
  setFurniState: (uid: string, state: number) => void
  /** 直接设定朝向（编辑浮层的四个方向按钮） */
  setFurniDir: (uid: string, dir: RoomDirection) => void
  /** 叠放：把某件放到另一件的第几个面上（index 由槽位表决定） */
  setFurniSurface: (uid: string, surface: { parent: string; index: number } | null) => void
  /** 角色坐/躺依附的家具 */
  setActorSeat: (uid: string, seat: { uid: string; surfaceIndex: number } | null) => void
  undo: () => void
  redo: () => void
  reset: (room: RoomSpec) => void
  /** 读档 / 导入存档：整场替换，不产生撤销步 */
  loadScene: (scene: { room: RoomSpec; furni: FurniInstance[]; actors: ActorInstance[] }) => void
}

let uidSeed = 0

/** 场景内唯一 id：时间戳 + 自增，够用且可读。 */
export function nextFurniUid(): string {
  uidSeed += 1
  return `f${Date.now().toString(36)}${uidSeed.toString(36)}`
}

/** 官方旋转顺序 3 → 5 → 7 → 1（`Furni.tryToTurn`）。 */
export function rotateDirection(dir: RoomDirection): RoomDirection {
  const order: RoomDirection[] = [3, 5, 7, 1]
  const index = order.indexOf(dir)
  return order[(index + 1) % order.length] ?? 3
}

/** 删除后清理选中集合。 */
function dropSelection(
  state: { selected: string | null; selection: string[] },
  removed: string[],
): { selected: string | null; selection: string[] } {
  const selection = state.selection.filter((uid) => !removed.includes(uid))
  return { selection, selected: selection[selection.length - 1] ?? null }
}

export const useRoomStore = create<RoomStore>((set, get) => {
  /** 提交一次可撤销的改动。 */
  const commit = (mutate: (state: RoomStore) => Partial<RoomStore>): void => {
    set((state) => {
      const next = mutate(state)
      return {
        ...next,
        past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
        future: [],
      }
    })
  }

  return {
    room: null,
    furni: [],
    actors: [],
    selected: null,
    selection: [],
    selectedActor: null,
    past: [],
    future: [],

    setRoom: (room) => set({ room }),

    addFurni: (instance) =>
      commit((state) => ({
        furni: [...state.furni, instance],
        selected: instance.uid,
        selection: [instance.uid],
      })),

    moveFurni: (uid, x, y) =>
      set((state) => {
        const index = state.furni.findIndex((item) => item.uid === uid)
        const current = index >= 0 ? state.furni[index]! : null
        if (!current || (current.x === x && current.y === y)) return state
        const next = state.furni.slice()
        next[index] = { ...current, x, y }
        return {
          furni: next,
          past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
          future: [],
        }
      }),

    rotateFurni: (uid) =>
      set((state) => {
        const index = state.furni.findIndex((item) => item.uid === uid)
        const current = index >= 0 ? state.furni[index]! : null
        if (!current) return state
        const next = state.furni.slice()
        next[index] = { ...current, dir: rotateDirection(current.dir) }
        return {
          furni: next,
          past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
          future: [],
        }
      }),

    removeFurni: (uid) =>
      commit((state) => ({
        furni: state.furni.filter((item) => item.uid !== uid),
        ...dropSelection(state, [uid]),
      })),

    select: (uid) => set({ selected: uid, selection: uid ? [uid] : [] }),

    toggleSelect: (uid) =>
      set((state) => {
        const has = state.selection.includes(uid)
        const selection = has
          ? state.selection.filter((item) => item !== uid)
          : [...state.selection, uid]
        return { selection, selected: selection[selection.length - 1] ?? null }
      }),

    selectMany: (uids) => set({ selection: uids, selected: uids[uids.length - 1] ?? null }),

    alignSelection: (mode) =>
      commit((state) => {
        const anchor = state.furni.find((item) => item.uid === state.selected)
        if (!anchor || state.selection.length < 2) return {}
        const moving = state.furni.filter(
          (item) => item.uid !== anchor.uid && state.selection.includes(item.uid),
        )
        const shifted = new Map(
          moving.map((item) => {
            if (mode === 'left') return [item.uid, { x: anchor.x, y: item.y }] as const
            if (mode === 'right') return [item.uid, { x: anchor.x, y: item.y }] as const
            if (mode === 'top') return [item.uid, { x: item.x, y: anchor.y }] as const
            if (mode === 'bottom') return [item.uid, { x: item.x, y: anchor.y }] as const
            return [item.uid, { x: anchor.x, y: anchor.y }] as const
          }),
        )
        return {
          furni: state.furni.map((item) => {
            const next = shifted.get(item.uid)
            return next ? { ...item, ...next } : item
          }),
        }
      }),

    removeSelection: () =>
      commit((state) => ({
        furni: state.furni.filter((item) => !state.selection.includes(item.uid)),
        selected: null,
        selection: [],
      })),

    rotateSelection: () =>
      commit((state) => ({
        furni: state.furni.map((item) =>
          state.selection.includes(item.uid) ? { ...item, dir: rotateDirection(item.dir) } : item,
        ),
      })),

    moveSelection: (dx, dy) =>
      commit((state) =>
        dx === 0 && dy === 0
          ? {}
          : {
              furni: state.furni.map((item) =>
                state.selection.includes(item.uid)
                  ? { ...item, x: item.x + dx, y: item.y + dy }
                  : item,
              ),
            },
      ),

    addActor: (actor) =>
      commit((state) => ({ actors: [...state.actors, actor], selectedActor: actor.uid })),

    removeActor: (uid) =>
      commit((state) => ({
        actors: state.actors.filter((item) => item.uid !== uid),
        selectedActor: state.selectedActor === uid ? null : state.selectedActor,
      })),

    selectActor: (uid) => set({ selectedActor: uid }),

    placeActor: (uid, x, y, dir) =>
      set((state) => ({
        actors: state.actors.map((item) => (item.uid === uid ? { ...item, x, y, dir } : item)),
      })),

    setActorClip: (uid, clipId) =>
      set((state) => ({
        actors: state.actors.map((item) => (item.uid === uid ? { ...item, clipId } : item)),
      })),

    setFurniDir: (uid, dir) =>
      set((state) => ({
        furni: state.furni.map((item) => (item.uid === uid ? { ...item, dir } : item)),
      })),

    setFurniSurface: (uid, surface) =>
      commit((state) => ({
        furni: state.furni.map((item) => (item.uid === uid ? { ...item, surface } : item)),
      })),

    setFurniState: (uid, nextState) =>
      set((state) => ({
        furni: state.furni.map((item) => (item.uid === uid ? { ...item, state: nextState } : item)),
      })),

    setActorSeat: (uid, seat) =>
      set((state) => ({
        actors: state.actors.map((item) => (item.uid === uid ? { ...item, seat } : item)),
      })),

    undo: () => {
      const { past, future } = get()
      const previous = past[past.length - 1]
      if (!previous) return
      set((state) => ({
        furni: previous.furni,
        actors: previous.actors,
        past: past.slice(0, -1),
        future: [snapshot(state), ...future].slice(0, HISTORY_LIMIT),
        selected: null,
        selection: [],
      }))
    },

    redo: () => {
      const { past, future } = get()
      const next = future[0]
      if (!next) return
      set((state) => ({
        furni: next.furni,
        actors: next.actors,
        past: [...past, snapshot(state)].slice(-HISTORY_LIMIT),
        future: future.slice(1),
        selected: null,
        selection: [],
      }))
    },

    loadScene: (scene) =>
      set({
        room: scene.room,
        furni: scene.furni,
        actors: scene.actors,
        selected: null,
        selection: [],
        selectedActor: null,
        past: [],
        future: [],
      }),

    reset: (room) =>
      set({
        room,
        furni: [],
        actors: [],
        selected: null,
        selection: [],
        selectedActor: null,
        past: [],
        future: [],
      }),
  }
})

function snapshot(state: { furni: FurniInstance[]; actors: ActorInstance[] }): Snapshot {
  return { furni: state.furni, actors: state.actors }
}
