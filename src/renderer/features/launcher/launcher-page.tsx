import { ButtonRoot, SpinnerRoot } from '@heroui/react'
import * as React from 'react'

import type { AppInfo, Catalog, SaveRecord } from '@shared/contract'
import { useSaves } from '@features/saves/hooks/use-saves'
import { applyOutfitSave, isOutfitSave, outfitItemCount } from '@features/outfits/state/outfit-save'
import { composeActor, OFFICIAL_SPEC, type CostumeInstance } from '@engine/index'
import { formatResourceTime, formatSlotTime } from '@ui/format'
import { IconArrowRight, IconBook, IconFolder, IconHanger, IconRefresh } from '@ui/icons'
import logo from '@/assets/pktgf-logo.png'
import { getBaseActor, getCostume, toDataUrl } from '@/services/assets'
import { UpdateCard } from './update-card'

/**
 * 工作台。
 *
 * 后台式布局：顶部状态与操作、KPI、最近的搭配表格、右侧当前造型与软件版本。
 * 不放营销 Hero，也不显示尚未开放的功能。
 */
export function LauncherPage({
  catalog,
  info,
  onOpenOutfits,
  onOpenCatalog,
}: {
  catalog: Catalog | null
  info: AppInfo | null
  onOpenOutfits: () => void
  onOpenCatalog: () => void
}): React.ReactElement {
  const { saves } = useSaves()
  const outfitSaves = React.useMemo(() => saves.filter(isOutfitSave), [saves])

  const latest = outfitSaves[0] ?? null
  const preview = useWorkspacePreview(catalog, outfitSaves)
  const resourceTime = formatResourceTime(catalog?.meta.resourceList)

  const openSlot = (save: SaveRecord): void => {
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
              <p className="text-[10px] text-pkt-text-mute">工作台 · 像素搭配 / 图鉴 / 存档</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ButtonRoot size="sm" variant="outline" onPress={onOpenCatalog}>
              <IconBook className="size-3.5" />
              打开图鉴
            </ButtonRoot>
            <ButtonRoot size="sm" onPress={onOpenOutfits}>
              打开衣柜
              <IconArrowRight className="size-3.5" />
            </ButtonRoot>
          </div>
        </header>

        <div className="grid grid-cols-3 gap-3">
          <Kpi
            icon={<IconFolder className="size-4" />}
            label="已保存搭配"
            value={`${outfitSaves.length}`}
            hint="本机存档"
          />
          <Kpi
            icon={<IconHanger className="size-4" />}
            label="最近保存"
            value={latest ? formatSlotTime(latest.updatedAt || latest.createdAt) : '—'}
            hint={latest?.name ?? '还没有存档'}
          />
          <Kpi
            icon={<IconRefresh className="size-4" />}
            label="资源版本"
            value={resourceTime}
            hint="官方资源时间"
          />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-4">
          <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-pkt-border/70 bg-surface/40">
            <div className="flex items-center justify-between gap-3 border-b border-pkt-border/60 px-4 py-3">
              <h2 className="text-[13px] font-medium text-pkt-text">最近搭配</h2>
              <ButtonRoot size="sm" variant="ghost" onPress={onOpenOutfits}>
                打开衣柜
                <IconArrowRight className="size-3.5" />
              </ButtonRoot>
            </div>

            {outfitSaves.length === 0 ? (
              <EmptySlots onStart={onOpenOutfits} />
            ) : (
              <div className="pkt-scroll max-h-[430px] overflow-y-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="sticky top-0 z-10 bg-surface-secondary/95 text-[10px] text-pkt-text-mute backdrop-blur">
                    <tr>
                      <th className="px-4 py-2 font-normal">搭配</th>
                      <th className="w-16 px-2 py-2 font-normal">件数</th>
                      <th className="w-32 px-2 py-2 font-normal">保存时间</th>
                      <th className="w-20 px-4 py-2 text-right font-normal">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outfitSaves.map((save) => (
                      <tr
                        key={save.id}
                        className="border-t border-pkt-border/40 transition-colors hover:bg-pkt-panel-hover"
                      >
                        <td className="px-4 py-1.5">
                          <button
                            type="button"
                            onClick={() => openSlot(save)}
                            className="flex min-w-0 items-center gap-2 text-left"
                          >
                            <img
                              src={save.preview}
                              alt=""
                              className="pkt-pixelated h-10 w-[27px] shrink-0 rounded-sm border border-pkt-border/50"
                            />
                            <span className="truncate text-pkt-text">{save.name}</span>
                          </button>
                        </td>
                        <td className="px-2 py-1.5 text-pkt-text-mute">{outfitItemCount(save)}</td>
                        <td className="px-2 py-1.5 text-pkt-text-mute">
                          {formatSlotTime(save.updatedAt || save.createdAt)}
                        </td>
                        <td className="px-4 py-1.5 text-right">
                          <ButtonRoot size="sm" variant="tertiary" onPress={() => openSlot(save)}>
                            载入
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
                  {latest ? '上次保存' : '默认'}
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
                  {latest?.name ?? '默认造型'}
                </span>
                {latest ? (
                  <span className="shrink-0 text-[10px] text-pkt-text-mute">
                    {outfitItemCount(latest)} 件
                  </span>
                ) : null}
              </div>
              {latest ? (
                <ButtonRoot
                  className="mt-2 w-full"
                  size="sm"
                  variant="outline"
                  onPress={() => openSlot(latest)}
                >
                  载入这套
                </ButtonRoot>
              ) : (
                <ButtonRoot className="mt-2 w-full" size="sm" onPress={onOpenOutfits}>
                  去搭配
                </ButtonRoot>
              )}
            </section>

            <UpdateCard info={info} />
          </aside>
        </div>

        <footer className="border-t border-pkt-border/60 pt-2.5 text-[10px] text-pkt-text-mute">
          非官方工具 · 素材与数据版权归皮卡堂官方所有，仅在本机展示与合成
        </footer>
      </div>
    </div>
  )
}

function Kpi({
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
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-pkt-border/70 bg-surface/40 px-3.5 py-3">
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

function EmptySlots({ onStart }: { onStart: () => void }): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      <span className="grid size-14 place-items-center rounded-2xl border border-pkt-border bg-surface text-pkt-accent">
        <IconHanger className="size-7" />
      </span>
      <div>
        <p className="text-[13px] font-medium text-pkt-text">还没有保存过搭配</p>
        <p className="mx-auto mt-1 max-w-xs text-[11px] leading-relaxed text-pkt-text-mute">
          在衣柜里搭好一套，点「保存当前搭配」或按快捷键，就会出现在这里。
        </p>
      </div>
      <ButtonRoot size="sm" onPress={onStart}>
        去搭配
        <IconArrowRight className="size-3.5" />
      </ButtonRoot>
      <div className="flex flex-wrap justify-center gap-1.5">
        {['发型', '套装', '头饰', '表情', '动态物品', '导出 PNG / GIF'].map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-pkt-border/70 px-2 py-0.5 text-[9px] text-pkt-text-mute"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  )
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
