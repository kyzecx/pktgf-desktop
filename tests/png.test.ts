import { describe, expect, it } from 'vitest'

import {
  createImage,
  decodePng,
  encodePng,
  crop,
  whiteToAlpha,
  scaleNearest,
} from '../src/engine/index.ts'
import { fillRect, px, solid } from './helpers/fixtures.ts'

describe('png 编解码', () => {
  it('能往返一个带透明度的位图', () => {
    const source = createImage(4, 3)
    fillRect(source, { x: 0, y: 0, w: 2, h: 2 }, [255, 0, 0, 255])
    fillRect(source, { x: 2, y: 1, w: 2, h: 2 }, [0, 255, 0, 128])

    const decoded = decodePng(encodePng(source))

    expect(decoded.width).toBe(4)
    expect(decoded.height).toBe(3)
    expect(px(decoded, 0, 0)).toEqual([255, 0, 0, 255])
    expect(px(decoded, 3, 2)).toEqual([0, 255, 0, 128])
    expect(px(decoded, 3, 0)).toEqual([0, 0, 0, 0])
  })

  it('拒绝非 PNG 数据', () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3]))).toThrow(/PNG/)
  })
})

describe('crop', () => {
  it('按矩形裁切且越界部分为透明', () => {
    const source = solid(10, 10, [1, 2, 3, 255])
    const out = crop(source, { x: 8, y: 8, w: 4, h: 4 })
    expect(out.width).toBe(4)
    expect(px(out, 0, 0)).toEqual([1, 2, 3, 255])
    expect(px(out, 3, 3)).toEqual([0, 0, 0, 0])
  })

  it('对完全越界的矩形返回全透明图', () => {
    const source = solid(10, 10, [1, 2, 3, 255])
    const out = crop(source, { x: 100, y: 100, w: 2, h: 2 })
    expect(px(out, 0, 0)).toEqual([0, 0, 0, 0])
  })
})

describe('whiteToAlpha', () => {
  it('只把不透明纯白变成透明', () => {
    const image = createImage(4, 1)
    fillRect(image, { x: 0, y: 0, w: 1, h: 1 }, [255, 255, 255, 255])
    fillRect(image, { x: 1, y: 0, w: 1, h: 1 }, [255, 255, 255, 254])
    fillRect(image, { x: 2, y: 0, w: 1, h: 1 }, [254, 255, 255, 255])
    fillRect(image, { x: 3, y: 0, w: 1, h: 1 }, [10, 20, 30, 255])

    whiteToAlpha(image)

    expect(px(image, 0, 0)).toEqual([0, 0, 0, 0])
    expect(px(image, 1, 0)).toEqual([255, 255, 255, 254])
    expect(px(image, 2, 0)).toEqual([254, 255, 255, 255])
    expect(px(image, 3, 0)).toEqual([10, 20, 30, 255])
  })
})

describe('scaleNearest', () => {
  it('整数放大不插值', () => {
    const image = createImage(2, 2)
    fillRect(image, { x: 0, y: 0, w: 1, h: 1 }, [9, 9, 9, 255])
    const out = scaleNearest(image, 3)
    expect(out.width).toBe(6)
    expect(px(out, 0, 0)).toEqual([9, 9, 9, 255])
    expect(px(out, 2, 2)).toEqual([9, 9, 9, 255])
    expect(px(out, 3, 0)).toEqual([0, 0, 0, 0])
  })
})
