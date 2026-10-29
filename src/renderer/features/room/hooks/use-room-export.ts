import * as React from 'react'

import type { Catalog, CatalogFurniture, CatalogRoomDef } from '@shared/contract'
import {
  actorMirrored,
  buildWallPanelRects,
  clipsFromCatalog,
  composeRoomActor,
  evaluateClip,
  lieClip,
  renderFrame,
  sitClip,
  standClip,
  walkClip,
  type ActorInstance,
  type ExportActor,
  type ExportFurni,
  type FurniInstance,
  type MotionClip,
  type RoomLayout,
  type RoomModel,
} from '@engine/room'
import { decodePng, encodeGif, encodePng } from '@engine/index'
import { toBase64 } from '@/services/assets'

import { loadDecoImages, loadFurniImage, loadPlayerActorAssets } from '../services'
import { useCustomActorStore } from '../state/custom-actor-store'
import { useCustomClipStore } from '../state/custom-clip-store'
import {
  DEFAULT_EXPORT_SETTINGS,
  packFrames,
  type ExportSettings,
} from '../components/export-panel'

/**
 * 导出管线。
 *
 * 所有导出都基于同一个 `frameAt(t)`：按时间采样角色动作 / 家具动画，
 * 再交给引擎的 `renderFrame` 合成 —— 所以导出结果与屏幕上看到的一致。
 */

export interface ExportContext {
  catalog: Catalog
  room: CatalogRoomDef
  model: RoomModel
  layout: RoomLayout
  stage: { width: number; height: number }
  furni: FurniInstance[]
  actors: ActorInstance[]
}

export interface ExportApi {
  busy: string | null
  status: string | null
  exporting: boolean
  exportPng: (settings: ExportSettings) => Promise<void>
  exportGif: (settings: ExportSettings) => Promise<void>
  exportFrames: (settings: ExportSettings) => Promise<void>
  exportVideo: (settings: ExportSettings) => Promise<void>
  /** 上一次导出的文件路径（面板里可以直接打开所在文件夹） */
  lastPath: string | null
  /** 只出图不落盘（存档缩略图用） */
  renderPreview: () => Promise<Uint8Array | null>
  ffmpegReady: boolean
}

