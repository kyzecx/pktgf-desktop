import * as React from 'react'
import { ButtonRoot, InputRoot } from '@heroui/react'

import type { Catalog, CatalogNpcDef, SaveRecord } from '@shared/contract'
import type { ActorInstance as RoomActorInstance } from '@engine/room'
import { loadNpcArt } from '../services'
import { useCustomActorStore } from '../state/custom-actor-store'
import { CUSTOM_ACTOR_IMPORT_WINDOW_ID } from '../windows'
import { useFloatingStore } from '@ui/floating/use-floating-store'
import { cn } from '@ui/cn'

/**
 * 角色 / NPC 面板。
 *
 * - 玩家角色：从搭配存档一键放进房间（沿用同一份 worn，与衣柜显示一致）
 * - 游戏 NPC：按名字搜索目录里的 NPC
 * - 选中后点地板可以让角色走过去（A* 寻路在引擎里）
 */

export function ActorPanel({
  catalog,
  actors,
  selectedActor,
  onAdd,
  onAddNpc,
  onAddCustom,
  onSelect,
  onRemove,
}: {
  catalog: Catalog
  actors: RoomActorInstance[]
  selectedActor: string | null
  onAdd: (saveId: string) => void
  onAddNpc: (code: string) => void
  /** 把自定义角色包放进房间 */
  onAddCustom: (id: string) => void
  onSelect: (uid: string) => void
  onRemove: (uid: string) => void
  /** 选中角色后点动作：面板由「角色动作」浮窗负责，这里不再重复 */
}): React.ReactElement {
  const [mode, setMode] = React.useState<'none' | 'save' | 'npc' | 'custom'>('none')
  const [query, setQuery] = React.useState('')

  const npcs = React.useMemo(() => {
    const keyword = query.trim().toLowerCase()
    const list = catalog.npcs
    if (!keyword) return list.slice(0, 24)
    return list
      .filter(
        (item) =>
          item.name.toLowerCase().includes(keyword) || item.code.toLowerCase().includes(keyword),
      )
      .slice(0, 24)
  }, [catalog.npcs, query])

  return (
    <div className="rounded-pkt border border-pkt-border bg-pkt-panel/60 p-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium text-pkt-text-mute">角色 · {actors.length}</p>
        <div className="flex gap-1">
          <ButtonRoot
            size="sm"
            variant={mode === 'save' ? 'secondary' : 'ghost'}
            onPress={() => setMode(mode === 'save' ? 'none' : 'save')}
          >
            存档
          </ButtonRoot>
          <ButtonRoot
            size="sm"
            variant={mode === 'npc' ? 'secondary' : 'ghost'}
            onPress={() => setMode(mode === 'npc' ? 'none' : 'npc')}
          >
            NPC
          </ButtonRoot>
          <ButtonRoot
            size="sm"
            variant={mode === 'custom' ? 'secondary' : 'ghost'}
            onPress={() => setMode(mode === 'custom' ? 'none' : 'custom')}
          >
            自定义
          </ButtonRoot>
        </div>
      </div>

      {mode === 'save' ? (
        <SavePicker
          onPick={(id) => {
            onAdd(id)
            setMode('none')
          }}
        />
      ) : null}

      {mode === 'npc' ? (
        <div className="mt-1.5">
          <InputRoot
            placeholder="搜索 NPC 名字 / 代码"
            value={query}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
          />
          <div className="pkt-scroll mt-1 max-h-40 overflow-y-auto">
            {npcs.map((npc) => (
              <button
                key={npc.code}
                type="button"
                onClick={() => {
                  onAddNpc(npc.code)
                  setMode('none')
                }}
                className="flex w-full items-center gap-1.5 rounded-pkt px-1.5 py-1 text-left text-[11px] text-pkt-text-dim hover:bg-pkt-panel hover:text-pkt-text"
              >
                <NpcThumb npc={npc} />
                <span className="min-w-0 flex-1 truncate">{npc.name}</span>
                <span className="shrink-0 text-[9px] text-pkt-text-mute">{npc.code}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {mode === 'custom' ? (
        <CustomActorList
          onAdd={(id) => {
            onAddCustom(id)
            setMode('none')
          }}
        />
      ) : null}

      {actors.length > 0 ? (
        <div className="mt-1.5 flex flex-col gap-0.5">
          {actors.map((actor) => (
            <div
              key={actor.uid}
              className={cn(
                'flex items-center gap-1 rounded-pkt px-1.5 py-0.5 text-[11px]',
                actor.uid === selectedActor
                  ? 'bg-pkt-panel-active text-pkt-text'
                  : 'text-pkt-text-dim hover:bg-pkt-panel',
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(actor.uid)}
                className="flex-1 truncate text-left"
              >
                {actor.kind === 'npc'
                  ? `NPC · ${actor.npcCode}`
                  : `角色 · ${actor.outfit?.sex === 1 ? '男' : '女'}`}
              </button>
              <button
                type="button"
                onClick={() => onRemove(actor.uid)}
                className="text-[10px] text-pkt-text-mute hover:text-pkt-danger"
              >
                删除
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-[10px] text-pkt-text-mute">
          选「存档」把搭配存档放进来，或选「NPC」搜游戏 NPC。
        </p>
      )}
    </div>
  )
}

/** 搭配存档选择器（只列 outfit 存档）。 */
function SavePicker({ onPick }: { onPick: (id: string) => void }): React.ReactElement {
  const { saves, loading } = useSavesLazy()
  const outfits = saves.filter((save) => save.kind === 'outfit')

  if (loading) return <p className="mt-1 text-[10px] text-pkt-text-mute">正在读取存档…</p>
  if (outfits.length === 0) {
    return (
      <p className="mt-1 text-[10px] text-pkt-text-mute">还没有搭配存档，先去「搭配」保存一个。</p>
    )
  }

  return (
    <div className="pkt-scroll mt-1 max-h-40 overflow-y-auto">
      {outfits.map((save) => (
        <button
          key={save.id}
          type="button"
          onClick={() => onPick(save.id)}
          className="flex w-full items-center justify-between rounded-pkt px-1.5 py-0.5 text-left text-[11px] text-pkt-text-dim hover:bg-pkt-panel hover:text-pkt-text"
        >
          <span className="truncate">{save.name}</span>
          <span className="shrink-0 text-[9px] text-pkt-text-mute">
            {new Date(save.updatedAt || save.createdAt).toLocaleDateString('zh-CN')}
          </span>
        </button>
      ))}
    </div>
  )
}

/** 延迟读取存档，避免面板一出现就打 IPC。 */
function useSavesLazy(): { saves: SaveRecord[]; loading: boolean } {
  const [state, setState] = React.useState<{ saves: SaveRecord[]; loading: boolean }>({
    saves: [],
    loading: true,
  })

  React.useEffect(() => {
    let cancelled = false
    void window.pkt
      .listSaves()
      .then((saves) => {
        if (!cancelled) setState({ saves, loading: false })
      })
      .catch(() => {
        if (!cancelled) setState({ saves: [], loading: false })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}

const npcThumbCache = new Map<string, Promise<string | null>>()

/** NPC 缩略图：直接取第一帧（dir 3），转成 dataURL 缓存。 */
function useNpcThumb(npc: CatalogNpcDef | null): string | null {
  const [src, setSrc] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!npc) {
      setSrc(null)
      return
    }
    let cancelled = false
    const key = `${npc.code}:${npc.md5}`
    const cached = npcThumbCache.get(key)
    const promise =
      cached ??
      loadNpcArt(npc, 3, 1)
        .then((art) => (art ? bitmapToDataUrl(art.bitmap) : null))
        .catch(() => null)
    if (!cached) npcThumbCache.set(key, promise)

    void promise.then((value) => {
      if (!cancelled) setSrc(value)
    })
    return () => {
      cancelled = true
    }
  }, [npc])

  return src
}

function bitmapToDataUrl(bitmap: ImageBitmap): string {
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
  return canvas.toDataURL('image/png')
}

function NpcThumb({ npc }: { npc: CatalogNpcDef | null }): React.ReactElement {
  const src = useNpcThumb(npc)
  return (
    <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-sm bg-pkt-panel">
      {src ? (
        <img
          src={src}
          alt=""
          className="max-h-8 max-w-8"
          style={{ imageRendering: 'pixelated' }}
          draggable={false}
        />
      ) : null}
    </span>
  )
}

/** 自定义角色包列表 + 导入入口。 */
function CustomActorList({ onAdd }: { onAdd: (id: string) => void }): React.ReactElement {
  const items = useCustomActorStore((state) => state.items)
  const remove = useCustomActorStore((state) => state.remove)

  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-pkt-text-mute">自定义角色 · {items.length}</span>
        <ButtonRoot
          size="sm"
          variant="ghost"
          onPress={() => useFloatingStore.getState().openWindow(CUSTOM_ACTOR_IMPORT_WINDOW_ID)}
        >
          ＋ 导入
        </ButtonRoot>
      </div>
      {items.length === 0 ? (
        <p className="mt-1 text-[10px] text-pkt-text-mute">
          导入一张 40×60 的横向帧条即可（ZIP 会读 `_3_*` / `_7_*`）。
        </p>
      ) : (
        <div className="pkt-scroll mt-1 max-h-32 overflow-y-auto">
          {items.map((actor) => (
            <div
              key={actor.id}
              className="flex items-center gap-1.5 rounded-pkt px-1.5 py-1 text-[11px] text-pkt-text-dim hover:bg-pkt-panel"
            >
              <img
                src={actor.front}
                alt=""
                className="h-8 w-8 shrink-0 object-none"
                style={{ imageRendering: 'pixelated', objectPosition: 'left center' }}
                draggable={false}
              />
              <button
                type="button"
                onClick={() => onAdd(actor.id)}
                className="min-w-0 flex-1 truncate text-left hover:text-pkt-text"
              >
                {actor.name}
              </button>
              <button
                type="button"
                onClick={() => remove(actor.id)}
                className="shrink-0 text-[10px] text-pkt-text-mute hover:text-pkt-danger"
              >
                删除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
