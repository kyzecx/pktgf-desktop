import { ButtonRoot, IconSearch, InputRoot } from '@heroui/react'
import * as React from 'react'

import type { SaveKind, SaveRecord } from '@shared/contract'
import { parseSaveBundle, serializeSaveBundle } from '@shared/saves'
import { outfitItemCount } from '@features/outfits/state/outfit-save'
import { formatSlotTime } from '@ui/format'
import { IconArrowRight, IconHanger } from '@ui/icons'
import { toBase64 } from '@/services/assets'
import { useSaves } from './hooks/use-saves'

const KIND_LABELS: Record<SaveKind, string> = {
  outfit: '搭配',
  room: '装修',
}

type SortOrder = 'newest' | 'oldest' | 'name'
type KindFilter = 'all' | SaveKind

/**
 * 存档管理页。
 *
 * 搭配、后续装修/家具等工具的存档都汇总在这里。
 * 页面只认 SaveRecord，具体载入由调用方按 kind 处理。
 */
export function SavesPage({
  onOpenSave,
  onOpenOutfits,
}: {
  onOpenSave: (save: SaveRecord) => void
  onOpenOutfits: () => void
}): React.ReactElement {
  const { saves, put, remove } = useSaves()
  const [query, setQuery] = React.useState('')
  const [kind, setKind] = React.useState<KindFilter>('all')
  const [sort, setSort] = React.useState<SortOrder>('newest')
  const [notice, setNotice] = React.useState<string | null>(null)

  const kinds = React.useMemo(() => {
    const present = new Set(saves.map((save) => save.kind))
    return (['all', 'outfit', 'room'] as const).filter(
      (value) => value === 'all' || present.has(value),
    )
  }, [saves])

  const visible = React.useMemo(() => {
    const keyword = query.trim().toLowerCase()
    const filtered = saves.filter((save) => {
      if (kind !== 'all' && save.kind !== kind) return false
      if (!keyword) return true
      return save.name.toLowerCase().includes(keyword) || KIND_LABELS[save.kind].includes(keyword)
    })
    return filtered.sort((a, b) => compareSaves(a, b, sort))
  }, [saves, kind, query, sort])

  const importSaves = async (): Promise<void> => {
    const file = await window.pkt.openFile({
      filters: [{ name: '存档', extensions: ['json'] }],
    })
    if (!file) return
    try {
      const raw = new TextDecoder().decode(
        Uint8Array.from(atob(file.base64), (char) => char.charCodeAt(0)),
      )
      const list = parseSaveBundle(raw)
      if (list.length === 0) {
        setNotice('没有解析到可用的存档')
        return
      }
      for (const save of list) await put(save)
      setNotice(`已导入 ${list.length} 个存档`)
    } catch (error) {
      console.warn('[saves] 导入失败', error)
      setNotice('导入失败，请检查文件格式')
    }
  }

  const exportSaves = async (): Promise<void> => {
    if (saves.length === 0) return
    const payload = serializeSaveBundle(saves)
    await window.pkt.saveFile({
      suggestedName: `pktgf-saves-${Date.now()}.json`,
      dataBase64: toBase64(new TextEncoder().encode(payload)),
    })
  }

  return (
    <div className="pkt-scroll h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-6 py-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight text-pkt-text">存档管理</h1>
            <p className="mt-0.5 text-[11px] text-pkt-text-mute">
              搭配、装修等工具的存档都汇总在这里
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ButtonRoot size="sm" variant="outline" onPress={() => void importSaves()}>
              导入
            </ButtonRoot>
            <ButtonRoot
              size="sm"
              variant="outline"
              isDisabled={saves.length === 0}
              onPress={() => void exportSaves()}
            >
              导出全部
            </ButtonRoot>
            <ButtonRoot size="sm" onPress={onOpenOutfits}>
              打开搭配
              <IconArrowRight className="size-3.5" />
            </ButtonRoot>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-pkt-text-mute" />
            <InputRoot
              value={query}
              placeholder="搜索存档名称"
              onChange={(event) => setQuery(event.target.value)}
              className="w-full pl-9"
            />
          </div>

          {kinds.length > 1 ? (
            <div className="flex items-center gap-1">
              {kinds.map((value) => (
                <ButtonRoot
                  key={value}
                  size="sm"
                  variant={kind === value ? 'primary' : 'ghost'}
                  onPress={() => setKind(value)}
                >
                  {value === 'all' ? '全部' : KIND_LABELS[value]}
                </ButtonRoot>
              ))}
            </div>
          ) : null}

          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortOrder)}
            aria-label="存档排序"
            className="h-7 shrink-0 rounded-md border border-pkt-border bg-pkt-panel px-1.5 text-[10px] text-pkt-text"
          >
            <option value="newest">最新优先</option>
            <option value="oldest">最早优先</option>
            <option value="name">按名称</option>
          </select>

          <span className="ml-auto text-[10px] text-pkt-text-mute">
            {visible.length} / {saves.length} 个存档
          </span>
        </div>

        {notice ? (
          <p className="rounded-pkt border border-pkt-border/70 bg-surface/40 px-3 py-2 text-[10px] text-pkt-text-mute">
            {notice}
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="ml-2 text-pkt-accent hover:underline"
            >
              知道了
            </button>
          </p>
        ) : null}

        {saves.length === 0 ? (
          <EmptySaves onStart={onOpenOutfits} />
        ) : visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-pkt-border px-6 py-14 text-center text-[12px] text-pkt-text-mute">
            没有匹配的存档
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((save) => (
              <SaveCard
                key={save.id}
                save={save}
                onOpen={() => onOpenSave(save)}
                onDelete={() => void remove(save.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SaveCard({
  save,
  onOpen,
  onDelete,
}: {
  save: SaveRecord
  onOpen: () => void
  onDelete: () => void
}): React.ReactElement {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onOpen}
        title={save.name}
        className="w-full rounded-xl border border-pkt-border/70 bg-surface/40 p-2 text-left transition-all hover:-translate-y-0.5 hover:border-pkt-accent/50 hover:bg-surface-hover"
      >
        <div className="pkt-checker relative grid h-[190px] place-items-center overflow-hidden rounded-lg border border-pkt-border/50">
          <img
            src={save.preview}
            alt=""
            draggable={false}
            className="pkt-pixelated max-h-[172px] max-w-full object-contain"
          />
          <span className="absolute top-1.5 left-1.5 rounded-full border border-pkt-border bg-surface/90 px-1.5 py-0.5 text-[9px] text-pkt-text-mute backdrop-blur">
            {KIND_LABELS[save.kind]}
          </span>
          <span className="absolute right-1.5 bottom-1.5 rounded-full border border-pkt-accent/30 bg-surface/90 px-1.5 py-0.5 text-[9px] text-pkt-accent opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
            载入
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 px-0.5">
          <span className="truncate text-[12px] text-pkt-text">{save.name}</span>
          <span className="shrink-0 text-[10px] text-pkt-text-mute">
            {formatSlotTime(save.updatedAt || save.createdAt)}
          </span>
        </div>
        <div className="mt-0.5 px-0.5 text-[10px] text-pkt-text-mute">
          {save.kind === 'outfit' ? `${outfitItemCount(save)} 件` : '装修存档'}
        </div>
      </button>
      <button
        type="button"
        aria-label="删除存档"
        onClick={onDelete}
        className="absolute top-2 right-2 grid size-5 place-items-center rounded-full text-[12px] text-pkt-text-mute opacity-0 transition-opacity group-hover:opacity-100 hover:bg-pkt-danger/20 hover:text-pkt-danger"
      >
        ×
      </button>
    </div>
  )
}

function EmptySaves({ onStart }: { onStart: () => void }): React.ReactElement {
  return (
    <div className="relative overflow-hidden rounded-xl border border-dashed border-pkt-border px-6 py-16">
      <div className="pkt-dot-grid pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative flex flex-col items-center gap-3 text-center">
        <span className="grid size-14 place-items-center rounded-2xl border border-pkt-border bg-surface text-pkt-accent">
          <IconHanger className="size-7" />
        </span>
        <div>
          <p className="text-[13px] font-medium text-pkt-text">还没有存档</p>
          <p className="mt-1 text-[11px] text-pkt-text-mute">
            搭配好一套后保存，搭配和后续装修的存档都会出现在这里。
          </p>
        </div>
        <ButtonRoot size="sm" onPress={onStart}>
          去搭配
          <IconArrowRight className="size-3.5" />
        </ButtonRoot>
      </div>
    </div>
  )
}

function compareSaves(a: SaveRecord, b: SaveRecord, sort: SortOrder): number {
  if (sort === 'oldest') return a.createdAt - b.createdAt
  if (sort === 'name') return a.name.localeCompare(b.name, 'zh-CN')
  return (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)
}
