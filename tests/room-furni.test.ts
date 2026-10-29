import { describe, expect, it } from 'vitest'

import type { RoomDirection } from '../src/shared/contract'

import {
  SortMgr2D,
  frameSuffix,
  furniAnchors,
  furniDims,
  furniOrigin,
  isJustBack,
  furniMaskSymbol,
  furniSurfaceSlots,
  maskOrigin,
  parsePointList,
  parseSurfaceLoc,
  resolveFurniSprite,
  surfaceItemOrigin,
  wallItemOrigin,
  type Sortable,
} from '../src/engine/room/index'

/**
 * 家具符号与深度排序的规格验证。
 *
 * 期望值来自官方 `FurniBitItem.getBmdFromImage`、`Furni.updateSprite/getBaseLoc`、
 * `SortMgr2D.isJustBack`，以及真实素材 cha0001 / tab0001 / bed0001 的实测尺寸。
 */

describe('家具符号解析', () => {
  const fourWay = { code: 'cha0001', dirable: 4 as const, symetric: true }
  const twoWayMirror = { code: 'cha0001', dirable: 2 as const, symetric: true }
  const oneWay = { code: 'bat0001', dirable: 1 as const, symetric: true }

  it('帧号补两位', () => {
    expect(frameSuffix(1)).toBe('01')
    expect(frameSuffix(9)).toBe('09')
    expect(frameSuffix(12)).toBe('12')
  })

  it('dir3 永远取自己的图', () => {
    expect(resolveFurniSprite(fourWay, 3)).toEqual({ symbol: 'cha0001_3_01', mirrored: false })
  })

  it('对称件的 dir5 用 dir3 的镜像', () => {
    expect(resolveFurniSprite(fourWay, 5)).toEqual({ symbol: 'cha0001_3_01', mirrored: true })
    expect(resolveFurniSprite(twoWayMirror, 5)).toEqual({
      symbol: 'cha0001_3_01',
      mirrored: true,
    })
  })

  it('单向家具只有 dir3，其余方向给 null', () => {
    expect(resolveFurniSprite(oneWay, 5)).toEqual({ symbol: 'bat0001_3_01', mirrored: true })
    expect(resolveFurniSprite(oneWay, 7)).toBeNull()
    expect(resolveFurniSprite(oneWay, 1)).toBeNull()
  })

  it('四向非对称件按方向取原图', () => {
    const asymmetric = { code: 'bed0001', dirable: 4 as const, symetric: false }
    expect(resolveFurniSprite(asymmetric, 7)).toEqual({ symbol: 'bed0001_7_01', mirrored: false })
    expect(resolveFurniSprite(asymmetric, 1)).toEqual({ symbol: 'bed0001_1_01', mirrored: false })
  })

  it('缺帧回退到 01；缺符号回退到镜像', () => {
    const available = new Set(['cha0001_3_01'])
    expect(resolveFurniSprite(fourWay, 3, 5, available)).toEqual({
      symbol: 'cha0001_3_01',
      mirrored: false,
    })
    // dir7 没有图 → 退回 dir3 的镜像
    const fourWayAsym = { code: 'cha0001', dirable: 4 as const, symetric: false }
    expect(resolveFurniSprite(fourWayAsym, 7, 1, available)).toBeNull()
  })
})

describe('锚点与摆放', () => {
  it('锚点按官方公式做 rows/cols 与 quad 修正', () => {
    // cha0001：rows=2 cols=4 baseLoc "28 37&29 34"，图 56×50
    const anchors = furniAnchors(
      { baseLoc: '28 37&29 34', rows: 2, cols: 4, dirable: 4, position: 1 },
      { width: 56, height: 50 },
    )
    // dir3: 28 + 5*(2-4) = 18，37 - 2.5*(2+4) = 22
    expect(anchors[3]).toEqual({ x: 18, y: 22 })
    // dir7: 29 + 5*(2-4) = 19，34 - 15 = 19
    expect(anchors[7]).toEqual({ x: 19, y: 19 })
    // dir5 / dir1 是图片宽度的镜像
    expect(anchors[5]).toEqual({ x: 56 - 18, y: 22 })
    expect(anchors[1]).toEqual({ x: 56 - 19, y: 19 })
  })

  it('bed0001 的锚点与实测一致', () => {
    const anchors = furniAnchors(
      { baseLoc: '39 48', rows: 5, cols: 3, dirable: 2, position: 1 },
      { width: 78, height: 67 },
    )
    expect(anchors[3]).toEqual({ x: 49, y: 28 })
    expect(anchors[7]).toEqual(anchors[3])
  })

  it('挂墙家具以图片中心为锚点', () => {
    const anchors = furniAnchors(
      { baseLoc: '0 0', rows: 1, cols: 1, dirable: 2, position: 3 },
      { width: 36, height: 81 },
    )
    expect(anchors[3]).toEqual({ x: 18, y: 40 })
  })

  it('屏幕坐标 = 格点投影 + 地板原点 − 锚点 + 20（官方约定）', () => {
    const anchors = furniAnchors(
      { baseLoc: '28 37&29 34', rows: 2, cols: 4, dirable: 4, position: 1 },
      { width: 56, height: 50 },
    )
    const origin = furniOrigin({ x: 6, y: 8 }, 3, anchors, { floorTop: { x: 435, y: 236 } })
    // (6-8)*10 + 435 - 18 + 20 = 417；(6+8)*5 + 236 - 22 = 284
    expect(origin).toEqual({ x: 417, y: 284 })
  })
})

