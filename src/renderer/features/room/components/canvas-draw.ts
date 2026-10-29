import type { Catalog, CatalogFurniture, CatalogRoomDef, RoomDirection } from '@shared/contract'
import {
  SortMgr2D,
  buildFloorPieces,
  buildWallPieces,
  doorPlacement,
  floorCellOrigin,
  footprint,
  footprintCells,
  furniAnchors,
  furniDims,
  furniOrigin,
  furniSurfaceSlots,
  surfaceItemOrigin,
  tileDiamond,
  wallItemOrigin,
  type FurniInstance,
  type RoomLayout,
  type Sortable,
} from '@engine/room'
import type { RoomModel } from '@engine/room'

import type { DecoAssets, FurniArt } from '../services'
import { furniArtKey } from '../services'

/**
 * 画布绘制函数：全部是「给 ctx 一张图/一组指令」的纯函数，
 * 与 React 状态无关，方便单独读、也方便将来换 WebGL。
 */

export interface DrawnFurni {
  instance: FurniInstance
  def: CatalogFurniture
  art: FurniArt
  anchors: ReturnType<typeof furniAnchors>
  origin: { x: number; y: number }
}

export function buildDrawList(input: {
  catalog: Catalog
  arts: Map<string, FurniArt | null>
  furni: FurniInstance[]
  layout: RoomLayout
  /** 墙板矩形（按当前墙纸算），挂墙件用它定位 */
  wallPanels?: Map<string, { x: number; y: number; width: number; height: number }>
}): DrawnFurni[] {
  const sortables: Array<Sortable & { instance: FurniInstance; def: CatalogFurniture }> = []

  for (const instance of input.furni) {
    const def = input.catalog.furniture.find((item) => item.code === instance.code)
    if (!def) continue
    // 挂墙件没有格点，用所属墙面格参与排序（永远贴在后墙一侧）
    const top = instance.wallLoc
      ? { x: instance.wallLoc.x, y: instance.wallLoc.y }
      : { x: instance.x, y: instance.y }
    const dims = furniDims(def, instance.dir)
    sortables.push({
      id: instance.uid,
      top,
      rows: dims.rows,
      cols: dims.cols,
      parentId: instance.surface?.parent ?? null,
      overMe: def.otherOverMe,
      surfaceIndex: instance.surface?.index ?? 0,
      dir: instance.dir,
      instance,
      def,
    })
  }

  const sorter = new SortMgr2D<(typeof sortables)[number]>({
    childrenOf: (parent) =>
      sortables
        .filter((child) => child.parentId === parent.id)
        .map((child) => ({ item: child, index: child.surfaceIndex ?? 0 })),
    slotOf: (parent, index) => {
      const art = input.arts.get(furniArtKey(parent.instance))
      if (!art) return null
      return furniSurfaceSlots(parent.def, parent.instance.dir, art.width)[index] ?? null
    },
  })

  const ordered = sorter.rebuild(sortables)
  const out: DrawnFurni[] = []
  const byUid = new Map<string, DrawnFurni>()

  for (const entry of ordered) {
    const art = input.arts.get(furniArtKey(entry.instance))
    if (!art) continue
    const anchors = furniAnchors(
      entry.def,
      { width: art.width, height: art.height },
      entry.instance.dir,
    )

    let origin: { x: number; y: number }
    if (entry.instance.wallLoc) {
      const panel = input.wallPanels?.get(wallKey(entry.instance.wallLoc))
      origin = panel
        ? wallItemOrigin(panel, { width: art.width, height: art.height })
        : { x: -9999, y: -9999 }
    } else {
      origin = furniOrigin(
        { x: entry.instance.x, y: entry.instance.y },
        entry.instance.dir,
        anchors,
        { floorTop: input.layout.floorTop },
      )
    }

    const drawn: DrawnFurni = { instance: entry.instance, def: entry.def, art, anchors, origin }
    out.push(drawn)
    byUid.set(entry.instance.uid, drawn)
  }

  // 叠放件：父原点 − 子锚点 + 槽位（官方 Dish.setTopPoint）
  for (const drawn of out) {
    const surface = drawn.instance.surface
    if (!surface) continue
    const parent = byUid.get(surface.parent)
    if (!parent) continue
    const slots = furniSurfaceSlots(parent.def, parent.instance.dir, parent.art.width)
    const slot = slots[surface.index]
    if (!slot) continue
    drawn.origin = surfaceItemOrigin(parent.origin, drawn.anchors[drawn.instance.dir], slot)
  }

  return out
}

