import { describe, expect, it } from 'vitest'

import {
  RoomModel,
  applyInteraction,
  enterPoints,
  facingForEnter,
  nearestEnterPoint,
  parseBehaviour,
  parseBehaviours,
  resolveInteraction,
} from '../src/engine/room/index'

/**
 * 家具交互（M5）。
 *
 * 期望值来自官方 `BehaviourVO`（`"sit 坐下 1"` 的解析）、
 * `setBehaviourByFunctionType`（functionType 额外行为）与 `fc.getEnterPointByDir`。
 */

describe('behaviour 解析', () => {
  it('拆成 动作名 / 中文名 / 权限 / 参数', () => {
    expect(parseBehaviour('sit 坐下 1')).toEqual({
      type: 'sit',
      name: '坐下',
      admin: 1,
      param: '',
    })
    expect(parseBehaviour('open 打开 2 custom')).toMatchObject({
      type: 'open',
      admin: 2,
      param: 'custom',
    })
  })

  it('多条行为用 & 分隔，空值忽略', () => {
    const list = parseBehaviours('open 打开 1&close 关闭 1')
    expect(list.map((entry) => entry.type)).toEqual(['open', 'close'])
    expect(parseBehaviours(null)).toEqual([])
    expect(parseBehaviours('')).toEqual([])
  })
})

describe('交互解析', () => {
  it('functionType 优先（Door → toggle）', () => {
    const def = resolveInteraction({
      behaviour: 'open 打开 1',
      functionType: 'Door',
      otherOverMe: 0,
    })
    expect(def.kind).toBe('toggle')
    expect(def.states).toBe(2)
    expect(def.label).toBe('打开')
  })

  it('GiftBox / RandomState3 → 多状态循环', () => {
    expect(
      resolveInteraction({ behaviour: null, functionType: 'GiftBox', otherOverMe: 0 }).kind,
    ).toBe('cycle')
    expect(
      resolveInteraction({ behaviour: null, functionType: 'RandomState3', otherOverMe: 0 }).states,
    ).toBe(3)
  })

  it('behaviour 里的 sit / lie 映射到坐躺', () => {
    const sit = resolveInteraction({ behaviour: 'sit 坐下 1', functionType: null, otherOverMe: 1 })
    expect(sit).toMatchObject({ kind: 'sit', clip: 'sit', surface: 0 })
    const lie = resolveInteraction({ behaviour: 'lie 躺下 1', functionType: null, otherOverMe: 0 })
    expect(lie).toMatchObject({ kind: 'lie', clip: 'lie' })
  })

  it('没有 behaviour 也没有 functionType 就是纯装饰', () => {
    expect(resolveInteraction({ behaviour: null, functionType: null, otherOverMe: 0 }).kind).toBe(
      'none',
    )
  })

  it('不认识的行为降级为 none，但保留中文名', () => {
    const def = resolveInteraction({
      behaviour: 'joinFishGame 参加钓鱼比赛 1',
      functionType: null,
      otherOverMe: 0,
    })
    expect(def.kind).toBe('none')
    expect(def.label).toBe('参加钓鱼比赛')
  })
})

describe('交互点', () => {
  const model = new RoomModel({ rows: 6, cols: 6 })

  it('四周一圈，且只保留可走格', () => {
    const points = enterPoints(model, { x: 2, y: 2 }, 2, 2)
    // 2×2 家具（rows=2, cols=2）四周共 8 个点
    expect(points).toHaveLength(8)
    expect(points).toContainEqual({ x: 1, y: 2 })
    expect(points).toContainEqual({ x: 4, y: 3 })
    expect(points).toContainEqual({ x: 2, y: 1 })
    expect(points).toContainEqual({ x: 3, y: 4 })
  })

  it('贴边时不会给出越界点', () => {
    const points = enterPoints(model, { x: 0, y: 0 }, 1, 1)
    expect(points.every((point) => point.x >= 0 && point.y >= 0)).toBe(true)
    expect(points).toHaveLength(2)
  })

  it('家具占位本身不算交互点', () => {
    const blocked = new RoomModel({ rows: 4, cols: 4 })
    blocked.occupy('t', { x0: 1, y0: 1, x1: 2, y1: 2 })
    const points = enterPoints(blocked, { x: 1, y: 1 }, 2, 2)
    expect(
      points.some((point) => point.x >= 1 && point.x <= 2 && point.y >= 1 && point.y <= 2),
    ).toBe(false)
  })

  it('挑最近的交互点，并给出面向家具的朝向', () => {
    const points = enterPoints(model, { x: 2, y: 2 }, 2, 2)
    const nearest = nearestEnterPoint(points, { x: 0, y: 2 })
    expect(nearest).toEqual({ x: 1, y: 2 })
    expect(facingForEnter(nearest!, { x: 2, y: 2 })).toBe(5)

    const fromRight = nearestEnterPoint(points, { x: 5, y: 3 })
    expect(fromRight).toEqual({ x: 4, y: 3 })
    expect(facingForEnter(fromRight!, { x: 2, y: 2 })).toBe(1)
  })
})

describe('交互执行', () => {
  const door = resolveInteraction({
    behaviour: 'open 打开 1',
    functionType: 'Door',
    otherOverMe: 0,
  })

  it('门在 0/1 之间翻', () => {
    expect(applyInteraction(door, 0).state).toBe(1)
    expect(applyInteraction(door, 1).state).toBe(0)
  })

  it('多状态家具循环', () => {
    const box = resolveInteraction({
      behaviour: null,
      functionType: 'RandomState3',
      otherOverMe: 0,
    })
    expect([0, 1, 2].map((state) => applyInteraction(box, state).state)).toEqual([1, 2, 0])
  })

  it('坐下不改变家具状态，只让角色就位', () => {
    const chair = resolveInteraction({
      behaviour: 'sit 坐下 1',
      functionType: null,
      otherOverMe: 0,
    })
    expect(applyInteraction(chair, 0)).toEqual({ state: 0, actor: { clip: 'sit', seat: true } })
  })
})
