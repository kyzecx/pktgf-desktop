import type { RoomDirection } from '@shared/contract'

import type { GridPoint } from './grid'

/**
 * 家具素材解析：符号名、镜像、锚点。
 *
 * 全部规则来自官方 `FurniBitItem`（`zD`）与 `Furni.updateSprite/getBaseLoc`，
 * 见 docs/room-spec.md §5。这里只做纯计算，不碰位图。
 */

/** 家具渲染需要的最小配置（官方 furniConfig 的子集）。 */
export interface FurniMeta {
  code: string
  /** 占地行数（Y 方向）= 官方 gridW */
  rows: number
  /** 占地列数（X 方向）= 官方 gridH */
  cols: number
  /** 1=单向 2=两向 4=四向 */
  dirable: 1 | 2 | 4
  /** 左右镜像即同一件 */
  symetric: boolean
  /** 官方原始锚点串，如 "28 37&29 34" */
  baseLoc: string
  /** 官方可叠放点串；没有则 null */
  surfaceLoc: string | null
  /** 1 地面 / 2 地毯 / 3,4 挂墙 / 5 靠墙 / 6..8 特殊 */
  position: number
}

/**
 * 家具在某个朝向下的实际占地。
 *
 * 官方 `Furni.tryToTurn()` 里每次转向都会 `swapRowCol()`，所以
 * **`dir 1 / 5` 的 rows 与 cols 是互换的**（`dir 3 / 7` 用原始值）。
 * 占地、锚点补偿、排序宽度都必须用它，否则旋转后网格不会跟着转。
 */
export function furniDims(
  meta: Pick<FurniMeta, 'rows' | 'cols'>,
  dir: RoomDirection,
): { rows: number; cols: number } {
  const swap = dir === 1 || dir === 5
  return swap ? { rows: meta.cols, cols: meta.rows } : { rows: meta.rows, cols: meta.cols }
}

export interface FurniSpriteRef {
  symbol: string
  /** 需要水平翻转（对称方向的另一半） */
  mirrored: boolean
}

/** 帧序号补成两位：1 → "01"（官方 `a<10 ? "0"+a : a`）。 */
export function frameSuffix(frame: number): string {
  return frame < 10 ? `0${frame}` : `${frame}`
}

/**
 * 解密朝向 → 符号名。
 *
 * 官方 `getBmdFromImage` 的完整规则：
 * ```
 * dir3 = <code>_3_NN            （缺帧回退到 01）
 * dir5 = dirable=1 或 (2|4 且 symetric) → 镜像(dir3)
 *        否则 <code>_5_NN
 * dir7 = <code>_7_NN            （只有 dirable=4 才有）
 * dir1 = symetric → 镜像(dir7)；否则 <code>_1_NN
 * ```
 * 返回 null 表示这一向没有素材（例如单向家具的 dir1/7）。
 */
export function resolveFurniSprite(
  meta: Pick<FurniMeta, 'code' | 'dirable' | 'symetric'>,
  dir: RoomDirection,
  frame = 1,
  /** 包里实际存在的符号名集合；不传则假设都存在 */
  available?: ReadonlySet<string>,
): FurniSpriteRef | null {
  const suffix = frameSuffix(frame)
  const own = (suffixDir: number): string => `${meta.code}_${suffixDir}_${suffix}`
  const exists = (name: string): boolean => (available ? available.has(name) : true)

  const pick = (name: string, fallback: string): string | null => {
    if (exists(name)) return name
    if (fallback && exists(fallback)) return fallback
    return null
  }

  const base3 = pick(own(3), `${meta.code}_3_01`)
  if (!base3) return null

  const mirrorOf3: FurniSpriteRef = { symbol: base3, mirrored: true }
  const asIs = (symbol: string | null): FurniSpriteRef | null =>
    symbol ? { symbol, mirrored: false } : null

  if (dir === 3) return { symbol: base3, mirrored: false }

  if (dir === 5) {
    if (meta.dirable === 1) return mirrorOf3
    if (meta.symetric) return mirrorOf3
    // 非对称两向/四向：官方直接取 _5_，没有就空着；
    // 这里退化为镜像 dir3，只影响素材缺失的自定义包，避免编辑器里"东西消失"。
    return asIs(pick(own(5), '')) ?? mirrorOf3
  }

  if (dir === 7) {
    if (meta.dirable !== 4) return null
    return asIs(pick(own(7), `${meta.code}_7_01`))
  }

  // dir === 1：四向家具才有；对称件用 dir7 的镜像
  if (meta.dirable !== 4) return null
  const base7 = pick(own(7), `${meta.code}_7_01`)
  if (meta.symetric) return base7 ? { symbol: base7, mirrored: true } : null
  return asIs(pick(own(1), '')) ?? (base7 ? { symbol: base7, mirrored: false } : null)
}

