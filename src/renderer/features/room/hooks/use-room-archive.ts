import * as React from 'react'

import {
  PKTROOM_FORMAT,
  PKTROOM_VERSION,
  deserializeRoom,
  packPktRoom,
  serializeRoom,
  unpackPktRoom,
  type PktRoomFile,
} from '@engine/room'
import type { Catalog, CatalogRoomDef } from '@shared/contract'
import { toBase64 } from '@/services/assets'

import type { ActorInstance, FurniInstance, RoomSpec } from '@engine/room'
import { useRoomStore } from '../state/room-store'
import { useCustomFurniStore } from '../state/custom-furni-store'
import { useCustomActorStore } from '../state/custom-actor-store'
import { useCustomClipStore } from '../state/custom-clip-store'

/** 导入后交给页面去应用的一整套场景。 */
export interface PktRoomLoad {
  room: RoomSpec
  furni: FurniInstance[]
  actors: ActorInstance[]
  name: string
}

/**
 * 房间存档与 `.pktroom` 导入导出。
 *
 * - 存档：进 `saves.json`（`kind: 'room'`），带一张缩略图
 * - 分享包：zip 里一个 `room.json`，自定义家具/角色/动作的图一起塞进去，
 *   别人导入后能直接看到一样的房间
 */
export function useRoomArchive(input: {
  catalog: Catalog | null
  room: CatalogRoomDef | null
  spec: RoomSpec | null
  renderPreview: () => Promise<Uint8Array | null>
  applyScene: (payload: PktRoomLoad) => void
}): {
  busy: boolean
  status: string | null
  saveRoom: () => Promise<void>
  exportPktRoom: () => Promise<void>
  importPktRoom: () => Promise<void>
} {
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState<string | null>(null)

  const run = async (task: () => Promise<string | null>): Promise<void> => {
    setBusy(true)
    setStatus(null)
    try {
      setStatus(await task())
    } catch (error) {
      setStatus(`失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const saveRoom = (): Promise<void> =>
    run(async () => {
      const { room, furni, actors } = useRoomStore.getState()
      if (!room) return '先选一个房型再保存'
      const data = serializeRoom({ room, furni, actors })
      const preview = await input.renderPreview()
      const now = Date.now()
      await window.pkt.putSave({
        version: 2,
        id: `room-${now.toString(36)}`,
        kind: 'room',
        name: input.room?.name ?? `房间 ${room.type}`,
        createdAt: now,
        updatedAt: now,
        preview: preview ? `data:image/png;base64,${toBase64(preview)}` : '',
        data,
      })
      return '已存到本机存档'
    })

  const exportPktRoom = (): Promise<void> =>
    run(async () => {
      const { room, furni, actors } = useRoomStore.getState()
      if (!room) return '先选一个房型再导出'
      const usedFurniCodes = new Set(furni.map((item) => item.code))
      const customFurni = useCustomFurniStore
        .getState()
        .items.filter((item) => usedFurniCodes.has(`custom:${item.id}`))
      const usedActorIds = new Set(
        actors.map((actor) => actor.customActor).filter((id): id is string => Boolean(id)),
      )
      const usedClipIds = new Set(actors.map((actor) => actor.clipId).filter(Boolean))
      const customActors = useCustomActorStore
        .getState()
        .items.filter((item) => usedActorIds.has(item.id))
      const customClips = useCustomClipStore
        .getState()
        .clips.filter((clip) => usedClipIds.has(clip.id))

      const file: PktRoomFile = {
        format: PKTROOM_FORMAT,
        version: PKTROOM_VERSION,
        savedAt: Date.now(),
        name: input.room?.name ?? `房间 ${room.type}`,
        room: serializeRoom({ room, furni, actors }),
        assets: {
          furni: customFurni.map((item) => ({ id: item.id, meta: item.meta, image: item.image })),
          actors: customActors.map((item) => ({
            id: item.id,
            name: item.name,
            front: item.front,
            ...(item.back ? { back: item.back } : {}),
            frameCount: item.frameCount,
            frameDuration: item.frameDuration,
          })),
          clips: customClips,
        },
      }

      const bytes = await packPktRoom(file)
      const result = await window.pkt.saveFile({
        useExportDir: true,
        suggestedName: `${file.name}.pktroom`,
        dataBase64: toBase64(bytes),
      })
      if (!result.saved) return '已取消'
      return `已导出存档（含 ${file.assets.furni.length} 件家具、${file.assets.actors.length} 个角色）`
    })

  const importPktRoom = (): Promise<void> =>
    run(async () => {
      const picked = await window.pkt.openFile({
        filters: [{ name: '房间存档', extensions: ['pktroom', 'zip', 'json'] }],
      })
      if (!picked) return '已取消'
      const bytes = Uint8Array.from(atob(picked.base64), (char) => char.charCodeAt(0))
      const file = await unpackPktRoom(bytes)

      // 先把包里带的素材登记进各自的 store（同名 id 覆盖）
      for (const item of file.assets.furni) {
        useCustomFurniStore.getState().add({
          id: item.id,
          meta: item.meta as never,
          image: item.image,
          createdAt: Date.now(),
        })
      }
      for (const item of file.assets.actors) {
        useCustomActorStore.getState().add({
          id: item.id,
          name: item.name,
          front: item.front,
          ...(item.back ? { back: item.back } : {}),
          frameCount: item.frameCount,
          frameDuration: item.frameDuration,
          createdAt: Date.now(),
        })
      }
      for (const clip of file.assets.clips) {
        useCustomClipStore.getState().put(clip)
      }

      const catalog = input.catalog
      const restored = deserializeRoom(file.room, {
        rows: file.room.room.rows,
        cols: file.room.room.cols,
        ...(catalog ? { knownCodes: new Set(catalog.furniture.map((item) => item.code)) } : {}),
        knownActors: new Set(useCustomActorStore.getState().items.map((item) => item.id)),
      })

      input.applyScene({
        room: restored.room,
        furni: restored.furni,
        actors: restored.actors,
        name: file.name,
      })
      return restored.warnings.length > 0
        ? `已导入，但有 ${restored.warnings.length} 处问题：${restored.warnings[0]}`
        : `已导入「${file.name}」`
    })

  return { busy, status, saveRoom, exportPktRoom, importPktRoom }
}
