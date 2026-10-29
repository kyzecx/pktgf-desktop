import type { CatalogRoomDef } from '@shared/contract'

import { footprint, footprintInside, type Footprint, type GridPoint } from './grid'
import { PLACEABLE_TILES, TILE_TYPE, type RoomLayout, type RoomStage } from './types'

/**
 * 房间模型：结构图（`roomMapConfig`）→ 格子类型表 / 可走图 / 放置判定。
 *
 * 对应官方 `Room`（`Ak`）：
 *   - `setMapData` 建 `map` / `originalMap` / `displayPropMap`
 *   - `isCanBePass` 判走格
 *   - `isCanPutDown` 判占地
 * 公式与常量见 docs/room-spec.md §2。
 */

/** 结构图解码：`"1,1,0&1,1,0"` → `number[][]`（行优先）。 */
export function decodeRoomMap(map: string): number[][] {
  return map
    .split('&')
    .map((row) => row.trim())
    .filter((row) => row.length > 0)
    .map((row) =>
      row
        .split(',')
        .map((cell) => Number(cell.trim()))
        .map((value) => (Number.isFinite(value) ? value : TILE_TYPE.none)),
    )
}

/**
 * 计算房间布局。
 *
 * 官方 `Room` 构造里的位运算还原（docs/room-spec.md §2.2）：
 *
 * ```js
 * const b = min(gridW, gridH)              // 运行时 gridW = 配置 gridH（列）
 * const c = |gridW - gridH|
 * const boxW = 20*b + 10*c + 2*wallDepth   // = 10*(gridW+gridH) + 2*wallDepth
 * const boxH = 10*b +  5*c +   wallHeight  // =  5*(gridW+gridH) + wallHeight
 * origin = ((stage.w - boxW)/2, (stage.h - boxH)/2)
 * floorTop.x = origin.x + wallDepth + (gridH - 2) * 10
 * floorTop.y = origin.y + wallHeight - floorDepth
 * ```
 */
export function computeRoomLayout(def: CatalogRoomDef, stage: RoomStage): RoomLayout {
  const cols = def.cols
  const rows = def.rows

  // 官方把 min/差值拆成位运算，等价于下面两个式子。
  const boxWidth = 10 * (cols + rows) + 2 * def.wallDepth
  const boxHeight = 5 * (cols + rows) + def.wallHeight

  const originX = Math.floor((stage.width - boxWidth) / 2)
  const originY = Math.floor((stage.height - boxHeight) / 2)

  return {
    floorTop: {
      // 官方 `Room` 构造：origin.x + wallDepth + (gridH - 2) * 10，不加 10
      x: originX + def.wallDepth + (rows - 2) * 10,
      y: originY + def.wallHeight - def.floorDepth,
    },
    originX,
    originY,
    boxWidth,
    boxHeight,
  }
}

/**
 * 地板绘制时每格额外右移 —— **10**，官方 `Floor.draw` 原句：
 * `g && b.set_x(b.get_x() + 10)`（`g = 1 == 地板图.gridH`）。
 *
 * 注意：这 10 只加在**地砖**上，`floorTopPoint` 本身不加（墙的 `+6/+20`、
 * 家具的 `+20` 都是相对未偏移的原点）。之前把 10 挪进原点，会让地砖相对墙错 10px，
 * 墙脚那条 1px 描边就断成一串虚线。
 */
export const FLOOR_X_SHIFT = 10

/** 某格地板菱形的包围盒左上角（屏幕像素，已含房间原点）。 */
export function floorCellOrigin(
  x: number,
  y: number,
  layout: RoomLayout,
  options: { tileCells?: 1 | 2 } = {},
): { x: number; y: number } {
  // 官方只在 1×1 地砖时 +10；2×2 地砖不加
  const shift = options.tileCells === 2 ? 0 : FLOOR_X_SHIFT
  return {
    x: layout.floorTop.x + (x - y) * 10 + shift,
    y: layout.floorTop.y + (x + y) * 5,
  }
}

