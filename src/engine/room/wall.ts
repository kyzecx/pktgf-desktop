import type { CatalogRoomDef } from '@shared/contract'

import type { GridPoint } from './grid'
import type { RoomLayout } from './types'

/**
 * 墙面拼块。
 *
 * 官方 `Wall.draw`（`GJ.prototype`）按结构图逐列挑变体，只有「背后没有地板」的那一格
 * 会长出墙面，也就是房间的两条后边（`up` = y-1 侧、`left` = x-1 侧）。
 * 变体符号：`<code>_up` / `_left` / `_right` / `_down`（docs/room-spec.md §4.1）。
 *
 * M1 只画后墙（up/left）；`right`/`down` 与拐角微调留给 M2 用金标图对齐。
 */

export type WallVariant = 'up' | 'left' | 'right' | 'down'

export interface WallPiece {
  variant: WallVariant
  x: number
  y: number
  cell: GridPoint
}

/** 官方 1×1 墙块的像素微调表（`d == 1` 分支）。 */
const OFFSET_ONE_CELL: Record<WallVariant, { x: number; y: number }> = {
  up: { x: 6, y: 4 },
  left: { x: 6, y: 6 },
  down: { x: 10, y: 1 },
  right: { x: 20, y: 6 },
}

/** 房间分类对墙面的额外纵向位移。 */
function categoryNudge(category: number): number {
  if (category === 2) return 8
  if (category === 5) return 13
  return 0
}

function solid(map: number[][], y: number, x: number): boolean {
  const row = map[y]
  const value = row?.[x]
  return value !== undefined && value !== 0
}

/**
 * 官方 `Wall.isTop`：同时满足「上方无地板」和「左侧无地板」才是墙角（`_up`）。
 * 只有一条边缺地板时交给 `isRight` / `isLeft`，否则整面墙都会用转角图，
 * 渲染出来是一根根竖条（这是 M1 第一版踩过的坑）。
 */
export function isWallTop(map: number[][], y: number, x: number): boolean {
  if (y === 0) return x === 0 || !solid(map, 0, x - 1)
  if (x === 0) return !solid(map, y - 1, x)
  return !solid(map, y - 1, x) && !solid(map, y, x - 1)
}

/** 官方 `Wall.isLeft`：左边缺地板（且不是只有 y=0 那一行）。 */
/** 官方 `Wall.isLeft`：左边缺地板（x==0 且不是第一行也算）。 */
export function isWallLeft(map: number[][], y: number, x: number): boolean {
  if (x === 0) return y > 0
  return y > 0 && !solid(map, y, x - 1)
}

/** 官方 `Wall.isRight`：上方缺地板。 */
export function isWallRight(map: number[][], y: number, x: number): boolean {
  if (y === 0) return x > 0
  if (x === 0) return false
  return !solid(map, y - 1, x)
}

/**
 * 某格会长出哪种墙面（与 `buildWallPieces` 的判定完全一致）。
 * 挂墙家具按这个变体找自己的墙板槽位。
 */
export function wallVariantAt(map: number[][], x: number, y: number): WallVariant | null {
  if (!solid(map, y, x)) return null
  if (isWallTop(map, y, x)) return 'up'
  if (isWallLeft(map, y, x)) return 'left'
  if (isWallRight(map, y, x)) return 'right'
  return null
}

/**
 * 生成墙面绘制指令 —— 严格照官方 `Wall.draw`（`GJ.prototype.draw`）的控制流。
 *
 * 关键在 `n`：官方用两个变量决定"这块墙要不要画"，
 * ```
 * n = k - m   // 屏幕列，用来定位
 * ...画完...
 * n = k       // 下一次判断用：上一块墙的 k
 * 若 isLeft 且 n < k（这一格的左墙在上次出墙位置的右边）→ 整行跳过
 * ```
 * 中间那个分支就是"阶梯形房间不要在锯齿边重复出墙"的开关。少了它，
 * 斜向锯齿的每一级都会再出一块 132px 高的墙，上一块的顶盖就压在下一块墙面上，
 * 看起来像墙上多了几条黑线（游戏里不存在这些线）。
 *
 * 其余细节：
 * - 变体优先级 `up(0) → left(2) → right(6) → down(4)`
 * - `isGoOn`（上方是空洞）则继续向右扫，否则（combine=1 时）结束本行
 * - 步长 `d = 1 == 墙纸 VO.gridH`（即 decoConfig.gridW）
 */
export function buildWallPieces(
  map: number[][],
  layout: RoomLayout,
  room: Pick<CatalogRoomDef, 'wallHeight' | 'wallDepth' | 'category' | 'combine'>,
  options: { tileCells?: 1 | 2 } = {},
): WallPiece[] {
  const pieces: WallPiece[] = []
  const rows = map.length
  const cols = map[0]?.length ?? 0
  const step = options.tileCells === 2 ? 2 : 1
  const combine = room.combine
  const nudge = categoryNudge(room.category)

  let lastK = -1

  for (let m = 0; m < rows;) {
    for (let k = 0; k < cols;) {
      const cell = map[m]?.[k] ?? 0
      // combine==1：有地板就出墙；combine==2：只有值为 3 的格子出墙
      const qualifies = combine === 1 ? cell !== 0 : cell === 3

      if (qualifies) {
        let variant: WallVariant
        if (isWallTop(map, m, k)) variant = 'up'
        else if (isWallLeft(map, m, k)) {
          // 左墙出现在上一次出墙位置的右边 → 整行跳过（官方 `d?++m:m+=2; break`）
          if (lastK < k && combine === 1) {
            m += step
            break
          }
          variant = 'left'
        } else if (isWallRight(map, m, k)) variant = 'right'
        else variant = 'down'

        push(pieces, variant, { x: k, y: m }, layout, room, nudge)
        lastK = k

        if (!isGoOn(map, m, k) && combine === 1) break
      }

      k += step
    }
    m += step
  }

  return pieces
}

/** 官方 `Wall.isGoOn`：上方没地板（或第一行）就继续画。 */
function isGoOn(map: number[][], y: number, x: number): boolean {
  return y === 0 || (map[y - 1]?.[x] ?? 0) === 0
}

function push(
  pieces: WallPiece[],
  variant: WallVariant,
  cell: GridPoint,
  layout: RoomLayout,
  room: Pick<CatalogRoomDef, 'wallHeight' | 'wallDepth'>,
  nudge: number,
): void {
  const offset = OFFSET_ONE_CELL[variant]
  pieces.push({
    variant,
    x: (cell.x - cell.y) * 10 + layout.floorTop.x + offset.x,
    y:
      (cell.x + cell.y) * 5 +
      layout.floorTop.y -
      room.wallHeight +
      room.wallDepth +
      offset.y +
      nudge,
    cell,
  })
}
