import { ButtonRoot, KbdRoot, SeparatorRoot } from '@heroui/react'
import * as React from 'react'

import type { Catalog, CatalogItem, Part } from '@shared/contract'
import { FloatingWindow } from '@ui/floating'
import { formatResourceTime } from '@ui/format'
import type { UseActorPreviewResult } from '../hooks/use-actor-preview'
import { useOutfitExport } from '../hooks/use-outfit-export'
import { EXPORT_GIF_SHORTCUT, EXPORT_SHORTCUT } from '../shortcuts'
import { LIST_COLUMN_OPTIONS, useOutfitStore, type ListColumns } from '../state/outfit-store'
import { Section } from './section'

export const OUTFIT_VIEW_WINDOW_ID = 'outfit-view'

/** 画面设置二级菜单：列表密度、预览模式、缩放、动态与导出。 */
export function ViewSettingsWindow({
  catalog,
  worn,
  preview,
}: {
  catalog: Catalog
  worn: Partial<Record<Part, CatalogItem>>
  preview: UseActorPreviewResult
}): React.ReactElement {
  const scale = useOutfitStore((state) => state.scale)
  const setScale = useOutfitStore((state) => state.setScale)
  const autoScale = useOutfitStore((state) => state.autoScale)
  const setAutoScale = useOutfitStore((state) => state.setAutoScale)
  const playing = useOutfitStore((state) => state.playing)
  const togglePlaying = useOutfitStore((state) => state.togglePlaying)
  const itemDisplay = useOutfitStore((state) => state.itemDisplay)
  const setItemDisplay = useOutfitStore((state) => state.setItemDisplay)
  const previewMode = useOutfitStore((state) => state.previewMode)
  const setPreviewMode = useOutfitStore((state) => state.setPreviewMode)
  const smallViews = useOutfitStore((state) => state.smallViews)
  const setSmallView = useOutfitStore((state) => state.setSmallView)
  const listColumns = useOutfitStore((state) => state.listColumns)
  const setListColumns = useOutfitStore((state) => state.setListColumns)

  const { exportingPng, exportingGif, hasMotion, exportPng, exportGif } = useOutfitExport({
    catalog,
    worn,
    preview,
  })

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat || event.altKey) return
      if (!event.metaKey && !event.ctrlKey) return
      if (event.key.toLowerCase() !== 'e') return

      event.preventDefault()
      if (event.shiftKey) void exportGif()
      else void exportPng()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [exportPng, exportGif])

  return (
    <FloatingWindow
      id={OUTFIT_VIEW_WINDOW_ID}
      title="画面设置"
      width={400}
      defaultPosition={{ x: 280, y: 120 }}
    >
      <div className="flex flex-col gap-2 p-2.5">
        <Section title="列表">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-pkt-text-mute">列表显示</span>
            <div className="flex items-center gap-1">
              {(['large', 'small'] as const).map((value) => (
                <ButtonRoot
                  key={value}
                  size="sm"
                  variant={itemDisplay === value ? 'primary' : 'ghost'}
                  onPress={() => setItemDisplay(value)}
                >
                  {value === 'large' ? '大图' : '小图'}
                </ButtonRoot>
              ))}
            </div>
          </div>

          <SeparatorRoot className="my-2" />

          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-pkt-text-mute">每行数量</span>
            <select
              value={listColumns}
              onChange={(event) => setListColumns(Number(event.target.value) as ListColumns)}
              className="h-6 rounded-md border border-pkt-border bg-pkt-panel px-1.5 text-[10px] text-pkt-text"
            >
              {LIST_COLUMN_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value === 0 ? '自动' : `${value} 个`}
                </option>
              ))}
            </select>
          </div>
        </Section>

        <Section title="预览">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-pkt-text-mute">预览显示</span>
            <div className="flex items-center gap-1">
              {(['large', 'small', 'both'] as const).map((value) => (
                <ButtonRoot
                  key={value}
                  size="sm"
                  variant={previewMode === value ? 'primary' : 'ghost'}
                  onPress={() => setPreviewMode(value)}
                >
                  {value === 'large' ? '大图' : value === 'small' ? '小图' : '双模型'}
                </ButtonRoot>
              ))}
            </div>
          </div>

          {previewMode !== 'large' ? (
            <>
              <SeparatorRoot className="my-2" />

              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-pkt-text-mute">小模型视角</span>
                <div className="flex items-center gap-1">
                  <ButtonRoot
                    size="sm"
                    variant={smallViews.front ? 'primary' : 'ghost'}
                    isDisabled={smallViews.front && !smallViews.back}
                    onPress={() => setSmallView('front', !smallViews.front)}
                  >
                    正面
                  </ButtonRoot>
                  <ButtonRoot
                    size="sm"
                    variant={smallViews.back ? 'primary' : 'ghost'}
                    isDisabled={smallViews.back && !smallViews.front}
                    onPress={() => setSmallView('back', !smallViews.back)}
                  >
                    背面
                  </ButtonRoot>
                </div>
              </div>
              <p className="mt-1 text-[10px] text-pkt-text-mute">正面/背面至少保留一面</p>
            </>
          ) : null}

          <SeparatorRoot className="my-2" />

          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-pkt-text-mute">缩放</span>
            <div className="flex items-center gap-1">
              <ButtonRoot
                size="sm"
                aria-label={`自动缩放，当前 ${scale}x`}
                variant={autoScale ? 'primary' : 'ghost'}
                onPress={() => setAutoScale(true)}
              >
                <span>自动</span>
                <span className="text-[9px] opacity-60">{scale}x</span>
              </ButtonRoot>
              {([2, 3, 4] as const).map((value) => (
                <ButtonRoot
                  key={value}
                  size="sm"
                  aria-label={`${value}x 缩放`}
                  variant={!autoScale && scale === value ? 'primary' : 'ghost'}
                  onPress={() => setScale(value)}
                >
                  {value}x
                </ButtonRoot>
              ))}
            </div>
          </div>
        </Section>

        <Section title="动态与导出">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-pkt-text-mute">动态物品</span>
            <ButtonRoot
              size="sm"
              variant={playing ? 'tertiary' : 'outline'}
              onPress={togglePlaying}
              isDisabled={!hasMotion}
            >
              {playing ? '暂停' : '播放'}
            </ButtonRoot>
          </div>

          <SeparatorRoot className="my-2" />

          <div className="grid grid-cols-2 gap-2">
            <ButtonRoot
              onPress={() => void exportPng()}
              isDisabled={
                exportingPng ||
                preview.status !== 'ready' ||
                (previewMode !== 'large' && !preview.smallReady)
              }
            >
              {exportingPng ? '导出中…' : '导出 PNG'}
            </ButtonRoot>
            <ButtonRoot
              variant="outline"
              onPress={() => void exportGif()}
              isDisabled={!hasMotion || exportingGif}
            >
              {exportingGif ? '生成中…' : '导出 GIF'}
            </ButtonRoot>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] text-pkt-text-mute">
            <KbdRoot className="text-[10px]">{EXPORT_SHORTCUT}</KbdRoot>
            <span>PNG</span>
            <KbdRoot className="text-[10px]">{EXPORT_GIF_SHORTCUT}</KbdRoot>
            <span>GIF</span>
          </div>

          <p className="mt-2.5 text-[10px] leading-relaxed text-pkt-text-mute">
            资源版本 {formatResourceTime(catalog.meta.resourceList)}
            {' · '}
            导出 PNG 为 4× 像素放大
          </p>
        </Section>
      </div>
    </FloatingWindow>
  )
}
