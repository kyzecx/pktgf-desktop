import { ButtonRoot } from '@heroui/react'
import * as React from 'react'

import type { Part } from '@shared/contract'
import {
  IconFace,
  IconFolder,
  IconHanger,
  IconLayoutHorizontal,
  IconLayoutVertical,
  IconSettings,
} from '@ui/icons'
import type { UseActorPreviewResult } from '../hooks/use-actor-preview'
import type { CategoryLayout } from '../state/outfit-store'
import { CategoryTabs } from './category-tabs'
import { PreviewStage } from './preview-stage'

export type OutfitPanel = 'detail' | 'faces' | 'slots' | 'view'

/**
 * 右侧衣柜：分类、预览画布和三个二级菜单入口（衣柜/表情/画面设置）。
 *
 * 分类支持竖排（画布左侧一列）与横排（预览标题下方一行），
 * 两种排布都不再占用左侧物品网格的宽度。
 */
export function WardrobePanel({
  preview,
  wornCount,
  openPanels,
  onTogglePanel,
  counts,
  activePart,
  icons,
  onSelectPart,
  layout,
  onToggleLayout,
}: {
  preview: UseActorPreviewResult
  wornCount: number
  openPanels: Record<OutfitPanel, boolean>
  onTogglePanel: (panel: OutfitPanel) => void
  counts: Map<Part, number>
  activePart: Part
  icons: Partial<Record<Part, string>>
  onSelectPart: (part: Part) => void
  layout: CategoryLayout
  onToggleLayout: () => void
}): React.ReactElement {
  const isVertical = layout === 'vertical'

  return (
    <aside className="flex min-h-0 w-[380px] shrink-0 flex-col border-l border-pkt-border bg-surface-secondary/30">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-pkt-border px-3">
        <span className="text-[11px] font-medium tracking-wide text-pkt-text-mute">试穿预览</span>
        {wornCount > 0 ? (
          <span className="text-[10px] text-pkt-text-mute">{wornCount} 件</span>
        ) : null}
        <div className="ml-auto flex items-center gap-0.5">
          <ButtonRoot
            size="sm"
            variant="ghost"
            isIconOnly
            aria-label={isVertical ? '分类改为横排' : '分类改为竖排'}
            onPress={onToggleLayout}
          >
            {isVertical ? (
              <IconLayoutHorizontal className="size-4" />
            ) : (
              <IconLayoutVertical className="size-4" />
            )}
          </ButtonRoot>
          <span className="mx-1 h-4 w-px bg-pkt-border" />
          <PanelButton
            label="衣柜"
            active={openPanels.detail}
            onClick={() => onTogglePanel('detail')}
          >
            <IconHanger className="size-4" />
          </PanelButton>
          <PanelButton
            label="表情"
            active={openPanels.faces}
            onClick={() => onTogglePanel('faces')}
          >
            <IconFace className="size-4" />
          </PanelButton>
          <PanelButton
            label="存档"
            active={openPanels.slots}
            onClick={() => onTogglePanel('slots')}
          >
            <IconFolder className="size-4" />
          </PanelButton>
          <PanelButton
            label="画面设置"
            active={openPanels.view}
            onClick={() => onTogglePanel('view')}
          >
            <IconSettings className="size-4" />
          </PanelButton>
        </div>
      </div>

      {!isVertical ? (
        <div className="flex shrink-0 items-center border-b border-pkt-border/70">
          <CategoryTabs
            counts={counts}
            active={activePart}
            icons={icons}
            orientation="horizontal"
            onSelect={onSelectPart}
          />
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {isVertical ? (
          <div className="flex w-[56px] shrink-0 flex-col border-r border-pkt-border/70">
            <CategoryTabs
              counts={counts}
              active={activePart}
              icons={icons}
              orientation="vertical"
              onSelect={onSelectPart}
            />
          </div>
        ) : null}
        <PreviewStage preview={preview} />
      </div>
    </aside>
  )
}

function PanelButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active: boolean
  onClick: () => void
  children: React.ReactNode
}): React.ReactElement {
  return (
    <span title={label}>
      <ButtonRoot
        size="sm"
        variant={active ? 'tertiary' : 'ghost'}
        isIconOnly
        aria-label={label}
        onPress={onClick}
      >
        {children}
      </ButtonRoot>
    </span>
  )
}
