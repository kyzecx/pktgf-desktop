import { ButtonRoot, SpinnerRoot } from '@heroui/react'
import * as React from 'react'

import type { Catalog, CatalogAssets, Part } from '@shared/contract'
import { CategoryTabs } from '@features/outfits/components/category-tabs'
import { usePartIcons } from '@features/outfits/hooks/use-part-icons'
import { useOutfitStore } from '@features/outfits/state/outfit-store'
import { useRecentItems } from '@ui/recent-items'
import { cn } from '@ui/cn'
import { VirtualGrid } from '@ui/virtual-grid'
import { useSaveShortcut, useSearchShortcut } from '@ui/shortcuts'
import { LIST_SIZES, ListSettingsButton, ListSettingsWindow } from '@features/shared/list-settings'
import {
  SearchField,
  ToolbarActions,
  ToolbarCount,
  ToolbarGroup,
  ToolbarRoot,
  ToolbarSearch,
  ToolbarSubbar,
} from '@ui/toolbar'
import { setThumbnailAssets } from '@features/outfits/hooks/use-thumbnail'
import { CatalogCard } from './components/catalog-card'
import { CatalogDetail } from './components/catalog-detail'
import { SaleEditor } from './sale/sale-editor'
import { useCatalogExport } from './hooks/use-catalog-export'
import { useFrameSelection } from './hooks/use-frame-selection'
import { getEntryThumbnail } from './services'
import {
  buildCatalogEntries,
  CATALOG_KIND_LABELS,
  FURNITURE_CATEGORY_LABELS,
  type CatalogEntry,
  type CatalogKind,
  type CatalogView,
  type PetView,
} from './types'

