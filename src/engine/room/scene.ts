import { blend, createImage, flipHorizontal } from '../image'
import type { RgbaImage } from '../types'

import type { CatalogRoomDef, RoomDirection } from '@shared/contract'

import { buildFloorPieces, type FloorVariant } from './floor'
import type { RoomModel } from './room'
import type { RoomLayout } from './types'
import { buildWallPieces, type WallVariant } from './wall'

/**
 * 静态层合成：把地面 + 墙面 + 门按官方顺序画到一张透明图上。
 *
 * 这一层只在「房型 / 地板 / 墙纸 / 门」变化时重算，家具与角色叠在它上面（M3 起）。
 * 纯函数，Node 侧可以直接跑出金标图（`tools/verify-room.ts`）。
 */

/**
 * 地板 / 墙面素材。
 *
 * 泛型是为了让渲染进程可以直接放 `ImageBitmap`（Canvas 绘制），
 * Node 侧（校验工具、导出）用 `RgbaImage`。
 */
export interface FloorAssets<T = RgbaImage> {
  top: T
  left: T
  right: T
  center: T
}

export interface WallAssets<T = RgbaImage> {
  up: T
  left: T
  right: T
  down: T
}

export interface StaticLayerInput {
  model: RoomModel
  layout: RoomLayout
  stage: { width: number; height: number }
  room: Parameters<typeof buildWallPieces>[2] &
    Pick<CatalogRoomDef, 'entryX' | 'entryY' | 'entryDir'>
  floor?: FloorAssets | null
  /** 地板图自身格数（1 或 2） */
  floorCells?: 1 | 2
  /** 墙纸自身格数（1 或 2） */
  wallCells?: 1 | 2
  wall?: WallAssets | null
  door?: RgbaImage | null
  /** 门的朝向（官方 entryDir，默认 5） */
  doorDir?: RoomDirection
}

export interface StaticLayerResult {
  image: RgbaImage
  /** 地面拼块数（= 结构图里的地板格数） */
  floorPieces: number
  wallPieces: number
  /** 完全落在舞台外的拼块（正常应为空，校验用） */
  outliers: Array<{ layer: 'floor' | 'wall' | 'door'; x: number; y: number }>
}

/** 合成静态层：墙面 → 地面 → 门（地面盖住墙脚，门再压在地面接缝上）。 */
export function composeStaticLayer(input: StaticLayerInput): StaticLayerResult {
  const stage = input.stage
  const image = createImage(stage.width, stage.height)
  const outliers: StaticLayerResult['outliers'] = []
  let floorPieces = 0
  let wallPieces = 0

  // 严格照官方 Room.addRoom 的 addChild 顺序：wall → floor → door。
  // 地板盖住墙板伸下来的那 14px 墙脚；顺序反了门会看起来悬空。
  if (input.wall) {
    const wall = input.wall
    for (const piece of buildWallPieces(input.model.structure, input.layout, input.room, {
      tileCells: input.wallCells ?? 1,
    })) {
      const sprite = wall[piece.variant as WallVariant]
      wallPieces += 1
      if (offscreen(piece.x, piece.y, sprite, stage)) {
        outliers.push({ layer: 'wall', x: piece.cell.x, y: piece.cell.y })
      }
      blend(image, sprite, piece.x, piece.y)
    }
  }

  if (input.floor) {
    const floor = input.floor
    for (const piece of buildFloorPieces(input.model.structure, input.layout, {
      tileCells: input.floorCells ?? 1,
    })) {
      const sprite = floor[piece.variant as FloorVariant]
      floorPieces += 1
      if (offscreen(piece.x, piece.y, sprite, stage)) {
        outliers.push({ layer: 'floor', x: piece.cell.x, y: piece.cell.y })
      }
      blend(image, sprite, piece.x, piece.y)
    }
  }

  if (input.door) {
    const placed = doorPlacement(input.room, input.layout, input.door, input.doorDir ?? 5)
    const sprite = placed.flipped ? flipHorizontal(input.door) : input.door
    if (offscreen(placed.x, placed.y, sprite, stage)) {
      outliers.push({ layer: 'door', x: 0, y: 0 })
    }
    blend(image, sprite, placed.x, placed.y)
  }

  return { image, floorPieces, wallPieces, outliers }
}

/**
 * 门的朝向。
 *
 * 官方 `Fv.getDoor(dir)`：`dir == 5` 用原图，否则水平翻转。
 * 素材（`door0001_left`）是给**左侧墙**（沿 +y 那条边）画的；
 * 入口在 `entryY = 1` 的顶边（沿 +x 那条墙）时必须镜像，否则门套会朝墙里。
 */
export function orientDoor(
  door: RgbaImage,
  structure: number[][],
  cell: { x: number; y: number },
): RgbaImage {
  const above = structure[cell.y - 1]?.[cell.x]
  const onTopEdge = cell.y === 0 || above === 0
  return onTopEdge ? flipHorizontal(door) : door
}

/**
 * 门的落点 —— 照官方 `Door.draw(dir)`：
 *
 * ```
 * d = entryX - entryY            (运行时 entryX/entryY 已互换)
 * f = entryY + entryX
 * x = 10*d + floorTop.x - 14*(dir==5 ? 1 : -1)
 * y =  5*f + floorTop.y - doorHeight + 9*(dir==5 ? 1 : -1)
 * if (category == 2) y += 8
 * ```
 * 朝向：`Fv.getDoor(dir)`，dir==5 用原图，其它方向水平翻转。
 */
export function doorPlacement(
  room: Pick<CatalogRoomDef, 'entryX' | 'entryY' | 'entryDir' | 'category'>,
  layout: RoomLayout,
  sprite: { height: number },
  dir: RoomDirection = 5,
): { x: number; y: number; flipped: boolean } {
  const d = room.entryX - room.entryY
  const f = room.entryY + room.entryX
  const sign = dir === 5 ? 1 : -1
  return {
    x: 10 * d + layout.floorTop.x - 14 * sign,
    y: 5 * f + layout.floorTop.y - sprite.height + 9 * sign + (room.category === 2 ? 8 : 0),
    flipped: dir !== 5,
  }
}

/** 与舞台完全没有交集即视为越界。 */
function offscreen(
  x: number,
  y: number,
  sprite: RgbaImage,
  stage: { width: number; height: number },
): boolean {
  return x + sprite.width <= 0 || y + sprite.height <= 0 || x >= stage.width || y >= stage.height
}

export interface WallPanelRect {
  x: number
  y: number
  width: number
  height: number
  variant: WallVariant
  cell: { x: number; y: number }
}

/**
 * 墙板矩形表：`x,y,variant` → 屏幕矩形。
 *
 * 挂墙家具要按它居中；界面与导出共用这一份，避免两边算出不同位置。
 */
export function buildWallPanelRects(
  model: { structure: number[][] },
  layout: RoomLayout,
  room: Parameters<typeof buildWallPieces>[2],
  wall: WallAssets | null | undefined,
  nominal: { width: number; height: number } = { width: 22, height: 132 },
): Map<string, WallPanelRect> {
  const panels = new Map<string, WallPanelRect>()
  if (!wall) return panels
  for (const piece of buildWallPieces(model.structure, layout, room)) {
    const sprite = wall[piece.variant]
    panels.set(`${piece.cell.x},${piece.cell.y},${piece.variant}`, {
      x: piece.x,
      y: piece.y,
      width: sprite?.width ?? nominal.width,
      height: sprite?.height ?? nominal.height,
      variant: piece.variant,
      cell: piece.cell,
    })
  }
  return panels
}
