import { describe, expect, it } from 'vitest'

import {
  DEFAULT_CUSTOM_META,
  customCode,
  customId,
  isCustomCode,
  suggestBaseLoc,
  synthesizeFurniDef,
  validateCustomFurni,
} from '../src/engine/room/index'
import {
  customActorFrameIndex,
  customActorStrip,
} from '../src/renderer/features/room/state/custom-actor-store'

/**
 * 自定义家具（M6）：元数据校验 + 合成目录条目。
 *
 * 目标：导入的家具和官方家具走**完全相同**的渲染/交互路径，
 * 所以合成出来的 `CatalogFurniture` 字段语义必须和官方一致。
 */

describe('自定义家具元数据', () => {
  it('默认值合法', () => {
    expect(validateCustomFurni(DEFAULT_CUSTOM_META).ok).toBe(true)
  })

  it('名称 / 行列 / 锚点格式错误会报出来', () => {
    const result = validateCustomFurni({
      ...DEFAULT_CUSTOM_META,
      name: '   ',
      rows: 0,
      cols: 99,
      baseLoc: 'abc',
    })
    expect(result.ok).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([
        '名称不能为空',
        '行数需为 1–12 的整数',
        '列数需为 1–12 的整数',
        '锚点格式应为 "x y"（像素）',
      ]),
    )
  })

  it('过大的占格只警告不报错；挂墙提示锚点无效', () => {
    const big = validateCustomFurni({ ...DEFAULT_CUSTOM_META, rows: 8, cols: 8 })
    expect(big.ok).toBe(true)
    expect(big.warnings.some((w) => w.includes('6×6'))).toBe(true)

    const wall = validateCustomFurni({ ...DEFAULT_CUSTOM_META, position: 3 })
    expect(wall.warnings.some((w) => w.includes('挂墙'))).toBe(true)
  })

  it('可叠放点格式校验', () => {
    expect(validateCustomFurni({ ...DEFAULT_CUSTOM_META, surfaceLoc: '10 12$20 8' }).ok).toBe(true)
    expect(validateCustomFurni({ ...DEFAULT_CUSTOM_META, surfaceLoc: '10-12' }).ok).toBe(false)
  })
})

describe('合成目录条目', () => {
  it('code 带 custom: 前缀，且能取回 id', () => {
    const code = customCode('abc')
    expect(code).toBe('custom:abc')
    expect(isCustomCode(code)).toBe(true)
    expect(customId(code)).toBe('abc')
    expect(isCustomCode('cha0001')).toBe(false)
  })

  it('行列与朝向沿用官方语义（rows=Y、cols=X）', () => {
    const def = synthesizeFurniDef('abc', {
      ...DEFAULT_CUSTOM_META,
      rows: 2,
      cols: 3,
      dirable: 4,
      baseLoc: '20 24',
    })
    expect(def.rows).toBe(2)
    expect(def.cols).toBe(3)
    expect(def.dirable).toBe(4)
    expect(def.baseLoc).toBe('20 24')
    expect(def.kind).toBe('furni')
    expect(def.position).toBe(1)
    // 交互模板会转成官方 behaviour 串
    expect(synthesizeFurniDef('a', { ...DEFAULT_CUSTOM_META, interact: 'sit' }).behaviour).toBe(
      'sit 坐下 1',
    )
    expect(synthesizeFurniDef('a', DEFAULT_CUSTOM_META).behaviour).toBeNull()
  })

  it('单图导入的推荐锚点取底边中点', () => {
    expect(suggestBaseLoc({ width: 40, height: 30 }, 2, 2)).toBe('20 20')
  })
})

describe('自定义角色帧（规则函数）', () => {
  it('背面缺省时 7/1 用正面镜像，3/5 用正面', () => {
    const actor = {
      id: 'a1',
      name: 'x',
      front: 'data:front',
      frameCount: 4,
      frameDuration: 100,
      createdAt: 0,
    }
    expect(customActorStrip(actor, 3)).toEqual({ strip: 'data:front', mirrored: false })
    expect(customActorStrip(actor, 5)).toEqual({ strip: 'data:front', mirrored: true })
    expect(customActorStrip(actor, 7)).toEqual({ strip: 'data:front', mirrored: false })
    expect(customActorStrip(actor, 1)).toEqual({ strip: 'data:front', mirrored: true })

    const withBack = { ...actor, back: 'data:back' }
    expect(customActorStrip(withBack, 7)).toEqual({ strip: 'data:back', mirrored: false })
    expect(customActorStrip(withBack, 1)).toEqual({ strip: 'data:back', mirrored: true })
  })

  it('按帧时长循环取帧', () => {
    const actor = {
      id: 'a1',
      name: 'x',
      front: 'f',
      frameCount: 4,
      frameDuration: 100,
      createdAt: 0,
    }
    expect(customActorFrameIndex(actor, 0)).toBe(0)
    expect(customActorFrameIndex(actor, 99)).toBe(0)
    expect(customActorFrameIndex(actor, 100)).toBe(1)
    expect(customActorFrameIndex(actor, 450)).toBe(0) // 4 帧循环
  })
})
