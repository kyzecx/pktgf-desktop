import { describe, expect, it } from 'vitest'

import {
  RoomModel,
  computeRoomLayout,
  renderFrame,
  type ExportActor,
} from '../src/engine/room/index'
import { createImage } from '../src/engine/image'
import type { CatalogRoomDef } from '../src/shared/contract'

/**
 * 导出用的确定性帧渲染（M7）。
 *
 * 要求：同一份数据 + 同一个时间 → 逐像素相同，这样 GIF/视频才不会和界面对不上。
 */

const room: CatalogRoomDef = {
  type: 101,
  category: 1,
  name: '基本房型1',
  rows: 16,
  cols: 20,
  entryX: 1,
  entryY: 7,
  entryDir: 5,
  exitX: 1,
  exitY: 7,
  exitDir: 5,
  defaultTile: 1,
  defaultWall: 1,
  defaultDoor: 1,
  defaultBg: 1,
  defaultStructure: 0,
  maxFurni: 200,
  wallHeight: 128,
  floorDepth: 8,
  wallDepth: 4,
  picWH: '',
  gridOffset: '',
  scene: null,
  tmx: null,
  ifDefaultImg: 0,
  combine: 1,
}

const actor = (patch: Partial<ExportActor> = {}): ExportActor => ({
  uid: 'a1',
  x: 6,
  y: 6,
  dir: 3,
  pose: 'stand',
  art: { image: paint(40, 60, [255, 0, 0, 255]), mirrored: false },
  ...patch,
})

function paint(width: number, height: number, rgba: [number, number, number, number]) {
  const image = createImage(width, height)
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = rgba[0]
    image.data[i + 1] = rgba[1]
    image.data[i + 2] = rgba[2]
    image.data[i + 3] = rgba[3]
  }
  return image
}

describe('导出帧渲染', () => {
  const model = new RoomModel({ rows: room.rows, cols: room.cols })
  const layout = computeRoomLayout(room, { width: 950, height: 540 })
  const stage = { width: 950, height: 540 }

  it('同样输入两次渲染逐像素相同', () => {
    const input = { model, layout, room, stage, furni: [], actors: [actor()] }
    const a = renderFrame(input)
    const b = renderFrame(input)
    expect(a.width).toBe(950)
    expect(a.height).toBe(540)
    expect(a.data).toEqual(b.data)
  })

  it('角色会被画进去（指定位置出现非透明像素）', () => {
    const blank = renderFrame({ model, layout, room, stage, furni: [], actors: [] })
    const withActor = renderFrame({ model, layout, room, stage, furni: [], actors: [actor()] })
    let diff = 0
    for (let i = 3; i < blank.data.length; i += 4) {
      if ((blank.data[i] ?? 0) !== (withActor.data[i] ?? 0)) diff += 1
    }
    expect(diff).toBeGreaterThan(100)
  })

  it('支持等比放大与背景色', () => {
    const scaled = renderFrame({
      model,
      layout,
      room,
      stage,
      furni: [],
      actors: [actor()],
      scale: 2,
      background: [12, 34, 56],
    })
    expect(scaled.width).toBe(1900)
    expect(scaled.height).toBe(1080)
    expect([scaled.data[0], scaled.data[1], scaled.data[2], scaled.data[3]]).toEqual([
      12, 34, 56, 255,
    ])
  })

  it('镜像角色与不镜像结果不同', () => {
    const plain = renderFrame({ model, layout, room, stage, furni: [], actors: [actor()] })
    const mirrored = renderFrame({
      model,
      layout,
      room,
      stage,
      furni: [],
      actors: [actor({ art: { image: paint(40, 60, [0, 200, 0, 255]), mirrored: true } })],
    })
    expect(plain.data).not.toEqual(mirrored.data)
  })
})
