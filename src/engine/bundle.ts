import { unzipSync } from 'fflate'

import { decodePng } from './png'
import type { RgbaImage } from './types'

/**
 * 服饰包读取。
 *
 * 支持 data.json + symbols/*.png，也支持 atlas_0.png + atlas_map.json。
 * 符号名以 `data.json.symbols[].className` 为准。
 */

export interface BundleSymbol {
  className: string
  /** 落到图集上的区域；直接铺图时为 null。 */
  atlas: { image: string; x: number; y: number; w: number; h: number } | null
  /** 直接铺图时的文件路径。 */
  path: string | null
}

export interface OfficialBundle {
  /** className -> 符号描述 */
  symbols: Map<string, BundleSymbol>
  /** 包内文件（懒解码用） */
  files: Map<string, Uint8Array>
  frameRate: number
  /** 解码结果缓存：className -> 位图 */
  cache: Map<string, RgbaImage>
}

interface DataJson {
  frameRate?: number
  symbols?: Array<{ path?: string; className?: string }>
}

interface AtlasEntry {
  atlas: string
  x: number
  y: number
  w: number
  h: number
}

export class BundleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BundleError'
  }
}

export function openBundle(zipBytes: Uint8Array): OfficialBundle {
  const files = new Map<string, Uint8Array>()
  const unzipped = unzipSync(zipBytes, {
    filter: (file) => !file.name.endsWith('/'),
  })
  for (const [name, data] of Object.entries(unzipped)) {
    files.set(name, data)
  }

  const dataFile = files.get('data.json')
  if (!dataFile) throw new BundleError('服饰包缺少 data.json')

  const data = JSON.parse(stripBom(decodeUtf8(dataFile))) as DataJson
  const atlasMap = files.get('atlas_map.json')
  const atlas = atlasMap
    ? (JSON.parse(stripBom(decodeUtf8(atlasMap))) as Record<string, AtlasEntry>)
    : null

  const symbols = new Map<string, BundleSymbol>()
  for (const symbol of data.symbols ?? []) {
    const className = symbol.className?.trim()
    const path = symbol.path?.trim()
    if (!className) continue

    const region = atlas && path ? atlas[path] : undefined
    symbols.set(className, {
      className,
      path: region ? null : (path ?? null),
      atlas: region
        ? { image: region.atlas, x: region.x, y: region.y, w: region.w, h: region.h }
        : null,
    })
  }

  return {
    symbols,
    files,
    frameRate: data.frameRate ?? 24,
    cache: new Map(),
  }
}

/** 取符号对应的完整位图（图集模式会自动裁出来）。 */
export function readSymbolImage(bundle: OfficialBundle, className: string): RgbaImage | null {
  const cached = bundle.cache.get(className)
  if (cached) return cached

  const symbol = bundle.symbols.get(className)
  if (!symbol) return null

  let image: RgbaImage | null = null
  if (symbol.atlas) {
    const atlasBytes = bundle.files.get(symbol.atlas.image)
    if (!atlasBytes) throw new BundleError(`图集缺失: ${symbol.atlas.image}`)
    const sheet = decodePng(atlasBytes)
    image = cropRaw(sheet, symbol.atlas)
  } else if (symbol.path) {
    const bytes = bundle.files.get(symbol.path)
    if (!bytes) throw new BundleError(`符号图片缺失: ${symbol.path}`)
    image = decodePng(bytes)
  }

  if (image) bundle.cache.set(className, image)
  return image
}

function cropRaw(
  image: RgbaImage,
  rect: { x: number; y: number; w: number; h: number },
): RgbaImage {
  const out = {
    width: rect.w,
    height: rect.h,
    data: new Uint8ClampedArray(rect.w * rect.h * 4),
  }
  for (let y = 0; y < rect.h; y += 1) {
    const sy = rect.y + y
    if (sy < 0 || sy >= image.height) continue
    const start = (sy * image.width + rect.x) * 4
    out.data.set(image.data.subarray(start, start + rect.w * 4), y * rect.w * 4)
  }
  return out
}

/** Windows 记事本保存的 JSON 会带 BOM，官方 config 就是这种。 */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

export function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes)
}
