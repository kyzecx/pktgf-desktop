import { ButtonRoot } from '@heroui/react'
import * as React from 'react'

import {
  LIST_COLUMN_OPTIONS,
  useOutfitStore,
  type ItemDisplay,
  type ItemSort,
  type ListColumns,
} from '@features/outfits/state/outfit-store'
import { FloatingWindow, useFloatingStore } from '@ui/floating'
import { IconList } from '@ui/icons'
import type { VirtualGridSize } from '@ui/virtual-grid'

export const LIST_SETTINGS_WINDOW_ID = 'list-settings'

/** 搭配与图鉴共用同一套卡片尺寸，切换列表模式时两边的默认大小一致。 */
export const LIST_SIZES: Record<ItemDisplay, VirtualGridSize> = {
  large: {
    minWidth: 56,
    autoWidth: 84,
    autoHeight: 104,
    autoThumbWidth: 48,
    autoThumbHeight: 72,
    gap: 8,
  },
  small: {
    minWidth: 44,
    autoWidth: 64,
    autoHeight: 86,
    autoThumbWidth: 40,
    autoThumbHeight: 60,
    gap: 6,
  },
}

export function ListSettingsButton(): React.ReactElement {
  const open = useFloatingStore((state) => state.open[LIST_SETTINGS_WINDOW_ID] ?? false)
  const toggle = useFloatingStore((state) => state.toggle)

  return (
    <ButtonRoot
      size="sm"
      variant={open ? 'tertiary' : 'ghost'}
      aria-label="列表设置"
      onPress={() => toggle(LIST_SETTINGS_WINDOW_ID)}
    >
      <IconList className="size-3.5" />
      列表
    </ButtonRoot>
  )
}

/** 列表显示和每行数量的二级菜单；搭配页和图鉴页共享同一个设置。 */
export function ListSettingsWindow({
  extra,
  hideDisplay = false,
}: {
  extra?: React.ReactNode
  hideDisplay?: boolean
}): React.ReactElement {
  const display = useOutfitStore((state) => state.itemDisplay)
  const setDisplay = useOutfitStore((state) => state.setItemDisplay)
  const columns = useOutfitStore((state) => state.listColumns)
  const setColumns = useOutfitStore((state) => state.setListColumns)
  const sort = useOutfitStore((state) => state.itemSort)
  const setSort = useOutfitStore((state) => state.setItemSort)

  return (
    <FloatingWindow
      id={LIST_SETTINGS_WINDOW_ID}
      title="列表"
      width={300}
      defaultPosition={{ x: 280, y: 96 }}
    >
      <div className="flex flex-col gap-3 p-3 text-[11px]">
        {hideDisplay ? null : (
          <div className="flex items-center justify-between gap-3">
            <span className="text-pkt-text-mute">列表显示</span>
            <div className="flex items-center gap-1">
              {(['large', 'small'] as const).map((value) => (
                <ButtonRoot
                  key={value}
                  size="sm"
                  variant={display === value ? 'primary' : 'ghost'}
                  onPress={() => setDisplay(value)}
                >
                  {value === 'large' ? '大图' : '小图'}
                </ButtonRoot>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="text-pkt-text-mute">每行数量</span>
          <select
            value={columns}
            onChange={(event) => setColumns(Number(event.target.value) as ListColumns)}
            className="h-7 rounded-md border border-pkt-border bg-pkt-panel px-1.5 text-[10px] text-pkt-text"
          >
            {LIST_COLUMN_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value === 0 ? '自动' : `${value} 个`}
              </option>
            ))}
          </select>
        </div>

        {extra}

        <div className="flex items-center justify-between gap-3">
          <span className="text-pkt-text-mute">排序</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as ItemSort)}
            className="h-7 rounded-md border border-pkt-border bg-pkt-panel px-1.5 text-[10px] text-pkt-text"
          >
            <option value="newest">最新优先</option>
            <option value="oldest">最早优先</option>
            <option value="name">按名称</option>
          </select>
        </div>
      </div>
    </FloatingWindow>
  )
}
