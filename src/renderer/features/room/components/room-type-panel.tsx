import * as React from 'react'
import { ButtonRoot, InputRoot } from '@heroui/react'

import type { CatalogRoomDef } from '@shared/contract'
import { FloatingWindow } from '@ui/floating'
import { cn } from '@ui/cn'

import { ROOM_TYPE_WINDOW_ID } from '../windows'

const CATEGORY_LABEL: Record<number, string> = {
  1: '普通房型',
  2: '花园',
  4: '特殊',
  6: '渔场',
  10: '商店',
  11: '商店',
  12: '商店',
  15: '主题房',
}

/**
 * 房型面板（浮窗）。
 *
 * 之前是常驻左栏，占掉画布宽度；改成按钮打开，列表可搜索、按分类分组。
 */
export function RoomTypePanel({
  rooms,
  roomType,
  onSelect,
}: {
  rooms: CatalogRoomDef[]
  roomType: number
  onSelect: (type: number) => void
}): React.ReactElement {
  const [query, setQuery] = React.useState('')

  const grouped = React.useMemo(() => {
    const keyword = query.trim().toLowerCase()
    const buckets = new Map<number, CatalogRoomDef[]>()
    for (const room of rooms) {
      if (keyword) {
        const hit =
          room.name.toLowerCase().includes(keyword) || room.type.toString().includes(keyword)
        if (!hit) continue
      }
      const list = buckets.get(room.category) ?? []
      list.push(room)
      buckets.set(room.category, list)
    }
    return [...buckets.entries()].sort((a, b) => a[0] - b[0])
  }, [rooms, query])

  return (
    <FloatingWindow
      id={ROOM_TYPE_WINDOW_ID}
      title="房型"
      width={260}
      defaultPosition={{ x: 96, y: 120 }}
    >
      <div className="flex flex-col gap-2 p-2">
        <InputRoot
          value={query}
          placeholder="搜索房型（名称 / 编号）"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
        />
        <div className="pkt-scroll max-h-[60vh] overflow-y-auto">
          {grouped.map(([category, items]) => (
            <div key={category} className="mb-2">
              <p className="px-1 pb-1 text-[10px] text-pkt-text-mute">
                {CATEGORY_LABEL[category] ?? `分类 ${category}`} · {items.length}
              </p>
              <div className="flex flex-col gap-0.5">
                {items.map((room) => (
                  <button
                    key={room.type}
                    type="button"
                    onClick={() => onSelect(room.type)}
                    className={cn(
                      'flex items-center justify-between rounded-pkt px-2 py-1 text-left text-[11px] transition-colors',
                      room.type === roomType
                        ? 'bg-pkt-panel-active text-pkt-text'
                        : 'text-pkt-text-dim hover:bg-pkt-panel hover:text-pkt-text',
                      room.ifDefaultImg !== 0 && 'opacity-60',
                    )}
                  >
                    <span className="truncate">{room.name}</span>
                    <span className="shrink-0 text-[10px] text-pkt-text-mute">{room.type}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {grouped.length === 0 ? (
            <p className="p-2 text-[11px] text-pkt-text-mute">没有匹配的房型</p>
          ) : null}
        </div>
        <ButtonRoot
          size="sm"
          variant="ghost"
          onPress={() => setQuery('')}
          isDisabled={query.length === 0}
        >
          清空搜索
        </ButtonRoot>
      </div>
    </FloatingWindow>
  )
}
