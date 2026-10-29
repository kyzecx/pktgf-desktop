/**
 * 极简 TMX（Tiled）解析器。
 *
 * 只需要场景房用到的子集：`<map>` 属性、`<tileset>`（含 `<image>` 与 tile 的
 * `type` 属性）、`<layer>` 数据（CSV 或 base64+zlib）。不依赖任何 XML 库；
 * zlib 解压需要调用方注入（Node 用 `zlib`，浏览器用 `DecompressionStream`）。
 *
 * 官方客户端用 `org.io.arkeus.tiled` 解析，字段名一致（docs/room-spec.md §4.2 补充）。
 */

export interface TmxTileset {
  firstGid: number
  name: string
  tileWidth: number
  tileHeight: number
  columns: number
  tileCount: number
  image: { source: string; width: number; height: number }
  /** tile id → 官方地块类型（0/10/20…） */
  types: Map<number, number>
}

export interface TmxLayer {
  name: string
  visible: boolean
  /** 行优先；0 = 空，负值 = 水平翻转 */
  data: number[][]
}

export interface TmxMap {
  width: number
  height: number
  tileWidth: number
  tileHeight: number
  tilesets: TmxTileset[]
  layers: TmxLayer[]
}

/** Tiled 的水平翻转标记位。 */
const FLIPPED_FLAG = 0x80000000

export interface TmxParseOptions {
  /** base64+zlib 图层需要；浏览器传 `DecompressionStream` 的实现 */
  inflate?: (bytes: Uint8Array) => Promise<Uint8Array> | Uint8Array
}

export async function parseTmx(xml: string, options: TmxParseOptions = {}): Promise<TmxMap> {
  const mapTag = /<map\b([^>]*)>/.exec(xml)
  if (!mapTag) throw new Error('TMX 缺少 <map>')
  const mapAttrs = attrs(mapTag[1] ?? '')

  const tilesets: TmxTileset[] = []
  for (const match of xml.matchAll(/<tileset\b([^>]*)>([\s\S]*?)<\/tileset>/g)) {
    const head = attrs(match[1] ?? '')
    const body = match[2] ?? ''
    const imageTag = /<image\b([^>]*)\/?>/.exec(body)
    const image = imageTag ? attrs(imageTag[1] ?? '') : {}

    const types = new Map<number, number>()
    for (const tile of body.matchAll(/<tile\b([^>]*)>([\s\S]*?)<\/tile>/g)) {
      const tileAttrs = attrs(tile[1] ?? '')
      const typeTag = /<property\b([^>]*name="type"[^>]*)\/?>/.exec(tile[2] ?? '')
      if (!typeTag) continue
      const property = attrs(typeTag[1] ?? '')
      const id = Number(tileAttrs.id)
      const type = Number(property.value)
      if (Number.isFinite(id) && Number.isFinite(type)) types.set(id, type)
    }

    tilesets.push({
      firstGid: num(head.firstgid),
      name: head.name ?? '',
      tileWidth: num(head.tilewidth),
      tileHeight: num(head.tileheight),
      columns: num(head.columns),
      tileCount: num(head.tilecount),
      image: {
        source: image.source ?? '',
        width: num(image.width),
        height: num(image.height),
      },
      types,
    })
  }

  const layers: TmxLayer[] = []
  for (const match of xml.matchAll(/<layer\b([^>]*)>([\s\S]*?)<\/layer>/g)) {
    const head = attrs(match[1] ?? '')
    const body = match[2] ?? ''
    const dataTag = /<data\b([^>]*)>([\s\S]*?)<\/data>/.exec(body)
    if (!dataTag) continue
    const dataAttrs = attrs(dataTag[1] ?? '')
    const payload = (dataTag[2] ?? '').trim()

    let numbers: number[] = []
    if (!dataAttrs.encoding || dataAttrs.encoding === 'csv') {
      numbers = payload
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value))
    } else if (dataAttrs.encoding === 'base64') {
      const raw = base64ToBytes(payload)
      const bytes =
        dataAttrs.compression === 'zlib'
          ? options.inflate
            ? await options.inflate(raw)
            : null
          : raw
      if (!bytes) throw new Error('TMX 图层是 zlib 压缩的，需要注入 inflate')
      numbers = []
      for (let i = 0; i + 3 < bytes.length; i += 4) {
        // Tiled 的 gid 是无符号 32 位，高 3 位是翻转标记；先转无符号再取低 29 位
        const value =
          (bytes[i]! | (bytes[i + 1]! << 8) | (bytes[i + 2]! << 16) | (bytes[i + 3]! << 24)) >>> 0
        const gid = value & 0x1fffffff
        numbers.push((value & FLIPPED_FLAG) !== 0 ? -gid : gid)
      }
    } else {
      continue
    }

    const width = num(mapAttrs.width)
    const height = num(mapAttrs.height)
    if (width <= 0 || height <= 0) continue

    const data: number[][] = []
    for (let y = 0; y < height; y += 1) {
      data.push(numbers.slice(y * width, (y + 1) * width))
    }

    layers.push({
      name: head.name ?? '',
      visible: head.visible !== '0',
      data,
    })
  }

  return {
    width: num(mapAttrs.width),
    height: num(mapAttrs.height),
    tileWidth: num(mapAttrs.tilewidth),
    tileHeight: num(mapAttrs.tileheight),
    tilesets,
    layers,
  }
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64ToBytes(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/=]/g, '')
  const out: number[] = []
  for (let i = 0; i < clean.length; i += 4) {
    const a = BASE64.indexOf(clean[i] ?? '=')
    const b = BASE64.indexOf(clean[i + 1] ?? '=')
    const c = BASE64.indexOf(clean[i + 2] ?? '=')
    const d = BASE64.indexOf(clean[i + 3] ?? '=')
    if (a < 0 || b < 0) break
    out.push(((a << 2) | (b >> 4)) & 0xff)
    if (c >= 0) out.push(((b << 4) | (c >> 2)) & 0xff)
    if (d >= 0) out.push(((c << 6) | d) & 0xff)
  }
  return new Uint8Array(out)
}

function attrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const match of raw.matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g)) {
    const key = match[1]
    const value = match[2]
    if (key && value !== undefined) out[key] = value
  }
  return out
}

function num(value: string | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