/**
 * 屏幕像素 → 格子，`floorCellOrigin` 的严格反函数。
 *
 * 官方走的是 `getItemIndex(mouse - (floorTop + (20,0)))`，那是「像素↔格点」
 * 共用一套 skew 变换的写法，边界上会有半格偏差。这里改成**菱形包含测试**：
 * 直接把候选平面格 (a,b)（a=x-y, b=x+y，同奇偶）逐个验 `|dx-10| + 2|dy-5| <= 10`，
 * 保证「画在哪格就能点中哪格」，编辑时的拖放与高亮不会错位。
 */
export function pixelToCell(px: number, py: number, layout: RoomLayout): { x: number; y: number } {
  const lx = px - layout.floorTop.x - FLOOR_X_SHIFT
  const ly = py - layout.floorTop.y
  const a0 = Math.floor(lx / 10)
  const b0 = Math.floor(ly / 5)

  for (let a = a0 - 1; a <= a0 + 1; a += 1) {
    for (let b = b0 - 1; b <= b0 + 1; b += 1) {
      // x=(a+b)/2、y=(b-a)/2 必须是整数 → a、b 同奇偶
      if ((a + b) % 2 !== 0) continue
      const dx = lx - a * 10
      const dy = ly - b * 5
      if (dx < 0 || dx > 20 || dy < 0 || dy > 10) continue
      if (Math.abs(dx - 10) + 2 * Math.abs(dy - 5) <= 10) {
        return { x: (a + b) / 2, y: (b - a) / 2 }
      }
    }
  }

  // 落在虚空里：给一个"最近的格"，调用方用 RoomModel.exists 过滤
  return { x: Math.floor((a0 + b0) / 2), y: Math.floor((b0 - a0) / 2) }
}

export interface RoomModelOptions {
  /** 结构图；缺省时按 rows × cols 满铺地板 */
  map?: number[][]
  rows: number
  cols: number
}

/**
 * 房间运行期模型。
 *
 * `cells[y][x]` 是**格子类型**（见 `TILE_TYPE`），不是家具占用；
 * 家具占用单独记在 `occupied`，因为它随编辑变化、且要区分"地毯可叠"。
 */
export class RoomModel {
  readonly rows: number
  readonly cols: number
  /** 结构图（0 = 不是地板），已按房型尺寸归一化 */
  readonly structure: number[][]
  /** 当前格子类型表 */
  readonly cells: number[][]
  /** 家具占用的格子：key = `x,y` → uid */
  private readonly occupied = new Map<string, string>()

  constructor(options: RoomModelOptions) {
    this.rows = options.rows
    this.cols = options.cols
    this.structure = options.map
      ? adaptStructure(options.map, options.rows, options.cols)
      : fullFloor(options.rows, options.cols)
    this.cells = this.structure.map((row) => row.slice())
  }

  /** 窗外格：结构图为 0 的格子。 */
  exists(x: number, y: number): boolean {
    const row = this.structure[y]
    return row !== undefined && row[x] !== undefined && row[x] !== 0
  }

  cell(x: number, y: number): number {
    return this.cells[y]?.[x] ?? TILE_TYPE.none
  }

  /**
   * 官方 `isCanBePass`：可走的格子白名单。
   *
   * 官方是 `GROUND_LIST ∪ {地毯, 农田, 泳池, 楼梯}`，这里先按已知值列出，
   * 水面（游泳状态）留到 M3 再补。
   */
  canWalk(x: number, y: number): boolean {
    if (!this.exists(x, y)) return false
    // 官方把家具占位直接写进格子类型表（Zc.FURNI），这里查占位表等价。
    if (this.occupied.has(`${x},${y}`)) return false
    const cell = this.cell(x, y)
    return (
      cell === TILE_TYPE.floor ||
      cell === 3 ||
      cell === TILE_TYPE.rug ||
      cell === TILE_TYPE.swimmingPool ||
      cell === TILE_TYPE.cropLand
    )
  }

