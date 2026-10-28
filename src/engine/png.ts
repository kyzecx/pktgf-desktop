import { unzlibSync, zlibSync } from 'fflate'

import type { RgbaImage } from './types'

/**
 * 极简 PNG 编解码器。
 *
 * 为什么不用浏览器/原生实现：整个引擎需要在 Node（构建脚本、单测）和渲染进程里
 * 得到完全一致的结果，纯 JS 实现是唯一能保证这一点的方案。游戏资源全部是
 * 8bit RGBA 非隔行 PNG，这里额外兼容 RGB / 灰度 / 调色板，够用且可读。
 */

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export class PngError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PngError'
  }
}

interface Ihdr {
  width: number
  height: number
  bitDepth: number
  colorType: number
  interlace: number
}

function readIhdr(bytes: Uint8Array, offset: number): Ihdr {
  return {
    width: readUint32(bytes, offset),
    height: readUint32(bytes, offset + 4),
    bitDepth: bytes[offset + 8] ?? 0,
    colorType: bytes[offset + 9] ?? 0,
    interlace: bytes[offset + 12] ?? 0,
  }
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)) >>>
    0
  )
}

function channelsFor(colorType: number): number {
  switch (colorType) {
    case 0:
      return 1
    case 2:
      return 3
    case 3:
      return 1
    case 4:
      return 2
    case 6:
      return 4
    default:
      throw new PngError(`不支持的 PNG 颜色类型: ${colorType}`)
  }
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

/** 反 filter（PNG 规范 §9），原地处理一行。 */
function unfilterRow(
  filter: number,
  row: Uint8Array,
  prev: Uint8Array | null,
  bytesPerPixel: number,
): void {
  const length = row.length
  switch (filter) {
    case 0:
      return
    case 1:
      for (let i = bytesPerPixel; i < length; i += 1) {
        row[i] = ((row[i] ?? 0) + (row[i - bytesPerPixel] ?? 0)) & 0xff
      }
      return
    case 2:
      if (!prev) return
      for (let i = 0; i < length; i += 1) {
        row[i] = ((row[i] ?? 0) + (prev[i] ?? 0)) & 0xff
      }
      return
    case 3:
      for (let i = 0; i < length; i += 1) {
        const left = i >= bytesPerPixel ? (row[i - bytesPerPixel] ?? 0) : 0
        const up = prev ? (prev[i] ?? 0) : 0
        row[i] = ((row[i] ?? 0) + ((left + up) >> 1)) & 0xff
      }
      return
    case 4:
      for (let i = 0; i < length; i += 1) {
        const left = i >= bytesPerPixel ? (row[i - bytesPerPixel] ?? 0) : 0
        const up = prev ? (prev[i] ?? 0) : 0
        const upLeft = prev && i >= bytesPerPixel ? (prev[i - bytesPerPixel] ?? 0) : 0
        row[i] = ((row[i] ?? 0) + paeth(left, up, upLeft)) & 0xff
      }
      return
    default:
      throw new PngError(`不支持的 PNG filter: ${filter}`)
  }
}

export function decodePng(bytes: Uint8Array): RgbaImage {
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (bytes[i] !== PNG_SIGNATURE[i]) throw new PngError('不是合法的 PNG 文件')
  }

  let offset = 8
  let ihdr: Ihdr | null = null
  let palette: Uint8Array | null = null
  let transparency: Uint8Array | null = null
  const idat: Uint8Array[] = []

  while (offset + 8 <= bytes.length) {
    const length = readUint32(bytes, offset)
    const type = String.fromCharCode(
      bytes[offset + 4] ?? 0,
      bytes[offset + 5] ?? 0,
      bytes[offset + 6] ?? 0,
      bytes[offset + 7] ?? 0,
    )
    const dataStart = offset + 8
    const dataEnd = dataStart + length

    if (type === 'IHDR') ihdr = readIhdr(bytes, dataStart)
    else if (type === 'PLTE') palette = bytes.subarray(dataStart, dataEnd)
    else if (type === 'tRNS') transparency = bytes.subarray(dataStart, dataEnd)
    else if (type === 'IDAT') idat.push(bytes.subarray(dataStart, dataEnd))
    else if (type === 'IEND') break

    offset = dataEnd + 4 // 跳过 CRC
  }

  if (!ihdr) throw new PngError('PNG 缺少 IHDR')
  if (ihdr.bitDepth !== 8) throw new PngError(`不支持的 PNG 位深: ${ihdr.bitDepth}`)
  if (ihdr.interlace !== 0) throw new PngError('不支持隔行扫描 PNG')

  const channels = channelsFor(ihdr.colorType)
  const bytesPerPixel = channels
  const rowLength = ihdr.width * channels
  const inflated = unzlibSync(concat(idat))
  const expected = ihdr.height * (rowLength + 1)
  if (inflated.length < expected) {
    throw new PngError(`PNG 数据不完整: ${inflated.length} < ${expected}`)
  }

  const raw = new Uint8Array(ihdr.height * rowLength)
  let previous: Uint8Array | null = null
  for (let y = 0; y < ihdr.height; y += 1) {
    const rowStart = y * (rowLength + 1)
    const filter = inflated[rowStart] ?? 0
    const row = inflated.subarray(rowStart + 1, rowStart + 1 + rowLength)
    unfilterRow(filter, row, previous, bytesPerPixel)
    raw.set(row, y * rowLength)
    previous = row
  }

  const out = new Uint8ClampedArray(ihdr.width * ihdr.height * 4)
  for (let pixel = 0; pixel < ihdr.width * ihdr.height; pixel += 1) {
    const src = pixel * channels
    const dst = pixel * 4
    switch (ihdr.colorType) {
      case 0: {
        const value = raw[src] ?? 0
        out[dst] = value
        out[dst + 1] = value
        out[dst + 2] = value
        out[dst + 3] = 255
        break
      }
      case 2:
        out[dst] = raw[src] ?? 0
        out[dst + 1] = raw[src + 1] ?? 0
        out[dst + 2] = raw[src + 2] ?? 0
        out[dst + 3] = 255
        break
      case 3: {
        if (!palette) throw new PngError('调色板 PNG 缺少 PLTE')
        const index = raw[src] ?? 0
        out[dst] = palette[index * 3] ?? 0
        out[dst + 1] = palette[index * 3 + 1] ?? 0
        out[dst + 2] = palette[index * 3 + 2] ?? 0
        out[dst + 3] = transparency?.[index] ?? 255
        break
      }
      case 4: {
        const value = raw[src] ?? 0
        out[dst] = value
        out[dst + 1] = value
        out[dst + 2] = value
        out[dst + 3] = raw[src + 1] ?? 0
        break
      }
      case 6:
        out[dst] = raw[src] ?? 0
        out[dst + 1] = raw[src + 1] ?? 0
        out[dst + 2] = raw[src + 2] ?? 0
        out[dst + 3] = raw[src + 3] ?? 0
        break
    }
  }

  return { width: ihdr.width, height: ihdr.height, data: out }
}

function concat(chunks: Uint8Array[]): Uint8Array {
  let total = 0
  for (const chunk of chunks) total += chunk.length
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) {
    c = (CRC_TABLE[(c ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function writeUint32(value: number): Uint8Array {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ])
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array([...type].map((char) => char.charCodeAt(0)))
  const body = concat([typeBytes, data])
  return concat([writeUint32(data.length), body, writeUint32(crc32(body))])
}

/** 仅供测试与调试导出使用（filter 固定为 0）。 */
export function encodePng(image: RgbaImage): Uint8Array {
  const rowLength = image.width * 4
  const raw = new Uint8Array(image.height * (rowLength + 1))
  for (let y = 0; y < image.height; y += 1) {
    raw[y * (rowLength + 1)] = 0
    raw.set(image.data.subarray(y * rowLength, (y + 1) * rowLength), y * (rowLength + 1) + 1)
  }

  const ihdr = concat([
    writeUint32(image.width),
    writeUint32(image.height),
    new Uint8Array([8, 6, 0, 0, 0]),
  ])

  return concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibSync(raw, { level: 6 })),
    chunk('IEND', new Uint8Array(0)),
  ])
}