/** 墙面格 + 变体 → 墙板 key（与 `buildWallPieces` 的产出对应）。 */
export function wallKey(loc: { x: number; y: number; variant: string }): string {
  return `${loc.x},${loc.y},${loc.variant}`
}

export function drawStatic(
  ctx: CanvasRenderingContext2D,
  input: {
    room: CatalogRoomDef
    model: RoomModel
    layout: RoomLayout
    deco: Partial<DecoAssets>
    /** 地板图自身格数（1 或 2），决定逐格还是隔格绘制 */
    floorCells?: 1 | 2
    /** 墙纸自身格数（1 或 2） */
    wallCells?: 1 | 2
    /** 整图房型：直接画整间场景图，跳过地板/墙/门拼接 */
    scene?: { bitmap: ImageBitmap; x: number; y: number } | null
  },
): void {
  const { room, model, layout, deco, scene, floorCells = 1, wallCells = 1 } = input

  if (scene) {
    ctx.drawImage(scene.bitmap, scene.x, scene.y)
    return
  }

  // 官方 Room.addRoom 顺序：wall → floor → door（地板压住墙脚）。
  if (deco.wall) {
    for (const piece of buildWallPieces(model.structure, layout, room, {
      tileCells: wallCells,
    })) {
      ctx.drawImage(deco.wall[piece.variant], piece.x, piece.y)
    }
  }

  if (deco.floor) {
    for (const piece of buildFloorPieces(model.structure, layout, { tileCells: floorCells })) {
      ctx.drawImage(deco.floor[piece.variant], piece.x, piece.y)
    }
  }

  if (deco.door) {
    const placed = doorPlacement(room, layout, deco.door, room.entryDir ?? 5)
    if (placed.flipped) {
      ctx.save()
      ctx.translate(placed.x + deco.door.width, placed.y)
      ctx.scale(-1, 1)
      ctx.drawImage(deco.door, 0, 0)
      ctx.restore()
    } else {
      ctx.drawImage(deco.door, placed.x, placed.y)
    }
  }
}

export function drawFurni(ctx: CanvasRenderingContext2D, entry: DrawnFurni): void {
  const { art, origin } = entry
  if (art.mirrored) {
    ctx.save()
    ctx.translate(origin.x + art.width, origin.y)
    ctx.scale(-1, 1)
    ctx.drawImage(art.bitmap, 0, 0)
    ctx.restore()
  } else {
    ctx.drawImage(art.bitmap, origin.x, origin.y)
  }
}

export function drawPlacementGhost(
  ctx: CanvasRenderingContext2D,
  input: {
    room: CatalogFurniture
    hover: { x: number; y: number } | null
    layout: RoomLayout
    occupancy: RoomModel
    art: FurniArt | null
    /** 放置朝向（决定占地是否互换与镜像），默认 3 */
    dir?: RoomDirection
  },
): void {
  const { room, hover, layout, occupancy, art, dir = 3 } = input
  if (!hover) return
  const dims = furniDims(room, dir)
  const ok = occupancy.canPlace(hover.x, hover.y, dims.rows, dims.cols)
  drawFootprint(
    ctx,
    layout,
    hover.x,
    hover.y,
    dims.rows,
    dims.cols,
    ok ? 'rgba(120,255,160,0.9)' : 'rgba(255,110,110,0.9)',
  )

  if (!art) return
  const anchors = furniAnchors(room, { width: art.width, height: art.height }, dir)
  const origin = furniOrigin(hover, dir, anchors, { floorTop: layout.floorTop })
  ctx.save()
  ctx.globalAlpha = ok ? 0.65 : 0.35
  if (art.mirrored) {
    ctx.translate(origin.x + art.width, origin.y)
    ctx.scale(-1, 1)
    ctx.drawImage(art.bitmap, 0, 0)
  } else {
    ctx.drawImage(art.bitmap, origin.x, origin.y)
  }
  ctx.restore()
}

