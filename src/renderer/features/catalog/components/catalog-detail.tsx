import { ButtonRoot } from '@heroui/react'
import * as React from 'react'

import { getEntryFrames, getPetEggThumbnail, type EntryFrames } from '../services'
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
  onDownloadSelected,
}: {
  entry: CatalogEntry
  selectedFrames: ReadonlySet<string>
  exporting: boolean
  onToggleFrame: (key: string) => void
  onSetFrames: (keys: string[], checked: boolean) => void
  onClearFrames: () => void
  onDownloadSelected: () => void
}): React.ReactElement {
  const [eggSrc, setEggSrc] = React.useState<string | null>(null)
  const [frames, setFrames] = React.useState<EntryFrames | null>(null)
  const [frameError, setFrameError] = React.useState<string | null>(null)
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
      <div className="pkt-checker grid h-48 place-items-center rounded-pkt border border-pkt-border/60">
        <CatalogThumbnail entry={entry} view={view} />
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
      <CatalogFramePicker
        frames={frames}
        selected={selectedFrames}
        onToggle={onToggleFrame}
        onSetMany={onSetFrames}
        onClear={onClearFrames}
      />

      <ButtonRoot
        onPress={onDownloadSelected}
        isDisabled={exporting || selectedFrames.size === 0}
        className="w-full"
      >
        {exporting ? '下载中…' : `下载选中帧 (${selectedFrames.size})`}
      </ButtonRoot>

      <p className="mt-auto text-[9px] leading-relaxed text-pkt-text-mute">
        导出结构：皮卡堂图鉴 / {CATALOG_KIND_LABELS[entry.kind]} / {entry.code}_{entry.name} /
        frames
      </p>
    </aside>
  )
}
