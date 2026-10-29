import { describe, expect, it } from 'vitest'

import {
  RoomModel,
  actorCell,
  clipsFromCatalog,
  evaluateNpcMotion,
  parseSelfMotion,
  pickSelfMotion,
  actorFrontFacing,
  actorMirrored,
  clipDuration,
  evaluateClip,
  directionBetween,
  findPath,
  makeClip,
  pixelToCell,
  resolveStepFrames,
  walkClip,
} from '../src/engine/room/index'
import { composeRoomActor } from '../src/engine/room/actor'
import { createImage } from '../src/engine/image'
import type { RgbaImage } from '../src/engine/types'

/**
 * 角色（M4）规格验证。
 *
 * 方向映射来自官方 `Gg.getHead` 里的 `a = (a - 1) >> 1`：
 *   1 → 背面镜像、3 → 正面、5 → 正面镜像、7 → 背面
 * 格子布局来自真实 `actor8.zip` 的 `actor` 符号（700×840）。
 */

describe('角色朝向与帧', () => {
  it('3/5 朝镜头（正面块），1/7 背面块', () => {
    expect(actorFrontFacing(3)).toBe(true)
    expect(actorFrontFacing(5)).toBe(true)
    expect(actorFrontFacing(1)).toBe(false)
    expect(actorFrontFacing(7)).toBe(false)
  })

  it('1 与 5 需要水平镜像', () => {
    expect(actorMirrored(1)).toBe(true)
    expect(actorMirrored(5)).toBe(true)
    expect(actorMirrored(3)).toBe(false)
    expect(actorMirrored(7)).toBe(false)
  })

  it('各部位的格子坐标（正面块 y=0，背面块 y=420）', () => {
    expect(actorCell('head', 3, 0)).toEqual({ x: 0, y: 0 })
    expect(actorCell('head', 3, 1)).toEqual({ x: 40, y: 0 })
    expect(actorCell('body', 3, 0)).toEqual({ x: 0, y: 60 })
    expect(actorCell('arm', 3, 0)).toEqual({ x: 0, y: 120 })
    expect(actorCell('arm', 3, 15)).toEqual({ x: 0, y: 180 })
    expect(actorCell('arm', 3, 23)).toEqual({ x: 320, y: 180 })
    expect(actorCell('leg', 3, 0)).toEqual({ x: 0, y: 300 })
    expect(actorCell('leg', 3, 11)).toEqual({ x: 440, y: 300 })

    expect(actorCell('head', 1, 0)).toEqual({ x: 0, y: 420 })
    expect(actorCell('body', 1, 0)).toEqual({ x: 0, y: 480 })
    expect(actorCell('arm', 1, 0)).toEqual({ x: 0, y: 540 })
    // 背面腿 = 420 + 300（官方 getActorLeg 写 420 是切到头部图，已实测修正）
    expect(actorCell('leg', 1, 0)).toEqual({ x: 0, y: 720 })
  })
})

describe('动作求值', () => {
  const clip = makeClip('t', '测试', [
    { arms: 1, legs: 0, duration: 100 },
    { arms: 2, legs: 3, duration: 200 },
  ])

  it('总时长 = 各步之和', () => {
    expect(clipDuration(clip)).toBe(300)
  })

  it('按时间落在对应步上', () => {
    expect(evaluateClip(clip, 0, 3)).toMatchObject({ step: 0, arms: 1 })
    expect(evaluateClip(clip, 99, 3)).toMatchObject({ step: 0, arms: 1 })
    expect(evaluateClip(clip, 100, 3)).toMatchObject({ step: 1, arms: 2, legs: 3 })
    expect(evaluateClip(clip, 299, 3)).toMatchObject({ step: 1 })
  })

  it('非循环动作走完后停在最后一步', () => {
    const sample = evaluateClip(clip, 5000, 3)
    expect(sample.done).toBe(true)
    expect(sample.step).toBe(1)
  })

  it('循环动作对总时长取模', () => {
    const looping = makeClip('l', '循环', [{ arms: 1, duration: 100 }], true)
    expect(evaluateClip(looping, 250, 3)).toMatchObject({ arms: 1 })
    expect(evaluateClip(looping, 250, 3).elapsed).toBe(50)
  })

  it('逐朝向覆写优先于通用值', () => {
    const step = { arms: 5, legs: 1, byDir: { 3: { arms: 9 } } }
    expect(resolveStepFrames(step, 3)).toMatchObject({ arms: 9, legs: 1 })
    expect(resolveStepFrames(step, 7)).toMatchObject({ arms: 5, legs: 1 })
  })

  it('偏移支持 "x,y" 与 [x,y]', () => {
    expect(evaluateClip(makeClip('o', 'o', [{ offset: '0,-2' }]), 0, 3).offset).toEqual({
      x: 0,
      y: -2,
    })
    expect(evaluateClip(makeClip('o2', 'o2', [{ offset: [3, -4] }]), 0, 3).offset).toEqual({
      x: 3,
      y: -4,
    })
  })

  it('行走动作是循环的且取腿部四帧', () => {
    const walk = walkClip()
    expect(walk.loop).toBe(true)
    expect(walk.steps.map((step) => step.legs)).toEqual([0, 3, 6, 9])
  })
})

