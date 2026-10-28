import { zipSync } from 'fflate'

import { createImage, decodePng, encodePng } from '../../src/engine/index.ts'
import type { CostumeInstance, RgbaImage } from '../../src/engine/index.ts'

/**
 * 测试夹具：全部由代码生成，不依赖官方素材。
 *
 * 这样 CI 无需联网，也不会把游戏资源塞进仓库；同时能精确控制每个区域的
 * 颜色，用来断言裁切坐标、图层顺序和白转透明。
 */

export type Rgba = readonly [number, number, number, number]

export function px(image: RgbaImage, x: number, y: number): Rgba {
  const i = (y * image.width + x) * 4
  return [
    image.data[i] ?? 0,
    image.data[i + 1] ?? 0,
    image.data[i + 2] ?? 0,
    image.data[i + 3] ?? 0,
  ]
}

export function fill(image: RgbaImage, color: Rgba): RgbaImage {
  const { data } = image
  for (let i = 0; i < data.length; i += 4) {
    data[i] = color[0]
    data[i + 1] = color[1]
    data[i + 2] = color[2]
    data[i + 3] = color[3]
  }
  return image
}

/** 在指定矩形里填色（含白块测试用）。 */
export function fillRect(
  image: RgbaImage,
  rect: { x: number; y: number; w: number; h: number },
  color: Rgba,
): RgbaImage {
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue
      const i = (y * image.width + x) * 4
      image.data[i] = color[0]
      image.data[i + 1] = color[1]
      image.data[i + 2] = color[2]
      image.data[i + 3] = color[3]
    }
  }
  return image
}

export function solid(width: number, height: number, color: Rgba): RgbaImage {
  return fill(createImage(width, height), color)
}

export interface SheetOptions {
  frontHead?: Rgba
  backHead?: Rgba
  body?: Rgba
  wingMask?: Rgba
  /** 在 frontHead 区域左上角放一块不透明纯白，用于验证白转透明。 */
  frontHeadWhitePatch?: boolean
  bodyWhitePatch?: boolean
}

/** 生成 700×840 的标准服饰 sheet，四个大图区域各一种颜色。 */
export function makeSheet(options: SheetOptions = {}): RgbaImage {
  const sheet = createImage(700, 840)
  fillRect(sheet, { x: 600, y: 0, w: 100, h: 150 }, options.frontHead ?? [255, 0, 0, 255])
  fillRect(sheet, { x: 600, y: 150, w: 100, h: 150 }, options.backHead ?? [0, 255, 0, 255])
  fillRect(sheet, { x: 600, y: 300, w: 100, h: 150 }, options.body ?? [0, 0, 255, 255])
  fillRect(sheet, { x: 600, y: 450, w: 100, h: 150 }, options.wingMask ?? [255, 0, 255, 255])
  if (options.frontHeadWhitePatch) {
    fillRect(sheet, { x: 600, y: 0, w: 10, h: 10 }, [255, 255, 255, 255])
  }
  if (options.bodyWhitePatch) {
    fillRect(sheet, { x: 600, y: 300, w: 10, h: 10 }, [255, 255, 255, 255])
  }
  return sheet
}

export function makeZip(files: Record<string, Uint8Array>): Uint8Array {
  return zipSync(files, { level: 0 })
}

export interface CostumeZipOptions extends SheetOptions {
  code: string
  /** 动态帧数：>0 时生成 `<code>_Animate` 帧条（100×150/帧）。 */
  animateFrames?: number
  /** 帧条每帧的颜色，默认用不同颜色便于断言帧号。 */
  frameColors?: Rgba[]
  frameRate?: number
  /** 用图集模式打包。 */
  atlas?: boolean
}

