import { describe, expect, it } from 'vitest'

import {
  DIR_VECTORS,
  FLOOR_X_SHIFT,
  RoomModel,
  TILE_HEIGHT,
  TILE_TYPE,
  TILE_WIDTH,
  computeRoomLayout,
  computeSceneLayout,
  decodeRoomMap,
  buildFloorPieces,
  buildWallPieces,
  directionFromDelta,
  floorCellOrigin,
  footprint,
  footprintBounds,
  footprintCells,
  footprintInside,
  gridToPixel,
  mirrorDirection,
  nextDirection,
  normalizeDirection,
  pixelToCell,
  pixelToGrid,
  pixelToGridIndex,
} from '../src/engine/room/index'
import { createImage, flipHorizontal } from '../src/engine/image'
import { orientDoor } from '../src/engine/room/scene'
import type { CatalogRoomDef } from '../src/shared/contract'

/** 测试用的房型工厂：只覆盖关心的字段，避免每个用例重复 20 行。 */
function roomDef(patch: Partial<CatalogRoomDef> = {}): CatalogRoomDef {
  return {
    type: 101,
    category: 1,
    name: '基本房型1',
    rows: 3,
    cols: 4,
    entryX: 1,
    entryY: 1,
    entryDir: 5,
    exitX: 1,
    exitY: 1,
    exitDir: 5,
    defaultTile: 1,
    defaultWall: 1,
    defaultDoor: 1,
    defaultBg: 1,
    defaultStructure: 0,
    maxFurni: 200,
    wallHeight: 128,
    floorDepth: 8,
    wallDepth: 4,
    picWH: '',
    gridOffset: '',
    scene: null,
    tmx: null,
    ifDefaultImg: 0,
    combine: 1,
    ...patch,
  }
}

/**
 * 45° 网格的规格验证。
 *
 * 所有期望值都来自 Main_*.js 的常量与公式（docs/room-spec.md §1、§2）：
 *   tile_width = 20, tile_height = 10
 *   getItemPos(gx, gy) = ((gx-gy)*10, (gx+gy)*5)
 */

describe('网格换算', () => {
  it('单格是 20×10 的菱形包围盒', () => {
    expect(TILE_WIDTH).toBe(20)
    expect(TILE_HEIGHT).toBe(10)
  })

  it('格点按 (x-y)*10 / (x+y)*5 投影', () => {
    expect(gridToPixel(0, 0)).toEqual({ x: 0, y: 0 })
    expect(gridToPixel(1, 0)).toEqual({ x: 10, y: 5 })
    expect(gridToPixel(0, 1)).toEqual({ x: -10, y: 5 })
    expect(gridToPixel(3, 2)).toEqual({ x: 10, y: 25 })
  })

  it('像素与格点可以互逆', () => {
    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [5, 3],
      [12, 9],
    ] as const) {
      const px = gridToPixel(x, y)
      const back = pixelToGrid(px.x, px.y)
      expect(back.x).toBeCloseTo(x)
      expect(back.y).toBeCloseTo(y)
    }
  })

  it('像素取索引时两个分量各 +1（官方 getItemIndex）', () => {
    // 格点 (0,0) 的菱形左上角 → 索引 (1,1)
    expect(pixelToGridIndex(0, 0)).toEqual({ x: 1, y: 1 })
    // 格点 (2,1) → 偏移 10,-5
    const px = gridToPixel(2, 1)
    expect(pixelToGridIndex(px.x, px.y)).toEqual({ x: 3, y: 2 })
    // 官方先夹到 -1 再 +1，所以负坐标的索引是 0（不是 -1）
    expect(pixelToGridIndex(-100, -100)).toEqual({ x: 0, y: 0 })
  })
})