export function drawFootprint(
  ctx: CanvasRenderingContext2D,
  layout: RoomLayout,
  x: number,
  y: number,
  rows: number,
  cols: number,
  color: string,
): void {
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  for (const cell of footprintCells(footprint(x, y, rows, cols))) {
    const origin = floorCellOrigin(cell.x, cell.y, layout)
    const points = tileDiamond(origin.x, origin.y)
    ctx.beginPath()
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y)
      else ctx.lineTo(point.x, point.y)
    })
    ctx.closePath()
    ctx.stroke()
  }
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  model: RoomModel,
  layout: RoomLayout,
): void {
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const cell of model.floorCells()) {
    const origin = floorCellOrigin(cell.x, cell.y, layout)
    const points = tileDiamond(origin.x, origin.y)
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y)
      else ctx.lineTo(point.x, point.y)
    })
    ctx.closePath()
  }
  ctx.stroke()
}

export function isCellInFootprint(
  cell: { x: number; y: number },
  instance: FurniInstance,
  def: CatalogFurniture,
): boolean {
  const fp = footprint(instance.x, instance.y, def.rows, def.cols)
  return cell.x >= fp.x0 && cell.x <= fp.x1 && cell.y >= fp.y0 && cell.y <= fp.y1
}

/** 放置挂墙件时，把可选的墙板整体描一遍（淡）＋当前悬停的那块描亮。 */
export function drawWallHighlight(
  ctx: CanvasRenderingContext2D,
  panels: Map<string, { x: number; y: number; width: number; height: number }>,
  activeKey: string | null,
): void {
  for (const [key, panel] of panels) {
    ctx.strokeStyle = key === activeKey ? 'rgba(120,255,160,0.95)' : 'rgba(120,255,160,0.25)'
    ctx.lineWidth = 1
    ctx.strokeRect(panel.x + 0.5, panel.y + 0.5, panel.width - 1, panel.height - 1)
  }
}

/** 在墙板上画出挂件的落位预览。 */
export function drawWallSlot(
  ctx: CanvasRenderingContext2D,
  panel: { x: number; y: number; width: number; height: number },
  def: { rows: number; cols: number },
): void {
  const width = Math.max(8, panel.width * Math.max(1, def.cols) * 0.5)
  const height = Math.max(8, panel.height * 0.4)
  ctx.fillStyle = 'rgba(120,255,160,0.18)'
  ctx.fillRect(panel.x, panel.y, width, height)
  ctx.strokeStyle = 'rgba(120,255,160,0.8)'
  ctx.strokeRect(panel.x + 0.5, panel.y + 0.5, width - 1, height - 1)
}

/** 某格上可用的墙板（挂墙件落点）：优先后墙的 up/left/right 变体。 */
export function wallSegmentsAt(
  panels: Map<string, { x: number; y: number; width: number; height: number; variant: string }>,
  cell: { x: number; y: number },
): Array<{ x: number; y: number; width: number; height: number }> {
  const out: Array<{ x: number; y: number; width: number; height: number }> = []
  for (const variant of ['up', 'right', 'left']) {
    const panel = panels.get(`${cell.x},${cell.y},${variant}`)
    if (panel) out.push(panel)
  }
  return out
}

