import type { RoomDirection } from '@shared/contract'

import { blend, createImage, flipHorizontal, scaleNearest, whiteToAlpha } from '../image'
import type { RgbaImage } from '../types'

import { SortMgr2D, type Sortable } from './sort'
import type { FurniMeta } from './furni'
import {
  furniAnchors,
  furniDims,
  furniOrigin,
  furniSurfaceSlots,
  surfaceItemOrigin,
  wallItemOrigin,
} from './furni'
import type { WallVariant } from './wall'
import { composeStaticLayer, type FloorAssets, type WallAssets } from './scene'
import type { RoomModel } from './room'
import type { RoomLayout } from './types'

/**
 * 确定性帧渲染（导出用）。
 *
 * 界面上是 Canvas 逐层 `drawImage`，导出必须能在没有 Canvas 的环境里
 * 得到**逐像素相同**的结果，所以这里用引擎自带的 `blend` 复刻同一条绘制顺序：
 * 静态层（墙→地→门）→ 家具（按 SortMgr2D）→ 角色 → 灯光叠层。
 *
 * 所有输入都是「时间 t 的函数」，同一份数据 + 同一个 t 一定得到同一张图，
 * 这样 GIF / 视频导出才不会和屏幕上的不一样。
 */

export interface ExportFurni {
  uid: string
  def: FurniMeta & { code: string; position: number; otherOverMe: 0 | 1 | 2; meOverOther: boolean }
  dir: RoomDirection
  x: number
  y: number
  /** 叠放：父物件 uid + 面序号 */
  surface: { parent: string; index: number } | null
  /** 挂墙位（所属墙面格）；地面/靠墙为 null */
  wallLoc: { x: number; y: number; variant: WallVariant } | null
  /** 当前帧的位图（调用方按时间采样好） */
  art: { image: RgbaImage; mirrored: boolean }
  /** 灯光（可选） */
  light?: { loc: string; color: string; intensity: number } | null
}

export interface ExportActor {
  uid: string
  x: number
  y: number
  dir: RoomDirection
  /** 调用方按时间渲染好的单帧 */
  art: { image: RgbaImage; mirrored: boolean }
  /** 坐/躺：用 SIT/LIE 锚点 */
  pose: 'stand' | 'sit' | 'lie'
  offset?: { x: number; y: number }
}

export interface ExportFrameInput {
  model: RoomModel
  layout: RoomLayout
  room: Parameters<typeof composeStaticLayer>[0]['room']
  stage: { width: number; height: number }
  floor?: FloorAssets | null
  wall?: WallAssets | null
  door?: RgbaImage | null
  doorDir?: RoomDirection
  floorCells?: 1 | 2
  wallCells?: 1 | 2
  furni: ExportFurni[]
  actors: ExportActor[]
  /** 墙板矩形（挂墙件定位用） */
  wallPanels?: Map<string, { x: number; y: number; width: number; height: number }>
  /** 画面等比放大 */
  scale?: number
  /** 背景色；不传则保持透明 */
  background?: readonly [number, number, number] | null
}

/** 官方小模型的站立 / 坐 / 躺锚点（与 canvas 侧同一组常量）。 */
const STAND: Record<RoomDirection, { x: number; y: number }> = {
  1: { x: 21, y: 47 },
  3: { x: 19, y: 47 },
  5: { x: 22, y: 47 },
  7: { x: 18, y: 48 },
}
const SIT: Record<RoomDirection, { x: number; y: number }> = {
  1: { x: 22, y: 45 },
  3: { x: 20, y: 41 },
  5: { x: 19, y: 43 },
  7: { x: 19, y: 44 },
}
const LIE: Record<RoomDirection, { x: number; y: number }> = {
  1: { x: 21, y: 45 },
  3: { x: 21, y: 44 },
  5: { x: 19, y: 42 },
  7: { x: 21, y: 43 },
}

/**
 * 渲染一帧。
 *
 * 顺序与界面完全一致：静态层（内部是 墙→地→门）→ 家具/角色统一排序 → 灯光。
 */