describe('朝向', () => {
  it('只认 1/3/5/7，其余回退 3', () => {
    expect(normalizeDirection(1)).toBe(1)
    expect(normalizeDirection(5)).toBe(5)
    expect(normalizeDirection(2)).toBe(3)
    expect(normalizeDirection(undefined)).toBe(3)
    expect(normalizeDirection(9)).toBe(3)
  })

  it('位移向量与官方 setMoveData 一致：5=+x 3=+y 1=-x 7=-y', () => {
    expect(DIR_VECTORS[5]).toEqual({ x: 1, y: 0 })
    expect(DIR_VECTORS[3]).toEqual({ x: 0, y: 1 })
    expect(DIR_VECTORS[1]).toEqual({ x: -1, y: 0 })
    expect(DIR_VECTORS[7]).toEqual({ x: 0, y: -1 })
  })

  it('位移反推朝向', () => {
    expect(directionFromDelta(1, 0)).toBe(5)
    expect(directionFromDelta(0, 1)).toBe(3)
    expect(directionFromDelta(-1, 0)).toBe(1)
    expect(directionFromDelta(0, -1)).toBe(7)
    expect(directionFromDelta(1, 1)).toBeNull()
  })

  it('镜像与旋转顺序', () => {
    expect(mirrorDirection(1)).toBe(5)
    expect(mirrorDirection(5)).toBe(1)
    expect(mirrorDirection(3)).toBe(7)
    expect(nextDirection(3)).toBe(5)
    expect(nextDirection(5)).toBe(7)
    expect(nextDirection(7)).toBe(1)
    expect(nextDirection(1)).toBe(3)
  })
})

describe('占地', () => {
  it('rows 沿 +y、cols 沿 +x（官方 gridW/gridH 的语义）', () => {
    const fp = footprint(4, 2, 5, 3) // rows=5, cols=3
    expect(fp).toEqual({ x0: 4, y0: 2, x1: 6, y1: 6 })
    expect(footprintCells(fp)).toHaveLength(15)
    expect(footprintInside(fp, 16, 20)).toBe(true)
    expect(footprintInside(fp, 5, 20)).toBe(false)
  })

  it('占地包围盒宽度 = (rows+cols)*10，高度 = (rows+cols)*5', () => {
    const bounds = footprintBounds(footprint(0, 0, 5, 3))
    expect(bounds.width).toBe((5 + 3) * 10)
    expect(bounds.height).toBe((5 + 3) * 5)
  })
})

describe('房间布局', () => {
  const room = roomDef({ rows: 16, cols: 20, type: 101 })

  it('包围盒 = 10*(cols+rows)+2*wallDepth × 5*(cols+rows)+wallHeight', () => {
    const layout = computeRoomLayout(room, { width: 950, height: 540 })
    expect(layout.boxWidth).toBe(10 * 36 + 8)
    expect(layout.boxHeight).toBe(5 * 36 + 128)
    expect(layout.originX).toBe(Math.floor((950 - layout.boxWidth) / 2))
    expect(layout.floorTop.y).toBe(layout.originY + 128 - 8)
  })

  it('叠加半格修正后，地板包围盒正好居中于房间包围盒', () => {
    const layout = computeRoomLayout(room, { width: 950, height: 540 })
    const model = new RoomModel({ rows: room.rows, cols: room.cols })
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const cell of model.floorCells()) {
      const p = floorCellOrigin(cell.x, cell.y, layout)
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x + TILE_WIDTH)
      minY = Math.min(minY, p.y)
      maxY = Math.max(maxY, p.y + TILE_HEIGHT)
    }
    // 水平居中（容差 0.5px）
    expect((minX + maxX) / 2).toBeCloseTo(layout.originX + layout.boxWidth / 2, 5)
    // 官方：floorTop 不加 10，地砖每格 +10 → 地板左边缘正好落在房间框内沿
    expect(minX - layout.originX).toBeCloseTo(room.wallDepth, 5)
    // 竖直方向：地板顶边比墙底低一个地板厚度（侧面正好补上那段高度）
    expect(minY).toBeCloseTo(layout.originY + room.wallHeight - room.floorDepth, 5)
    expect(maxY - minY).toBeCloseTo((room.rows + room.cols) * 5, 5)
    expect(maxY + room.floorDepth).toBeCloseTo(layout.originY + layout.boxHeight, 5)
    // 官方 `Floor.draw` 的右移只加在地砖上（1×1 时）
    expect(FLOOR_X_SHIFT).toBe(10)
  })

  it('同尺寸房间在更大舞台上居中', () => {
    const small = computeRoomLayout(room, { width: 950, height: 540 })
    const large = computeRoomLayout(room, { width: 1900, height: 1080 })
    expect(large.originX - small.originX).toBeGreaterThan(0)
    expect(large.floorTop.x - small.floorTop.x).toBe(large.originX - small.originX)
  })
})