  /** 官方 `isCanPutDown`：占地内每格都必须是可放类型。 */
  canPlace(x: number, y: number, rows: number, cols: number): boolean {
    const fp = footprint(x, y, rows, cols)
    if (!footprintInside(fp, this.rows, this.cols)) return false
    for (let cy = fp.y0; cy <= fp.y1; cy += 1) {
      for (let cx = fp.x0; cx <= fp.x1; cx += 1) {
        if (!this.exists(cx, cy)) return false
        const cell = this.cell(cx, cy)
        if (!PLACEABLE_TILES.includes(cell)) return false
        if (this.occupied.has(`${cx},${cy}`)) return false
      }
    }
    return true
  }

  /** 占住一个家具；重复占位会抛错，调用方应先 `canPlace`。 */
  occupy(uid: string, fp: Footprint): void {
    for (let cy = fp.y0; cy <= fp.y1; cy += 1) {
      for (let cx = fp.x0; cx <= fp.x1; cx += 1) {
        this.occupied.set(`${cx},${cy}`, uid)
      }
    }
  }

  /** 释放某个家具的占位。 */
  release(uid: string): void {
    for (const [key, value] of this.occupied) {
      if (value === uid) this.occupied.delete(key)
    }
  }

  /** 某格被哪个家具占住。 */
  occupantAt(x: number, y: number): string | null {
    return this.occupied.get(`${x},${y}`) ?? null
  }

  /** 清空家具占位（重建场景时用）。 */
  clearOccupancy(): void {
    this.occupied.clear()
  }

  /**
   * 靠墙判定：官方 `isCanPutDownAgainstWall`。
   *
   * 语义是「家具背后紧贴的格子必须是虚空（结构图 0）」，
   * 也就是它被摆到了房间边缘。返回应该贴的墙向（3 或 5），都不贴返回 -1。
   */
  placeAgainstWall(x: number, y: number, rows: number, cols: number, dir: 3 | 5): 3 | 5 | -1 {
    if (!this.canPlace(x, y, rows, cols)) return -1

    // 背后（y-1）整排是否全是虚空
    const backIsVoid = (): boolean => {
      if (y === 0) return true
      for (let cx = x; cx < x + cols; cx += 1) {
        if (this.structure[y - 1]?.[cx] !== 0) return false
      }
      return true
    }
    // 左侧（x-1）整列是否全是虚空
    const leftIsVoid = (): boolean => {
      if (x === 0) return true
      for (let cy = y; cy < y + rows; cy += 1) {
        if (this.structure[cy]?.[x - 1] !== 0) return false
      }
      return true
    }

    if (dir === 3) {
      if (backIsVoid()) return 3
      if (leftIsVoid()) return 5
    } else {
      if (leftIsVoid()) return 5
      if (backIsVoid()) return 3
    }
    return -1
  }

  /** 结构图里所有地块（画地板用）。 */
  floorCells(): GridPoint[] {
    const cells: GridPoint[] = []
    for (let y = 0; y < this.rows; y += 1) {
      for (let x = 0; x < this.cols; x += 1) {
        if (this.exists(x, y)) cells.push({ x, y })
      }
    }
    return cells
  }
}

/**
 * 把结构图对齐到房型尺寸。
 *
 * 官方数据里有 3 个例外（56 个拼接房型中的 3 个）：
 *   - 中级房型25 / 撕名牌活动房间：结构图是转置的（58×56 vs 房型 56×58）
 *   - 打雪仗房间：结构图 52×56 vs 房型 50×50，比房型大一圈
 * 这里统一处理：尺寸相等直接收；转置能对上就转置；否则裁剪 / 用 0 补齐。
 */
