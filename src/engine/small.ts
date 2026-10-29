import { openBundle, readSymbolImage } from './bundle'
import { blend, createImage, crop, whiteKeyBackdrop, whiteToAlpha } from './image'
import type { Part, RgbaImage } from './types'

/**
 * 小模型（40×60）合成。
 *
 * 小模型没有单独的资源包：基础头/身/手/腿和服饰小图都在同一张
 * 700×840 sheet 的左上角，按 40×60 单元格排列（见 docs §2）。
 * 这里只做衣柜需要的正面/背面待机第 0 帧，不处理转向与动作。
 *
 * 正面和背面各有一套固定图层顺序；背面没有眼镜层。
 */

export const SMALL_ART_WIDTH = 40
export const SMALL_ART_HEIGHT = 60

/** 官方小模型的帧数：腿 12 帧、手臂 15+9=24 帧、头 2 帧（`getLegBmd(dir, i)` 同源）。 */
export const SMALL_LEG_FRAMES = 12
export const SMALL_ARM_FRAMES = 24
export const SMALL_HEAD_FRAMES = 2

export type SmallDirection = 'front' | 'back'

interface CellRect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * 方向块内的相对偏移（正面块 y=0、背面块 y=420）。
 *
 * 服饰 sheet 与基础 actor sheet 布局相同，所以商店里的裤子 `f_pant001`
 * 在第 5 行（y=300）有 12 帧腿、第 12 行（y=720）有 12 帧背面腿。
 * 官方按帧号取：`pant.getLegBmd(dir, curLegIndex)` / `getArmBmd(dir, curArmIndex)`。
 */
const BLOCK_OFFSET: Record<SmallDirection, number> = { front: 0, back: 420 }
const PART_ROW = { head: 0, body: 60, arm: 120, armAlt: 180, leg: 300 } as const

const CELLS: Record<SmallDirection, Record<'head' | 'body' | 'arm' | 'leg', CellRect>> = {
  front: {
    head: { x: 0, y: 0, w: SMALL_ART_WIDTH, h: SMALL_ART_HEIGHT },
    body: { x: 0, y: 60, w: SMALL_ART_WIDTH, h: SMALL_ART_HEIGHT },
    arm: { x: 0, y: 120, w: SMALL_ART_WIDTH, h: SMALL_ART_HEIGHT },
    leg: { x: 0, y: 300, w: SMALL_ART_WIDTH, h: SMALL_ART_HEIGHT },
  },
  back: {
    head: { x: 0, y: 420, w: SMALL_ART_WIDTH, h: SMALL_ART_HEIGHT },
    body: { x: 0, y: 480, w: SMALL_ART_WIDTH, h: SMALL_ART_HEIGHT },
    arm: { x: 0, y: 540, w: SMALL_ART_WIDTH, h: SMALL_ART_HEIGHT },
    leg: { x: 0, y: 720, w: SMALL_ART_WIDTH, h: SMALL_ART_HEIGHT },
  },
}

/** 第 index 帧在「方向块」里的格子（手臂 15+9 分两行，与基础 actor 一致）。 */
export function smallFrameCell(
  direction: SmallDirection,
  part: 'head' | 'body' | 'arm' | 'leg',
  index = 0,
): CellRect {
  const base = BLOCK_OFFSET[direction]
  if (part === 'arm') {
    const safe = Math.max(0, index) % SMALL_ARM_FRAMES
    const row = safe < 15 ? PART_ROW.arm : PART_ROW.armAlt
    const column = safe < 15 ? safe : safe - 15
    return {
      x: column * SMALL_ART_WIDTH,
      y: base + row,
      w: SMALL_ART_WIDTH,
      h: SMALL_ART_HEIGHT,
    }
  }
  const count = part === 'leg' ? SMALL_LEG_FRAMES : part === 'head' ? SMALL_HEAD_FRAMES : 1
  const safe = Math.max(0, index) % count
  return {
    x: safe * SMALL_ART_WIDTH,
    y: base + PART_ROW[part],
    w: SMALL_ART_WIDTH,
    h: SMALL_ART_HEIGHT,
  }
}

export interface SmallActorFrame {
  head: RgbaImage
  body: RgbaImage
  arm: RgbaImage
  leg: RgbaImage
}

