import * as React from 'react'

import type { Catalog, CatalogFurniture } from '@shared/contract'
import { ButtonRoot } from '@heroui/react'
import { SearchField } from '@ui/toolbar'
import { useFloatingStore } from '@ui/floating/use-floating-store'
import { useRecentItems } from '@ui/recent-items'
import { cn } from '@ui/cn'

import { getFurniThumb, useFurniThumb } from './use-furni-thumb'
import { useCustomFurniStore, withCustomFurniture } from '../state/custom-furni-store'
import { CUSTOM_FURNI_IMPORT_WINDOW_ID } from '../windows'

/**
 * 家具库：搜索 + 分类 + 缩略图列表。
 *
 * 地面件（position 1/2/5）直接摆；挂墙件（3/4）在画布上吸附墙板槽位（M3.5）。
 */

const PLACEABLE_POSITIONS = new Set([1, 2, 3, 4, 5])

const PAGE_SIZE = 120

export function FurniLibrary({
  catalog,
  onPick,
  pickingCode,
  search,
  onSearchChange,
  allSearch,
  onToggleAllSearch,
  searchRef,
}: {
  catalog: Catalog
  onPick: (item: CatalogFurniture) => void
  pickingCode: string | null
  /** 搜索词由页面持有：空格打开面板后要能聚焦同一个输入框 */
  search: string
  onSearchChange: (value: string) => void
  /** 默认 true（全分类搜索），复用搭配页搜索框的「全」按钮 */
  allSearch: boolean
  onToggleAllSearch: () => void
  searchRef: React.RefObject<HTMLInputElement | null>
}): React.ReactElement {
  const recent = useRecentItems('room-furni')
  const [category, setCategory] = React.useState('all')
  const [limit, setLimit] = React.useState(PAGE_SIZE)
  const [wallOnly, setWallOnly] = React.useState(false)
  const scrollRef = React.useRef<HTMLDivElement | null>(null)

  // 滚到底自动续载（与搭配页一致，不点按钮）
  const handleScroll = React.useCallback(() => {
    const element = scrollRef.current
    if (!element) return
    const remain = element.scrollHeight - element.scrollTop - element.clientHeight
    if (remain > 240) return
    setLimit((value) => value + PAGE_SIZE)
  }, [])

  const customItems = useCustomFurniStore((state) => state.items)
  const furni = React.useMemo(
    () =>
      withCustomFurniture(
        catalog.furniture.filter((item) => item.kind === 'furni'),
        customItems,
      ),
    [catalog, customItems],
  )

  const placeable = React.useMemo(
    () => furni.filter((item) => PLACEABLE_POSITIONS.has(item.position)),
    [furni],
  )

  const categories = React.useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of placeable) {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [placeable])

  const filtered = React.useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return placeable.filter((item) => {
      if (wallOnly && item.position !== 3 && item.position !== 4) return false
      if (!allSearch && category !== 'all' && item.category !== category) return false
      if (!keyword) return true
      return item.name.toLowerCase().includes(keyword) || item.code.toLowerCase().includes(keyword)
    })
  }, [placeable, category, search, wallOnly, allSearch])

  React.useEffect(() => {
    setLimit(PAGE_SIZE)
  }, [search, category, wallOnly])

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <SearchField
        value={search}
        placeholder={allSearch ? '搜索全部家具' : '搜索当前分类'}
        inputRef={searchRef}
        scope={{ active: allSearch, onToggle: onToggleAllSearch }}
        history={recent.items}
        onPickHistory={(item) => onSearchChange(item.value)}
        onClearHistory={recent.clear}
        onChange={onSearchChange}
      />

      <div className="flex gap-1 overflow-x-auto pb-1">
        <ButtonRoot
          size="sm"
          className="shrink-0"
          variant={category === 'all' ? 'secondary' : 'ghost'}
          onPress={() => setCategory('all')}
        >
          全部 {placeable.length}
        </ButtonRoot>
        <ButtonRoot
          size="sm"
          className="shrink-0"
          variant={wallOnly ? 'secondary' : 'ghost'}
          onPress={() => setWallOnly((value) => !value)}
        >
          挂墙
        </ButtonRoot>
        {categories.slice(0, 10).map(([key, count]) => (
          <ButtonRoot
            key={key}
            size="sm"
            className="shrink-0"
            variant={category === key ? 'secondary' : 'ghost'}
            onPress={() => setCategory(key)}
          >
            {CATEGORY_LABEL[key] ?? key} {count}
          </ButtonRoot>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[10px] text-pkt-text-mute">
          共 {filtered.length} 件可摆 · 挂墙件会吸附墙板；放到柜面会叠加
        </p>
        <ButtonRoot
          size="sm"
          variant="ghost"
          onPress={() => useFloatingStore.getState().openWindow(CUSTOM_FURNI_IMPORT_WINDOW_ID)}
        >
          ＋ 导入
        </ButtonRoot>
      </div>

      <div
        ref={scrollRef}
        className="pkt-scroll min-h-0 flex-1 overflow-y-auto"
        onScroll={handleScroll}
      >
        <div className="grid grid-cols-4 gap-1">
          {filtered.slice(0, limit).map((item) => (
            <FurniCell
              key={`${item.code}:${item.type}`}
              catalog={catalog}
              item={item}
              active={pickingCode === item.code}
              onPick={() => {
                onPick(item)
                void getFurniThumb(item).then((image) => {
                  if (image) {
                    recent.remember({ key: item.code, label: item.name, image, value: item.name })
                  }
                })
              }}
            />
          ))}
        </div>
        {filtered.length > limit ? (
          <p className="py-2 text-center text-[10px] text-pkt-text-mute">加载中…</p>
        ) : null}
      </div>
    </div>
  )
}

function FurniCell({
  catalog,
  item,
  active,
  onPick,
}: {
  catalog: Catalog
  item: CatalogFurniture
  active: boolean
  onPick: () => void
}): React.ReactElement {
  const src = useFurniThumb(catalog, item)

  return (
    <button
      type="button"
      onClick={onPick}
      title={`${item.name} · ${item.cols}×${item.rows}`}
      className={cn(
        'flex flex-col items-center gap-0.5 rounded-pkt border p-1 transition-colors',
        active
          ? 'border-pkt-accent bg-pkt-panel-active'
          : 'border-transparent hover:border-pkt-border-strong hover:bg-pkt-panel',
      )}
    >
      <span className="relative grid size-10 place-items-center">
        {item.position === 3 || item.position === 4 ? (
          <span className="absolute top-0 right-0 rounded-sm bg-pkt-accent/80 px-0.5 text-[8px] leading-3 text-pkt-accent-text">
            墙
          </span>
        ) : item.otherOverMe > 0 ? (
          <span className="absolute top-0 right-0 rounded-sm bg-pkt-panel-active px-0.5 text-[8px] leading-3 text-pkt-text-dim">
            叠
          </span>
        ) : null}
        {src ? (
          <img
            src={src}
            alt=""
            className="max-h-10 max-w-10"
            style={{ imageRendering: 'pixelated' }}
            draggable={false}
          />
        ) : null}
      </span>
      <span className="w-full truncate text-[9px] leading-tight text-pkt-text-mute">
        {item.name}
      </span>
    </button>
  )
}

const CATEGORY_LABEL: Record<string, string> = {
  bat: '卫浴',
  bed: '床',
  cab: '柜子',
  cha: '椅子沙发',
  dec: '装饰',
  ele: '电器',
  kit: '厨房',
  lig: '灯具',
  lux: '奢华',
  pla: '植物',
  rug: '地毯',
  she: '架子',
  tab: '桌子',
  toy: '玩具',
  win: '窗',
  wal: '墙面',
}
