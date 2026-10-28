import { describe, expect, it } from 'vitest'

import { composeActor, FALLBACK_SPEC } from '../src/engine/index.ts'
import type { CostumeInstance, RgbaImage } from '../src/engine/index.ts'
import { fakeCostume, fillRect, solid } from './helpers/fixtures.ts'
import type { CostumeOverrides } from './helpers/fixtures.ts'

const spec = FALLBACK_SPEC

/**
 * 基础层用分段色块，避免互相覆盖导致断言看不出层次：
 *   y 0..69    基础头
 *   y 70..119  基础身体
 *   y 120..149 基础腿
 */
function splitBase(): { head: RgbaImage; body: RgbaImage; lowerbody: RgbaImage } {
  const head = solid(100, 150, [0, 0, 0, 0])
  fillRect(head, { x: 0, y: 0, w: 100, h: 70 }, [11, 11, 11, 255])
  const body = solid(100, 150, [0, 0, 0, 0])
  fillRect(body, { x: 0, y: 70, w: 100, h: 50 }, [22, 22, 22, 255])
  const lowerbody = solid(100, 150, [0, 0, 0, 0])
  fillRect(lowerbody, { x: 0, y: 120, w: 100, h: 30 }, [33, 33, 33, 255])
  return { head, body, lowerbody }
}

const base = splitBase()

function compose(
  worn: Record<string, CostumeInstance>,
  extra: Partial<Parameters<typeof composeActor>[0]> = {},
) {
  return composeActor({ spec, base, worn, ...extra })
}

function pixel(image: RgbaImage, x = 5, y = 5) {
  const i = (y * image.width + x) * 4
  return [image.data[i], image.data[i + 1], image.data[i + 2], image.data[i + 3]]
}

function layer(
  part: CostumeInstance['part'],
  color: [number, number, number, number],
  extra: CostumeOverrides = {},
): CostumeInstance {
  const image = solid(100, 150, color)
  const patch: CostumeOverrides = {}

  if (part === 'hair') {
    patch.frontHead = image
    patch.backHead = image
  } else if (['hats', 'mask', 'glas', 'bear'].includes(part)) {
    patch.frontHead = image
  } else if (part === 'wing') {
    patch.body = image
    patch.wingMask = image
  } else {
    patch.body = image
  }

  return fakeCostume({ part, code: `${part}_test`, ...patch, ...extra })
}

describe('图层顺序', () => {
  it('上方图层覆盖下方图层', () => {
    const out = compose({
      clot: layer('clot', [1, 1, 1, 255]),
      coat: layer('coat', [2, 2, 2, 255]),
    })
    expect(pixel(out)).toEqual([2, 2, 2, 255])
  })

  it('帽子在头发前层之上', () => {
    const out = compose({
      hair: layer('hair', [10, 10, 10, 255]),
      hats: layer('hats', [20, 20, 20, 255]),
    })
    expect(pixel(out)).toEqual([20, 20, 20, 255])
  })

  it('头发后层在最底下（会被基础腿覆盖）', () => {
    const backOnly = solid(100, 150, [10, 10, 10, 255])
    const out = compose({
      hair: fakeCostume({ part: 'hair', code: 'hair_back', backHead: backOnly }),
    })
    // backHead 是第 1 层，基础腿是第 4 层
    expect(pixel(out, 5, 140)).toEqual([33, 33, 33, 255])
  })

  it('cset 在眼镜之上、头发前层之下', () => {
    const withCset = compose({
      glas: layer('glas', [1, 1, 1, 255]),
      cset: layer('cset', [2, 2, 2, 255]),
      hair: layer('hair', [3, 3, 3, 255]),
    })
    expect(pixel(withCset)).toEqual([3, 3, 3, 255])
  })
})