describe('像素命中格子', () => {
  const layout = computeRoomLayout(roomDef(), { width: 950, height: 540 })

  it('每格中心点都能命中回自己（floorCellOrigin 的反函数）', () => {
    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [7, 5],
      [19, 15],
    ] as const) {
      const origin = floorCellOrigin(x, y, layout)
      const center = { x: origin.x + TILE_WIDTH / 2, y: origin.y + TILE_HEIGHT / 2 }
      expect(pixelToCell(center.x, center.y, layout)).toEqual({ x, y })
    }
  })

  it('邻居格子的中心会落到邻居（不会粘在边界）', () => {
    const origin = floorCellOrigin(5, 5, layout)
    // +x 邻居（右下）的菱形中心
    const right = pixelToCell(origin.x + TILE_WIDTH, origin.y + TILE_HEIGHT, layout)
    expect(right).toEqual({ x: 6, y: 5 })
    // +y 邻居（左下）的菱形中心
    const down = pixelToCell(origin.x, origin.y + TILE_HEIGHT, layout)
    expect(down).toEqual({ x: 5, y: 6 })
  })
})

describe('整图房布局', () => {
  it('拼接房调用 computeSceneLayout 直接返回 null（防止拿 (0,0) 当房间布局）', () => {
    const layout = computeSceneLayout(roomDef({ rows: 16, cols: 20, ifDefaultImg: 0 }), {
      width: 950,
      height: 540,
    })
    expect(layout).toBeNull()
  })

  it('整图房按 picWH 居中 + gridOffset 定位', () => {
    const layout = computeSceneLayout(
      roomDef({ picWH: '701 473', gridOffset: '350 130', ifDefaultImg: 1, rows: 32, cols: 32 }),
      { width: 950, height: 540 },
    )
    expect(layout?.image).toEqual({ x: 124, y: 33, width: 701, height: 473 })
    expect(layout?.floorTop).toEqual({ x: 474, y: 163 })
  })
})