export interface DrawnActor {
  instance: { uid: string; x: number; y: number; dir: RoomDirection }
  art: { bitmap: ImageBitmap; mirrored: boolean; width: number; height: number }
  origin: { x: number; y: number }
}

/**
 * 角色屏幕坐标。
 *
 * 官方 `Actor.setLoc`：
 * ```
 * x = getItemPos(top).x + floorTop.x - baseLoc.x + 20
 * y = getItemPos(top).y + floorTop.y - baseLoc.y - 10
 * ```
 * 小模型的 baseLoc 就是锚点表里的 `STAND_BASE_LOC_*`（约 (20,47)），
 * 这里用 47 的纵向值，保证脚站在菱形中心偏下。
 */
export function actorOrigin(
  cell: { x: number; y: number },
  dir: RoomDirection,
  layout: RoomLayout,
  anchors: Record<RoomDirection, { x: number; y: number }> = STAND_ANCHORS,
  offset: { x: number; y: number } = { x: 0, y: 0 },
): { x: number; y: number } {
  const anchor = anchors[dir]
  return {
    x: Math.round((cell.x - cell.y) * 10 + layout.floorTop.x - anchor.x + 20 + offset.x),
    y: Math.round((cell.x + cell.y) * 5 + layout.floorTop.y - anchor.y + offset.y - 10),
  }
}

/** 官方 `ve.STAND_BASE_LOC_*`（小模型站立锚点）。 */
export const STAND_ANCHORS: Record<RoomDirection, { x: number; y: number }> = {
  1: { x: 21, y: 47 },
  3: { x: 19, y: 47 },
  5: { x: 22, y: 47 },
  7: { x: 18, y: 48 },
}

/** 官方 `ve.SIT_BASE_LOC_*`（坐下）。 */
export const SIT_ANCHORS: Record<RoomDirection, { x: number; y: number }> = {
  1: { x: 22, y: 45 },
  3: { x: 20, y: 41 },
  5: { x: 19, y: 43 },
  7: { x: 19, y: 44 },
}

/** 官方 `ve.LIE_BASE_LOC_*`（躺下）。 */
export const LIE_ANCHORS: Record<RoomDirection, { x: number; y: number }> = {
  1: { x: 21, y: 45 },
  3: { x: 21, y: 44 },
  5: { x: 19, y: 42 },
  7: { x: 21, y: 43 },
}

/** 画一个角色（支持镜像）。 */
export function drawActor(ctx: CanvasRenderingContext2D, actor: DrawnActor): void {
  const { art, origin } = actor
  const y = origin.y - (art.height - 60)
  if (art.mirrored) {
    ctx.save()
    ctx.translate(origin.x + art.width, y)
    ctx.scale(-1, 1)
    ctx.drawImage(art.bitmap, 0, 0)
    ctx.restore()
  } else {
    ctx.drawImage(art.bitmap, origin.x, y)
  }
}

/** 场景绘制顺序：家具与角色共用一套深度排序（官方同样如此）。 */
export interface SceneOrderEntry {
  kind: 'furni' | 'actor'
  id: string
}

export function orderScene(
  furni: DrawnFurni[],
  actors: Array<{ uid: string; x: number; y: number; dir: RoomDirection }>,
): SceneOrderEntry[] {
  const sortables: Array<Sortable & { kind: 'furni' | 'actor' }> = []

  for (const entry of furni) {
    sortables.push({
      id: entry.instance.uid,
      top: { x: entry.instance.x, y: entry.instance.y },
      rows: entry.def.rows,
      cols: entry.def.cols,
      parentId: entry.instance.surface?.parent ?? null,
      overMe: entry.def.otherOverMe,
      surfaceIndex: entry.instance.surface?.index ?? 0,
      dir: entry.instance.dir,
      kind: 'furni',
    })
  }

  for (const actor of actors) {
    sortables.push({
      id: actor.uid,
      top: { x: actor.x, y: actor.y },
      rows: 1,
      cols: 1,
      parentId: null,
      overMe: 0,
      dir: actor.dir,
      kind: 'actor',
    })
  }

  const sorter = new SortMgr2D<(typeof sortables)[number]>()
  return sorter.rebuild(sortables).map((entry) => ({ kind: entry.kind, id: entry.id }))
}