describe('寻路', () => {
  const model = new RoomModel({ rows: 5, cols: 5 })

  it('直线可达', () => {
    const path = findPath(model, { x: 0, y: 0 }, { x: 0, y: 3 })
    expect(path.map((step) => step.cell)).toEqual([
      { x: 0, y: 1 },
      { x: 0, y: 2 },
      { x: 0, y: 3 },
    ])
    expect(path.every((step) => step.dir === 3)).toBe(true)
  })

  it('绕开占位（家具）', () => {
    const blocked = new RoomModel({
      rows: 3,
      cols: 3,
      map: [
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
      ],
    })
    blocked.occupy('box', { x0: 1, y0: 1, x1: 1, y1: 1 })
    const path = findPath(blocked, { x: 0, y: 1 }, { x: 2, y: 1 })
    expect(path.length).toBeGreaterThan(2)
    expect(path.some((step) => step.cell.x === 1 && step.cell.y === 1)).toBe(false)
  })

  it('目标不可走时返回空路径', () => {
    const withVoid = new RoomModel({
      rows: 2,
      cols: 2,
      map: [
        [1, 0],
        [1, 1],
      ],
    })
    expect(findPath(withVoid, { x: 0, y: 0 }, { x: 1, y: 0 })).toEqual([])
  })

  it('原地不动返回空路径', () => {
    expect(findPath(model, { x: 2, y: 2 }, { x: 2, y: 2 })).toEqual([])
  })
})

describe('官方动作与 NPC 行为（M4.5）', () => {
  it('motionConfig 的 255 组动作能转成 clip（含逐向覆写）', () => {
    const clips = clipsFromCatalog({
      offer: [
        { arms: 22, legs: 1, duration: 250 },
        { arms: 18, legs: 6, duration: 250, offset: '0,-2' },
      ],
      sit: [{ legs: 1, duration: 500, byDir: { 3: { arms: 9 } } }],
    })
    expect(clips.size).toBe(2)
    const offer = clips.get('offer')!
    expect(offer.loop).toBe(true)
    // 官方配置的帧号是 1 起，转换时统一减 1（`putArms((c.arms|0)-1)`）
    expect(offer.steps[0]).toMatchObject({ arms: 21, legs: 0 })
    expect(offer.steps[1]).toMatchObject({ arms: 17, legs: 5, offset: '0,-2' })
    // 逐向覆写同样减 1，并在取值时才生效
    const sample = evaluateClip(clips.get('sit')!, 0, 3)
    expect(sample).toMatchObject({ arms: 8, legs: 0 })
  })

  it('hair 只驱动头发层，基础头永远是第 0 帧', () => {
    const clips = clipsFromCatalog({
      blink: [
        { arms: 1, legs: 1, hair: 1 },
        { arms: 1, legs: 1, hair: 2 },
      ],
    })
    const clip = clips.get('blink')!
    expect(clip.steps[0]!.hair).toBe(0)
    expect(clip.steps[1]!.hair).toBe(1)
    // 两步的头部帧都一样（早期把 hair 当头部帧用，导致头部一直闪）
    expect(evaluateClip(clip, 0, 3).hairFrame).toBe(0)
    expect(evaluateClip(clip, 250, 3).hairFrame).toBe(1)
  })

  it('缺省的帧号（官方 -1）沿用上一步', () => {
    const clips = clipsFromCatalog({
      waves: [{ arms: 5, legs: 2 }, { duration: 100 }, { duration: 100, arms: 8 }],
    })
    const clip = clips.get('waves')!
    // 第二步没写 arms/legs → 沿用第一步（转成 0 起是 4 / 1）
    expect(evaluateClip(clip, 250, 3)).toMatchObject({ step: 1, arms: 4, legs: 1 })
    expect(evaluateClip(clip, 350, 3)).toMatchObject({ step: 2, arms: 7, legs: 1 })
  })

  it('NPC 动作按时间取帧并循环', () => {
    const steps = [
      { frame: 1, duration: 200 },
      { frame: 2, duration: 100 },
      { frame: 3, duration: 300 },
    ]
    expect(evaluateNpcMotion(steps, 0)).toBe(1)
    expect(evaluateNpcMotion(steps, 199)).toBe(1)
    expect(evaluateNpcMotion(steps, 250)).toBe(2)
    expect(evaluateNpcMotion(steps, 350)).toBe(3)
    // 总长 600 → 700ms 回到第 1 帧
    expect(evaluateNpcMotion(steps, 700)).toBe(1)
  })

  it('自主动作权重解析与按权重挑选', () => {
    const entries = parseSelfMotion('move:0.7&magic:1')
    expect(entries).toEqual([
      { action: 'move', weight: 0.7 },
      { action: 'magic', weight: 1 },
    ])
    expect(pickSelfMotion(entries, () => 0)).toBe('move')
    expect(pickSelfMotion(entries, () => 0.99)).toBe('magic')
    expect(parseSelfMotion(null)).toEqual([])
    expect(pickSelfMotion([], () => 0.5)).toBeNull()
  })
})