describe('surfaceLoc 解析', () => {
  it('按 & 分方向、$ 分面', () => {
    const groups = parseSurfaceLoc('16 23$33 32&37 26$18 20')
    expect(groups).toHaveLength(2)
    expect(groups?.[0]).toEqual([
      { x: 16, y: 23 },
      { x: 33, y: 32 },
    ])
    expect(groups?.[1]?.[1]).toEqual({ x: 18, y: 20 })
  })

  it('空串与非法值', () => {
    expect(parseSurfaceLoc(null)).toBeNull()
    expect(parseSurfaceLoc('')).toBeNull()
    expect(parsePointList('1 2')).toEqual([{ x: 1, y: 2 }])
  })
})

describe('深度排序', () => {
  const item = (over: Partial<Sortable> & Pick<Sortable, 'id' | 'top'>): Sortable => ({
    rows: 2,
    cols: 2,
    parentId: null,
    overMe: 0,
    ...over,
  })

  it('isJustBack：x 与 b.x+cols、y 与 b.y+rows 比较', () => {
    const a = item({ id: 'a', top: { x: 0, y: 0 } })
    const b = item({ id: 'b', top: { x: 4, y: 4 } })
    expect(isJustBack(a, b)).toBe(true)
    expect(isJustBack(b, a)).toBe(false)
    // 刚好贴着边界（x = b.x + cols）不算在后面
    const edge = item({ id: 'c', top: { x: 6, y: 4 } })
    expect(isJustBack(edge, b)).toBe(false)
    // 占地相交时两边都为真：官方靠插入顺序决定，不是严格偏序
    const overlap = item({ id: 'd', top: { x: 5, y: 5 } })
    expect(isJustBack(overlap, b)).toBe(true)
    expect(isJustBack(b, overlap)).toBe(true)
  })

  it('同位置两次插入：后插入的排在后面（官方行为）', () => {
    const sorter = new SortMgr2D<Sortable>()
    const a = item({ id: 'a', top: { x: 4, y: 4 } })
    const b = item({ id: 'b', top: { x: 4, y: 4 } })
    sorter.insert(a)
    sorter.insert(b)
    // isJustBack(b, a) 为真 → b 插到 a 前面（更靠后绘制）
    expect(sorter.order.map((entry) => entry.id)).toEqual(['b', 'a'])
    // 重新插一次 a：又跑到 b 前面 → 说明完全由插入顺序决定
    sorter.refresh('a')
    expect(sorter.order.map((entry) => entry.id)).toEqual(['a', 'b'])
  })

  it('靠后的位置插到前面', () => {
    const sorter = new SortMgr2D<Sortable>()
    const front = item({ id: 'front', top: { x: 8, y: 8 } })
    const back = item({ id: 'back', top: { x: 0, y: 0 } })
    sorter.insert(front)
    sorter.insert(back)
    expect(sorter.order.map((entry) => entry.id)).toEqual(['back', 'front'])
  })

  it('叠放：子物件永远排在父物件后面，并按面序号排', () => {
    const table = item({ id: 'table', top: { x: 2, y: 2 }, overMe: 1, rows: 4, cols: 4 })
    const cup = item({ id: 'cup', top: { x: 2, y: 2 }, parentId: 'table', surfaceIndex: 1 })
    const plate = item({ id: 'plate', top: { x: 2, y: 2 }, parentId: 'table', surfaceIndex: 0 })
    const behind = item({ id: 'behind', top: { x: 0, y: 0 } })

    const slots = new Map([
      [0, { x: 4, y: 6 }],
      [1, { x: 2, y: 1 }],
    ])
    const sorter = new SortMgr2D<Sortable>({
      childrenOf: (parent) =>
        [cup, plate]
          .filter((child) => child.parentId === parent.id)
          .map((child) => ({ item: child, index: child.surfaceIndex ?? 0 })),
      slotOf: (_parent, index) => slots.get(index) ?? null,
    })

    sorter.insert(behind)
    sorter.insert(table)
    sorter.insert(cup)
    sorter.insert(plate)

    const order = sorter.order.map((entry) => entry.id)
    expect(order[0]).toBe('behind')
    expect(order[1]).toBe('table')
    // 面 1 的排序点 y 更小 → 排在面 0 之前
    expect(order.slice(2)).toEqual(['cup', 'plate'])
  })

  it('remove 后其余顺序不变', () => {
    const sorter = new SortMgr2D<Sortable>()
    sorter.insert(item({ id: 'a', top: { x: 0, y: 0 } }))
    sorter.insert(item({ id: 'b', top: { x: 6, y: 6 } }))
    sorter.remove('a')
    expect(sorter.order.map((entry) => entry.id)).toEqual(['b'])
  })
})