export function useRoomExport(context: ExportContext | null): ExportApi {
  const customClips = useCustomClipStore((state) => state.clips)
  const customActors = useCustomActorStore((state) => state.items)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState<string | null>(null)
  const [lastPath, setLastPath] = React.useState<string | null>(null)
  const [ffmpegReady, setFfmpegReady] = React.useState(false)

  React.useEffect(() => {
    void window.pkt
      .ffmpegStatus()
      .then((result) => setFfmpegReady(result.available))
      .catch(() => setFfmpegReady(false))
  }, [])

  const clips = React.useMemo(() => {
    const map = clipsFromCatalog(context?.catalog.actorMotions)
    for (const preset of [standClip(), walkClip(), sitClip(), lieClip()]) {
      if (!map.has(preset.id)) map.set(preset.id, preset)
    }
    for (const clip of customClips) map.set(clip.id, clip)
    return map
  }, [context?.catalog.actorMotions, customClips])

  /**
   * 渲染 t 时刻的一帧。
   *
   * 家具：`animationMode > 0` 且有 `motionFrames` 时按时间循环帧号；否则用第 1 帧。
   * 角色：`clipId` → `evaluateClip(clip, t, dir)` → 合成 40×60。
   */
  const frameAt = React.useCallback(
    async (timeMs: number, settings: ExportSettings, scale: number) => {
      if (!context) throw new Error('还没有房间')
      const { catalog, room, model, layout, stage, furni, actors } = context

      const deco = await loadDecoImages(catalog, room)
      const wallPanels = buildWallPanelRects(model, layout, room, deco.wall)

      const exportFurni: ExportFurni[] = []
      for (const instance of furni) {
        const def = catalog.furniture.find((item) => item.code === instance.code)
        if (!def) continue
        const frame = furniFrame(def, instance, timeMs)
        const art = await loadFurniImage(def, instance.dir, frame)
        if (!art) continue
        exportFurni.push({
          uid: instance.uid,
          def: { ...def, code: def.code, position: def.position },
          dir: instance.dir,
          x: instance.x,
          y: instance.y,
          surface: instance.surface
            ? { parent: instance.surface.parent, index: instance.surface.index }
            : null,
          wallLoc: instance.wallLoc
            ? { x: instance.wallLoc.x, y: instance.wallLoc.y, variant: instance.wallLoc.variant }
            : null,
          art,
          light: def.light ?? null,
        })
      }

      const exportActors: ExportActor[] = []
      for (const actor of actors) {
        const built = await buildActorFrame(actor, timeMs, clips, catalog, customActors)
        if (built) exportActors.push(built)
      }

      return renderFrame({
        model,
        layout,
        room,
        stage,
        floor: deco.floor,
        wall: deco.wall,
        door: deco.door,
        doorDir: room.entryDir,
        floorCells: deco.floorCells,
        wallCells: deco.wallCells,
        furni: exportFurni,
        actors: exportActors,
        wallPanels,
        scale,
        background: settings.background ? ([246, 247, 250] as const) : null,
      })
    },
    [context, clips, customActors],
  )

  const run = async (kind: string, task: () => Promise<string | null>): Promise<void> => {
    if (busy) return
    setBusy(kind)
    setStatus(null)
    try {
      const message = await task()
      if (message) setStatus(message)
    } catch (error) {
      setStatus(`导出失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(null)
    }
  }

  const exportPng = (settings: ExportSettings): Promise<void> =>
    run('png', async () => {
      const frame = await frameAt(0, settings, settings.scale)
      const png = encodePng(frame)
      const saved = await window.pkt.saveFile({
        useExportDir: true,
        suggestedName: `room-${Date.now()}.png`,
        dataBase64: toBase64(png),
      })
      setLastPath(saved.path)
      return saved.saved
        ? `已导出 PNG（${frame.width}×${frame.height}）${fileName(saved.path)}`
        : '已取消'
    })

  const renderSequence = async (
    settings: ExportSettings,
  ): Promise<{ frames: Uint8Array[]; delays: number[] }> => {
    const fps = Math.min(30, Math.max(4, settings.fps))
    const total = Math.min(30, Math.max(1, settings.seconds)) * 1000
    const step = 1000 / fps
    const frames: Uint8Array[] = []
    const delays: number[] = []
    for (let time = 0; time < total; time += step) {
      const image = await frameAt(time, settings, settings.scale)
      frames.push(encodePng(image))
      delays.push(Math.round(step))
    }
    return { frames, delays }
  }

  const exportGif = (settings: ExportSettings): Promise<void> =>
    run('gif', async () => {
      const { frames, delays } = await renderSequence(settings)
      const images = frames.map((png) => decodeForGif(png))
      const saved = await window.pkt.saveFile({
        useExportDir: true,
        suggestedName: `room-${Date.now()}.gif`,
        dataBase64: toBase64(encodeGif(images, delays)),
      })
      setLastPath(saved.path)
      return saved.saved ? `已导出 GIF（${images.length} 帧）${fileName(saved.path)}` : '已取消'
    })

  const exportFrames = (settings: ExportSettings): Promise<void> =>
    run('frames', async () => {
      const { frames } = await renderSequence(settings)
      const zip = await packFrames(frames, 'room')
      const saved = await window.pkt.saveFile({
        useExportDir: true,
        suggestedName: `room-frames-${Date.now()}.zip`,
        dataBase64: toBase64(zip),
      })
      setLastPath(saved.path)
      return saved.saved ? `已导出 ${frames.length} 张 PNG（zip）${fileName(saved.path)}` : '已取消'
    })

  const exportVideo = (settings: ExportSettings): Promise<void> =>
    run('video', async () => {
      if (!ffmpegReady) {
        return '未检测到 ffmpeg：请先安装 ffmpeg（或在设置里指定路径），也可以先导出 GIF / PNG 序列'
      }
      const { frames } = await renderSequence(settings)
      const result = await window.pkt.encodeVideo({
        framesBase64: frames.map((png) => toBase64(png)),
        useExportDir: true,
        fps: settings.fps,
        suggestedName: `room-${Date.now()}.mp4`,
      })
      if (result.ok) setLastPath(result.path)
      return result.ok ? `已导出视频${fileName(result.path)}` : (result.error ?? '视频导出失败')
    })

  const renderPreview = React.useCallback(async (): Promise<Uint8Array | null> => {
    if (!context) return null
    const image = await frameAt(0, { ...DEFAULT_EXPORT_SETTINGS, scale: 1, background: true }, 1)
    return encodePng(image)
  }, [context, frameAt])

  return {
    busy,
    status,
    lastPath,
    exporting: Boolean(busy),
    renderPreview,
    exportPng,
    exportGif,
    exportFrames,
    exportVideo,
    ffmpegReady,
  }
}

/** 家具当前该取第几帧（有动画就按时间循环）。 */
function furniFrame(def: CatalogFurniture, instance: FurniInstance, timeMs: number): number {
  const frames = def.motionFrames
  if (!frames || frames.length === 0 || def.animationMode === 0) {
    return instance.state > 0 ? instance.state : 1
  }
  const total = frames.reduce((sum, frame) => sum + Math.max(1, frame.duration), 0)
  let remain = timeMs % total
  for (const frame of frames) {
    const duration = Math.max(1, frame.duration)
    if (remain < duration) return frame.frame
    remain -= duration
  }
  return frames[frames.length - 1]?.frame ?? 1
}

/** 角色在 t 时刻的合成帧。 */
async function buildActorFrame(
  actor: ActorInstance,
  timeMs: number,
  clips: Map<string, MotionClip>,
  catalog: Catalog,
  customActors: Array<{
    id: string
    front: string
    back?: string
    frameCount: number
    frameDuration: number
  }>,
): Promise<ExportActor | null> {
  if (actor.kind === 'custom' && actor.customActor) {
    const def = customActors.find((item) => item.id === actor.customActor)
    if (!def) return null
    const strip = (actor.dir === 7 || actor.dir === 1) && def.back ? def.back : def.front
    const image = await decodeStripFrame(strip, def.frameCount, timeMs, def.frameDuration)
    if (!image) return null
    return {
      uid: actor.uid,
      x: actor.x,
      y: actor.y,
      dir: actor.dir,
      pose: 'stand',
      art: { image, mirrored: actor.dir === 1 || actor.dir === 5 },
    }
  }

  if (actor.kind === 'npc' || !actor.outfit || !catalog.assets) return null
  const assets = await loadPlayerActorAssets({
    catalog,
    assets: catalog.assets,
    outfit: actor.outfit,
  })
  const clip = actor.clipId ? (clips.get(actor.clipId) ?? standClip()) : standClip()
  const sample = evaluateClip(clip, timeMs, actor.dir)
  const image = composeRoomActor({
    sheet: assets.sheet,
    pose: { dir: actor.dir, arms: sample.arms, legs: sample.legs, hairFrame: sample.hairFrame },
    worn: assets.worn,
    face: assets.face,
  })
  return {
    uid: actor.uid,
    x: actor.x,
    y: actor.y,
    dir: actor.dir,
    pose: actor.seat || clip.id === 'sit' ? 'sit' : clip.id === 'lie' ? 'lie' : 'stand',
    art: { image, mirrored: actorMirrored(actor.dir) },
    offset: sample.offset,
  }
}

/** 帧条裁帧（导出用，同步 PNG 解码）。 */
async function decodeStripFrame(
  dataUrl: string,
  frameCount: number,
  timeMs: number,
  frameDuration: number,
) {
  const { decodePng, crop } = await import('@engine/index')
  const response = await fetch(dataUrl)
  const bytes = new Uint8Array(await response.arrayBuffer())
  const strip = decodePng(bytes)
  const count = Math.max(1, frameCount)
  const width = Math.floor(strip.width / count)
  if (width <= 0) return null
  const index = Math.floor(timeMs / Math.max(40, frameDuration)) % count
  return crop(strip, { x: index * width, y: 0, w: width, h: strip.height })
}

function decodeForGif(png: Uint8Array) {
  return decodePng(png)
}

/** 状态栏里只显示文件名，完整路径靠「打开文件夹」。 */
function fileName(path: string | null): string {
  if (!path) return ''
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return ` · ${index >= 0 ? path.slice(index + 1) : path}`
}
