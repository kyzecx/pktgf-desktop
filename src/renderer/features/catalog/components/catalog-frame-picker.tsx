import { ButtonRoot, SpinnerRoot } from '@heroui/react'
import * as React from 'react'

import { toDataUrl } from '@/services/assets'
import { cn } from '@ui/cn'
import { frameKey } from '../types'
import type { EntryFrames, FrameGroup } from '../services'

/** 大/小模型、家具、宠物共用同一套帧选择器。 */
export function CatalogFramePicker({
  frames,
  selected,
  onToggle,
  onSetMany,
  onClear,
}: {
  frames: EntryFrames | null
  selected: ReadonlySet<string>
  onToggle: (key: string) => void
  onSetMany: (keys: string[], checked: boolean) => void
  onClear: () => void
}): React.ReactElement {
  if (!frames) {
    return (
      <div className="flex items-center gap-2 text-[10px] text-pkt-text-mute">
        <SpinnerRoot size="sm" color="accent" />
        正在载入帧…
      </div>
    )
  }

  if (frames.total === 0) {
    return <p className="text-[10px] text-pkt-text-mute">这个物品没有可导出的帧。</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-pkt-text-mute">已选 {selected.size} 帧</span>
        <div className="flex items-center gap-1">
          <ButtonRoot
            size="sm"
            variant="ghost"
            onPress={() => {
              const keys = frames.groups.flatMap((group) =>
                group.frames.map((frame) => frameKey(group.dir, frame.name)),
              )
              onSetMany(keys, true)
            }}
          >
            全选
          </ButtonRoot>
          <ButtonRoot size="sm" variant="ghost" onPress={onClear} isDisabled={selected.size === 0}>
            清空
          </ButtonRoot>
        </div>
      </div>

      <div className="flex max-h-64 flex-col gap-2 overflow-auto pr-0.5">
        {frames.groups.map((group) => (
          <FrameGroupSection
            key={group.dir}
            group={group}
            selected={selected}
            onToggle={onToggle}
            onSetMany={onSetMany}
          />
        ))}
      </div>
    </div>
  )
}

function FrameGroupSection({
  group,
  selected,
  onToggle,
  onSetMany,
}: {
  group: FrameGroup
  selected: ReadonlySet<string>
  onToggle: (key: string) => void
  onSetMany: (keys: string[], checked: boolean) => void
}): React.ReactElement {
  const keys = group.frames.map((frame) => frameKey(group.dir, frame.name))
  const allSelected = keys.length > 0 && keys.every((key) => selected.has(key))

  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] text-pkt-text-mute">
          {group.label} · {group.frames.length}
        </span>
        {group.frames.length > 1 ? (
          <button
            type="button"
            className="text-[9px] text-pkt-accent"
            onClick={() => onSetMany(keys, !allSelected)}
          >
            {allSelected ? '取消本组' : '全选本组'}
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-1">
        {group.frames.map((frame) => (
          <FrameTile
            key={frame.name}
            name={frame.name}
            checked={selected.has(frameKey(group.dir, frame.name))}
            image={frame.image}
            onToggle={() => onToggle(frameKey(group.dir, frame.name))}
          />
        ))}
      </div>
    </section>
  )
}

function FrameTile({
  name,
  checked,
  image,
  onToggle,
}: {
  name: string
  checked: boolean
  image: { data: Uint8ClampedArray; width: number; height: number }
  onToggle: () => void
}): React.ReactElement {
  const src = React.useMemo(() => toDataUrl(image), [image])

  return (
    <label
      className={cn(
        'flex cursor-pointer flex-col gap-0.5 rounded border p-0.5',
        checked ? 'border-pkt-accent bg-pkt-accent/10' : 'border-pkt-border/60',
      )}
    >
      <span className="pkt-checker grid h-12 place-items-center overflow-hidden rounded-sm">
        <img src={src} alt={name} className="pkt-pixelated max-h-11 max-w-full object-contain" />
      </span>
      <span className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-label={`选择帧 ${name}`}
          className="size-2.5 shrink-0 accent-[var(--pkt-accent)]"
        />
        <span className="min-w-0 truncate text-[8px] text-pkt-text-mute">{name}</span>
      </span>
    </label>
  )
}