/** 把 `"0xfff899"` / `#fff899` 解析成 rgb。 */
export function parseLightColor(raw: string): { r: number; g: number; b: number } {
  const text = raw.trim()
  const hex = /^(?:0x|#)?([0-9a-f]{6})$/i.exec(text)?.[1]
  if (!hex) return { r: 255, g: 244, b: 200 }
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  }
}

/** 解析 `"24 7"` 这种灯光位置（相对精灵左上角）。 */
export function parseLightLoc(raw: string): { x: number; y: number } {
  const [x, y] = raw.trim().split(/\s+/)
  return { x: Number(x) || 0, y: Number(y) || 0 }
}

/**
 * 灯光叠加 —— 官方 `FunctionType=Light` 那套：
 * `lightLoc` 是相对精灵左上角的偏移，`lightIntensity` 决定半径与强度，
 * `lightColor` 是暖色，`lightMode` 目前只见到 0（常亮）。
 *
 * 用 `lighter` 混合画一团径向渐变，等效于官方把灯光图叠上去。
 */
export function drawFurniLight(
  ctx: CanvasRenderingContext2D,
  entry: DrawnFurni,
  light: { loc: string; color: string; intensity: number; mode: number },
): void {
  if (!light.intensity || light.intensity < 1) return
  const offset = parseLightLoc(light.loc)
  const color = parseLightColor(light.color)
  const radius = 18 + light.intensity * 16
  const cx = entry.origin.x + offset.x
  const cy = entry.origin.y + offset.y

  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
  gradient.addColorStop(0, `rgba(${color.r},${color.g},${color.b},0.45)`)
  gradient.addColorStop(0.55, `rgba(${color.r},${color.g},${color.b},0.18)`)
  gradient.addColorStop(1, `rgba(${color.r},${color.g},${color.b},0)`)

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/**
 * 画父物件（`Bonsai`）的遮罩，压住子物件（`Posy`）的底部。
 *
 * 遮罩是父物件自己的图帧，位置就是父物件原点；镜像规则跟父物件美术一致。
 */
export function drawFurniMask(ctx: CanvasRenderingContext2D, parent: DrawnFurni): void {
  const mask = parent.art.mask
  if (!mask) return
  const { origin, art } = parent
  if (art.mirrored) {
    ctx.save()
    ctx.translate(origin.x + art.width, origin.y)
    ctx.scale(-1, 1)
    ctx.drawImage(mask, 0, 0)
    ctx.restore()
    return
  }
  ctx.drawImage(mask, origin.x, origin.y)
}

/** 框选矩形：把格子矩形画成等距菱形轮廓。 */
export function drawMarquee(
  ctx: CanvasRenderingContext2D,
  layout: RoomLayout,
  rect: { x0: number; x1: number; y0: number; y1: number },
): void {
  const corners = [
    toStage(layout, rect.x0, rect.y0),
    toStage(layout, rect.x1 + 1, rect.y0),
    toStage(layout, rect.x1 + 1, rect.y1 + 1),
    toStage(layout, rect.x0, rect.y1 + 1),
  ]
  if (corners.length === 0) return
  ctx.save()
  ctx.beginPath()
  corners.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y)
    else ctx.lineTo(point.x, point.y)
  })
  ctx.closePath()
  ctx.fillStyle = 'rgba(120,200,255,0.12)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(120,200,255,0.9)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.restore()
}

function toStage(layout: RoomLayout, x: number, y: number): { x: number; y: number } {
  return { x: (x - y) * 10 + layout.floorTop.x, y: (x + y) * 5 + layout.floorTop.y }
}
