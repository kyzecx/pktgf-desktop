import * as React from 'react'
import { ButtonRoot, InputRoot } from '@heroui/react'

import { encodeGif, encodePng } from '@engine/index'
import { FloatingWindow } from '@ui/floating'

import { EXPORT_WINDOW_ID } from '../windows'

export interface ExportSettings {
  scale: 1 | 2 | 3
  background: boolean
  /** GIF：帧率与时长 */
  fps: number
  seconds: number
}

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  scale: 2,
  background: true,
  fps: 12,
  seconds: 4,
}

/**
 * 导出浮窗：PNG / GIF / 视频。
 *
 * 关键设计：每条导出都走**同一个 `frameAt(t)`**（见 use-room-export），
 * 所以导出的画面和屏幕上看到的一致；视频需要系统 ffmpeg，没有就降级 GIF 并提示。
 */
export function ExportPanel({
  settings,
  onChange,
  onExportPng,
  onExportGif,
  onExportVideo,
  onExportFrames,
  busy,
  status,
  ffmpegReady,
  lastPath,
}: {
  settings: ExportSettings
  onChange: (patch: Partial<ExportSettings>) => void
  onExportPng: () => void
  onExportGif: () => void
  onExportVideo: () => void
  onExportFrames: () => void
  busy: string | null
  status: string | null
  ffmpegReady: boolean
  /** 上次导出的文件（可直接打开所在文件夹） */
  lastPath: string | null
}): React.ReactElement {
  return (
    <FloatingWindow
      id={EXPORT_WINDOW_ID}
      title="导出"
      width={320}
      defaultPosition={{ x: 700, y: 140 }}
    >
      <div className="flex flex-col gap-2 p-2 text-[11px]">
        <div className="flex items-center gap-1">
          <span className="w-14 text-pkt-text-mute">倍率</span>
          {([1, 2, 3] as const).map((value) => (
            <ButtonRoot
              key={value}
              size="sm"
              variant={settings.scale === value ? 'secondary' : 'ghost'}
              onPress={() => onChange({ scale: value })}
            >
              {value}×
            </ButtonRoot>
          ))}
          <ButtonRoot
            size="sm"
            variant={settings.background ? 'secondary' : 'ghost'}
            onPress={() => onChange({ background: !settings.background })}
          >
            背景
          </ButtonRoot>
        </div>

        <div className="flex items-center gap-1">
          <span className="w-14 text-pkt-text-mute">GIF</span>
          <label className="flex items-center gap-1">
            <InputRoot
              className="w-14"
              value={String(settings.fps)}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                onChange({ fps: clamp(Number(event.target.value.replace(/\D/g, '')) || 12, 4, 30) })
              }
            />
            fps
          </label>
          <label className="flex items-center gap-1">
            <InputRoot
              className="w-14"
              value={String(settings.seconds)}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                onChange({
                  seconds: clamp(Number(event.target.value.replace(/\D/g, '')) || 4, 1, 30),
                })
              }
            />
            秒
          </label>
        </div>

        <div className="mt-1 flex flex-wrap gap-1">
          <ButtonRoot size="sm" onPress={onExportPng} isDisabled={Boolean(busy)}>
            {busy === 'png' ? '导出中…' : '导出 PNG'}
          </ButtonRoot>
          <ButtonRoot size="sm" variant="outline" onPress={onExportGif} isDisabled={Boolean(busy)}>
            {busy === 'gif' ? '导出中…' : '导出 GIF'}
          </ButtonRoot>
        </div>

        <div className="mt-1 flex flex-wrap gap-1">
          <ButtonRoot
            size="sm"
            variant="outline"
            onPress={onExportVideo}
            isDisabled={Boolean(busy)}
          >
            {busy === 'video' ? '导出中…' : '导出视频 (MP4)'}
          </ButtonRoot>
          <ButtonRoot size="sm" variant="ghost" onPress={onExportFrames} isDisabled={Boolean(busy)}>
            {busy === 'frames' ? '导出中…' : '导出 PNG 序列'}
          </ButtonRoot>
        </div>

        <p className="text-[10px] text-pkt-text-mute">
          视频导出需要单独安装 ffmpeg
          {ffmpegReady ? '（已检测到）' : '（未检测到，会提示降级为 GIF）'}。
          序列导出会生成一整个文件夹，可自行用 ffmpeg 合成。
        </p>

        {status ? <p className="text-[10px] text-pkt-text">{status}</p> : null}
        {lastPath ? (
          <div className="flex items-center gap-1">
            <ButtonRoot
              size="sm"
              variant="ghost"
              onPress={() => void window.pkt.revealPath(lastPath)}
            >
              打开所在文件夹
            </ButtonRoot>
            <span className="truncate text-[10px] text-pkt-text-mute" title={lastPath}>
              保存位置可在「设置 → 导出」固定
            </span>
          </div>
        ) : null}
      </div>
    </FloatingWindow>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 把若干 PNG 放进 zip（序列导出用）。 */
export function packFrames(frames: Uint8Array[], prefix: string): Promise<Uint8Array> {
  return import('fflate').then(({ zipSync }) => {
    const files: Record<string, Uint8Array> = {}
    frames.forEach((frame, index) => {
      files[`${prefix}-${String(index).padStart(4, '0')}.png`] = frame
    })
    return zipSync(files, { level: 6 })
  })
}

export { encodeGif, encodePng }