export function CatalogPage({
  catalog,
  assets,
}: {
  catalog: Catalog
  assets: CatalogAssets
}): React.ReactElement {
  const [kind, setKind] = React.useState<CatalogKind>('outfit')
  const [part, setPart] = React.useState<Part>('hair')
  const [furnitureCategory, setFurnitureCategory] = React.useState('all')
  const [search, setSearch] = React.useState('')
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null)
  const [petView, setPetView] = React.useState<PetView>('pet')
  const [saleKeys, setSaleKeys] = React.useState<Set<string>>(new Set())
  const [saleOpen, setSaleOpen] = React.useState(false)
  const display = useOutfitStore((state) => state.itemDisplay)
  const listColumns = useOutfitStore((state) => state.listColumns)
  const itemSort = useOutfitStore((state) => state.itemSort)
  const icons = usePartIcons(assets.uiIcons)
  const frameSelection = useFrameSelection()
  const { state, start, startOriginals, startGif, cancel, reset } = useCatalogExport()
  const searchRef = React.useRef<HTMLInputElement | null>(null)
  const recent = useRecentItems('catalog')

  React.useEffect(() => {
    setThumbnailAssets(assets)
    return () => setThumbnailAssets(null)
  }, [assets])

  const allEntries = React.useMemo(() => buildCatalogEntries(catalog), [catalog])
  const entryByKey = React.useMemo(
    () => new Map(allEntries.map((entry) => [entry.key, entry])),
    [allEntries],
  )
  const partCounts = React.useMemo(() => {
    const counts = new Map<Part, number>()
    for (const item of catalog.items) counts.set(item.part, (counts.get(item.part) ?? 0) + 1)
    return counts
  }, [catalog.items])
  const furnitureCategories = React.useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of catalog.furniture ?? []) {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [catalog.furniture])

  const kindEntries = React.useMemo(() => {
    return allEntries.filter((entry) => {
      if (entry.kind !== kind) return false
      if (kind === 'outfit') return entry.category === part
      if (kind === 'furniture') {
        return furnitureCategory === 'all' || entry.category === furnitureCategory
      }
      return true
    })
  }, [allEntries, kind, part, furnitureCategory])

  const filtered = React.useMemo(() => {
    const keyword = search.trim().toLowerCase()
    const result = keyword
      ? kindEntries.filter(
          (entry) =>
            entry.name.toLowerCase().includes(keyword) ||
            entry.code.toLowerCase().includes(keyword),
        )
      : [...kindEntries]

    result.sort((left, right) => {
      if (itemSort === 'name') return left.name.localeCompare(right.name, 'zh-CN')
      if (itemSort === 'oldest') return sortValue(left) - sortValue(right)
      return sortValue(right) - sortValue(left)
    })
    return result
  }, [kindEntries, search, itemSort])

  React.useEffect(() => {
    setSelectedKey(null)
  }, [kind, part, furnitureCategory, search, itemSort])

  const selected = selectedKey ? (entryByKey.get(selectedKey) ?? null) : null
  const saleEntries = allEntries.filter((entry) => saleKeys.has(entry.key))
  const selectedTargets = React.useMemo(() => {
    const targets: Array<{ entry: CatalogEntry; frames: ReadonlySet<string> }> = []
    for (const [key, frames] of frameSelection.selections) {
      if (frames.size === 0) continue
      const entry = entryByKey.get(key)
      if (entry) targets.push({ entry, frames })
    }
    return targets
  }, [entryByKey, frameSelection.selections])

  const view: CatalogView = { display, petView }
  const currentSelected = selected ? frameSelection.get(selected.key) : new Set<string>()

  const toggleSale = (key: string): void => {
    setSaleKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  useSearchShortcut(() => searchRef.current?.focus())
  const saveSelectedFrames = React.useCallback(() => {
    if (selectedTargets.length > 0) void start(selectedTargets, '已选帧')
  }, [selectedTargets, start])
  useSaveShortcut(saveSelectedFrames, frameSelection.count > 0)

  const selectEntry = React.useCallback(
    (entry: CatalogEntry): void => {
      setSelectedKey(entry.key)
      void getEntryThumbnail(entry)
        .then((image) => {
          if (image) {
            recent.remember({ key: entry.key, label: entry.name, image, value: entry.key })
          }
        })
        .catch(() => undefined)
    },
    [recent],
  )
  const gridSize = kind === 'pet' ? LIST_SIZES.large : LIST_SIZES[display]

  const subcategories = (): React.ReactElement | null => {
    if (kind === 'outfit') {
      return (
        <div className="min-w-0 flex-1">
          <CategoryTabs
            counts={partCounts}
            active={part}
            icons={icons}
            orientation="horizontal"
            onSelect={setPart}
          />
        </div>
      )
    }
    if (kind === 'furniture') {
      return (
        <div className="pkt-scroll flex w-full min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto">
          <ButtonRoot
            size="sm"
            variant={furnitureCategory === 'all' ? 'secondary' : 'ghost'}
            className={cn(
              'shrink-0',
              furnitureCategory === 'all' && 'border border-pkt-border-strong',
            )}
            onPress={() => setFurnitureCategory('all')}
          >
            全部
          </ButtonRoot>
          {furnitureCategories.map(([category, count]) => (
            <ButtonRoot
              key={category}
              size="sm"
              variant={furnitureCategory === category ? 'secondary' : 'ghost'}
              className={cn(
                'shrink-0',
                furnitureCategory === category && 'border border-pkt-border-strong',
              )}
              onPress={() => setFurnitureCategory(category)}
            >
              {FURNITURE_CATEGORY_LABELS[category] ?? category.toUpperCase()}
              <span className="ml-1 text-[9px] opacity-60">{count}</span>
            </ButtonRoot>
          ))}
        </div>
      )
    }
    return null
  }

  const percent = state.total > 0 ? Math.min(100, Math.round((state.done / state.total) * 100)) : 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ToolbarRoot>
        <ToolbarSearch>
          <SearchField
            value={search}
            placeholder="搜索名称或代码"
            inputRef={searchRef}
            history={recent.items}
            onPickHistory={(item) => {
              const entry = entryByKey.get(item.value)
              if (entry) selectEntry(entry)
            }}
            onClearHistory={recent.clear}
            onChange={setSearch}
          />
        </ToolbarSearch>
        <ToolbarCount>{filtered.length.toLocaleString()} 件</ToolbarCount>
        <ToolbarActions>
          <ListSettingsButton />
        </ToolbarActions>
      </ToolbarRoot>

      <ToolbarSubbar className="flex-nowrap">
        <ToolbarGroup className="shrink-0">
          {(['outfit', 'furniture', 'pet'] as const).map((entry) => (
            <ButtonRoot
              key={entry}
              size="sm"
              variant={kind === entry ? 'primary' : 'ghost'}
              onPress={() => setKind(entry)}
            >
              {CATALOG_KIND_LABELS[entry]}
            </ButtonRoot>
          ))}
        </ToolbarGroup>
        <ToolbarActions className="shrink-0">
          <ButtonRoot size="sm" variant="outline" onPress={() => setSaleOpen(true)}>
            卖货图 ({saleEntries.length})
          </ButtonRoot>
          {frameSelection.count > 0 ? (
            <ButtonRoot size="sm" variant="ghost" onPress={() => frameSelection.clear()}>
              清空已选
            </ButtonRoot>
          ) : null}
          <details className="relative">
            <summary className="flex h-7 cursor-pointer list-none items-center gap-1 rounded-md border border-pkt-border bg-pkt-panel px-2 text-[10px] text-pkt-text [&::-webkit-details-marker]:hidden">
              下载 <span className="text-[8px] text-pkt-text-mute">▼</span>
            </summary>
            <div className="absolute top-full right-0 z-50 mt-1 flex w-56 flex-col gap-0.5 rounded-pkt border border-pkt-border bg-pkt-panel p-1 shadow-[var(--pkt-shadow-lg)]">
              {[
                { label: `已选帧 (${frameSelection.count})`, targets: selectedTargets },
                {
                  label: `当前分类 (${filtered.length})`,
                  targets: filtered.map((entry) => ({ entry })),
                },
                {
                  label: `全部图鉴 (${allEntries.length})`,
                  targets: allEntries.map((entry) => ({ entry })),
                },
              ].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  disabled={state.running || option.targets.length === 0}
                  onClick={(event) => {
                    void start(option.targets, '下载')
                    event.currentTarget.closest('details')?.removeAttribute('open')
                  }}
                  className="rounded-sm px-2 py-1 text-left text-[10px] text-pkt-text hover:bg-pkt-panel-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {option.label}
                </button>
              ))}
              <div className="mt-1 border-t border-pkt-border/60 px-2 pt-1.5 pb-0.5 text-[8px] text-pkt-text-mute">
                原图（未裁切雪碧图）
              </div>
              {[
                {
                  label: `当前物品原图${selected ? '' : '（先选一个物品）'}`,
                  targets: selected ? [{ entry: selected }] : [],
                },
                {
                  label: `当前分类原图 (${filtered.length})`,
                  targets: filtered.map((entry) => ({ entry })),
                },
                {
                  label: `全部图鉴原图 (${allEntries.length})`,
                  targets: allEntries.map((entry) => ({ entry })),
                },
              ].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  disabled={state.running || option.targets.length === 0}
                  onClick={(event) => {
                    void startOriginals(option.targets, '原图')
                    event.currentTarget.closest('details')?.removeAttribute('open')
                  }}
                  className="rounded-sm px-2 py-1 text-left text-[10px] text-pkt-text hover:bg-pkt-panel-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </details>
        </ToolbarActions>
      </ToolbarSubbar>

      <ToolbarSubbar className="flex-nowrap">
        {kind === 'pet' ? (
          <span className="text-[10px] text-pkt-text-mute">
            宠物图鉴不区分大小图；在列表菜单切换宠物本体 / 宠物蛋
          </span>
        ) : (
          subcategories()
        )}
      </ToolbarSubbar>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 p-3">
          <VirtualGrid
            items={filtered}
            size={gridSize}
            columnsSetting={listColumns}
            itemKey={(entry) => entry.key}
            resetKey={`${kind}:${part}:${furnitureCategory}:${search}:${itemSort}:${display}:${petView}:${listColumns}`}
            empty={state.running ? '导出中…' : '没有匹配的图鉴条目'}
            renderItem={(entry, layout) => (
              <CatalogCard
                entry={entry}
                selected={selectedKey === entry.key}
                saleSelected={saleKeys.has(entry.key)}
                view={view}
                layout={layout}
                onSelect={() => selectEntry(entry)}
                onToggleSale={() => toggleSale(entry.key)}
              />
            )}
          />
        </div>

        {selected ? (
          <CatalogDetail
            entry={selected}
            selectedFrames={currentSelected}
            exporting={state.running}
            onToggleFrame={(key) => frameSelection.toggle(selected.key, key)}
            onSetFrames={(keys, checked) => frameSelection.setMany(selected.key, keys, checked)}
            onClearFrames={() => frameSelection.clear(selected.key)}
            onExportGif={() => void startGif(selected)}
          />
        ) : (
          <aside className="grid w-72 shrink-0 place-items-center border-l border-pkt-border p-4 text-center text-[10px] text-pkt-text-mute">
            选择一个图鉴条目查看并勾选帧
          </aside>
        )}
      </div>

      {saleOpen ? (
        <SaleEditor
          entries={saleEntries}
          allEntries={allEntries}
          assets={assets}
          onClose={() => setSaleOpen(false)}
        />
      ) : null}

      <ListSettingsWindow
        hideDisplay={kind === 'pet'}
        extra={
          kind === 'pet' ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-pkt-text-mute">宠物图鉴</span>
              <div className="flex items-center gap-1">
                {(['pet', 'egg'] as const).map((entry) => (
                  <ButtonRoot
                    key={entry}
                    size="sm"
                    variant={petView === entry ? 'primary' : 'ghost'}
                    onPress={() => setPetView(entry)}
                  >
                    {entry === 'pet' ? '宠物本体' : '宠物蛋'}
                  </ButtonRoot>
                ))}
              </div>
            </div>
          ) : null
        }
      />

      {state.running || state.error || state.finished ? (
        <div className="shrink-0 border-t border-pkt-border bg-pkt-panel px-3 py-2">
          {state.error ? (
            <p className="text-[10px] text-pkt-danger">导出失败：{state.error}</p>
          ) : state.running ? (
            <div className="flex items-center gap-2">
              <SpinnerRoot size="sm" color="accent" />
              <span className="min-w-0 flex-1 truncate text-[10px] text-pkt-text">
                正在导出 {state.done.toLocaleString()} / {state.total.toLocaleString()} ·{' '}
                {state.current}
              </span>
              <div className="h-1.5 w-40 overflow-hidden rounded-full bg-pkt-border">
                <div className="h-full bg-pkt-accent" style={{ width: `${percent}%` }} />
              </div>
              <ButtonRoot size="sm" variant="ghost" onPress={cancel}>
                取消
              </ButtonRoot>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[10px] text-pkt-text-mute">
              <span className="min-w-0 flex-1 truncate">
                {state.finished ? `已导出到 ${state.rootPath}` : '已取消导出'}
              </span>
              <ButtonRoot size="sm" variant="ghost" onPress={reset}>
                关闭
              </ButtonRoot>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

function sortValue(entry: CatalogEntry): number {
  if (entry.item) return entry.item.serial
  if (entry.furniture) return entry.furniture.type
  if (entry.pet) return entry.pet.type
  return 0
}
