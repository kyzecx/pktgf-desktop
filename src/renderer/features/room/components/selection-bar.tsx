import * as React from 'react'
import { ButtonRoot } from '@heroui/react'

import type { Catalog } from '@shared/contract'
import { furniDims, type FurniInstance } from '@engine/room'

import type { useRoomStore } from '../state/room-store'

type RoomStore = ReturnType<typeof useRoomStore.getState>

/**
 * 多选工具条。
 *
 * 只做「官方装修里真正常用的三件事」：对齐、批量转向、批量删除。
 * 对齐的语义是**对齐到主选中物件的那一列/行**（主选中 = 最后点的那件）。
 */
export function SelectionBar({
  store,
  catalog,
  onStack,
}: {
  store: RoomStore
  catalog: Catalog | null
  /** 把所有选中件叠到主选中那件上（官方 otherOverMe / meOverOther） */
  onStack: () => void
}): React.ReactElement | null {
  const count = store.selection.length
  if (count < 2) return null

  const items = store.selection
    .map((uid) => store.furni.find((item) => item.uid === uid))
    .filter((item): item is FurniInstance => Boolean(item))
  const totalCells = items.reduce((sum, item) => {
    const def = catalog?.furniture.find((entry) => entry.code === item.code)
    if (!def) return sum
    const dims = furniDims(def, item.dir)
    return sum + dims.rows * dims.cols
  }, 0)

  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-pkt border border-pkt-border bg-pkt-panel/95 px-2 py-1 text-[11px] shadow-pkt">
      <span className="text-pkt-text-mute">
        已选 {count} 件 · {totalCells} 格
      </span>
      <span className="mx-1 h-4 w-px bg-pkt-border" />
      <ButtonRoot size="sm" variant="ghost" onPress={() => store.alignSelection('left')}>
        同列
      </ButtonRoot>
      <ButtonRoot size="sm" variant="ghost" onPress={() => store.alignSelection('top')}>
        同行
      </ButtonRoot>
      <ButtonRoot size="sm" variant="ghost" onPress={() => store.alignSelection('center')}>
        叠到一点
      </ButtonRoot>
      <ButtonRoot size="sm" variant="ghost" onPress={onStack}>
        叠到主选中
      </ButtonRoot>
      <span className="mx-1 h-4 w-px bg-pkt-border" />
      <ButtonRoot size="sm" variant="ghost" onPress={() => store.rotateSelection()}>
        全部转向
      </ButtonRoot>
      <ButtonRoot size="sm" variant="ghost" onPress={() => store.removeSelection()}>
        全部删除
      </ButtonRoot>
      <ButtonRoot size="sm" variant="ghost" onPress={() => store.select(null)}>
        取消
      </ButtonRoot>
    </div>
  )
}