export interface SmallBaseActorArt {
  front: SmallActorFrame
  back: SmallActorFrame
}

export interface SmallCostumeFrame {
  /** 头层帧（官方 `curHeadIndex`）：hair、bear、mask、hats、glas、cset 的头部 */
  head?: RgbaImage[]
  /** 身体层（单帧）：clot、coat、cset、wing */
  body?: RgbaImage
  /** 手臂层帧（官方 `curArmIndex`）：clot、coat、cset */
  arm?: RgbaImage[]
  /** 腿层帧（官方 `curLegIndex`）：pant、cset */
  leg?: RgbaImage[]
}

export interface SmallCostumeArt {
  front: SmallCostumeFrame
  back: SmallCostumeFrame
}

export interface SmallWornItem {
  art: SmallCostumeArt
  useMask: boolean
  coverHead: boolean
}

export type SmallWorn = Partial<Record<Part, SmallWornItem>>

export function loadSmallBaseActor({ zipBytes }: { zipBytes: Uint8Array }): SmallBaseActorArt {
  const bundle = openBundle(zipBytes)
  const sheet = readSymbolImage(bundle, 'actor')
  if (!sheet) throw new Error('基础角色包缺少 actor 符号')

  return {
    front: cropFrame(sheet, 'front'),
    back: cropFrame(sheet, 'back'),
  }
}

export function buildSmallCostume(input: {
  part: Part
  code: string
  zipBytes: Uint8Array
}): SmallCostumeArt {
  const bundle = openBundle(input.zipBytes)
  const sheet = readSymbolImage(bundle, input.code)
  if (!sheet) return { front: {}, back: {} }
  return buildSmallCostumeFromImage(sheet, input.part)
}

/** 从一张 700×840 sheet 裁出小模型正面/背面图层。 */
export function buildSmallCostumeFromImage(sheet: RgbaImage, part: Part): SmallCostumeArt {
  const art: SmallCostumeArt = { front: {}, back: {} }

  const keyedCrop = (cell: CellRect): RgbaImage => {
    const image = crop(sheet, cell)
    whiteKeyBackdrop(image)
    return image
  }
  /** 按官方帧数裁一整组。 */
  const keyedFrames = (direction: SmallDirection, part: 'head' | 'arm' | 'leg'): RgbaImage[] => {
    const count =
      part === 'arm' ? SMALL_ARM_FRAMES : part === 'leg' ? SMALL_LEG_FRAMES : SMALL_HEAD_FRAMES
    const frames: RgbaImage[] = []
    for (let index = 0; index < count; index += 1) {
      frames.push(keyedCrop(smallFrameCell(direction, part, index)))
    }
    return frames
  }

  for (const direction of ['front', 'back'] as const) {
    const cells = CELLS[direction]
    const frame = art[direction]
    switch (part) {
      case 'hair':
      case 'bear':
      case 'mask':
      case 'hats':
      case 'glas':
        frame.head = keyedFrames(direction, 'head')
        break
      case 'clot':
      case 'coat':
        frame.body = keyedCrop(cells.body)
        frame.arm = keyedFrames(direction, 'arm')
        break
      case 'cset':
        frame.head = keyedFrames(direction, 'head')
        frame.body = keyedCrop(cells.body)
        frame.arm = keyedFrames(direction, 'arm')
        frame.leg = keyedFrames(direction, 'leg')
        break
      case 'pant':
        frame.leg = keyedFrames(direction, 'leg')
        break
      case 'wing':
        frame.body = keyedCrop(cells.body)
        break
      default:
        break
    }
  }

  return art
}

export interface SmallComposeInput {
  base: SmallBaseActorArt
  worn?: SmallWorn
  /** 40×60 的表情小图；只有正面使用。 */
  face?: RgbaImage | null
  direction?: SmallDirection
  /** 帧号（官方 curArmIndex / curLegIndex / curHeadIndex） */
  armIndex?: number
  legIndex?: number
  headIndex?: number
}

/** 取某一帧（帧号越界时退回第 0 帧，避免整层消失）。 */
function frameAt(frames: RgbaImage[] | undefined, index: number): RgbaImage | undefined {
  if (!frames || frames.length === 0) return undefined
  return frames[Math.max(0, index) % frames.length] ?? frames[0]
}