export function renderFrame(input: ExportFrameInput): RgbaImage {
  const staticLayer = composeStaticLayer({
    model: input.model,
    layout: input.layout,
    stage: input.stage,
    room: input.room,
    floor: input.floor ?? null,
    wall: input.wall ?? null,
    door: input.door ?? null,
    doorDir: input.doorDir ?? 5,
    floorCells: input.floorCells ?? 1,
    wallCells: input.wallCells ?? 1,
  })

  const canvas = {
    width: input.stage.width,
    height: input.stage.height,
    data: new Uint8ClampedArray(staticLayer.image.data),
  }
  if (input.background) {
    fillBackground(canvas, input.background)
    // 背景要在静态层下面 → 重新把静态层叠上去
    blend(canvas, staticLayer.image)
  }

  const items = buildOrder(input)
  for (const item of items) {
    if (item.kind === 'furni') {
      const placed = placeFurni(item.furni, input)
      if (!placed) continue
      blit(canvas, placed.image, placed.x, placed.y)
      if (item.furni.light) drawLight(canvas, placed, item.furni.light)
      continue
    }

    const actor = item.actor
    const anchorSet = actor.pose === 'sit' ? SIT : actor.pose === 'lie' ? LIE : STAND
    const anchor = anchorSet[actor.dir]
    const origin = {
      x: Math.round(
        (actor.x - actor.y) * 10 + input.layout.floorTop.x - anchor.x + 20 + (actor.offset?.x ?? 0),
      ),
      y: Math.round(
        (actor.x + actor.y) * 5 + input.layout.floorTop.y - anchor.y - 10 + (actor.offset?.y ?? 0),
      ),
    }
    blit(canvas, actor.art.image, origin.x, origin.y, actor.art.mirrored)
  }

  const scale = input.scale ?? 1
  return scale === 1 ? canvas : scaleNearest(canvas, scale)
}

interface OrderedItem {
  kind: 'furni' | 'actor'
  id: string
  furni: ExportFurni
  actor: ExportActor
}

/** 家具与角色共用一套深度排序（与界面上的 `orderScene` 同源）。 */
function buildOrder(input: ExportFrameInput): OrderedItem[] {
  const sortables: Array<Sortable & { entry: OrderedItem }> = []

  for (const item of input.furni) {
    const top = item.wallLoc ? { x: item.wallLoc.x, y: item.wallLoc.y } : { x: item.x, y: item.y }
    sortables.push({
      id: item.uid,
      top,
      rows: furniDims(item.def, item.dir).rows,
      cols: furniDims(item.def, item.dir).cols,
      parentId: item.surface?.parent ?? null,
      overMe: item.def.otherOverMe,
      surfaceIndex: item.surface?.index ?? 0,
      dir: item.dir,
      entry: { kind: 'furni', id: item.uid, furni: item, actor: EMPTY_ACTOR },
    })
  }
  for (const actor of input.actors) {
    sortables.push({
      id: actor.uid,
      top: { x: actor.x, y: actor.y },
      rows: 1,
      cols: 1,
      parentId: null,
      overMe: 0,
      dir: actor.dir,
      entry: { kind: 'actor', id: actor.uid, furni: EMPTY_FURNI, actor },
    })
  }

  const sorter = new SortMgr2D<(typeof sortables)[number]>({
    childrenOf: (parent) =>
      sortables
        .filter((child) => child.parentId === parent.id)
        .map((child) => ({ item: child, index: child.surfaceIndex ?? 0 })),
    slotOf: (parent, index) => {
      const art = parent.entry.furni?.art
      if (!art) return null
      return (
        furniSurfaceSlots(parent.entry.furni.def, parent.entry.furni.dir, art.image.width)[index] ??
        null
      )
    },
  })

  return sorter.rebuild(sortables).map((entry) => entry.entry)
}

/** 排序表里用不到的占位值，避免可空字段污染调用处。 */
const EMPTY_ACTOR = {
  uid: '',
  x: 0,
  y: 0,
  dir: 3 as RoomDirection,
  art: { image: createImage(1, 1), mirrored: false },
  pose: 'stand' as const,
}
const EMPTY_FURNI = {
  uid: '',
  def: {
    code: '',
    rows: 1,
    cols: 1,
    dirable: 2 as const,
    symetric: true,
    baseLoc: '',
    surfaceLoc: null,
    position: 1,
    otherOverMe: 0 as const,
    meOverOther: false,
  },
  dir: 3 as RoomDirection,
  x: 0,
  y: 0,
  surface: null,
  wallLoc: null,
  art: { image: createImage(1, 1), mirrored: false },
}

