import { openBundle, readSymbolImage } from './bundle'
import { crop, whiteKeyBackdrop, whiteToAlpha } from './image'
import type { OfficialSpec } from './spec'
import type { Part, Rect, RgbaImage } from './types'

/**
 * 一件服饰在大模型里的全部图层。
 *
 * 静态物品来自 sheet 的 x=600 区域；动态物品（`motionName` 非空且包里存在
 * `<code>_Animate`）来自帧条 x=0 起的连续 100×150 帧。
 */
export interface CostumeArt {
  part: Part
  /** 动态帧；静态物品为空数组。 */
  frames: RgbaImage[]
  frameRate: number
  backHead?: RgbaImage
  frontHead?: RgbaImage
  body?: RgbaImage
  wingMask?: RgbaImage
}

export interface CostumeFlags {
  useMask?: boolean
  coverHead?: boolean
  displaytemplate?: boolean
  motionName?: string | null
}

export interface CostumeInstance extends CostumeArt, Required<Omit<CostumeFlags, 'motionName'>> {
  code: string
  motionName: string | null
}

export interface BuildCostumeInput {
  spec: OfficialSpec
  code: string
  part: Part
  zipBytes: Uint8Array
  flags?: CostumeFlags
}

export class CostumeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CostumeError'
  }
}

export function buildCostume(input: BuildCostumeInput): CostumeInstance {
  const { spec, code, part, zipBytes } = input
  const flags = input.flags ?? {}
  const binding = spec.parts[part]
  if (!binding) throw new CostumeError(`未知部位: ${part}`)

  const bundle = openBundle(zipBytes)
  const staticSymbol = readSymbolImage(bundle, code)
  const motionName = flags.motionName?.trim() ? flags.motionName.trim() : null
  const animateSymbol = readSymbolImage(bundle, `${code}_Animate`)
  const useAnimate = Boolean(motionName && animateSymbol)
  if (!staticSymbol && !useAnimate) throw new CostumeError(`服饰包缺少符号 ${code}`)

  const art: CostumeArt = {
    part,
    frames: [],
    frameRate: bundle.frameRate,
  }

  if (useAnimate && animateSymbol) {
    art.frames = sliceFrames(animateSymbol, spec)
    for (const frame of art.frames) whiteKeyBackdrop(frame)
    // 动态物品没有 x=600 的大图，头/身体一律取帧条。
    if (binding.frontHead) art.frontHead = art.frames[0]
    if (binding.backHead) art.backHead = undefined
    if (binding.body) art.body = art.frames[0]
    if (binding.wingMask && staticSymbol) {
      art.wingMask = keyedCrop(staticSymbol, spec.crops.wingMask)
    }
  } else if (staticSymbol) {
    if (binding.frontHead) art.frontHead = keyedCrop(staticSymbol, spec.crops.frontHead)
    if (binding.backHead) art.backHead = keyedCrop(staticSymbol, spec.crops.backHead)
    if (binding.body) art.body = keyedCrop(staticSymbol, spec.crops.body)
    if (binding.wingMask) art.wingMask = keyedCrop(staticSymbol, spec.crops.wingMask)
  }

  // 身体类服饰的底色按规则转透明。
  if (binding.body && spec.whiteKeyBodyParts.includes(part) && art.body && !useAnimate) {
    whiteToAlpha(art.body)
  }

  // useMask 的头部图层做白转透明。
  if (flags.useMask) {
    if (art.frontHead) whiteToAlpha(art.frontHead)
    if (art.backHead) whiteToAlpha(art.backHead)
    for (const frame of art.frames) whiteToAlpha(frame)
  }

  return {
    ...art,
    code,
    motionName,
    useMask: Boolean(flags.useMask),
    coverHead: Boolean(flags.coverHead),
    displaytemplate: Boolean(flags.displaytemplate),
  }
}

function keyedCrop(sheet: RgbaImage, rect: Rect): RgbaImage {
  const image = crop(sheet, rect)
  whiteKeyBackdrop(image)
  return image
}

function sliceFrames(sheet: RgbaImage, spec: OfficialSpec): RgbaImage[] {
  const { frameWidth, frameHeight, maxFrames } = spec.animated
  const count = Math.max(1, Math.min(maxFrames, Math.floor(sheet.width / frameWidth)))
  const frames: RgbaImage[] = []
  for (let index = 0; index < count; index += 1) {
    frames.push(crop(sheet, { x: index * frameWidth, y: 0, w: frameWidth, h: frameHeight }))
  }
  return frames
}