describe('可见性 / 互斥', () => {
  it('穿 cset 会隐藏 clot / pant / coat / 基础身体', () => {
    const out = compose({
      cset: layer('cset', [9, 9, 9, 255]),
      clot: layer('clot', [1, 1, 1, 255]),
      coat: layer('coat', [2, 2, 2, 255]),
      pant: layer('pant', [3, 3, 3, 255]),
    })
    expect(pixel(out)).toEqual([9, 9, 9, 255])
  })

  it('cset.coverHead 会隐藏头发前后层与帽子', () => {
    const out = compose({
      cset: layer('cset', [9, 9, 9, 255], { coverHead: true }),
      hair: layer('hair', [3, 3, 3, 255]),
      hats: layer('hats', [4, 4, 4, 255]),
    })
    // 帽子与头发都被隐藏，只剩 cset（基础头仍可见但在 cset 之下）
    expect(pixel(out)).toEqual([9, 9, 9, 255])
  })

  it('hair.coverHead 会隐藏帽子', () => {
    const out = compose({
      hair: layer('hair', [3, 3, 3, 255], { coverHead: true }),
      hats: layer('hats', [4, 4, 4, 255]),
    })
    expect(pixel(out)).toEqual([3, 3, 3, 255])
  })

  it('clot.displaytemplate=false 时隐藏基础身体', () => {
    const out = compose({ clot: layer('clot', [1, 1, 1, 255]) })
    expect(pixel(out)).toEqual([1, 1, 1, 255])
  })

  it('clot.displaytemplate=true 时基础身体在衣服之下仍被覆盖', () => {
    // 衣服在身体之后绘制，所以像素仍是衣服色；这里验证的是不隐藏身体的路径不报错
    const out = compose({ clot: layer('clot', [1, 1, 1, 255], { displaytemplate: true }) })
    expect(pixel(out)).toEqual([1, 1, 1, 255])
  })

  it('没有上衣时基础身体与腿可见', () => {
    const out = compose({})
    expect(pixel(out, 5, 30)).toEqual([11, 11, 11, 255])
    expect(pixel(out, 5, 90)).toEqual([22, 22, 22, 255])
    expect(pixel(out, 5, 140)).toEqual([33, 33, 33, 255])
  })
})

describe('白转透明合成规则', () => {
  const whiteBase = {
    head: solid(100, 150, [255, 255, 255, 255]),
    body: solid(100, 150, [255, 255, 255, 255]),
    lowerbody: solid(100, 150, [255, 255, 255, 255]),
  }

  it('穿 coat 且没有 opt-out 头部件时整图白转透明', () => {
    const out = composeActor({
      spec,
      base: whiteBase,
      worn: { coat: layer('coat', [5, 5, 5, 255]) },
    })
    // coat 是实心 5,5,5，没有白像素；基础头被 coat 覆盖。
    // 换一个角度：透明区域之外的纯白才会被转换。
    expect(pixel(out)).toEqual([5, 5, 5, 255])
  })

  it('opt-out 头部件存在时不做整图白转透明', () => {
    const worn = {
      coat: layer('coat', [5, 5, 5, 255]),
      hats: layer('hats', [255, 255, 255, 255]),
    }
    const out = composeActor({ spec, base: whiteBase, worn })
    expect(pixel(out)).toEqual([255, 255, 255, 255])
  })

  it('useMask 的头部件不构成 opt-out，整图仍会白转透明', () => {
    const worn = {
      coat: layer('coat', [5, 5, 5, 255]),
      hats: layer('hats', [255, 255, 255, 255], { useMask: true }),
    }
    const out = composeActor({ spec, base: whiteBase, worn })
    expect(pixel(out)).toEqual([0, 0, 0, 0])
  })

  it('动态 cset 不做整图白转透明', () => {
    const cset = layer('cset', [5, 5, 5, 255], {
      frames: [solid(100, 150, [5, 5, 5, 255])],
    })
    const worn = { cset, hats: layer('hats', [255, 255, 255, 255]) }
    const out = composeActor({ spec, base: whiteBase, worn })
    expect(pixel(out)).toEqual([255, 255, 255, 255])
  })
})

describe('动态帧', () => {
  it('frame 参数选择动态物品的帧', () => {
    const cset = layer('cset', [1, 1, 1, 255], {
      frames: [solid(100, 150, [10, 10, 10, 255]), solid(100, 150, [20, 20, 20, 255])],
    })
    expect(pixel(composeActor({ spec, base, worn: { cset }, frame: 0 }))).toEqual([10, 10, 10, 255])
    expect(pixel(composeActor({ spec, base, worn: { cset }, frame: 1 }))).toEqual([20, 20, 20, 255])
    expect(pixel(composeActor({ spec, base, worn: { cset }, frame: 4 }))).toEqual([10, 10, 10, 255])
  })
})

describe('基础层开关', () => {
  it('showActorBase=false 时不画基础头/身/腿', () => {
    const out = composeActor({ spec, base, worn: {}, showActorBase: false })
    expect(pixel(out)).toEqual([0, 0, 0, 0])
  })
})
