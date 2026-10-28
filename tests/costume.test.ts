import { describe, expect, it } from 'vitest'

import { buildCostume, FALLBACK_SPEC, loadBaseActor } from '../src/engine/index.ts'
import { makeActorZip, makeCostumeZip, px } from './helpers/fixtures.ts'

const spec = FALLBACK_SPEC

describe('bundle / 符号解析', () => {
  it('读静态服饰的四个大图区域', () => {
    const costume = buildCostume({
      spec,
      code: 'f_hair001',
      part: 'hair',
      zipBytes: makeCostumeZip({ code: 'f_hair001' }),
    })

    expect(costume.frontHead?.width).toBe(100)
    expect(costume.backHead?.height).toBe(150)
    expect(px(costume.frontHead!, 1, 1)).toEqual([255, 0, 0, 255])
    expect(px(costume.backHead!, 1, 1)).toEqual([0, 255, 0, 255])
    expect(costume.body).toBeUndefined()
  })

  it('支持 atlas_map.json 图集模式', () => {
    const costume = buildCostume({
      spec,
      code: 'f_hats001',
      part: 'hats',
      zipBytes: makeCostumeZip({ code: 'f_hats001', atlas: true }),
    })
    expect(costume.frontHead?.width).toBe(100)
    expect(px(costume.frontHead!, 0, 0)).toEqual([255, 0, 0, 255])
  })

  it('clot 的身体图在载入时就白转透明', () => {
    const costume = buildCostume({
      spec,
      code: 'f_clot001',
      part: 'clot',
      zipBytes: makeCostumeZip({ code: 'f_clot001', bodyWhitePatch: true }),
    })
    expect(px(costume.body!, 0, 0)).toEqual([0, 0, 0, 0])
    expect(px(costume.body!, 50, 50)).toEqual([0, 0, 255, 255])
  })

  it('pant 不做白转透明（与官方一致）', () => {
    const costume = buildCostume({
      spec,
      code: 'f_pant001',
      part: 'pant',
      zipBytes: makeCostumeZip({ code: 'f_pant001', bodyWhitePatch: true }),
    })
    expect(px(costume.body!, 0, 0)).toEqual([255, 255, 255, 255])
  })

  it('useMask 会把头部图的白转透明', () => {
    const costume = buildCostume({
      spec,
      code: 'f_hats002',
      part: 'hats',
      zipBytes: makeCostumeZip({ code: 'f_hats002', frontHeadWhitePatch: true }),
      flags: { useMask: true },
    })
    expect(px(costume.frontHead!, 0, 0)).toEqual([0, 0, 0, 0])
    expect(px(costume.frontHead!, 20, 20)).toEqual([255, 0, 0, 255])
  })

  it('没有 useMask 时保留白色', () => {
    const costume = buildCostume({
      spec,
      code: 'f_hats003',
      part: 'hats',
      zipBytes: makeCostumeZip({ code: 'f_hats003', frontHeadWhitePatch: true }),
    })
    expect(px(costume.frontHead!, 0, 0)).toEqual([255, 255, 255, 255])
  })
})

describe('动态物品', () => {
  it('从 _Animate 帧条切出 100×150 每帧', () => {
    const costume = buildCostume({
      spec,
      code: 'f_glas001',
      part: 'glas',
      zipBytes: makeCostumeZip({
        code: 'f_glas001',
        animateFrames: 3,
        frameColors: [
          [10, 0, 0, 255],
          [20, 0, 0, 255],
          [30, 0, 0, 255],
        ],
      }),
      flags: { motionName: 'blink4' },
    })

    expect(costume.frames).toHaveLength(3)
    expect(costume.frames.every((frame) => frame.width === 100 && frame.height === 150)).toBe(true)
    expect(px(costume.frames[2]!, 5, 5)).toEqual([30, 0, 0, 255])
    expect(costume.frontHead).toBe(costume.frames[0])
  })

  it('有 _Animate 但没有 motionName 时按静态处理（与官方一致）', () => {
    const costume = buildCostume({
      spec,
      code: 'f_glas002',
      part: 'glas',
      zipBytes: makeCostumeZip({ code: 'f_glas002', animateFrames: 2 }),
    })
    expect(costume.frames).toHaveLength(0)
    expect(costume.frontHead).toBeDefined()
  })

  it('帧数上限为 spec.animated.maxFrames', () => {
    const costume = buildCostume({
      spec: { ...spec, animated: { ...spec.animated, maxFrames: 2 } },
      code: 'f_glas003',
      part: 'glas',
      zipBytes: makeCostumeZip({ code: 'f_glas003', animateFrames: 5 }),
      flags: { motionName: 'frame8' },
    })
    expect(costume.frames).toHaveLength(2)
  })
})

describe('基础角色', () => {
  it('男头取 (600,0)，女头取 (600,300)', () => {
    const zip = makeActorZip()
    const boy = loadBaseActor({ spec, sex: 1, zipBytes: zip })
    const girl = loadBaseActor({ spec, sex: 2, zipBytes: zip })

    expect(px(boy.head, 1, 1)).toEqual([200, 10, 10, 255])
    expect(px(girl.head, 1, 1)).toEqual([10, 200, 10, 255])
    expect(px(boy.body, 1, 1)).toEqual([20, 20, 240, 255])
    expect(px(girl.body, 1, 1)).toEqual([240, 20, 240, 255])
    expect(px(boy.lowerbody, 1, 1)).toEqual([20, 240, 240, 255])
    expect(px(girl.lowerbody, 1, 1)).toEqual([240, 240, 20, 255])
  })
})
