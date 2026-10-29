import * as React from 'react'
import { ButtonRoot, InputRoot } from '@heroui/react'

import { decodePng, openBundle, readSymbolImage, type RgbaImage } from '@engine/index'
import { FloatingWindow } from '@ui/floating'
import { useFloatingStore } from '@ui/floating/use-floating-store'

import {
  MAX_CUSTOM_ACTOR_BYTES,
  useCustomActorStore,
  type CustomActor,
} from '../state/custom-actor-store'
import { CUSTOM_ACTOR_IMPORT_WINDOW_ID, MOTION_EDITOR_WINDOW_ID } from '../windows'

/**
 * 自定义角色包导入。
 *
 * 支持两种来源：
 * - **PNG 帧条**：横向 N 帧，每帧等宽（40×60 最稳），作为正面（dir3）
 * - **ZIP 包**：取 `<code>_3_*` 与 `<code>_7_*` 符号拼成帧条
 *
 * 没有背面时 dir7/dir1 自动用正面镜像（和官方 NPC 一样的兜底）。
 */
export function CustomActorImport(): React.ReactElement | null {
  const open = useFloatingStore((state) => state.open[CUSTOM_ACTOR_IMPORT_WINDOW_ID] ?? false)
  const add = useCustomActorStore((state) => state.add)

  const [name, setName] = React.useState('自定义角色')
  const [front, setFront] = React.useState<{
    dataUrl: string
    width: number
    height: number
  } | null>(null)
  const [back, setBack] = React.useState<{ dataUrl: string; width: number; height: number } | null>(
    null,
  )
  const [frameCount, setFrameCount] = React.useState(1)
  const [frameDuration, setFrameDuration] = React.useState(160)
  const [error, setError] = React.useState<string | null>(null)

  const pick = async (slot: 'front' | 'back'): Promise<void> => {
    setError(null)
    const file = await window.pkt.openFile({
      filters: [{ name: '角色帧条 / 素材包', extensions: ['png', 'zip'] }],
    })
    if (!file) return

    try {
      const bytes = Uint8Array.from(atob(file.base64), (char) => char.charCodeAt(0))
      if (bytes.byteLength > MAX_CUSTOM_ACTOR_BYTES) {
        setError(`文件超过 ${(MAX_CUSTOM_ACTOR_BYTES / 1024 / 1024).toFixed(0)}MB`)
        return
      }
      const strip = await readStrip(bytes, file.name)
      if (!strip) {
        setError('没能从文件里读出图片')
        return
      }
      if (slot === 'front') {
        setFront(strip)
        if (frameCount <= 1 && strip.height > 0) {
          // 默认按 40 宽猜帧数（官方帧就是 40×60）
          setFrameCount(Math.max(1, Math.round(strip.width / 40)))
        }
      } else {
        setBack(strip)
      }
    } catch (cause) {
      setError(`读取失败：${cause instanceof Error ? cause.message : String(cause)}`)
    }
  }

  const save = (): void => {
    if (!front) return
    const item: CustomActor = {
      id: `a${Date.now().toString(36)}`,
      name: name.trim() || '自定义角色',
      front: front.dataUrl,
      ...(back ? { back: back.dataUrl } : {}),
      frameCount: Math.max(1, frameCount),
      frameDuration: Math.max(40, frameDuration),
      createdAt: Date.now(),
    }
    try {
      add(item)
      useFloatingStore.getState().close(CUSTOM_ACTOR_IMPORT_WINDOW_ID)
      setFront(null)
      setBack(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  if (!open) return null

  const frameWidth = front ? Math.round(front.width / Math.max(1, frameCount)) : 0

  return (
    <FloatingWindow
      id={CUSTOM_ACTOR_IMPORT_WINDOW_ID}
      title="导入自定义角色"
      width={380}
      defaultPosition={{ x: 520, y: 160 }}
    >
      <div className="flex flex-col gap-2 p-2">
        <div className="flex gap-1">
          <ButtonRoot size="sm" variant="outline" onPress={() => void pick('front')}>
            正面帧条
          </ButtonRoot>
          <ButtonRoot size="sm" variant="ghost" onPress={() => void pick('back')}>
            背面（可选）
          </ButtonRoot>
        </div>

        {front ? (
          <div className="flex items-end gap-2 rounded-pkt border border-pkt-border p-1.5">
            <img
              src={front.dataUrl}
              alt=""
              className="max-h-16"
              style={{ imageRendering: 'pixelated' }}
              draggable={false}
            />
            <p className="text-[10px] text-pkt-text-mute">
              {front.width}×{front.height} · 每帧 {frameWidth || '?'}×{front.height}
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-pkt-text-mute">
            横向帧条（每帧等宽，通常 40×60）；ZIP 会取 `_3_*` / `_7_*` 符号。
          </p>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-pkt-text-mute">名称</span>
          <InputRoot
            value={name}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
          />
        </label>

        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[10px] text-pkt-text-mute">帧数</span>
            <InputRoot
              value={String(frameCount)}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setFrameCount(Math.max(1, Number(event.target.value.replace(/\D/g, '')) || 1))
              }
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[10px] text-pkt-text-mute">每帧时长 (ms)</span>
            <InputRoot
              value={String(frameDuration)}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setFrameDuration(Math.max(40, Number(event.target.value.replace(/\D/g, '')) || 160))
              }
            />
          </label>
        </div>

        {error ? <p className="text-[10px] text-pkt-danger">{error}</p> : null}

        <div className="flex gap-1">
          <ButtonRoot size="sm" onPress={save} isDisabled={!front}>
            保存到角色库
          </ButtonRoot>
          <ButtonRoot
            size="sm"
            variant="ghost"
            onPress={() => useFloatingStore.getState().openWindow(MOTION_EDITOR_WINDOW_ID)}
          >
            去编动作
          </ButtonRoot>
        </div>
      </div>
    </FloatingWindow>
  )
}

/** PNG 直接解；ZIP 把 `_3_*`（或 `_7_*`）符号横排成帧条。 */
async function readStrip(
  bytes: Uint8Array,
  fileName: string,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  let image: RgbaImage | null = null
  if (fileName.toLowerCase().endsWith('.zip')) {
    const bundle = openBundle(bytes)
    const names = [...bundle.symbols.keys()].filter((name) => /_\d{2,3}$/i.test(name))
    const frames = names
      .filter((name) => /_3_/i.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    const used = frames.length > 0 ? frames : names.slice(0, 1)
    if (used.length === 0) return null
    const images = used.map((name) => readSymbolImage(bundle, name)).filter(Boolean) as RgbaImage[]
    if (images.length === 0) return null
    image = stackHorizontally(images)
  } else {
    image = decodePng(bytes)
  }
  if (!image) return null

  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  canvas
    .getContext('2d')
    ?.putImageData(
      new ImageData(new Uint8ClampedArray(image.data), image.width, image.height),
      0,
      0,
    )
  return { dataUrl: canvas.toDataURL('image/png'), width: image.width, height: image.height }
}

function stackHorizontally(images: RgbaImage[]): RgbaImage {
  const width = images.reduce((sum, image) => sum + image.width, 0)
  const height = Math.max(...images.map((image) => image.height))
  const out = { width, height, data: new Uint8ClampedArray(width * height * 4) }
  let offset = 0
  for (const image of images) {
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const si = (y * image.width + x) * 4
        const di = ((y + (height - image.height)) * width + offset + x) * 4
        out.data[di] = image.data[si] ?? 0
        out.data[di + 1] = image.data[si + 1] ?? 0
        out.data[di + 2] = image.data[si + 2] ?? 0
        out.data[di + 3] = image.data[si + 3] ?? 0
      }
    }
    offset += image.width
  }
  return out
}
