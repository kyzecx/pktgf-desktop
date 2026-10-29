import * as React from 'react'
import { ButtonRoot, InputRoot } from '@heroui/react'

import type { Catalog, RoomDirection } from '@shared/contract'
import type { ActorInstance } from '@engine/room'
import { FloatingWindow } from '@ui/floating'
import { cn } from '@ui/cn'

import { useCustomClipStore } from '../state/custom-clip-store'
import { ACTOR_WINDOW_ID, MOTION_EDITOR_WINDOW_ID } from '../windows'

const BUILT_IN = [
  ['stand', '待机'],
  ['walk', '行走'],
  ['sit', '坐下'],
  ['lie', '躺下'],
] as const

/**
 * 角色动作面板：**选中房间里的角色才会出现**。
 *
 * 正确的用法就是「先放人物 → 点人物 → 这里挑动作」，
 * 所以入口不在顶栏菜单里（顶栏那条「动作」按钮已经去掉了）。
 * 想做自定义动作再点「编辑自定义动作」进动作编辑器。
 */
export function ActorActionPanel({
  catalog,
  actor,
  onClip,
  onDir,
  onRemove,
  onOpenMotionEditor,
}: {
  catalog: Catalog | null
  actor: ActorInstance
  onClip: (clipId: string | null) => void
  onDir: (dir: RoomDirection) => void
  onRemove: () => void
  onOpenMotionEditor: () => void
}): React.ReactElement {
  const [query, setQuery] = React.useState('')
  const customClips = useCustomClipStore((state) => state.clips)

  // NPC 用官方 npcMotionConfig（stand1 / walk1 / magic…），玩家才用 motionConfig；
  // 自建角色是帧条循环，套不了部件动作。
  const isNpc = actor.kind === 'npc'
  const isCustom = actor.kind === 'custom'
  const npcMotions = React.useMemo(() => Object.keys(catalog?.npcMotions ?? {}).sort(), [catalog])
  const official = React.useMemo(() => Object.keys(catalog?.actorMotions ?? {}).sort(), [catalog])
  const custom = React.useMemo(() => customClips.map((clip) => clip.id), [customClips])
  const all = React.useMemo(() => {
    if (isNpc) return npcMotions
    if (isCustom) return []
    return [...custom, ...official]
  }, [isNpc, isCustom, npcMotions, custom, official])

  const filtered = React.useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return all.slice(0, 80)
    return all.filter((name) => name.toLowerCase().includes(keyword)).slice(0, 80)
  }, [all, query])

  const label =
    actor.kind === 'npc'
      ? `NPC · ${actor.npcCode}`
      : actor.kind === 'custom'
        ? `自建角色 · ${actor.customActor}`
        : `角色 · ${actor.outfit?.sex === 1 ? '男' : '女'}`

  return (
    <FloatingWindow
      id={ACTOR_WINDOW_ID}
      title="角色动作"
      width={280}
      defaultPosition={{ x: 720, y: 180 }}
    >
      <div className="flex flex-col gap-1.5 p-2 text-[11px]">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-pkt-text">{label}</span>
          <span className="shrink-0 text-[10px] text-pkt-text-mute">
            {actor.x},{actor.y}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="w-8 text-pkt-text-mute">朝向</span>
          {([1, 3, 5, 7] as const).map((dir) => (
            <ButtonRoot
              key={dir}
              size="sm"
              variant={actor.dir === dir ? 'secondary' : 'ghost'}
              onPress={() => onDir(dir)}
            >
              {dir === 1 ? '左上' : dir === 3 ? '右下' : dir === 5 ? '右上' : '左下'}
            </ButtonRoot>
          ))}
        </div>

        {isCustom ? (
          <p className="rounded-pkt bg-pkt-panel/60 px-2 py-1.5 text-[10px] leading-relaxed text-pkt-text-mute">
            自建角色是按帧条循环播放的，不能套用部件动作；只能调朝向和位置。
          </p>
        ) : (
          <>
            {isNpc ? null : (
              <div className="flex flex-wrap gap-1 border-t border-pkt-border/60 pt-1.5">
                {BUILT_IN.map(([id, text]) => (
                  <ButtonRoot
                    key={id}
                    size="sm"
                    variant={actor.clipId === id ? 'secondary' : 'ghost'}
                    onPress={() => onClip(id)}
                  >
                    {text}
                  </ButtonRoot>
                ))}
                <ButtonRoot size="sm" variant="ghost" onPress={() => onClip(null)}>
                  停止
                </ButtonRoot>
              </div>
            )}
            {isNpc ? (
              <p className="pt-1.5 text-[10px] text-pkt-text-mute">
                NPC 只能用官方自带动作（站立 / 走动 / 特殊动作）
              </p>
            ) : null}
          </>
        )}

        {isCustom ? null : (
          <InputRoot
            placeholder={
              isNpc
                ? `搜索 NPC 动作（共 ${npcMotions.length} 组）`
                : `搜索动作（官方 ${official.length} 组）`
            }
            value={query}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
          />
        )}

        {isCustom ? null : (
          <div className="pkt-scroll max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-1 py-2 text-center text-[10px] text-pkt-text-mute">没有匹配的动作</p>
            ) : (
              filtered.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => onClip(name)}
                  className={cn(
                    'block w-full truncate rounded-pkt px-1.5 py-0.5 text-left',
                    actor.clipId === name
                      ? 'bg-pkt-panel-active text-pkt-text'
                      : 'text-pkt-text-dim hover:bg-pkt-panel hover:text-pkt-text',
                  )}
                >
                  {custom.includes(name) ? `${name} · 自建` : name}
                </button>
              ))
            )}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-pkt-border/60 pt-1.5">
          {isNpc ? null : (
            <ButtonRoot size="sm" variant="ghost" onPress={onOpenMotionEditor}>
              编辑自定义动作…
            </ButtonRoot>
          )}
          <ButtonRoot size="sm" variant="ghost" onPress={onRemove}>
            删除角色
          </ButtonRoot>
        </div>
      </div>
    </FloatingWindow>
  )
}

export { MOTION_EDITOR_WINDOW_ID }