describe('叠放槽位与挂墙', () => {
  const table = {
    surfaceLoc: '16 23$33 32&37 26$18 20',
  }

  it('dir3 直接用第 0 组', () => {
    expect(furniSurfaceSlots(table, 3, 56)).toEqual([
      { x: 16, y: 23 },
      { x: 33, y: 32 },
    ])
  })

  it('dir5 是第 0 组的水平镜像', () => {
    expect(furniSurfaceSlots(table, 5, 56)).toEqual([
      { x: 40, y: 23 },
      { x: 23, y: 32 },
    ])
  })

  it('dir7 用第 1 组，dir1 是它的镜像', () => {
    expect(furniSurfaceSlots(table, 7, 56)).toEqual([
      { x: 37, y: 26 },
      { x: 18, y: 20 },
    ])
    expect(furniSurfaceSlots(table, 1, 56)).toEqual([
      { x: 19, y: 26 },
      { x: 38, y: 20 },
    ])
  })

  it('没有 surfaceLoc 时没有槽位', () => {
    expect(furniSurfaceSlots({ surfaceLoc: null }, 3, 56)).toEqual([])
  })

  it('挂墙件居中到墙板（+1/+2 官方微调）', () => {
    // 墙板 22×132，画 36×81（门/画框尺寸）
    // x: 100 + (22-36)/2 = 93 → +1 = 94
    // y: 50 + (132-81)/2 = 75.5 → 四舍五入 76 → +2 = 78
    expect(
      wallItemOrigin({ x: 100, y: 50, width: 22, height: 132 }, { width: 36, height: 81 }),
    ).toEqual({ x: 94, y: 78 })
  })

  it('叠放件坐标 = 父原点 − 子锚点 + 槽位', () => {
    expect(surfaceItemOrigin({ x: 500, y: 300 }, { x: 10, y: 20 }, { x: 16, y: 23 })).toEqual({
      x: 506,
      y: 303,
    })
  })
})

describe('遮罩符号（Posy / Bonsai）', () => {
  it('遮罩只有 _3_ / _7_ 原图，5 与 1 走镜像', () => {
    expect(furniMaskSymbol({ code: 'blo0100' }, 3, 1)).toEqual({
      symbol: 'blo0100_3_01m',
      mirrored: false,
    })
    expect(furniMaskSymbol({ code: 'blo0100' }, 5, 1)).toEqual({
      symbol: 'blo0100_3_01m',
      mirrored: true,
    })
    expect(furniMaskSymbol({ code: 'blo0100' }, 7, 2)).toEqual({
      symbol: 'blo0100_7_02m',
      mirrored: false,
    })
    expect(furniMaskSymbol({ code: 'blo0100' }, 1, 2)).toEqual({
      symbol: 'blo0100_7_02m',
      mirrored: true,
    })
  })

  it('缺帧回退到 01，缺符号返回 null', () => {
    const available = new Set(['blo0100_3_01m'])
    expect(furniMaskSymbol({ code: 'blo0100' }, 3, 5, available)).toEqual({
      symbol: 'blo0100_3_01m',
      mirrored: false,
    })
    expect(furniMaskSymbol({ code: 'blo0100' }, 7, 1, available)).toBeNull()
  })

  it('遮罩画在父物件原点（官方：父.position − 子.position 再加回子原点）', () => {
    expect(maskOrigin({ x: 120, y: 80 })).toEqual({ x: 120, y: 80 })
  })
})

describe('旋转后占地跟着转（官方 tryToTurn → swapRowCol）', () => {
  const sofa = {
    rows: 2,
    cols: 4,
    baseLoc: '0,0',
    dirable: 4 as const,
    position: 5,
  }

  it('dir 3 / 7 用原始占地，dir 1 / 5 行列互换', () => {
    expect(furniDims(sofa, 3)).toEqual({ rows: 2, cols: 4 })
    expect(furniDims(sofa, 7)).toEqual({ rows: 2, cols: 4 })
    expect(furniDims(sofa, 5)).toEqual({ rows: 4, cols: 2 })
    expect(furniDims(sofa, 1)).toEqual({ rows: 4, cols: 2 })
  })

  it('4 向依次转向：3→5→7→1 的占地是「原、换、原、换」', () => {
    const cycle: RoomDirection[] = [3, 5, 7, 1]
    const shape = cycle.map((dir) => {
      const dims = furniDims(sofa, dir)
      return `${dims.rows}×${dims.cols}`
    })
    expect(shape).toEqual(['2×4', '4×2', '2×4', '4×2'])
  })

  it('锚点补偿用有效占地（否则旋转后贴不到格点）', () => {
    const sprite = { width: 120, height: 90 }
    expect(furniAnchors(sofa, sprite, 3)).not.toEqual(furniAnchors(sofa, sprite, 5))
  })
})
