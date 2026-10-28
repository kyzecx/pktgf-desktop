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

export type SmallDirection = 'front' | 'back'

interface CellRect {
  x: number
  y: number
  w: number
  h: number
}

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
    // 背面腿图在 sheet 的第二块。
    leg: { x: 0, y: 720, w: SMALL_ART_WIDTH, h: SMALL_ART_HEIGHT },
  },
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
  /** 头/脸层：hair、bear、mask、hats、glas、cset 的头部 */
  head?: RgbaImage
  /** 身体层：clot、coat、cset、wing */
  body?: RgbaImage
  /** 手臂层：clot、coat、cset */
  arm?: RgbaImage
  /** 腿层：pant、cset */
  leg?: RgbaImage
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

  for (const direction of ['front', 'back'] as const) {
    const cells = CELLS[direction]
    const frame = art[direction]
    switch (part) {
      case 'hair':
      case 'bear':
      case 'mask':
      case 'hats':
      case 'glas':
        frame.head = keyedCrop(cells.head)
        break
      case 'clot':
      case 'coat':
        frame.body = keyedCrop(cells.body)
        frame.arm = keyedCrop(cells.arm)
        break
      case 'cset':
        frame.head = keyedCrop(cells.head)
        frame.body = keyedCrop(cells.body)
        frame.arm = keyedCrop(cells.arm)
        frame.leg = keyedCrop(cells.leg)
        break
      case 'pant':
        frame.leg = keyedCrop(cells.leg)
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

  const cset = worn.cset
  const csetArt = art('cset')
  const headCovered = Boolean(cset?.coverHead)

  if (direction === 'front') {
    // 1 翅膀；2 基础头（或表情小图）；3 眼镜；4 头部组合
    draw(art('wing')?.body)
    draw(input.face ?? base.head)
    draw(art('glas')?.head)
    draw(art('bear')?.head)
    if (headCovered) {
      draw(csetArt?.head)
    } else {
      draw(art('hair')?.head)
      draw(art('mask')?.head)
    }

    // 5 身体；6 腿；7-11 裤子/连身腿/上衣/外套/连身身体
    draw(base.body)
    draw(base.leg)
    if (cset) {
      draw(csetArt?.leg)
      draw(csetArt?.body)
    } else {
      draw(art('pant')?.leg)
      draw(art('clot')?.body)
      draw(art('coat')?.body)
    }

    // 12 手臂；13-15 上衣/外套/连身手臂；16 帽子
    draw(base.arm)
    if (cset) {
      draw(csetArt?.arm)
    } else {
      draw(art('clot')?.arm)
      draw(art('coat')?.arm)
    }
    if (!headCovered && !worn.hair?.coverHead) draw(art('hats')?.head)
  } else {
    // items2：基础头/身/腿 → 服饰身体 → 手臂 → 翅膀 → 头部组合 → 帽子
    draw(base.head)
    draw(base.body)
    draw(base.leg)
    if (cset) {
      draw(csetArt?.leg)
      draw(csetArt?.body)
    } else {
      draw(art('pant')?.leg)
      draw(art('clot')?.body)
      draw(art('coat')?.body)
    }
    draw(base.arm)
    if (cset) {
      draw(csetArt?.arm)
    } else {
      draw(art('clot')?.arm)
      draw(art('coat')?.arm)
    }
    draw(art('wing')?.body)
    draw(art('bear')?.head)
    if (headCovered) {
      draw(csetArt?.head)
    } else {
      draw(art('hair')?.head)
      draw(art('mask')?.head)
    }
    if (!headCovered && !worn.hair?.coverHead) draw(art('hats')?.head)
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