/** 解析 `"28 37&29 34"` → `[{28,37},{29,34}]`；非法片段跳过。 */
export function parsePointList(raw: string): GridPoint[] {
  return raw
    .split('&')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [x, y] = part.split(/\s+/)
      return { x: Number(x) || 0, y: Number(y) || 0 }
    })
}

/** 解析 `"16 23$33 32&37 26$18 20"` → 每个方向一组可叠放点。 */
export function parseSurfaceLoc(raw: string | null): GridPoint[][] | null {
  if (!raw) return null
  const groups = raw
    .split('&')
    .map((group) =>
      group
        .split('$')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const [x, y] = part.split(/\s+/)
          return { x: Number(x) || 0, y: Number(y) || 0 }
        }),
    )
    .filter((group) => group.length > 0)
  return groups.length > 0 ? groups : null
}

/** 四个朝向的锚点（像素，含义：从精灵左上角到格子基准点的偏移）。 */
export type FurniAnchors = Record<RoomDirection, GridPoint>

/**
 * 计算四向锚点。
 *
 * 官方在精灵就绪后把 `baseLoc` 改写成「图片左上角」语义：
 * ```
 * 挂墙（position 3/4）：baseLoc3 = (w/2, h/2)
 * 地面：baseLoc3.x += 5 * (rows - cols)
 *       baseLoc3.y -= 2.5 * (rows + cols)
 *       baseLoc5 = (w - baseLoc3.x, baseLoc3.y)
 *       baseLoc1 = (w - baseLoc7.x, baseLoc7.y)
 * ```
 */
export function furniAnchors(
  meta: Pick<FurniMeta, 'baseLoc' | 'rows' | 'cols' | 'dirable' | 'position'>,
  sprite: { width: number; height: number },
  dir: RoomDirection = 3,
): FurniAnchors {
  const points = parsePointList(meta.baseLoc)
  const first = points[0] ?? { x: 0, y: 0 }
  const second = points[1] ?? first

  const onWall = meta.position === 3 || meta.position === 4
  if (onWall) {
    const centered = { x: sprite.width >> 1, y: sprite.height >> 1 }
    return { 1: centered, 3: centered, 5: centered, 7: centered }
  }

  const { rows, cols } = furniDims(meta, dir)
  const adjust = (point: GridPoint): GridPoint => ({
    x: point.x + 5 * (rows - cols),
    y: point.y - 2.5 * (rows + cols),
  })

  const base3 = adjust(first)
  const base7 = meta.dirable === 4 ? adjust(second) : base3
  return {
    1: { x: sprite.width - base7.x, y: base7.y },
    3: base3,
    5: { x: sprite.width - base3.x, y: base3.y },
    7: base7,
  }
}

export interface FurniScene {
  /** 房间地板原点（含舞台居中） */
  floorTop: GridPoint
  /** 官方 `setTopPoint` 里的 +20 约定（docs/room-spec.md §5.3） */
  xBias?: number
}

/**
 * 家具精灵左上角的屏幕坐标。
 *
 * 官方 `Furni.setTopPoint`：
 * ```
 * s = getItemPos(topPoint) + floorTop
 * x = s.x - baseLoc(dir).x + 20
 * y = s.y - baseLoc(dir).y
 * ```
 * 挂墙物件的坐标是像素槽位（`locP`），不走这套换算。
 */
export function furniOrigin(
  cell: GridPoint,
  dir: RoomDirection,
  anchors: FurniAnchors,
  scene: FurniScene,
): GridPoint {
  const bias = scene.xBias ?? 20
  const anchor = anchors[dir]
  // 锚点里带 2.5 的修正，可能是 .5；像素风一律取整，避免亚像素绘制
  return {
    x: Math.round((cell.x - cell.y) * 10 + scene.floorTop.x - anchor.x + bias),
    y: Math.round((cell.x + cell.y) * 5 + scene.floorTop.y - anchor.y),
  }
}