describe('房间模型', () => {
  it('结构图解码保留 0（虚空）', () => {
    const map = decodeRoomMap('1,1,0&1,0,1')
    expect(map).toEqual([
      [1, 1, 0],
      [1, 0, 1],
    ])
  })

  it('结构图缺省时满铺地板', () => {
    const model = new RoomModel({ rows: 3, cols: 4 })
    expect(model.floorCells()).toHaveLength(12)
    expect(model.canWalk(0, 0)).toBe(true)
  })

  it('虚空不可走、不可放', () => {
    const model = new RoomModel({ rows: 2, cols: 3, map: decodeRoomMap('1,1,0&1,1,1') })
    expect(model.exists(2, 0)).toBe(false)
    expect(model.canWalk(2, 0)).toBe(false)
    expect(model.canPlace(2, 0, 1, 1)).toBe(false)
  })

  it('占地越界或压到已有家具时拒绝放置', () => {
    const model = new RoomModel({ rows: 4, cols: 4 })
    expect(model.canPlace(0, 0, 2, 2)).toBe(true)
    model.occupy('a', footprint(0, 0, 2, 2))
    expect(model.canPlace(1, 1, 2, 2)).toBe(false)
    expect(model.canPlace(3, 3, 2, 2)).toBe(false)
    expect(model.occupantAt(1, 1)).toBe('a')
    model.release('a')
    expect(model.canPlace(1, 1, 2, 2)).toBe(true)
  })

  it('地毯（104）可放可走，家具占位后不可走', () => {
    const map = [
      [TILE_TYPE.floor, TILE_TYPE.rug],
      [TILE_TYPE.floor, TILE_TYPE.floor],
    ]
    const model = new RoomModel({ rows: 2, cols: 2, map })
    expect(model.canPlace(1, 0, 1, 1)).toBe(true)
    expect(model.canWalk(1, 0)).toBe(true)
    model.occupy('plant', footprint(1, 0, 1, 1))
    expect(model.canWalk(1, 0)).toBe(false)
  })

  it('贴墙判定：背后整排是虚空才返回 3', () => {
    // 第 0 行是虚空，第 1 行开始是地板
    const model = new RoomModel({
      rows: 3,
      cols: 3,
      map: decodeRoomMap('0,0,0&1,1,1&1,1,1'),
    })
    expect(model.placeAgainstWall(0, 1, 1, 1, 3)).toBe(3)
    expect(model.placeAgainstWall(1, 2, 1, 1, 3)).toBe(-1)
    // 左侧整列是虚空时返回 5（注意 y=0 的物件官方一律返回 3）
    const edge = new RoomModel({
      rows: 3,
      cols: 3,
      map: decodeRoomMap('0,1,1&0,1,1&0,1,1'),
    })
    expect(edge.placeAgainstWall(1, 0, 1, 1, 3)).toBe(3)
    expect(edge.placeAgainstWall(1, 1, 1, 1, 3)).toBe(5)
  })
})

describe('地面拼块', () => {
  const tileRoom = roomDef()
  const layout = computeRoomLayout(tileRoom, { width: 950, height: 540 })
  const map = [
    [1, 1, 1, 1],
    [1, 1, 1, 1],
    [1, 1, 1, 1],
  ]

  it('满铺矩形：只有左上角是 top，两条后边分别是 right / left，其余是 center', () => {
    const pieces = buildFloorPieces(map, layout)
    expect(pieces).toHaveLength(12)
    const at = (x: number, y: number) =>
      pieces.find((piece) => piece.cell.x === x && piece.cell.y === y)?.variant

    expect(at(0, 0)).toBe('top')
    expect(at(1, 0)).toBe('right')
    expect(at(3, 0)).toBe('right')
    expect(at(0, 1)).toBe('left')
    expect(at(0, 2)).toBe('left')
    expect(at(1, 1)).toBe('center')
    expect(at(3, 2)).toBe('center')
  })

  it('拼块坐标与 floorCellOrigin 完全一致', () => {
    for (const piece of buildFloorPieces(map, layout)) {
      const origin = floorCellOrigin(piece.cell.x, piece.cell.y, layout)
      expect({ x: piece.x, y: piece.y }).toEqual(origin)
    }
  })

  it('缺角时按邻居重新判定（L 形）', () => {
    const lShape = [
      [0, 1, 1, 1],
      [0, 1, 1, 1],
      [0, 0, 1, 1],
    ]
    const pieces = buildFloorPieces(lShape, layout)
    expect(pieces).toHaveLength(8)
    const at = (x: number, y: number) =>
      pieces.find((piece) => piece.cell.x === x && piece.cell.y === y)?.variant
    // (1,0)：上方无地板且左侧无地板 → 墙角 top
    expect(at(1, 0)).toBe('top')
    // (2,0)：上方无地板、左侧有地板 → right
    expect(at(2, 0)).toBe('right')
    // (2,2)：左边是空洞 → left
    expect(at(2, 2)).toBe('left')
    // (3,2)：左上方都有地板 → center
    expect(at(3, 2)).toBe('center')
  })

  it('2×2 地板图按两格步进', () => {
    // 4 列 × 3 行按两格采样 → 2×2 个拼块
    const pieces = buildFloorPieces(map, layout, { tileCells: 2 })
    expect(pieces).toHaveLength(4)
  })
})

