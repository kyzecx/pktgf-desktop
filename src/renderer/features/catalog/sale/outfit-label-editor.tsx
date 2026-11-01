import * as React from 'react'

import { cn } from '@ui/cn'
import { PART_LABELS, PART_ORDER } from '@features/outfits/state/outfit-store'
import type { OutfitSaleSubject, SaleLabel, SaleLabelPart } from './model'
import { sanitizePriceInput } from './price'

interface LabelRow {
  part: SaleLabelPart
  label: string
  defaultName: string
}

/**
 * 搭配存档的部件标价。
 *
 * 勾选哪个部件就在卖货图上多画一行；名称和价格由渲染器统一放在图片下方。
 */
export function OutfitLabelEditor({
  subject,
  labels,
  onToggle,
  onChange,
}: {
  subject: OutfitSaleSubject
  labels: SaleLabel[]
  onToggle: (part: SaleLabelPart) => void
  onChange: (part: SaleLabelPart, patch: Partial<Pick<SaleLabel, 'name' | 'price'>>) => void
}): React.ReactElement {
  const rows = React.useMemo<LabelRow[]>(() => {
    const wornByPart = new Map(subject.wornItems.map((item) => [item.part, item]))
    return [
      { part: 'all', label: '整套', defaultName: subject.source.name },
      ...PART_ORDER.filter((part) => wornByPart.has(part)).map((part) => ({
        part,
        label: PART_LABELS[part],
        defaultName: wornByPart.get(part)!.name,
      })),
    ]
  }, [subject])

  const labelsByPart = React.useMemo(
    () => new Map(labels.map((label) => [label.part, label])),
    [labels],
  )

  return (
    <div className="flex flex-col gap-1 rounded-pkt border border-pkt-border/60 bg-pkt-panel/40 p-1.5">
      <p className="text-[9px] leading-snug text-pkt-text-mute">
        勾选要标价的部件；名称和价格会画在图片下方，不遮挡模特。价格支持小数（最多两位），名称留空则只显示价格。
      </p>
      {rows.map((row) => {
        const label = labelsByPart.get(row.part)
        const selected = Boolean(label)
        return (
          <div key={row.part} className="flex items-center gap-1">
            <label className="flex shrink-0 cursor-pointer items-center gap-1">
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggle(row.part)}
                aria-label={`标注${row.label}`}
                className="size-3 accent-[var(--pkt-accent)]"
              />
              <span
                className={cn('w-7 text-[9px]', selected ? 'text-pkt-text' : 'text-pkt-text-mute')}
              >
                {row.label}
              </span>
            </label>
            <input
              value={label?.name ?? row.defaultName}
              disabled={!selected}
              onChange={(event) => onChange(row.part, { name: event.target.value })}
              placeholder="名称"
              aria-label={`${row.label}名称`}
              className="h-6 min-w-0 flex-1 rounded border border-pkt-border bg-pkt-panel px-1 text-[10px] text-pkt-text disabled:opacity-40"
            />
            <input
              value={label?.price ?? ''}
              disabled={!selected}
              onChange={(event) =>
                onChange(row.part, { price: sanitizePriceInput(event.target.value) })
              }
              placeholder="价格"
              inputMode="decimal"
              title="价格支持小数，最多两位"
              aria-label={`${row.label}价格`}
              className="h-6 w-14 shrink-0 rounded border border-pkt-border bg-pkt-panel px-1 text-[10px] text-pkt-text disabled:opacity-40"
            />
          </div>
        )
      })}
    </div>
  )
}
