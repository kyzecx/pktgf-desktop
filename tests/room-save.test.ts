import { describe, expect, it } from 'vitest'

import {
  PKTROOM_FORMAT,
  deserializeRoom,
  packPktRoom,
  serializeRoom,
  unpackPktRoom,
  type PktRoomFile,
} from '../src/engine/room/index'
import type { ActorInstance, FurniInstance, RoomSpec } from '../src/engine/room/index'

/**
 * 房间存档 + `.pktroom` 打包（M8）。
 *
 * 两个要求：存了能原样读回来；读分享包时坏数据只丢坏的，不能整间房炸掉。
 */

const room: RoomSpec = {
  type: 101,
  category: 1,
  rows: 16,
  cols: 20,
  tile: 2,
  wall: 3,
  door: 1,
  bg: 1,
}

const sofa: FurniInstance = {
  uid: 'f1',
  code: 'sofa001',
  x: 4,
  y: 5,
  dir: 5,
  wallLoc: null,
  surface: null,
  state: 0,
}

const lamp: FurniInstance = {
  uid: 'f2',
  code: 'lamp001',
  x: 4,
  y: 5,
  dir: 3,
  wallLoc: null,
  surface: { parent: 'f1', index: 1 },
  state: 2,
}

const actor: ActorInstance = {
  uid: 'a1',
  kind: 'player',
  outfit: { sex: 2, faceCode: 'face01', worn: { coat: 'coat0001' } },
  x: 8,
  y: 6,
  dir: 7,
  clipId: 'sit',
  seat: { uid: 'f1', surfaceIndex: 1 },
}

describe('房间存档', () => {
  it('序列化 → 反序列化后完全一致', () => {
    const data = serializeRoom({ room, furni: [sofa, lamp], actors: [actor] })
    const restored = deserializeRoom(data, { rows: 16, cols: 20 })
    expect(restored.warnings).toEqual([])
    expect(restored.room).toEqual(room)
    expect(restored.furni).toEqual([sofa, lamp])
    expect(restored.actors).toEqual([actor])
  })

  it('缺素材 / 超范围 / id 重复只丢那一件，并给出提示', () => {
    const data = serializeRoom({
      room,
      furni: [
        sofa,
        { ...sofa, code: 'nope999', uid: 'f3' },
        { ...sofa, uid: 'f4', x: 99 },
        { ...sofa, uid: 'f1' },
      ],
      actors: [actor, { ...actor, uid: 'a2', kind: 'custom', customActor: 'gone' }],
    })
    const restored = deserializeRoom(data, {
      rows: 16,
      cols: 20,
      knownCodes: new Set(['sofa001', 'lamp001']),
      knownActors: new Set<string>(),
    })
    expect(restored.furni).toHaveLength(1)
    expect(restored.actors).toHaveLength(1)
    expect(restored.warnings.length).toBeGreaterThanOrEqual(3)
  })

  it('叠放件丢了底座就退回落地，不当成坏数据', () => {
    const data = serializeRoom({ room, furni: [lamp], actors: [] })
    const restored = deserializeRoom(data, { rows: 16, cols: 20 })
    expect(restored.furni).toHaveLength(1)
    expect(restored.furni[0]!.surface).toBeNull()
    expect(restored.warnings[0]).toContain('底座')
  })

  it('坏数据直接抛错', () => {
    expect(() => deserializeRoom({ version: 2 }, { rows: 16, cols: 20 })).toThrow()
    expect(() => deserializeRoom(null, { rows: 16, cols: 20 })).toThrow()
  })

  it('朝向只接受 1/3/5/7，其它归到 3', () => {
    const data = serializeRoom({ room, furni: [{ ...sofa, dir: 9 as never }], actors: [] })
    expect(deserializeRoom(data, { rows: 16, cols: 20 }).furni[0]!.dir).toBe(3)
  })
})

describe('.pktroom 打包', () => {
  const file: PktRoomFile = {
    format: PKTROOM_FORMAT,
    version: 1,
    savedAt: 1_700_000_000_000,
    name: '我的小房间',
    room: serializeRoom({ room, furni: [sofa, lamp], actors: [actor] }),
    assets: {
      furni: [{ id: 'c1', meta: { rows: 1, cols: 1 }, image: 'data:image/png;base64,AAA' }],
      actors: [
        {
          id: 'act1',
          name: '自建角色',
          front: 'data:image/png;base64,BBB',
          frameCount: 3,
          frameDuration: 120,
        },
      ],
      clips: [],
    },
  }

  it('打包再解包内容不变', async () => {
    const bytes = await packPktRoom(file)
    const back = await unpackPktRoom(bytes)
    expect(back.name).toBe('我的小房间')
    expect(back.room.room).toEqual(room)
    expect(back.assets.furni).toHaveLength(1)
    expect(back.assets.actors[0]!.frameCount).toBe(3)
  })

  it('裸 JSON 也能读（用户手改过的包）', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(file))
    await expect(unpackPktRoom(bytes)).resolves.toMatchObject({ name: '我的小房间' })
  })

  it('不是存档时给出明确错误', async () => {
    await expect(unpackPktRoom(new TextEncoder().encode('{}'))).rejects.toThrow()
    await expect(unpackPktRoom(new TextEncoder().encode('not json'))).rejects.toThrow()
  })
})