/** 家具的最终绘制位置（含挂墙 / 叠放 / 镜像）。 */
function placeFurni(
  item: ExportFurni,
  input: ExportFrameInput,
): { image: RgbaImage; x: number; y: number } | null {
  const { image, mirrored } = item.art
  const anchors = furniAnchors(item.def, { width: image.width, height: image.height }, item.dir)

  if (item.wallLoc) {
    const panel = input.wallPanels?.get(
      `${item.wallLoc.x},${item.wallLoc.y},${item.wallLoc.variant}`,
    )
    if (!panel) return null
    const origin = wallItemOrigin(panel, { width: image.width, height: image.height })
    return { image: mirrored ? flipHorizontal(image) : image, x: origin.x, y: origin.y }
  }

  if (item.surface) {
    const parent = input.furni.find((candidate) => candidate.uid === item.surface!.parent)
    if (!parent) return null
    const parentPlaced = placeFurni(parent, input)
    if (!parentPlaced) return null
    const slots = furniSurfaceSlots(parent.def, parent.dir, parentPlaced.image.width)
    const slot = slots[item.surface.index]
    if (!slot) return null
    const childAnchors = anchors[item.dir]
    const origin = surfaceItemOrigin({ x: parentPlaced.x, y: parentPlaced.y }, childAnchors, slot)
    return { image: mirrored ? flipHorizontal(image) : image, x: origin.x, y: origin.y }
  }

  const origin = furniOrigin({ x: item.x, y: item.y }, item.dir, anchors, {
    floorTop: input.layout.floorTop,
  })
  return { image: mirrored ? flipHorizontal(image) : image, x: origin.x, y: origin.y }
}

function blit(canvas: RgbaImage, image: RgbaImage, x: number, y: number, mirrored = false): void {
  const sprite = mirrored ? flipHorizontal(image) : image
  // 家具/角色图如果是白底导出（老素材），按官方规则先转透明
  if (hasWhiteBackdropFast(sprite)) whiteToAlpha(sprite)
  blend(canvas, sprite, x, y)
}

function fillBackground(canvas: RgbaImage, color: readonly [number, number, number]): void {
  for (let i = 0; i < canvas.data.length; i += 4) {
    canvas.data[i] = color[0]
    canvas.data[i + 1] = color[1]
    canvas.data[i + 2] = color[2]
    canvas.data[i + 3] = 255
  }
}

/** 灯光：径向渐变用加法混合近似（与界面上的 `lighter` 一致）。 */
function drawLight(
  canvas: RgbaImage,
  placed: { image: RgbaImage; x: number; y: number },
  light: { loc: string; color: string; intensity: number },
): void {
  if (!light.intensity || light.intensity < 1) return
  const [offsetX, offsetY] = light.loc.split(/\s+/).map(Number)
  const hex = /^(?:0x|#)?([0-9a-f]{6})$/i.exec(light.color.trim())?.[1] ?? 'fff899'
  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  const radius = 18 + light.intensity * 16
  const cx = placed.x + (Number(offsetX) || 0)
  const cy = placed.y + (Number(offsetY) || 0)

  for (
    let y = Math.max(0, Math.floor(cy - radius));
    y < Math.min(canvas.height, cy + radius);
    y += 1
  ) {
    for (
      let x = Math.max(0, Math.floor(cx - radius));
      x < Math.min(canvas.width, cx + radius);
      x += 1
    ) {
      const distance = Math.hypot(x - cx, y - cy)
      if (distance > radius) continue
      const falloff = 1 - distance / radius
      const alpha = Math.round(falloff * falloff * 0.45 * 255 * (light.intensity / 2))
      if (alpha <= 0) continue
      const index = (y * canvas.width + x) * 4
      canvas.data[index] = Math.min(255, (canvas.data[index] ?? 0) + Math.round((r * alpha) / 255))
      canvas.data[index + 1] = Math.min(
        255,
        (canvas.data[index + 1] ?? 0) + Math.round((g * alpha) / 255),
      )
      canvas.data[index + 2] = Math.min(
        255,
        (canvas.data[index + 2] ?? 0) + Math.round((b * alpha) / 255),
      )
      canvas.data[index + 3] = Math.min(255, (canvas.data[index + 3] ?? 0) + alpha)
    }
  }
}

/** 极简白底判定：四个角有 3 个是纯白就当白底。 */
function hasWhiteBackdropFast(image: RgbaImage): boolean {
  const corners = [
    [0, 0],
    [image.width - 1, 0],
    [0, image.height - 1],
    [image.width - 1, image.height - 1],
  ] as const
  let white = 0
  for (const [x, y] of corners) {
    const i = (y * image.width + x) * 4
    const a = image.data[i + 3] ?? 0
    const r = image.data[i] ?? 0
    const g = image.data[i + 1] ?? 0
    const b = image.data[i + 2] ?? 0
    if (a > 0 && r > 240 && g > 240 && b > 240) white += 1
  }
  return white >= 3
}

export { createImage }
