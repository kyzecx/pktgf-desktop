import { ButtonRoot } from '@heroui/react'
import * as React from 'react'

import { IconFace, IconFolder, IconHanger, IconSettings } from '@ui/icons'
import type { UseActorPreviewResult } from '../hooks/use-actor-preview'
import { PreviewStage } from './preview-stage'

export type OutfitPanel = 'detail' | 'faces' | 'slots' | 'view'

/** 右侧衣柜：预览画布和四个二级菜单入口（衣柜/表情/存档/画面设置）。 */
export function WardrobePanel({
  preview,
  wornCount,
  openPanels,
  onTogglePanel,
}: {
  preview: UseActorPreviewResult
  wornCount: number
  openPanels: Record<OutfitPanel, boolean>
  onTogglePanel: (panel: OutfitPanel) => void
}): React.ReactElement {
  return (
    <aside className="flex min-h-0 w-[380px] shrink-0 flex-col border-l border-pkt-border bg-surface-secondary/30">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-pkt-border px-3">
        <span className="text-[11px] font-medium tracking-wide text-pkt-text-mute">试穿预览</span>
        {wornCount > 0 ? (
          <span className="text-[10px] text-pkt-text-mute">{wornCount} 件</span>
        ) : null}
        <div className="ml-auto flex items-center gap-0.5">
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

      <div className="flex min-h-0 flex-1">
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
