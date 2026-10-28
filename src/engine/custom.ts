import { buildSmallCostumeFromImage, type SmallCostumeArt } from './small'
import { decodePng } from './png'
import { crop, whiteKeyBackdrop, whiteToAlpha } from './image'
import type { OfficialSpec } from './spec'
import type { CostumeInstance, CostumeArt } from './costume'
import type { Part, RgbaImage } from './types'

/**
 * 自建素材。
 *
 * 静态图：标准 700×840 sheet（大图取 x=600，小图取左上 40×60 格子）。
 * 动态图：额外一张 100×150 横向帧条。
 *
 * 动态素材通常同时上传静态 sheet 和帧条：中小模型用静态图，
 * 大模型用帧条播放动画。
 */

const FULL_SHEET_WIDTH = 700
const FULL_SHEET_HEIGHT = 840

export interface CustomAssetInput {
  spec: OfficialSpec
  id: string
  part: Part
  /** 700×840 静态 sheet */
  png: Uint8Array
  /** 可选：100×150 横向帧条 */
  animatePng?: Uint8Array
  useMask?: boolean
  coverHead?: boolean
  displaytemplate?: boolean
}

export function buildCustomCostume(input: CustomAssetInput): CostumeInstance {
  const { spec, part, id } = input
  const sheet = decodePng(input.png)
  if (sheet.width < FULL_SHEET_WIDTH || sheet.height < FULL_SHEET_HEIGHT) {
    throw new Error('静态素材必须是 700×840 sheet')
  }

  const binding = spec.parts[part]
  if (!binding) throw new Error(`该部位不支持自建素材: ${part}`)

  const art: CostumeArt = {
    part,
    frames: [],
    frameRate: 24,
    ...(binding.frontHead ? { frontHead: keyedCrop(sheet, spec.crops.frontHead) } : {}),
    ...(binding.backHead ? { backHead: keyedCrop(sheet, spec.crops.backHead) } : {}),
    ...(binding.body ? { body: keyedCrop(sheet, spec.crops.body) } : {}),
    ...(binding.wingMask ? { wingMask: keyedCrop(sheet, spec.crops.wingMask) } : {}),
  }

  let motionName: string | null = null
  if (input.animatePng) {
    const frames = sliceAnimateFrames(spec, decodePng(input.animatePng))
    if (frames.length === 0) throw new Error('动态帧条里没有有效帧')
    art.frames = frames.length > 1 ? frames : []
    const first = frames[0]
    if (binding.frontHead && first) art.frontHead = first
    if (binding.backHead) art.backHead = undefined
    if (binding.body && first) art.body = first
    motionName = frames.length > 1 ? 'custom' : null
  }

  if (input.useMask) {
    if (art.frontHead) whiteToAlpha(art.frontHead)
    if (art.backHead) whiteToAlpha(art.backHead)
    for (const frame of art.frames) whiteToAlpha(frame)
  }

  return {
    ...art,
    code: id,
    motionName,
    useMask: Boolean(input.useMask),
    coverHead: Boolean(input.coverHead),
    displaytemplate: Boolean(input.displaytemplate),
  }
}

/** 自建素材的小模型图层：只读静态 sheet 左侧的 40×60 格子。 */
export function buildCustomSmallCostume(input: {
  spec: OfficialSpec
  part: Part
  png: Uint8Array
}): SmallCostumeArt {
  const sheet = decodePng(input.png)
  if (sheet.width < FULL_SHEET_WIDTH || sheet.height < FULL_SHEET_HEIGHT) {
    throw new Error('静态素材必须是 700×840 sheet')
  }
  return buildSmallCostumeFromImage(sheet, input.part)
}

function keyedCrop(
  sheet: RgbaImage,
  rect: { x: number; y: number; w: number; h: number },
): RgbaImage {
  const image = crop(sheet, rect)
  whiteKeyBackdrop(image)
  return image
}

function sliceAnimateFrames(spec: OfficialSpec, sheet: RgbaImage): RgbaImage[] {
  const { frameWidth, frameHeight, maxFrames } = spec.animated
  const count = Math.max(1, Math.min(maxFrames, Math.floor(sheet.width / frameWidth)))
  const frames: RgbaImage[] = []
  for (let index = 0; index < count; index += 1) {
    const frame = crop(sheet, {
      x: index * frameWidth,
      y: 0,
      w: frameWidth,
      h: frameHeight,
    })
    whiteKeyBackdrop(frame)
    frames.push(frame)
  }
  return frames
}
