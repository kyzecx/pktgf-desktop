import * as React from 'react'

import type { AppInfo, Catalog, SaveRecord } from '@shared/contract'
import { ButtonRoot, SpinnerRoot } from '@heroui/react'
import { useSaves } from '@features/saves/hooks/use-saves'
import { applyOutfitSave, isOutfitSave, outfitItemCount } from '@features/outfits/state/outfit-save'
import { isRoomSaveData, setPendingRoomSave } from '@features/room/state/pending-room-save'
import { composeActor, OFFICIAL_SPEC, type CostumeInstance } from '@engine/index'
import { formatResourceTime, formatSlotTime } from '@ui/format'
import {
  IconArrowRight,
  IconBook,
  IconFolder,
  IconHanger,
  IconHouse,
  IconRefresh,
  IconSettings,
  IconShirt,
  IconSofa,
} from '@ui/icons'
import logo from '@/assets/pktgf-logo.png'
import { getBaseActor, getCostume, toDataUrl } from '@/services/assets'
import { UpdateCard } from './update-card'

/**
 * 工作台。
 *
 * 后台式布局：功能入口 + 资源规模 + 最近存档（搭配/房间混排）+ 右侧当前造型与版本。
 * 卡片上写的是**现在真的能做的事**，不放预告。
 */

export interface LauncherHandlers {
  onOpenOutfits: () => void
  onOpenRoom: () => void
  onOpenCatalog: () => void
  onOpenSaves: () => void
  onOpenSettings: () => void
}