export function adaptStructure(map: number[][], rows: number, cols: number): number[][] {
  const height = map.length
  const width = map[0]?.length ?? 0
  if (height === rows && width === cols) return map
  if (height === cols && width === rows) {
    const transposed: number[][] = []
    for (let y = 0; y < rows; y += 1) {
      const row: number[] = []
      for (let x = 0; x < cols; x += 1) row.push(map[x]?.[y] ?? TILE_TYPE.none)
      transposed.push(row)
    }
    return transposed
  }
  const fitted: number[][] = []
  for (let y = 0; y < rows; y += 1) {
    const row: number[] = []
    for (let x = 0; x < cols; x += 1) row.push(map[y]?.[x] ?? TILE_TYPE.none)
    fitted.push(row)
  }
  return fitted
}

/** 房间在舞台上的包围盒尺寸（不依赖舞台大小）。 */
export function roomBoxSize(
  def: Pick<CatalogRoomDef, 'rows' | 'cols' | 'wallHeight' | 'wallDepth'>,
): {
  width: number
  height: number
} {
  return {
    width: 10 * (def.cols + def.rows) + 2 * def.wallDepth,
    height: 5 * (def.cols + def.rows) + def.wallHeight,
  }
}

/** 舞台放不下房间时（大房型），按房间尺寸扩舞台，四周留边距。 */
export function fitStage(
  def: Pick<CatalogRoomDef, 'rows' | 'cols' | 'wallHeight' | 'wallDepth'>,
  min: RoomStage,
  margin = 24,
): RoomStage {
  const box = roomBoxSize(def)
  return {
    width: Math.max(min.width, box.width + margin * 2),
    height: Math.max(min.height, box.height + margin * 2),
  }
}

function fullFloor(rows: number, cols: number): number[][] {
  const map: number[][] = []
  for (let y = 0; y < rows; y += 1) {
    const row: number[] = []
    for (let x = 0; x < cols; x += 1) row.push(TILE_TYPE.floor)
    map.push(row)
  }
  return map
}

/**
 * 整图房型（`ifDefaultImg != 0`）的布局。
 *
 * 官方 `Room` 构造里这类房型不走拼接：
 * ```
 * picW/picH ← picWH("701 473")
 * origin   = ((stage_w - picW) >> 1, (stage_h - picH) >> 1)
 * floorTop = origin + gridOffset("350 130")
 * ```
 * 也就是说**场景图是居中的**，而格点原点由配置里的 `gridOffset` 指定，
 * 这样家具/角色才能落在画好的地面上。
 */
export interface SceneLayout {
  /** 场景图左上角（舞台坐标） */
  image: { x: number; y: number; width: number; height: number }
  /** 格点原点（与拼接房型的 floorTop 同义） */
  floorTop: GridPoint
}

export function computeSceneLayout(
  def: Pick<CatalogRoomDef, 'picWH' | 'gridOffset' | 'ifDefaultImg'>,
  stage: RoomStage,
): SceneLayout | null {
  // 只有「官方整图房」才有场景图坐标；拼接房调用它是 bug，直接返回 null
  if (def.ifDefaultImg !== 1) return null

  const [rawW, rawH] = def.picWH.split(/\s+/).map(Number)
  // picWH 为空表示「整张图就是舞台」（官方把 stage 尺寸当图片尺寸，原点落在 0,0）
  const picW = rawW && rawH ? rawW : stage.width
  const picH = rawW && rawH ? rawH : stage.height

  const imageX = (stage.width - picW) >> 1
  const imageY = (stage.height - picH) >> 1
  const [offsetX, offsetY] = def.gridOffset.split(/\s+/).map(Number)

  return {
    image: { x: imageX, y: imageY, width: picW, height: picH },
    floorTop: {
      x: imageX + (Number.isFinite(offsetX) ? offsetX! : 0),
      y: imageY + (Number.isFinite(offsetY) ? offsetY! : 0),
    },
  }
}
