import { ButtonRoot, SpinnerRoot } from '@heroui/react'
import * as React from 'react'

import { toDataUrl } from '@/services/assets'
import { getEntryFrames, getPetEggThumbnail, type EntryFrames, type GifSequence } from '../services'
import { CATALOG_KIND_LABELS, type CatalogEntry, type CatalogView } from '../types'
import { CatalogFramePicker } from './catalog-frame-picker'
import { CatalogThumbnail } from './catalog-thumbnail'

export function CatalogDetail({
  entry,
  selectedFrames,
  exporting,
  onToggleFrame,
  onSetFrames,
  onClearFrames,
  onExportGif,
}: {
  entry: CatalogEntry
  selectedFrames: ReadonlySet<string>
  exporting: boolean
  onToggleFrame: (key: string) => void
  onSetFrames: (keys: string[], checked: boolean) => void
  onClearFrames: () => void
  onExportGif: () => void
}): React.ReactElement {
  const [eggSrc, setEggSrc] = React.useState<string | null>(null)
  const [frames, setFrames] = React.useState<EntryFrames | null>(null)
  const [frameError, setFrameError] = React.useState<string | null>(null)
  const [format, setFormat] = React.useState<'frames' | 'gif'>('frames')
  const view: CatalogView = { display: 'large', petView: 'pet' }

  React.useEffect(() => {
    let cancelled = false
    setEggSrc(null)
    if (entry.kind !== 'pet') return
    void getPetEggThumbnail(entry)
      .then((value) => {
        if (!cancelled) setEggSrc(value)
      })
      .catch(() => {
        if (!cancelled) setEggSrc(null)
      })
    return () => {
      cancelled = true
    }
  }, [entry])

  React.useEffect(() => {
    let cancelled = false
    setFormat('frames')
    setFrames(null)
    setFrameError(null)
    void getEntryFrames(entry)
      .then((value) => {
        if (!cancelled) setFrames(value)
      })
      .catch((error: unknown) => {
        if (!cancelled) setFrameError(error instanceof Error ? error.message : String(error))
      })
    return () => {
      cancelled = true
    }
  }, [entry])

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-auto border-l border-pkt-border p-3">
      <div className="pkt-checker relative grid h-56 shrink-0 place-items-center overflow-hidden rounded-pkt border border-pkt-border/60 p-2">
        {frames?.gif ? (
          <AnimatedPreview sequence={frames.gif} alt={entry.name} />
        ) : (
          <CatalogThumbnail entry={entry} view={view} />
        )}
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-pkt-accent/15 px-1.5 py-0.5 text-[9px] text-pkt-accent">
            {CATALOG_KIND_LABELS[entry.kind]}
          </span>
          <span className="truncate text-[10px] text-pkt-text-mute">{entry.code}</span>
        </div>
        <h3 className="text-sm font-medium text-pkt-text">{entry.name}</h3>
        {entry.description ? (
          <p className="text-[10px] leading-relaxed text-pkt-text-mute">{entry.description}</p>
        ) : null}
      </div>

      {entry.kind === 'pet' && eggSrc ? (
        <div className="flex items-center gap-2 rounded-pkt border border-pkt-border/60 p-2">
          <img src={eggSrc} alt="宠物蛋" className="pkt-pixelated size-12 object-contain" />
          <div className="flex flex-col">
            <span className="text-[10px] text-pkt-text">宠物蛋</span>
            <span className="text-[9px] text-pkt-text-mute">{entry.pet?.eggCode}</span>
          </div>
        </div>
      ) : null}

      {frameError ? <p className="text-[9px] text-pkt-danger">{frameError}</p> : null}

      {frames?.gif ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-pkt-text-mute">导出格式</span>
          <div className="flex items-center gap-1">
            <ButtonRoot
              size="sm"
              variant={format === 'frames' ? 'primary' : 'ghost'}
              onPress={() => setFormat('frames')}
            >
              帧图
            </ButtonRoot>
            <ButtonRoot
              size="sm"
              variant={format === 'gif' ? 'primary' : 'ghost'}
              onPress={() => setFormat('gif')}
            >
              GIF
            </ButtonRoot>
          </div>
        </div>
      ) : null}

      {format === 'gif' && frames?.gif ? (
        <p className="rounded-pkt border border-pkt-border/60 p-2 text-[10px] text-pkt-text-mute">
          将导出 {frames.gif.frames.length} 帧循环 GIF，与逐帧下载二选一。
        </p>
      ) : (
        <CatalogFramePicker
          frames={frames}
          selected={selectedFrames}
          onToggle={onToggleFrame}
          onSetMany={onSetFrames}
          onClear={onClearFrames}
        />
      )}

      {format === 'gif' && frames?.gif ? (
        <ButtonRoot onPress={onExportGif} isDisabled={exporting} className="w-full">
          {exporting ? '下载中…' : `下载 GIF (${frames.gif.frames.length} 帧)`}
        </ButtonRoot>
      ) : null}

      <p className="mt-auto text-[9px] leading-relaxed text-pkt-text-mute">
        导出结构：皮卡堂图鉴 / {CATALOG_KIND_LABELS[entry.kind]} / {entry.code}_{entry.name} /
        frames
      </p>
    </aside>
  )
}

function AnimatedPreview({
  sequence,
  alt,
}: {
  sequence: GifSequence
  alt: string
}): React.ReactElement {
  const [index, setIndex] = React.useState(0)
  const frame = sequence.frames[index] ?? sequence.frames[0]

  React.useEffect(() => {
    setIndex(0)
  }, [sequence])

  React.useEffect(() => {
    if (sequence.frames.length < 2) return
    const delay = sequence.delays[index] ?? 100
    const timer = window.setTimeout(
      () => setIndex((current) => (current + 1) % sequence.frames.length),
      delay,
    )
    return () => window.clearTimeout(timer)
  }, [sequence, index])

  const src = React.useMemo(() => (frame ? toDataUrl(frame.image) : ''), [frame])
  if (!src) return <SpinnerRoot size="sm" color="accent" />

  return (
    <>
      <img src={src} alt={alt} className="pkt-pixelated max-h-52 max-w-full object-contain" />
      <span className="absolute top-1.5 right-1.5 rounded bg-pkt-bg/80 px-1 text-[9px] text-pkt-text-mute">
        动
      </span>
    </>
  )
}