/** 按小模型图层顺序合成一张 40×60 的角色图。 */
export function composeSmallActor(input: SmallComposeInput): RgbaImage {
  const direction = input.direction ?? 'front'
  const base = input.base[direction]
  const worn = input.worn ?? {}
  const canvas = createImage(SMALL_ART_WIDTH, SMALL_ART_HEIGHT)

  const draw = (image: RgbaImage | null | undefined): void => {
    if (image) blend(canvas, image)
  }
  const art = (part: Part): SmallCostumeFrame | undefined => worn[part]?.art[direction]
  const armIndex = input.armIndex ?? 0
  const legIndex = input.legIndex ?? 0
  const headIndex = input.headIndex ?? 0
  const headOf = (part: Part): RgbaImage | undefined => frameAt(art(part)?.head, headIndex)
  const armOf = (part: Part): RgbaImage | undefined => frameAt(art(part)?.arm, armIndex)
  const legOf = (part: Part): RgbaImage | undefined => frameAt(art(part)?.leg, legIndex)

  const cset = worn.cset
  const csetArt = art('cset')
  const headCovered = Boolean(cset?.coverHead)

  if (direction === 'front') {
    // 1 翅膀；2 基础头（或表情小图）；3 眼镜；4 头部组合
    draw(art('wing')?.body)
    draw(input.face ?? base.head)
    draw(headOf('glas'))
    draw(headOf('bear'))
    if (headCovered) {
      draw(frameAt(csetArt?.head, headIndex))
    } else {
      draw(headOf('hair'))
      draw(headOf('mask'))
    }

    // 5 身体；6 腿；7-11 裤子/连身腿/上衣/外套/连身身体
    draw(base.body)
    draw(base.leg)
    if (cset) {
      draw(frameAt(csetArt?.leg, legIndex))
      draw(csetArt?.body)
    } else {
      draw(legOf('pant'))
      draw(art('clot')?.body)
      draw(art('coat')?.body)
    }

    // 12 手臂；13-15 上衣/外套/连身手臂；16 帽子
    draw(base.arm)
    if (cset) {
      draw(frameAt(csetArt?.arm, armIndex))
    } else {
      draw(armOf('clot'))
      draw(armOf('coat'))
    }
    if (!headCovered && !worn.hair?.coverHead) draw(headOf('hats'))
  } else {
    // items2：基础头/身/腿 → 服饰身体 → 手臂 → 翅膀 → 头部组合 → 帽子
    draw(base.head)
    draw(base.body)
    draw(base.leg)
    if (cset) {
      draw(frameAt(csetArt?.leg, legIndex))
      draw(csetArt?.body)
    } else {
      draw(legOf('pant'))
      draw(art('clot')?.body)
      draw(art('coat')?.body)
    }
    draw(base.arm)
    if (cset) {
      draw(frameAt(csetArt?.arm, armIndex))
    } else {
      draw(armOf('clot'))
      draw(armOf('coat'))
    }
    draw(art('wing')?.body)
    draw(headOf('bear'))
    if (headCovered) {
      draw(frameAt(csetArt?.head, headIndex))
    } else {
      draw(headOf('hair'))
      draw(headOf('mask'))
    }
    if (!headCovered && !worn.hair?.coverHead) draw(headOf('hats'))
    // 背面没有眼镜层（items2 不包含 glasSprite）
  }

  if (shouldWhiteKeySmall(worn)) whiteToAlpha(canvas)
  return canvas
}

function cropFrame(sheet: RgbaImage, direction: SmallDirection): SmallActorFrame {
  const cells = CELLS[direction]
  return {
    head: crop(sheet, cells.head),
    body: crop(sheet, cells.body),
    arm: crop(sheet, cells.arm),
    leg: crop(sheet, cells.leg),
  }
}

/** 与 `shouldWhiteKeyComposite` 同口径：外套/连身 + 没有任何「退出遮罩」的头部部件。 */
function shouldWhiteKeySmall(worn: SmallWorn): boolean {
  if (!worn.cset && !worn.coat) return false
  const headParts: Part[] = ['hats', 'mask', 'glas', 'bear', 'hair']
  return !headParts.some((part) => worn[part] && !worn[part]?.useMask)
}
