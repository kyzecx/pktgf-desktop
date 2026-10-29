import type { RoomDirection } from '@shared/contract'

import type { ActorInstance, FurniInstance, MotionClip, RoomSpec } from './types'

/**
 * 房间存档与 `.pktroom` 打包。
 *
 * 存档只记「可重建场景的最小信息」：房型、家具（code + 落点 + 朝向 + 状态）、
 * 角色。自定义家具/角色/动作不带图，只带 id，图在各自的 store 里；
 * 打包分享时才把图一起塞进 zip（见 `packPktRoom`）。
 */

export const PKTROOM_FORMAT = 'pktroom'
export const PKTROOM_VERSION = 1

export interface RoomSaveData {
  version: 2
  room: RoomSpec
  furni: Array<{
    uid: string
    code: string
    x: number
    y: number
    dir: RoomDirection
    state: number
    wallLoc: FurniInstance['wallLoc']
    surface: FurniInstance['surface']
  }>
  actors: Array<{
    uid: string
    kind: ActorInstance['kind']
    outfit?: ActorInstance['outfit']
    npcCode?: string
    customActor?: string
    x: number
    y: number
    dir: RoomDirection
    clipId: string | null
    seat: ActorInstance['seat']
  }>
}

export interface PktRoomAssets {
  furni: Array<{ id: string; meta: unknown; image: string }>
  actors: Array<{
    id: string
    name: string
    front: string
    back?: string
    frameCount: number
    frameDuration: number
  }>
  clips: MotionClip[]
}

export interface PktRoomFile {
  format: typeof PKTROOM_FORMAT
  version: number
  savedAt: number
  name: string
  room: RoomSaveData
  assets: PktRoomAssets
}

/** 场景 → 存档数据（丢掉运行时才有的字段）。 */
export function serializeRoom(input: {
  room: RoomSpec
  furni: FurniInstance[]
  actors: ActorInstance[]
}): RoomSaveData {
  return {
    version: 2,
    room: { ...input.room },
    furni: input.furni.map((item) => ({
      uid: item.uid,
      code: item.code,
      x: item.x,
      y: item.y,
      dir: item.dir,
      state: item.state,
      wallLoc: item.wallLoc ? { ...item.wallLoc } : null,
      surface: item.surface ? { ...item.surface } : null,
    })),
    actors: input.actors.map((actor) => ({
      uid: actor.uid,
      kind: actor.kind,
      ...(actor.outfit ? { outfit: { ...actor.outfit, worn: { ...actor.outfit.worn } } } : {}),
      ...(actor.npcCode ? { npcCode: actor.npcCode } : {}),
      ...(actor.customActor ? { customActor: actor.customActor } : {}),
      x: actor.x,
      y: actor.y,
      dir: actor.dir,
      clipId: actor.clipId,
      seat: actor.seat ? { ...actor.seat } : null,
    })),
  }
}

export interface RestoreResult {
  room: RoomSpec
  furni: FurniInstance[]
  actors: ActorInstance[]
  /** 无法还原的部分（缺素材、丢父件、越界），交给 UI 提示 */
  warnings: string[]
}

/**
 * 存档数据 → 场景。
 *
 * 容错优先：坏掉的单件跳过并记 warning，不要把整间房都判死
 * （分享来的包可能缺自定义素材）。
 */