describe('墙面拼块', () => {
  const room = {
    wallHeight: 128,
    wallDepth: 4,
    category: 1,
    combine: 1,
  }
  const layout = computeRoomLayout(roomDef({ rows: 16, cols: 20 }), {
    width: 950,
    height: 540,
  })
  const map = [
    [1, 1, 1, 1],
    [1, 1, 1, 1],
    [1, 1, 1, 1],
  ]

  it('矩形房间只长两条后墙：1 个转角 + 3 个 right + 2 个 left', () => {
    const pieces = buildWallPieces(map, layout, room)
    expect(pieces.filter((piece) => piece.variant === 'up')).toHaveLength(1)
    expect(pieces.filter((piece) => piece.variant === 'right')).toHaveLength(3)
    expect(pieces.filter((piece) => piece.variant === 'left')).toHaveLength(2)
    expect(pieces.some((piece) => piece.variant === 'down')).toBe(false)
  })

  it('墙面底边贴在墙脚：y = 地板原点 - 墙高 + 墙厚 + 变体微调', () => {
    for (const piece of buildWallPieces(map, layout, room)) {
      const origin = floorCellOrigin(piece.cell.x, piece.cell.y, layout)
      const offsets: Record<string, { x: number; y: number }> = {
        up: { x: 6, y: 4 },
        left: { x: 6, y: 6 },
        down: { x: 10, y: 1 },
        right: { x: 20, y: 6 },
      }
      const offset = offsets[piece.variant]!
      // 官方：墙不加地砖那 10 —— 墙块 x = 地板格原点 − 10 + 变体微调
      expect(piece.x).toBe(origin.x - FLOOR_X_SHIFT + offset.x)
      expect(piece.y).toBe(origin.y - room.wallHeight + room.wallDepth + offset.y)
    }
  })
})

describe('镜像与门朝向', () => {
  const makeImage = (width: number, height: number): ReturnType<typeof createImage> => {
    const image = createImage(width, height)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4
        image.data[i] = x + 1
        image.data[i + 1] = y + 1
        image.data[i + 2] = 0
        image.data[i + 3] = 255
      }
    }
    return image
  }

  it('flipHorizontal 逐像素水平镜像（行不变、列反序）', () => {
    const image = makeImage(3, 2)
    const out = flipHorizontal(image)
    // 第 0 行原为 1,2,3 → 翻转后 3,2,1；第 1 行同理，且两行都不丢
    expect([0, 1, 2].map((x) => out.data[x * 4])).toEqual([3, 2, 1])
    expect([0, 1, 2].map((x) => out.data[(3 + x) * 4])).toEqual([3, 2, 1])
    expect([0, 1, 2, 3, 4, 5].map((i) => out.data[i * 4 + 3])).toEqual([
      255, 255, 255, 255, 255, 255,
    ])
  })

  it('orientDoor：入口在顶边墙时镜像，在左侧墙时用原图', () => {
    const door = makeImage(2, 2)
    // 顶边：第 0 行全空，入口落在第 1 行
    const topEdge = [
      [0, 0, 0],
      [1, 1, 1],
      [1, 1, 1],
    ]
    const flipped = orientDoor(door, topEdge, { x: 1, y: 1 })
    expect(flipped).not.toBe(door)
    expect(flipped.data[0]).toBe(door.data[4])

    // 左侧墙：左边整列为空，入口在第 1 列
    const leftEdge = [
      [0, 1, 1],
      [0, 1, 1],
      [0, 1, 1],
    ]
    expect(orientDoor(door, leftEdge, { x: 1, y: 1 })).toBe(door)
  })
})
