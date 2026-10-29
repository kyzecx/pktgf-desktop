import type { GridPoint } from './grid'
import { floorCellOrigin } from './room'
import type { RoomLayout } from './types'

/**
 * 地面拼块：按房间结构图逐格推导「上 / 左 / 右 / 心」四种变体。
 *
 * 官方 `Floor.draw`（`bA.prototype`）的判定原样搬过来，
 * 区别只是把「读图 + 画 sprite」换成「产出绘制指令」，便于单测与复用。
 * 公式与符号名见 docs/room-spec.md §3。
 */

export type FloorVariant = 'top' | 'left' | 'right' | 'center'

export interface FloorPiece {
  variant: FloorVariant
  /** 屏幕像素（已含房间原点与半格修正） */
  x: number
  y: number
  cell: GridPoint
}

/** 结构图里该格是有地板的。 */
function solid(map: number[][], y: number, x: number): boolean {
  const row = map[y]
  const value = row?.[x]
  return value !== undefined && value !== 0
}

/** 官方 `Floor.isTop`。 */
export function isFloorTopCell(map: number[][], y: number, x: number): boolean {
  if (y === 0) return x === 0 || !solid(map, 0, x - 1)
  return !solid(map, y - 1, x) && (x === 0 || !solid(map, y, x - 1))
}

/** 官方 `Floor.isLeft`。 */
export function isFloorLeftCell(map: number[][], y: number, x: number): boolean {
  if (x === 0) return y !== 0
  return !solid(map, y, x - 1)
}

/** 官方 `Floor.isRight`。 */
export function isFloorRightCell(map: number[][], y: number, x: number): boolean {
  if (y === 0) return x !== 0
  return !solid(map, y - 1, x)
}

export function floorVariantAt(map: number[][], y: number, x: number): FloorVariant {
  if (isFloorTopCell(map, y, x)) return 'top'
  if (isFloorLeftCell(map, y, x)) return 'left'
  if (isFloorRightCell(map, y, x)) return 'right'
  return 'center'
}

export interface FloorBuildOptions {
  /**
   * 地板图自身的格数：1 = 1×1（20×10 菱形），2 = 2×2（40×20）。
   *
   * 官方 `Floor.draw` 用 `g = 1 == a.getGridH()` 决定「逐格 + x+=10」还是「隔格」。
   * 85 个地板图里有 61 个是 2×2，按 1 格画会重复绘制并露出接缝（看起来像黑线）。
   */
  tileCells?: 1 | 2
}

/**
 * 生成地面绘制指令。
 *
 * 官方循环顺序是「行优先、逐格（1×1）或隔格（2×2）」，
 * 这里保持一致：数组顺序即绘制顺序。
 */
export function buildFloorPieces(
  map: number[][],
  layout: RoomLayout,
  options: FloorBuildOptions = {},
): FloorPiece[] {
  const step = options.tileCells === 2 ? 2 : 1
  const pieces: FloorPiece[] = []
  const rows = map.length

  for (let y = 0; y < rows; y += step) {
    const cols = map[y]?.length ?? 0
    for (let x = 0; x < cols; x += step) {
      if (!solid(map, y, x)) continue
      const origin = floorCellOrigin(x, y, layout, { tileCells: step === 2 ? 2 : 1 })
      pieces.push({ variant: floorVariantAt(map, y, x), x: origin.x, y: origin.y, cell: { x, y } })
    }
  }

  return pieces
}
