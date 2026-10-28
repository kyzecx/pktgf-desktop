import { GIFEncoder, applyPalette, quantize } from 'gifenc'

import type { RgbaImage } from './types'

/**
 * 把逐帧位图编码成 GIF（1-bit 透明度）。
 *
 * 动态物品只有 4–8 帧，这里用 gifenc 的 rgba4444 量化 + 透明索引，
 * 每一帧单独调色板，避免不同帧之间串色。
 */
export function encodeGif(frames: RgbaImage[], delays: number[]): Uint8Array {
  if (frames.length === 0) throw new Error('GIF 至少需要一帧')

  const first = frames[0]
  if (!first) throw new Error('GIF 至少需要一帧')
  const { width, height } = first
  const gif = GIFEncoder()

  frames.forEach((frame, index) => {
    if (frame.width !== width || frame.height !== height) {
      throw new Error('GIF 各帧尺寸必须一致')
    }

    const palette = quantize(frame.data, 256, {
      format: 'rgba4444',
      oneBitAlpha: true,
    })
    const indexed = applyPalette(frame.data, palette, 'rgba4444')
    const transparentIndex = palette.findIndex((color) => (color[3] ?? 255) === 0)

    gif.writeFrame(indexed, width, height, {
      palette,
      delay: delays[index] ?? 200,
      ...(transparentIndex >= 0 ? { transparent: true, transparentIndex } : {}),
    })
  })

  gif.finish()
  return gif.bytes()
}