export function LauncherPage({
  catalog,
  info,
  onOpenOutfits,
  onOpenRoom,
  onOpenCatalog,
  onOpenSaves,
  onOpenSettings,
}: { catalog: Catalog | null; info: AppInfo | null } & LauncherHandlers): React.ReactElement {
  const { saves } = useSaves()
  const outfitSaves = React.useMemo(() => saves.filter(isOutfitSave), [saves])
  const roomSaves = React.useMemo(
    () => saves.filter((save) => save.kind === 'room' && isRoomSaveData(save.data)),
    [saves],
  )

  const latestOutfit = outfitSaves[0] ?? null
  const preview = useWorkspacePreview(catalog, outfitSaves)
  const counts = catalog?.meta.counts
  // 10 个部位的总数（快照里按部位分别计数）
  const costumeTotal = [
    'hair',
    'cset',
    'hats',
    'mask',
    'glas',
    'clot',
    'pant',
    'coat',
    'bear',
    'wing',
  ].reduce((sum, part) => sum + (counts?.[part] ?? 0), 0)
  const resourceTime = formatResourceTime(catalog?.meta.resourceList)

  const openSave = (save: SaveRecord): void => {
    if (save.kind === 'room') {
      if (isRoomSaveData(save.data)) {
        setPendingRoomSave(save.data)
        onOpenRoom()
      }
      return
    }
    if (applyOutfitSave(catalog, save)) onOpenOutfits()
  }

  return (
    <div className="pkt-scroll h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-6 py-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src={logo}
              alt="皮卡堂工坊"
              className="size-12 shrink-0 rounded-xl border border-pkt-border/70 bg-pkt-panel object-cover"
            />
            <div className="min-w-0">
              <h1 className="text-[20px] font-semibold tracking-tight text-pkt-text">皮卡堂工坊</h1>
              <p className="text-[10px] text-pkt-text-mute">
                工作台 · 搭配 / 建造装修 / 图鉴 / 存档
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ButtonRoot size="sm" variant="ghost" onPress={onOpenSettings}>
              <IconSettings className="size-3.5" />
              设置
            </ButtonRoot>
            <ButtonRoot size="sm" variant="outline" onPress={onOpenOutfits}>
              <IconShirt className="size-3.5" />
              在线衣柜
            </ButtonRoot>
            <ButtonRoot size="sm" onPress={onOpenRoom}>
              进建造
              <IconArrowRight className="size-3.5" />
            </ButtonRoot>
          </div>
        </header>

        {/* 四个功能入口：写清现在能做什么 */}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FeatureCard
            icon={<IconShirt className="size-4" />}
            title="搭配"
            subtitle={`${counts?.hair ?? 0} 发型 · ${counts?.cset ?? 0} 套装`}
            action={{
              label: outfitSaves.length > 0 ? '继续搭配' : '开始搭配',
              onPress: onOpenOutfits,
            }}
          />
          <FeatureCard
            icon={<IconHouse className="size-4" />}
            title="建造 · 装修"
            subtitle={`${counts?.rooms ?? 0} 房型 · ${counts?.furniture ?? 0} 家具`}
            action={{ label: '去建造', onPress: onOpenRoom }}
            accent
          />
          <FeatureCard
            icon={<IconBook className="size-4" />}
            title="图鉴"
            subtitle={`${counts?.furniture ?? 0} 家具 · ${counts?.npcs ?? 0} NPC`}
            action={{ label: '打开图鉴', onPress: onOpenCatalog }}
          />
          <FeatureCard
            icon={<IconFolder className="size-4" />}
            title="存档"
            subtitle={`${outfitSaves.length} 搭配 · ${roomSaves.length} 房间`}
            action={{ label: '管理存档', onPress: onOpenSaves }}
          />
        </div>

        {/* 资源与自动更新 */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            icon={<IconSofa className="size-4" />}
            label="家具库"
            value={`${counts?.furniture ?? 0}`}
            hint={`${counts?.rooms ?? 0} 房型 · ${counts?.roomMaps ?? 0} 走格图`}
          />
          <Stat
            icon={<IconHanger className="size-4" />}
            label="服饰库"
            value={`${costumeTotal}`}
            hint="发型 / 套装 / 头饰等 10 个部位"
          />
          <Stat
            icon={<IconHouse className="size-4" />}
            label="动作库"
            value={`${counts?.actorMotions ?? 0}`}
            hint={`${counts?.npcMotions ?? 0} 组 NPC 动作`}
          />
          <Stat
            icon={<IconRefresh className="size-4" />}
            label="资源版本"
            value={resourceTime}
            hint="每 5 分钟自动检查并更新"
          />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-4">
          <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-pkt-border/70 bg-surface/40">
            <div className="flex items-center justify-between gap-3 border-b border-pkt-border/60 px-4 py-3">
              <div className="flex items-baseline gap-2">
                <h2 className="text-[13px] font-medium text-pkt-text">最近存档</h2>
                <span className="text-[10px] text-pkt-text-mute">搭配与房间按时间混排</span>
              </div>
              <ButtonRoot size="sm" variant="ghost" onPress={onOpenSaves}>
                全部存档
                <IconArrowRight className="size-3.5" />
              </ButtonRoot>
            </div>

            {saves.length === 0 ? (
              <EmptySaves onStart={onOpenOutfits} onRoom={onOpenRoom} />
            ) : (
              <div className="pkt-scroll max-h-[430px] overflow-y-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="sticky top-0 z-10 bg-surface-secondary/95 text-[10px] text-pkt-text-mute backdrop-blur">
                    <tr>
                      <th className="px-4 py-2 font-normal">名称</th>
                      <th className="w-20 px-2 py-2 font-normal">类型</th>
                      <th className="w-28 px-2 py-2 font-normal">内容</th>
                      <th className="w-32 px-2 py-2 font-normal">保存时间</th>
                      <th className="w-20 px-4 py-2 text-right font-normal">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {saves.slice(0, 40).map((save) => (
                      <tr
                        key={save.id}
                        className="border-t border-pkt-border/40 transition-colors hover:bg-pkt-panel-hover"
                      >
                        <td className="px-4 py-1.5">
                          <button
                            type="button"
                            onClick={() => openSave(save)}
                            className="flex min-w-0 items-center gap-2 text-left"
                          >
                            {save.preview ? (
                              <img
                                src={save.preview}
                                alt=""
                                className="h-10 w-[27px] shrink-0 rounded-sm border border-pkt-border/50 object-cover pkt-pixelated"
                              />
                            ) : (
                              <span className="grid h-10 w-[27px] shrink-0 place-items-center rounded-sm border border-pkt-border/50 text-pkt-text-mute">
                                <IconFolder className="size-3.5" />
                              </span>
                            )}
                            <span className="truncate text-pkt-text">{save.name}</span>
                          </button>
                        </td>
                        <td className="px-2 py-1.5">
                          <span className="rounded-full border border-pkt-border/70 px-1.5 py-0.5 text-[9px] text-pkt-text-mute">
                            {save.kind === 'room' ? '房间' : '搭配'}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-pkt-text-mute">
                          {save.kind === 'room'
                            ? `${roomFurniCount(save)} 件家具`
                            : `${outfitItemCount(save)} 件`}
                        </td>
                        <td className="px-2 py-1.5 text-pkt-text-mute">
                          {formatSlotTime(save.updatedAt || save.createdAt)}
                        </td>
                        <td className="px-4 py-1.5 text-right">
                          <ButtonRoot size="sm" variant="tertiary" onPress={() => openSave(save)}>
                            打开
                          </ButtonRoot>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <aside className="flex flex-col gap-3">
            <section className="rounded-xl border border-pkt-border/70 bg-surface/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[13px] font-medium text-pkt-text">当前造型</h2>
                <span className="text-[10px] text-pkt-text-mute">
                  {latestOutfit ? '上次保存' : '默认'}
                </span>
              </div>
              <div className="pkt-checker mt-2 grid h-[228px] place-items-center overflow-hidden rounded-lg border border-pkt-border/50">
                {preview ? (
                  <img
                    src={preview}
                    alt=""
                    draggable={false}
                    className="pkt-pixelated h-[204px] w-[136px] object-contain"
                  />
                ) : (
                  <SpinnerRoot size="sm" color="accent" />
                )}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 px-0.5">
                <span className="truncate text-[11px] text-pkt-text">
                  {latestOutfit?.name ?? '默认造型'}
                </span>
                {latestOutfit ? (
                  <span className="shrink-0 text-[10px] text-pkt-text-mute">
                    {outfitItemCount(latestOutfit)} 件
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex gap-1.5">
                {latestOutfit ? (
                  <ButtonRoot
                    className="flex-1"
                    size="sm"
                    variant="outline"
                    onPress={() => openSave(latestOutfit)}
                  >
                    载入这套
                  </ButtonRoot>
                ) : (
                  <ButtonRoot className="flex-1" size="sm" onPress={onOpenOutfits}>
                    去搭配
                  </ButtonRoot>
                )}
                <ButtonRoot size="sm" variant="ghost" onPress={onOpenRoom}>
                  进建造
                </ButtonRoot>
              </div>
            </section>

            <UpdateCard info={info} />

            <section className="rounded-xl border border-pkt-border/70 bg-surface/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-[13px] font-medium text-pkt-text">喜欢皮卡堂工坊？</h2>
                  <p className="mt-0.5 text-[10px] text-pkt-text-mute">
                    去 GitHub 点个 Star 支持一下
                  </p>
                </div>
                <span className="text-lg text-pkt-warn">★</span>
              </div>
              <ButtonRoot
                className="mt-2 w-full"
                size="sm"
                variant="outline"
                onPress={() =>
                  void window.pkt.openExternal('https://github.com/kyzecx/pktgf-desktop')
                }
              >
                GitHub · 给个 Star
              </ButtonRoot>
            </section>
          </aside>
        </div>

        <footer className="border-t border-pkt-border/60 pt-2.5 text-[10px] text-pkt-text-mute">
          非官方工具 · 素材与数据版权归皮卡堂官方所有，仅在本机展示与合成
        </footer>
      </div>
    </div>
  )
}

/** 一屏说清「这个功能现在能做什么」。 */
function FeatureCard({
  icon,
  title,
  subtitle,
  action,
  accent,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  action: { label: string; onPress: () => void }
  accent?: boolean
}): React.ReactElement {
  return (
    <section
      className={`flex flex-col rounded-xl border p-3.5 ${
        accent ? 'border-pkt-accent/40 bg-pkt-accent/5' : 'border-pkt-border/70 bg-surface/40'
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-lg border ${
            accent
              ? 'border-pkt-accent/40 bg-pkt-accent/10 text-pkt-accent'
              : 'border-pkt-border bg-background/40 text-pkt-accent'
          }`}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-[13px] font-medium text-pkt-text">{title}</h2>
          <p className="truncate text-[10px] text-pkt-text-mute">{subtitle}</p>
        </div>
      </div>
      <ButtonRoot
        className="mt-3 w-full"
        size="sm"
        variant={accent ? 'secondary' : 'outline'}
        onPress={action.onPress}
      >
        {action.label}
        <IconArrowRight className="size-3.5" />
      </ButtonRoot>
    </section>
  )
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint: string
}): React.ReactElement {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-pkt-border/70 bg-surface/40 px-3.5 py-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-pkt-border bg-background/40 text-pkt-accent">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] text-pkt-text-mute">{label}</p>
        <p className="truncate text-[15px] font-semibold text-pkt-text">{value}</p>
        <p className="mt-0.5 truncate text-[10px] text-pkt-text-mute">{hint}</p>
      </div>
    </div>
  )
}

function EmptySaves({
  onStart,
  onRoom,
}: {
  onStart: () => void
  onRoom: () => void
}): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      <span className="grid size-14 place-items-center rounded-2xl border border-pkt-border bg-surface text-pkt-accent">
        <IconHanger className="size-7" />
      </span>
      <div>
        <p className="text-[13px] font-medium text-pkt-text">还没有任何存档</p>
        <p className="mx-auto mt-1 max-w-sm text-[11px] leading-relaxed text-pkt-text-mute">
          搭配好一套衣服，或者布置好一间房，点「保存」就会出现在这里； 房间存档可以导出成 .pktroom
          发给别人。
        </p>
      </div>
      <div className="flex gap-2">
        <ButtonRoot size="sm" onPress={onStart}>
          去搭配
          <IconArrowRight className="size-3.5" />
        </ButtonRoot>
        <ButtonRoot size="sm" variant="outline" onPress={onRoom}>
          去建造
        </ButtonRoot>
      </div>
      <div className="flex flex-wrap justify-center gap-1.5">
        {['十个部位', '动态物品', '导出 PNG / GIF', '45° 装修', '角色与 NPC', '导出视频'].map(
          (tag) => (
            <span
              key={tag}
              className="rounded-full border border-pkt-border/70 px-2 py-0.5 text-[9px] text-pkt-text-mute"
            >
              {tag}
            </span>
          ),
        )}
      </div>
    </div>
  )
}

/** 房间存档里的家具件数（结构不对就当 0）。 */
function roomFurniCount(save: SaveRecord): number {
  const data = save.data as { furni?: unknown[] } | null
  return Array.isArray(data?.furni) ? data.furni.length : 0
}

/** 有存档就用最新存档的预览，否则用一套默认造型做门面。 */
function useWorkspacePreview(catalog: Catalog | null, saves: SaveRecord[]): string | null {
  const [preview, setPreview] = React.useState<string | null>(saves[0]?.preview ?? null)

  React.useEffect(() => {
    const latestPreview = saves[0]?.preview
    if (latestPreview) {
      setPreview(latestPreview)
      return
    }
    if (!catalog) return

    let cancelled = false
    void (async () => {
      try {
        const hair =
          catalog.items.find((item) => item.code === 'f_hair016') ??
          catalog.items.find((item) => item.part === 'hair' && item.sex === 2)
        const cset =
          catalog.items.find((item) => item.code === 'f_cset004') ??
          catalog.items.find((item) => item.part === 'cset' && item.sex === 2)
        const hat = catalog.items.find((item) => item.code === 'f_hats028')

        const base = await getBaseActor(2, catalog.assets)
        const worn: Record<string, CostumeInstance> = {}
        if (hair) worn.hair = await getCostume(hair)
        if (cset) worn.cset = await getCostume(cset)
        if (hat) worn.hats = await getCostume(hat)

        const image = composeActor({ spec: OFFICIAL_SPEC, base, worn })
        if (!cancelled) setPreview(toDataUrl(image))
      } catch (error) {
        console.warn('[launcher] 默认造型加载失败', error)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [catalog, saves])

  return preview
}