export function makeCostumeZip(options: CostumeZipOptions): Uint8Array {
  const { code } = options
  const symbols: Array<{ path: string; className: string }> = []
  const files: Record<string, Uint8Array> = {}

  if (options.animateFrames && options.animateFrames > 0) {
    // 动态物品：静态符号只有小格，大图在 _Animate 帧条里。
    const small = solid(160, 60, [10, 10, 10, 255])
    files['symbols/1.png'] = encodePng(small)
    symbols.push({ path: 'symbols/1.png', className: code })

    const frames = options.animateFrames
    const strip = createImage(100 * frames, 150)
    for (let index = 0; index < frames; index += 1) {
      const color = options.frameColors?.[index] ?? [index * 40, 200, 100, 255]
      fillRect(strip, { x: index * 100, y: 0, w: 100, h: 150 }, color as Rgba)
    }
    files['symbols/2.png'] = encodePng(strip)
    symbols.push({ path: 'symbols/2.png', className: `${code}_Animate` })
  } else {
    const sheet = makeSheet(options)
    files['symbols/1.png'] = encodePng(sheet)
    symbols.push({ path: 'symbols/1.png', className: code })
  }

  if (options.atlas) {
    // 把唯一的图放进图集，验证 atlas_map 路径。
    const map: Record<string, { atlas: string; x: number; y: number; w: number; h: number }> = {}
    const source = files['symbols/1.png']
    if (source) {
      const image = decodePng(source)
      files['atlas_0.png'] = encodePng(image)
      delete files['symbols/1.png']
      for (const symbol of symbols) {
        map[symbol.path] = { atlas: 'atlas_0.png', x: 0, y: 0, w: image.width, h: image.height }
      }
      files['atlas_map.json'] = new TextEncoder().encode(JSON.stringify(map))
    }
  }

  files['data.json'] = new TextEncoder().encode(
    JSON.stringify({ root: 0, version: 0.1, symbols, frameRate: options.frameRate ?? 24 }),
  )
  files['library.json'] = new TextEncoder().encode(JSON.stringify({ version: 3 }))
  return makeZip(files)
}

export function makeActorZip(): Uint8Array {
  const sheet = createImage(700, 840)
  // 男头 (600,0) 红，女头 (600,300) 绿
  fillRect(sheet, { x: 600, y: 0, w: 100, h: 150 }, [200, 10, 10, 255])
  fillRect(sheet, { x: 600, y: 300, w: 100, h: 150 }, [10, 200, 10, 255])

  const files: Record<string, Uint8Array> = {
    'symbols/1.png': encodePng(sheet),
    'symbols/2.png': encodePng(solid(100, 150, [20, 20, 240, 255])),
    'symbols/3.png': encodePng(solid(100, 150, [240, 20, 240, 255])),
    'symbols/4.png': encodePng(solid(100, 150, [20, 240, 240, 255])),
    'symbols/5.png': encodePng(solid(100, 150, [240, 240, 20, 255])),
  }
  files['data.json'] = new TextEncoder().encode(
    JSON.stringify({
      root: 0,
      version: 0.1,
      symbols: [
        { path: 'symbols/1.png', className: 'actor' },
        { path: 'symbols/2.png', className: 'model_mbody' },
        { path: 'symbols/3.png', className: 'model_fbody' },
        { path: 'symbols/4.png', className: 'model_mleg' },
        { path: 'symbols/5.png', className: 'model_fleg' },
      ],
      frameRate: 30,
    }),
  )
  return makeZip(files)
}

/** 给测试用的纯色服饰实例（跳过 zip 解析）。 */
/** 允许覆盖除 part/code 之外的字段，避免可选字段把必填字段一起变成可选。 */
export type CostumeOverrides = Partial<Omit<CostumeInstance, 'part' | 'code'>>

export function fakeCostume(
  input: Pick<CostumeInstance, 'part' | 'code'> & CostumeOverrides,
): CostumeInstance {
  return {
    frames: [],
    frameRate: 24,
    motionName: null,
    useMask: false,
    coverHead: false,
    displaytemplate: false,
    ...input,
  }
}