describe('头部闪烁回归（hair 不是头部帧）', () => {
  /** 造一张只有头部两格有颜色的基础图：head0 红、head1 蓝。 */
  function sheetWithTwoHeads(): RgbaImage {
    const sheet = createImage(700, 840)
    const paint = (x0: number, y0: number, rgba: [number, number, number, number]): void => {
      for (let y = y0; y < y0 + 60; y += 1) {
        for (let x = x0; x < x0 + 40; x += 1) {
          const i = (y * 700 + x) * 4
          sheet.data[i] = rgba[0]
          sheet.data[i + 1] = rgba[1]
          sheet.data[i + 2] = rgba[2]
          sheet.data[i + 3] = rgba[3]
        }
      }
    }
    paint(0, 0, [220, 30, 30, 255])
    paint(40, 0, [30, 30, 220, 255])
    return sheet
  }

  it('hairFrame 变来变去，基础头像素完全不变', () => {
    const sheet = sheetWithTwoHeads()
    const a = composeRoomActor({ sheet, pose: { dir: 3, arms: 0, legs: 0, hairFrame: 0 } })
    const b = composeRoomActor({ sheet, pose: { dir: 3, arms: 0, legs: 0, hairFrame: 1 } })
    expect(a.data).toEqual(b.data)
    // 画的是 head0（红），不是 head1（蓝）
    expect([a.data[0], a.data[1], a.data[2]]).toEqual([220, 30, 30])
  })
})

describe('角色拖拽移动（落位不改朝向）', () => {
  it('引擎的 directionBetween 仍可用（行走朝向），但拖拽落位不用它', () => {
    const origin = { x: 5, y: 5 }
    expect(directionBetween(origin, { x: 8, y: 5 })).toBe(3) // 往 +x：右下
    expect(directionBetween(origin, { x: 2, y: 5 })).toBe(7) // 往 -x：左上
    expect(directionBetween(origin, { x: 5, y: 9 })).toBe(5) // 往 +y：左下
    expect(directionBetween(origin, { x: 5, y: 1 })).toBe(1) // 往 -y：右上
    expect(directionBetween(origin, origin)).toBeDefined()
  })

  it('格子中心经 pixelToCell 能原样取回（拖拽落点用的是同一套换算）', () => {
    const layout = {
      floorTop: { x: 300, y: 60 },
      originX: 0,
      originY: 0,
    } as unknown as Parameters<typeof pixelToCell>[2]

    for (const cell of [
      { x: 0, y: 0 },
      { x: 3, y: 4 },
      { x: 10, y: 8 },
      { x: 6, y: 12 },
    ]) {
      // 菱形左上顶点 + (10, 5) = 中心
      const px = layout.floorTop.x + (cell.x - cell.y) * 10 + 10 + 10
      const py = layout.floorTop.y + (cell.x + cell.y) * 5 + 5
      expect(pixelToCell(px, py, layout)).toEqual(cell)
    }
  })
})