export function deserializeRoom(
  data: unknown,
  options: { rows: number; cols: number; knownCodes?: Set<string>; knownActors?: Set<string> } = {
    rows: 0,
    cols: 0,
  },
): RestoreResult {
  const warnings: string[] = []
  const save = data as Partial<RoomSaveData> | null
  if (!save || typeof save !== 'object' || !save.room) {
    throw new Error('存档内容不完整：缺少房间信息')
  }

  const room = normalizeSpec(save.room)
  const rows = options.rows || 0
  const cols = options.cols || 0

  const furni: FurniInstance[] = []
  const seen = new Set<string>()
  for (const raw of save.furni ?? []) {
    if (
      !raw ||
      typeof raw.code !== 'string' ||
      !Number.isFinite(raw.x) ||
      !Number.isFinite(raw.y)
    ) {
      warnings.push('有一件家具数据损坏，已跳过')
      continue
    }
    if (seen.has(raw.uid)) {
      warnings.push(`家具 id 重复（${raw.uid}），已跳过`)
      continue
    }
    if (
      options.knownCodes &&
      !options.knownCodes.has(raw.code) &&
      !raw.code.startsWith('custom:')
    ) {
      warnings.push(`缺少家具素材：${raw.code}`)
      continue
    }
    if (rows > 0 && cols > 0 && (raw.x < 0 || raw.y < 0 || raw.x >= cols || raw.y >= rows)) {
      warnings.push(`家具 ${raw.code} 超出房间范围，已跳过`)
      continue
    }
    const wallLoc = raw.wallLoc ?? null
    const surface = raw.surface ?? null
    if (surface && !(save.furni ?? []).some((item) => item.uid === surface.parent)) {
      warnings.push(`叠放的家具找不到底座（${surface.parent}），已改为落地`)
    }
    seen.add(raw.uid)
    furni.push({
      uid: raw.uid,
      code: raw.code,
      x: raw.x,
      y: raw.y,
      dir: normalizeDir(raw.dir),
      state: Number.isFinite(raw.state) ? raw.state : 0,
      wallLoc: wallLoc
        ? {
            x: wallLoc.x,
            y: wallLoc.y,
            variant: (['up', 'left', 'right', 'down'] as const).includes(wallLoc.variant)
              ? wallLoc.variant
              : 'up',
          }
        : null,
      surface:
        surface && seen.has(surface.parent)
          ? { parent: surface.parent, index: surface.index }
          : null,
    })
  }

  const actors: ActorInstance[] = []
  for (const raw of save.actors ?? []) {
    if (!raw || !Number.isFinite(raw.x) || !Number.isFinite(raw.y)) continue
    if (options.knownActors && raw.customActor && !options.knownActors.has(raw.customActor)) {
      warnings.push(`缺少角色包：${raw.customActor}`)
      continue
    }
    actors.push({
      uid: raw.uid,
      kind: raw.kind === 'npc' || raw.kind === 'custom' ? raw.kind : 'player',
      ...(raw.outfit ? { outfit: raw.outfit } : {}),
      ...(raw.npcCode ? { npcCode: raw.npcCode } : {}),
      ...(raw.customActor ? { customActor: raw.customActor } : {}),
      x: raw.x,
      y: raw.y,
      dir: normalizeDir(raw.dir),
      clipId: raw.clipId ?? null,
      seat: raw.seat ?? null,
    })
  }

  return { room, furni, actors, warnings }
}

function normalizeDir(dir: unknown): RoomDirection {
  return dir === 1 || dir === 5 || dir === 7 ? dir : 3
}

function normalizeSpec(spec: Partial<RoomSpec>): RoomSpec {
  return {
    type: Number(spec.type) || 101,
    category: Number(spec.category) || 1,
    rows: Number(spec.rows) || 16,
    cols: Number(spec.cols) || 20,
    tile: Number(spec.tile) || 1,
    wall: Number(spec.wall) || 1,
    door: Number(spec.door) || 1,
    bg: Number(spec.bg) || 1,
    ...(spec.mapOverride ? { mapOverride: spec.mapOverride } : {}),
  }
}

/** 打包成 `.pktroom`（zip：一个 room.json，含 assets）。 */
export async function packPktRoom(file: PktRoomFile): Promise<Uint8Array> {
  const { zipSync, strToU8 } = await import('fflate')
  const json = JSON.stringify(file)
  return zipSync({ 'room.json': strToU8(json) }, { level: 6 })
}

/** 解包 `.pktroom`；格式不对就抛错，其余问题交给 deserializeRoom 的 warning。 */
export async function unpackPktRoom(bytes: Uint8Array): Promise<PktRoomFile> {
  const { unzipSync, strFromU8 } = await import('fflate')
  let entry: Uint8Array | undefined
  try {
    const files = unzipSync(bytes)
    entry = files['room.json'] ?? Object.values(files)[0]
  } catch {
    // 也可能是裸 JSON
    entry = bytes
  }
  if (!entry) throw new Error('这个文件不是 pktroom 房间存档')
  let parsed: unknown
  try {
    parsed = JSON.parse(strFromU8(entry))
  } catch {
    throw new Error('存档内容不是合法 JSON')
  }
  const file = parsed as Partial<PktRoomFile>
  if (file.format !== PKTROOM_FORMAT || !file.room) {
    throw new Error('存档格式不匹配（缺少 format/room 字段）')
  }
  return {
    format: PKTROOM_FORMAT,
    version: Number(file.version) || PKTROOM_VERSION,
    savedAt: Number(file.savedAt) || 0,
    name: typeof file.name === 'string' ? file.name : '导入的房间',
    room: file.room,
    assets: {
      furni: file.assets?.furni ?? [],
      actors: file.assets?.actors ?? [],
      clips: file.assets?.clips ?? [],
    },
  }
}
