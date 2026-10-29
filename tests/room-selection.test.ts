import { beforeEach, describe, expect, it } from 'vitest'

import { useRoomStore } from '../src/renderer/features/room/state/room-store'
import { canStackOn, footprintRect, normalizeRect, selectInRect } from '../src/engine/room/index'
import type { FurniInstance, RoomSpec } from '../src/engine/room'

/**
 * 多选、对齐、批量操作（M9）。
 *
 * 对齐语义：所有选中物件对齐到**主选中**（最后点的那件）所在的列/行。
 */

const room: RoomSpec = {
  type: 101,
  category: 1,
  rows: 16,
  cols: 20,
  tile: 1,
  wall: 1,
  door: 1,
  bg: 1,
}

const make = (uid: string, x: number, y: number): FurniInstance => ({
  uid,
  code: 'tab0001',
  x,
  y,
  dir: 3,
  wallLoc: null,
  surface: null,
  state: 0,
})

describe('多选与对齐', () => {
  beforeEach(() => {
    useRoomStore.setState({
      room,
      furni: [make('a', 2, 2), make('b', 5, 6), make('c', 8, 3)],
      actors: [],
      selected: null,
      selection: [],
      selectedActor: null,
      past: [],
      future: [],
    })
  })

  it('select 单选，toggleSelect 增减，selectMany 批量', () => {
    const store = useRoomStore.getState()
    store.select('a')
    expect(useRoomStore.getState().selection).toEqual(['a'])

    store.toggleSelect('b')
    expect(useRoomStore.getState().selection).toEqual(['a', 'b'])
    expect(useRoomStore.getState().selected).toBe('b')

    store.toggleSelect('a')
    expect(useRoomStore.getState().selection).toEqual(['b'])

    store.selectMany(['a', 'c'])
    expect(useRoomStore.getState().selected).toBe('c')
  })

  it('同列对齐：其余物件 x 都等于主选中', () => {
    const store = useRoomStore.getState()
    store.selectMany(['a', 'b', 'c'])
    store.alignSelection('left')
    const furni = useRoomStore.getState().furni
    expect(furni.filter((item) => item.uid !== 'c').every((item) => item.x === 8)).toBe(true)
  })

  it('同行对齐：y 对齐到主选中', () => {
    const store = useRoomStore.getState()
    store.selectMany(['a', 'b', 'c'])
    store.alignSelection('top')
    const furni = useRoomStore.getState().furni
    expect(furni.filter((item) => item.uid !== 'c').every((item) => item.y === 3)).toBe(true)
  })

  it('叠到一点：全部落到主选中格子', () => {
    const store = useRoomStore.getState()
    store.selectMany(['a', 'b'])
    store.alignSelection('center')
    const furni = useRoomStore.getState().furni
    expect(furni.find((item) => item.uid === 'a')).toMatchObject({ x: 5, y: 6 })
  })

  it('批量平移 / 转向 / 删除，且只影响选中的', () => {
    const store = useRoomStore.getState()
    store.selectMany(['a', 'b'])
    store.moveSelection(1, 2)
    let furni = useRoomStore.getState().furni
    expect(furni.find((item) => item.uid === 'a')).toMatchObject({ x: 3, y: 4 })
    expect(furni.find((item) => item.uid === 'c')).toMatchObject({ x: 8, y: 3 })

    store.rotateSelection()
    furni = useRoomStore.getState().furni
    expect(furni.find((item) => item.uid === 'a')!.dir).toBe(5)
    expect(furni.find((item) => item.uid === 'c')!.dir).toBe(3)

    store.removeSelection()
    furni = useRoomStore.getState().furni
    expect(furni.map((item) => item.uid)).toEqual(['c'])
    expect(useRoomStore.getState().selection).toEqual([])
  })

  it('批量操作可以撤销', () => {
    const store = useRoomStore.getState()
    store.selectMany(['a', 'b'])
    store.moveSelection(1, 1)
    useRoomStore.getState().undo()
    expect(useRoomStore.getState().furni.find((item) => item.uid === 'a')).toMatchObject({
      x: 2,
      y: 2,
    })
  })
})

describe('框选与叠放（engine）', () => {
  const def = { rows: 2, cols: 2 }

  it('占地矩形按朝向互换', () => {
    expect(footprintRect({ uid: 'a', x: 3, y: 4, dir: 3, def })).toEqual({
      x0: 3,
      x1: 4,
      y0: 4,
      y1: 5,
    })
    expect(footprintRect({ uid: 'a', x: 3, y: 4, dir: 5, def })).toEqual({
      x0: 3,
      x1: 4,
      y0: 4,
      y1: 5,
    })
    const uneven = { rows: 1, cols: 3 }
    expect(footprintRect({ uid: 'a', x: 0, y: 0, dir: 3, def: uneven })).toEqual({
      x0: 0,
      x1: 2,
      y0: 0,
      y1: 0,
    })
    // dir 7 是原始朝向，dir 5 才互换
    expect(footprintRect({ uid: 'a', x: 0, y: 0, dir: 7, def: uneven })).toEqual({
      x0: 0,
      x1: 2,
      y0: 0,
      y1: 0,
    })
    expect(footprintRect({ uid: 'a', x: 0, y: 0, dir: 5, def: uneven })).toEqual({
      x0: 0,
      x1: 0,
      y0: 0,
      y1: 2,
    })
  })

  it('框选命中占地而不是锚点', () => {
    const items = [
      { uid: 'sofa', x: 2, y: 2, dir: 3 as const, def: { rows: 1, cols: 3 } },
      { uid: 'far', x: 9, y: 9, dir: 3 as const, def: { rows: 1, cols: 1 } },
    ]
    // 矩形只盖住沙发第 3 格（锚点在 2,2）
    const hit = selectInRect(items, normalizeRect({ x: 4, y: 2 }, { x: 5, y: 3 }))
    expect(hit).toEqual(['sofa'])
  })

  it('单格点一下不算框选，挂墙件不参与框选', () => {
    const items = [{ uid: 'a', x: 1, y: 1, dir: 3 as const, def }]
    expect(selectInRect(items, normalizeRect({ x: 1, y: 1 }, { x: 1, y: 1 }))).toEqual([])
    expect(
      selectInRect(items, normalizeRect({ x: 0, y: 0 }, { x: 4, y: 4 }), {
        wallUids: new Set(['a']),
      }),
    ).toEqual([])
  })

  it('叠放规则跟官方一致：底座 otherOverMe>0 且上层 meOverOther', () => {
    expect(canStackOn({ otherOverMe: 1 }, { meOverOther: true })).toBe(true)
    expect(canStackOn({ otherOverMe: 0 }, { meOverOther: true })).toBe(false)
    expect(canStackOn({ otherOverMe: 2 }, { meOverOther: false })).toBe(false)
    expect(canStackOn(null, { meOverOther: true })).toBe(false)
  })
})
