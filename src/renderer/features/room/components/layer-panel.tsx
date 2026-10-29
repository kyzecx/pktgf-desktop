import * as React from 'react'
import { ButtonRoot, InputRoot } from '@heroui/react'

import type { Catalog } from '@shared/contract'
import { furniDims, type FurniInstance } from '@engine/room'

import type { useRoomStore } from '../state/room-store'
import { LAYER_WINDOW_ID } from '../windows'
import { FloatingWindow } from '@ui/floating'

type RoomStore = ReturnType<typeof useRoomStore.getState>

/**
 * 图层（物件列表）。
 *
 * 排的是**实际绘制顺序**（`SortMgr2D` 的结果反过来，最上面的先列），
 * 所以列表顺序 = 「谁压着谁」，比按添加顺序有用。
 * 点一行选中，Alt 点击多选；双击把视角对准它。
 */
export function LayerPanel({
  store,
  catalog,
  drawOrder,
  onFocus,
}: {
  store: RoomStore
  catalog: Catalog | null
  /** 从小到大（后画的在最后）的 uid 列表 */
  drawOrder: string[]
  onFocus: (item: FurniInstance) => void
}): React.ReactElement {
  const [query, setQuery] = React.useState('')

  const nameOf = React.useCallback(
    (code: string) => catalog?.furniture.find((item) => item.code === code)?.name ?? code,
    [catalog],
  )

  const rows = React.useMemo(() => {
    const order = new Map(drawOrder.map((uid, index) => [uid, index]))
    const keyword = query.trim().toLowerCase()
    return [...store.furni]
      .sort((a, b) => (order.get(b.uid) ?? 0) - (order.get(a.uid) ?? 0))
      .filter((item) => !keyword || nameOf(item.code).toLowerCase().includes(keyword))
  }, [store.furni, drawOrder, query, nameOf])

  return (
    <FloatingWindow
      id={LAYER_WINDOW_ID}
      title="图层"
      width={260}
      defaultPosition={{ x: 60, y: 160 }}
    >
      <div className="flex flex-col gap-1 p-2 text-[11px]">
        <InputRoot
          placeholder="搜索物件"
          value={query}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
        />
        {rows.length === 0 ? (
          <p className="px-1 py-3 text-center text-pkt-text-mute">
            {store.furni.length === 0 ? '房间里还没有东西' : '没有匹配的物件'}
          </p>
        ) : (
          <ul className="max-h-72 overflow-auto">
            {rows.map((item) => {
              const selected = store.selection.includes(item.uid)
              const def = catalog?.furniture.find((entry) => entry.code === item.code)
              const dims = def ? furniDims(def, item.dir) : null
              return (
                <li key={item.uid}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-1 rounded-pkt px-1 py-0.5 text-left ${
                      selected ? 'bg-pkt-accent/20' : 'hover:bg-pkt-panel/60'
                    }`}
                    onClick={(event) => {
                      if (event.altKey) store.toggleSelect(item.uid)
                      else store.select(item.uid)
                    }}
                    onDoubleClick={() => onFocus(item)}
                  >
                    <span className="flex-1 truncate">{nameOf(item.code)}</span>
                    {dims ? (
                      <span className="text-[10px] text-pkt-text-mute">
                        {dims.cols}×{dims.rows}
                      </span>
                    ) : null}
                    <span className="text-[10px] text-pkt-text-mute">
                      {item.x},{item.y}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] text-pkt-text-mute">共 {store.furni.length} 件</span>
          <div className="flex gap-1">
            <ButtonRoot
              size="sm"
              variant="ghost"
              isDisabled={!store.selected}
              onPress={() => store.selected && store.removeFurni(store.selected)}
            >
              删除
            </ButtonRoot>
            <ButtonRoot
              size="sm"
              variant="ghost"
              isDisabled={store.selection.length < 2}
              onPress={() => store.select(null)}
            >
              取消选择
            </ButtonRoot>
          </div>
        </div>
      </div>
    </FloatingWindow>
  )
}
