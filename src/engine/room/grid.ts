import type { RoomDirection } from '@shared/contract'

/**
 * 45° 网格：把「格子坐标」和「屏幕像素」互相换算。
 *
 * 官方实现见 `org.jpixel.utils.Display45Util`（`Xc`），格子尺寸来自
 * `xa.tile_width = 20` / `xa.tile_height = 10`（docs/room-spec.md §0/§1）。
 *
 * 约定：
 *   - 格点 (x, y) 是**格子索引**，x 沿 +5 方向（右下）递增，y 沿 +3 方向（左下）递增；
 *   - 一个格子的像素包围盒是 20×10 的菱形，相邻格子在屏幕上相差 (±10, +5)；
 *   - `gridToPixel` 返回**菱形包围盒左上角**，与官方 `getItemPos` 完全一致。
 */

/** 单格包围盒宽度（像素）。 */
export const TILE_WIDTH = 20
/** 单格包围盒高度（像素）。 */
export const TILE_HEIGHT = 10

export interface GridPoint {
  x: number
  y: number
}

export interface PixelPoint {
  x: number
  y: number
}

/** 格点 → 像素（菱形包围盒左上角）。 */
export function gridToPixel(x: number, y: number): PixelPoint {
  return {
    x: (x - y) * (TILE_WIDTH / 2),
    y: (x + y) * (TILE_HEIGHT / 2),
  }
}

/** 像素 → 格点（可能是小数；官方 `getItemIndex` 在此基础上 +1 并取整）。 */
export function pixelToGrid(px: number, py: number): PixelPoint {
  return {
    x: px / TILE_WIDTH + py / TILE_HEIGHT,
    y: py / TILE_HEIGHT - px / TILE_WIDTH,
  }
}

/**
 * 像素 → 格点索引，语义与官方 `getItemIndex` 一致：
 * 两个分量各自 `|0` 后再 +1，负数夹成 -1。
 */
export function pixelToGridIndex(px: number, py: number): GridPoint {
  const { x, y } = pixelToGrid(px, py)
  return {
    x: (x < 0 ? -1 : x | 0) + 1,
    y: (y < 0 ? -1 : y | 0) + 1,
  }
}

/** 朝向 → 格子位移（官方 `5=+x / 3=+y / 1=-x / 7=-y`）。 */
export const DIR_VECTORS: Record<RoomDirection, GridPoint> = {
  1: { x: -1, y: 0 },
  3: { x: 0, y: 1 },
  5: { x: 1, y: 0 },
  7: { x: 0, y: -1 },
}

/** 四个合法朝向。 */
export const DIRECTIONS: readonly RoomDirection[] = [1, 3, 5, 7]

/** 只有 1/3/5/7 合法；非法值按官方默认 3 处理。 */
export function normalizeDirection(value: unknown, fallback: RoomDirection = 3): RoomDirection {
  const n = Number(value)
  return n === 1 || n === 3 || n === 5 || n === 7 ? (n as RoomDirection) : fallback
}

/** 左右镜像：1↔5、3↔7（官方 `getSymmetricalDir`）。 */
export function mirrorDirection(dir: RoomDirection): RoomDirection {
  return dir > 4 ? ((dir - 4) as RoomDirection) : ((dir + 4) as RoomDirection)
}

/** 由格子位移反推朝向；非法（斜向/原地）返回 null。 */
export function directionFromDelta(dx: number, dy: number): RoomDirection | null {
  if (dx === 1 && dy === 0) return 5
  if (dx === -1 && dy === 0) return 1
  if (dx === 0 && dy === 1) return 3
  if (dx === 0 && dy === -1) return 7
  return null
}

/** 四个朝向的旋转顺序，即界面上「按 R 旋转」的循环。 */
export function nextDirection(dir: RoomDirection): RoomDirection {
  const order: RoomDirection[] = [3, 5, 7, 1]
  const index = order.indexOf(dir)
  return order[(index + 1) % order.length] ?? 3
}

/** 占地矩形（格子索引，闭区间）。rows 沿 +y，cols 沿 +x。 */
export interface Footprint {
  x0: number
  y0: number
  x1: number
  y1: number
}

export function footprint(x: number, y: number, rows: number, cols: number): Footprint {
  return { x0: x, y0: y, x1: x + Math.max(1, cols) - 1, y1: y + Math.max(1, rows) - 1 }
}

/** 占地内所有格子，按行优先。 */
export function footprintCells(fp: Footprint): GridPoint[] {
  const cells: GridPoint[] = []
  for (let y = fp.y0; y <= fp.y1; y += 1) {
    for (let x = fp.x0; x <= fp.x1; x += 1) cells.push({ x, y })
  }
  return cells
}

export function inFootprint(fp: Footprint, x: number, y: number): boolean {
  return x >= fp.x0 && x <= fp.x1 && y >= fp.y0 && y <= fp.y1
}

/** 占地是否落在房间内（房间为 rows × cols 格）。 */
export function footprintInside(fp: Footprint, roomRows: number, roomCols: number): boolean {
  return fp.x0 >= 0 && fp.y0 >= 0 && fp.x1 < roomCols && fp.y1 < roomRows
}

/** 占地菱形的像素包围盒。 */
export function footprintBounds(fp: Footprint): {
  x: number
  y: number
  width: number
  height: number
} {
  // 四个角点：左上角格子的菱形左上角，决定最高点与最左点。
  const top = gridToPixel(fp.x0, fp.y0)
  const right = gridToPixel(fp.x1, fp.y0)
  const bottom = gridToPixel(fp.x1, fp.y1)
  const left = gridToPixel(fp.x0, fp.y1)
  const minX = Math.min(top.x, right.x, bottom.x, left.x)
  const maxX = Math.max(top.x, right.x, bottom.x, left.x) + TILE_WIDTH
  const minY = Math.min(top.y, right.y, bottom.y, left.y)
  const maxY = Math.max(top.y, right.y, bottom.y, left.y) + TILE_HEIGHT
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** 菱形顶点（相对格子包围盒左上角）。用于画网格与高亮。 */
export function tileDiamond(px: number, py: number): PixelPoint[] {
  const halfW = TILE_WIDTH / 2
  const halfH = TILE_HEIGHT / 2
  return [
    { x: px + halfW, y: py },
    { x: px + TILE_WIDTH, y: py + halfH },
    { x: px + halfW, y: py + TILE_HEIGHT },
    { x: px, y: py + halfH },
  ]
}

/** 格子 → 菱形中心像素。 */
export function tileCenter(x: number, y: number): PixelPoint {
  const p = gridToPixel(x, y)
  return { x: p.x + TILE_WIDTH / 2, y: p.y + TILE_HEIGHT / 2 }
}

/**
 * 从 A 格走向 B 格时的朝向（等距投影下的四向）。
 *
 * 屏幕方向：+x 右下、+y 左下、-x 左上、-y 右上；步幅取变化大的那一轴。
 */
export function directionBetween(
  from: { x: number; y: number },
  to: { x: number; y: number },
): RoomDirection {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 3 : 7
  return dy >= 0 ? 5 : 1
}
