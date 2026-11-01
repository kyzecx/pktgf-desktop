import * as React from 'react'

import { cn } from '@ui/cn'
import { OutfitLabelEditor } from './outfit-label-editor'
import type { SaleItemState, SaleLabel, SaleLabelPart } from './model'
import { sanitizePriceInput } from './price'

export interface SaleItemRowProps {
  item: SaleItemState
  bordered: boolean
  armed: boolean
  grouped: boolean
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void
  onDragEnd: () => void
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void
  onChangeName: (value: string) => void
  onChangePrice: (value: string) => void
  onToggleSold: () => void
  onToggleLabel: (part: SaleLabelPart) => void
  onChangeLabel: (part: SaleLabelPart, patch: Partial<Pick<SaleLabel, 'name' | 'price'>>) => void
  onDetach: () => void
  onRemove: () => void
}

export function SaleItemRow({
  item,
  bordered,
  armed,
  grouped,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onChangeName,
  onChangePrice,
  onToggleSold,
  onToggleLabel,
  onChangeLabel,
  onDetach,
  onRemove,
}: SaleItemRowProps): React.ReactElement {
  const outfit = item.subject.kind === 'outfit' ? item.subject : null
  const entry = item.subject.kind === 'entry' ? item.subject.entry : null

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        'flex flex-col gap-1 rounded-pkt p-1.5 transition-all duration-200',
        bordered
          ? 'border border-pkt-border/60'
          : 'border border-transparent hover:border-pkt-border/60',
        armed && 'ring-2 ring-pkt-accent ring-offset-1 ring-offset-surface',
      )}
    >
      <div className="flex items-center gap-1">
        <span
          className="cursor-grab shrink-0 select-none text-[10px] text-pkt-text-mute"
          title="拖动到另一条可组合"
        >
          ⋮⋮
        </span>
        {outfit ? (
          <>
            <span className="min-w-0 flex-1 truncate text-[10px] text-pkt-text" title={item.name}>
              {item.name}
            </span>
            <span className="shrink-0 text-[9px] text-pkt-text-mute">
              {outfit.wornItems.length} 件
            </span>
          </>
        ) : (
          <input
            value={item.name}
            onChange={(event) => onChangeName(event.target.value)}
            aria-label={`${entry?.name ?? item.name} 展示名称`}
            className="h-7 min-w-0 flex-1 rounded-md border border-pkt-border bg-pkt-panel px-1.5 text-[10px] text-pkt-text"
          />
        )}
        {grouped ? (
          <button
            type="button"
            className="shrink-0 text-[9px] text-pkt-text-mute hover:text-pkt-accent"
            onClick={onDetach}
          >
            拆出
          </button>
        ) : null}
        <button
          type="button"
          className="shrink-0 px-0.5 text-[12px] leading-none text-pkt-text-mute hover:text-pkt-danger"
          aria-label="从卖货图移除"
          title="从卖货图移除"
          onClick={onRemove}
        >
          ×
        </button>
      </div>

      {outfit ? (
        <>
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[9px] text-pkt-text-mute">
              搭配存档 · 标题和部件价格在下方设置
            </span>
            <SoldToggle sold={item.sold} onToggle={onToggleSold} />
          </div>
          <OutfitLabelEditor
            subject={outfit}
            labels={item.labels}
            onToggle={onToggleLabel}
            onChange={onChangeLabel}
          />
        </>
      ) : (
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[9px] text-pkt-text-mute">
            {entry?.code}
          </span>
          <input
            value={item.price}
            onChange={(event) => onChangePrice(sanitizePriceInput(event.target.value))}
            placeholder="价格"
            inputMode="decimal"
            title="价格支持小数，最多两位"
            aria-label={`${item.name} 价格`}
            className="h-7 w-16 rounded-md border border-pkt-border bg-pkt-panel px-1.5 text-[10px] text-pkt-text"
          />
          <SoldToggle sold={item.sold} onToggle={onToggleSold} />
        </div>
      )}
    </div>
  )
}

function SoldToggle({
  sold,
  onToggle,
}: {
  sold: boolean
  onToggle: () => void
}): React.ReactElement {
  return (
    <label className="flex shrink-0 items-center gap-1 text-[9px] text-pkt-text-mute">
      <input
        type="checkbox"
        checked={sold}
        onChange={onToggle}
        className="size-3 accent-[var(--pkt-accent)]"
      />
      已卖
    </label>
  )
}
