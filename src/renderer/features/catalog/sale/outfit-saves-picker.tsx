import * as React from 'react'

import { cn } from '@ui/cn'
import { outfitItemCount, type OutfitSave } from '@features/outfits/state/outfit-save'
import { outfitSaleKey } from './model'

/** 从存档管理里挑整套搭配加入卖货图。 */
export function OutfitSavesPicker({
  saves,
  addedKeys,
  onToggle,
}: {
  saves: OutfitSave[]
  addedKeys: ReadonlySet<string>
  onToggle: (save: OutfitSave) => void
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-1.5 border-t border-pkt-border/60 pt-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-pkt-text-mute">搭配存档</span>
        <span className="text-[9px] text-pkt-text-mute">{saves.length} 个</span>
      </div>
      {saves.length === 0 ? (
        <p className="text-[10px] text-pkt-text-mute">
          还没有搭配存档。到「搭配」页保存一套后再来。
        </p>
      ) : (
        <div className="pkt-scroll flex max-h-44 flex-col gap-1 overflow-y-auto pr-0.5">
          {saves.map((save) => {
            const added = addedKeys.has(outfitSaleKey(save.id))
            return (
              <button
                key={save.id}
                type="button"
                onClick={() => onToggle(save)}
                className={cn(
                  'flex items-center gap-2 rounded-pkt border p-1 text-left transition-colors',
                  added
                    ? 'border-pkt-accent/60 bg-pkt-accent/10'
                    : 'border-pkt-border/60 hover:border-pkt-accent/60',
                )}
              >
                <img
                  src={save.preview}
                  alt=""
                  className="pkt-pixelated h-8 w-8 shrink-0 rounded-sm border border-pkt-border/50 object-contain"
                />
                <span className="min-w-0 flex-1 truncate text-[10px] text-pkt-text">
                  {save.name}
                </span>
                <span className="shrink-0 text-[9px] text-pkt-text-mute">
                  {outfitItemCount(save)} 件
                </span>
                <span
                  className={cn(
                    'shrink-0 text-[9px]',
                    added ? 'text-pkt-accent' : 'text-pkt-text-mute',
                  )}
                >
                  {added ? '已加入' : '加入'}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
