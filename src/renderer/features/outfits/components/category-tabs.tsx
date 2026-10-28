import { Tab, TabList, TabsRoot } from '@heroui/react'
import * as React from 'react'

import type { Part } from '@shared/contract'
import { cn } from '@ui/cn'
import { PART_LABELS, PART_ORDER } from '../state/outfit-store'

export type CategoryOrientation = 'vertical' | 'horizontal'

/**
 * 分类切换。
 *
 * 用官方 uiRes 的 16×16 分类图标代替文字，图标缺失时回退到部位名，
 * 保证资源包未就绪/加载失败也能操作。件数为 0 的分类保留但禁用。
 */
export function CategoryTabs({
  counts,
  active,
  icons,
  orientation,
  onSelect,
}: {
  counts: Map<Part, number>
  active: Part
  icons: Partial<Record<Part, string>>
  orientation: CategoryOrientation
  onSelect: (part: Part) => void
}): React.ReactElement {
  const isVertical = orientation === 'vertical'

  return (
    <TabsRoot
      orientation={orientation}
      selectedKey={active}
      onSelectionChange={(key) => onSelect(String(key) as Part)}
      className={cn(
        'pkt-no-drag min-h-0',
        isVertical
          ? 'pkt-scroll flex w-full flex-1 flex-col justify-center overflow-y-auto p-1.5'
          : 'w-full overflow-x-auto px-2 py-1.5',
      )}
    >
      <TabList
        className={cn(
          'p-0',
          isVertical
            ? 'flex flex-col items-center gap-1'
            : 'flex w-max flex-row items-center gap-1',
        )}
      >
        {PART_ORDER.map((part) => {
          const count = counts.get(part) ?? 0
          const icon = icons[part]
          return (
            <Tab
              key={part}
              id={part}
              isDisabled={count === 0}
              aria-label={PART_LABELS[part]}
              className={cn(
                'relative min-w-0 shrink-0 items-center justify-center rounded-pkt border p-0',
                'border-transparent text-pkt-text-mute transition-colors',
                'data-[selected=true]:border-pkt-accent/60 data-[selected=true]:bg-pkt-accent/15 data-[selected=true]:text-pkt-accent',
                isVertical ? 'size-10' : 'size-8',
              )}
            >
              {icon ? (
                <img
                  src={icon}
                  alt=""
                  draggable={false}
                  width={isVertical ? 32 : 24}
                  height={isVertical ? 32 : 24}
                  className="pkt-pixelated object-contain"
                  style={{ width: isVertical ? 32 : 24, height: isVertical ? 32 : 24 }}
                />
              ) : (
                <span className="text-[10px] leading-none">{PART_LABELS[part]}</span>
              )}
            </Tab>
          )
        })}
      </TabList>
    </TabsRoot>
  )
}