/**
 * 可叠放点（`surfaceLoc`）解析成当前朝向的槽位列表。
 *
 * 官方 `getSurfaceLoc()`：
 * ```
 * dir3 → surfaceLoc3
 * dir5 → surfaceLoc5 ?? surfaceLoc3        （surfaceLoc5 = bitmapW - surfaceLoc3.x）
 * dir7 → surFaceLoc7 ?? surfaceLoc5
 * dir1 → surfaceLoc1 ?? surfaceLoc3
 * ```
 * 而 `surfaceLoc` 串里的第 0 组是 dir3、第 1 组是 dir7。
 */
export function furniSurfaceSlots(
  meta: Pick<FurniMeta, 'surfaceLoc'>,
  dir: RoomDirection,
  spriteWidth: number,
): GridPoint[] {
  const groups = parseSurfaceLoc(meta.surfaceLoc)
  if (!groups) return []

  const group3 = groups[0] ?? []
  const group7 = groups[1] ?? null
  const mirror = (points: GridPoint[]): GridPoint[] =>
    points.map((point) => ({ x: point.x > 0 ? spriteWidth - point.x : 0, y: point.y }))

  if (dir === 3) return group3
  if (dir === 7) return group7 ?? mirror(group3)
  if (dir === 5) return mirror(group3)
  return group7 ? mirror(group7) : group3
}

/**
 * 挂墙物件的屏幕坐标。
 *
 * 官方把挂墙件的 `baseLoc` 改写成图片中心，然后
 * `x = locP.x - w/2 + 1`、`y = locP.y - h/2 + 2`。
 * 这里的 `locP` 取「墙板中心」，于是等价于把精灵居中到墙板上（+1/+2 的官方微调照抄）。
 */
export function wallItemOrigin(
  panel: { x: number; y: number; width: number; height: number },
  sprite: { width: number; height: number },
): GridPoint {
  return {
    x: Math.round(panel.x + (panel.width - sprite.width) / 2) + 1,
    y: Math.round(panel.y + (panel.height - sprite.height) / 2) + 2,
  }
}

/** 叠放在桌面/柜面上的物件坐标：父物件原点 − 子锚点 + 槽位（官方 `Dish.setTopPoint`）。 */
export function surfaceItemOrigin(
  parentOrigin: GridPoint,
  childAnchor: GridPoint,
  slot: GridPoint,
): GridPoint {
  return {
    x: Math.round(parentOrigin.x - childAnchor.x + slot.x),
    y: Math.round(parentOrigin.y - childAnchor.y + slot.y),
  }
}

/**
 * 遮罩符号（`_NNm`）。
 *
 * 官方 `getMaskBmdFromImage`：遮罩只有 `_3_` 与 `_7_` 两套原图，
 * 缺帧回退到该方向的 01 帧；`dir5 = 镜像(dir3)`、`dir1 = 镜像(dir7)`。
 */
export function furniMaskSymbol(
  meta: Pick<FurniMeta, 'code'>,
  dir: RoomDirection,
  frame = 1,
  available?: ReadonlySet<string>,
): { symbol: string; mirrored: boolean } | null {
  const suffix = `${frameSuffix(frame)}m`
  const exists = (name: string): boolean => (available ? available.has(name) : true)
  const pick = (name: string, fallback: string): string | null => {
    if (exists(name)) return name
    if (exists(fallback)) return fallback
    return null
  }

  const base3 = pick(`${meta.code}_3_${suffix}`, `${meta.code}_3_01m`)
  const base7 = pick(`${meta.code}_7_${suffix}`, `${meta.code}_7_01m`)

  if (dir === 3) return base3 ? { symbol: base3, mirrored: false } : null
  if (dir === 5) return base3 ? { symbol: base3, mirrored: true } : null
  if (dir === 7) return base7 ? { symbol: base7, mirrored: false } : null
  return base7 ? { symbol: base7, mirrored: true } : null
}

/**
 * 遮罩该画在哪。
 *
 * 官方在**子物件**的渲染层上贴父物件的遮罩，偏移是 `父.position − 子.position`
 * （`position` 是屏幕坐标，所以加回来就是父物件原点）；
 * 换算成绝对坐标就是「父物件的原点」。`Posy` 放在 `Bonsai` 上时，
 * 植物底部会被花盆的前沿裁掉，看起来才像是种在盆里。
 */
export function maskOrigin(parent: GridPoint): GridPoint {
  return { x: parent.x, y: parent.y }
}
