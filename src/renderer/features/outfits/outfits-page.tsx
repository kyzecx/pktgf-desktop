import * as React from 'react'

import type { Catalog, CatalogAssets, CatalogItem, Part, SaveRecord } from '@shared/contract'
import { ButtonRoot } from '@heroui/react'
import { useFloatingStore } from '@ui/floating'
import {
  SearchField,
  ToolbarActions,
  ToolbarCount,
  ToolbarRoot,
  ToolbarSearch,
  ToolbarSubbar,
} from '@ui/toolbar'
import { IconLayoutHorizontal, IconLayoutVertical } from '@ui/icons'
import { ListSettingsButton, ListSettingsWindow } from '@features/shared/list-settings'
import { useSearchShortcut } from '@ui/shortcuts'
import { useRecentItems } from '@ui/recent-items'
import { getCostume, toDataUrl } from '@/services/assets'
import { FacesWindow, OUTFIT_FACES_WINDOW_ID } from './components/faces-window'
import { ItemGrid } from './components/item-grid'
import {
  OUTFIT_DETAIL_WINDOW_ID,
  OutfitDetailWindow,
  type WornCustomAsset,
} from './components/outfit-detail-window'
import { OUTFIT_SLOTS_WINDOW_ID, SlotsWindow } from './components/slots-window'
import { OUTFIT_VIEW_WINDOW_ID, ViewSettingsWindow } from './components/view-settings-window'
import { CategoryTabs } from './components/category-tabs'
import { WardrobePanel, type OutfitPanel } from './components/wardrobe-panel'
import { useActorPreview } from './hooks/use-actor-preview'
import { usePartIcons } from './hooks/use-part-icons'
import { setThumbnailAssets } from './hooks/use-thumbnail'
import { useSaves } from '@features/saves/hooks/use-saves'
import { applyOutfitSave, isOutfitSave } from './state/outfit-save'
import { useCustomStore, type CustomAsset } from './state/custom-store'
import { PART_LABELS, useOutfitStore, type ItemSort } from './state/outfit-store'

export function OutfitsPage({
  catalog,
  assets,
  faces,
}: {
  catalog: Catalog
  assets: CatalogAssets
  faces: Catalog['faces']
}): React.ReactElement {
  const sex = useOutfitStore((state) => state.sex)
  const part = useOutfitStore((state) => state.part)
  const search = useOutfitStore((state) => state.search)
  const [allSearch, setAllSearch] = React.useState(true)
  const worn = useOutfitStore((state) => state.worn)
  const categoryLayout = useOutfitStore((state) => state.categoryLayout)
  const toggleCategoryLayout = useOutfitStore((state) => state.toggleCategoryLayout)
  const itemDisplay = useOutfitStore((state) => state.itemDisplay)
  const listColumns = useOutfitStore((state) => state.listColumns)
  const itemSort = useOutfitStore((state) => state.itemSort)
  const store = useOutfitStore()
  const searchRef = React.useRef<HTMLInputElement | null>(null)
  const recent = useRecentItems('outfit')

  useSearchShortcut(() => searchRef.current?.focus())

  const customAssets = useCustomStore((state) => state.assets)
  const icons = usePartIcons(assets.uiIcons)
  const detailOpen = useFloatingStore((state) => state.open[OUTFIT_DETAIL_WINDOW_ID] ?? false)
  const facesOpen = useFloatingStore((state) => state.open[OUTFIT_FACES_WINDOW_ID] ?? false)
  const slotsOpen = useFloatingStore((state) => state.open[OUTFIT_SLOTS_WINDOW_ID] ?? false)
  const viewOpen = useFloatingStore((state) => state.open[OUTFIT_VIEW_WINDOW_ID] ?? false)
  const togglePanel = useFloatingStore((state) => state.toggle)

  const [customWorn, setCustomWorn] = React.useState<WornCustomAsset[]>([])
  const preview = useActorPreview(catalog, assets, faces, customWorn)
  const { saves, put: putSave, remove: removeSave } = useSaves()
  const outfitSaves = React.useMemo(() => saves.filter(isOutfitSave), [saves])

  React.useEffect(() => {
    setThumbnailAssets(assets)
    return () => setThumbnailAssets(null)
  }, [assets])

  const counts = React.useMemo(() => {
    const map = new Map<Part, number>()
    for (const item of catalog.items) {
      if (item.sex !== 0 && item.sex !== sex) continue
      map.set(item.part, (map.get(item.part) ?? 0) + 1)
    }
    return map
  }, [catalog.items, sex])

  const items = React.useMemo(() => {
    const keyword = search.trim().toLowerCase()
    const searchAll = allSearch && keyword.length > 0
    const filtered = catalog.items.filter((item) => {
      if (!searchAll && item.part !== part) return false
      if (item.sex !== 0 && item.sex !== sex) return false
      if (!keyword) return true
      return item.name.toLowerCase().includes(keyword) || item.code.toLowerCase().includes(keyword)
    })
    return filtered.sort((a, b) => compareItems(a, b, itemSort))
  }, [allSearch, catalog.items, part, sex, search, itemSort])

  const wornCodes = React.useMemo(
    () =>
      new Set(
        Object.values(worn)
          .map((item) => item?.code)
          .filter((code): code is string => Boolean(code)),
      ),
    [worn],
  )

  const onToggleCustom = (asset: CustomAsset): void => {
    setCustomWorn((current) =>
      current.some((entry) => entry.id === asset.id)
        ? current.filter((entry) => entry.id !== asset.id)
        : [
            ...current.filter((entry) => entry.part !== asset.part),
            {
              id: asset.id,
              part: asset.part,
              dataUrl: asset.dataUrl,
              dynamic: asset.dynamic,
              animateDataUrl: asset.animateDataUrl,
              frameCount: asset.frameCount,
            },
          ],
    )
  }

  const onLoadSlot = (save: SaveRecord): void => {
    applyOutfitSave(catalog, save)
  }

  const rememberWorn = (item: CatalogItem): void => {
    void getCostume(item)
      .then((art) => {
        const image = art.frontHead ?? art.body ?? art.backHead ?? art.frames[0] ?? art.wingMask
        if (image) {
          recent.remember({
            key: item.code,
            label: item.name,
            image: toDataUrl(image),
            value: item.code,
          })
        }
      })
      .catch(() => undefined)
  }

  const toggleItem = (item: CatalogItem): void => {
    const willWear = worn[item.part]?.code !== item.code
    store.toggle(item)
    if (willWear) {
      store.setPart(item.part)
      rememberWorn(item)
    }
  }

  const pickHistory = (value: string): void => {
    const item = catalog.items.find((entry) => entry.code === value)
    if (!item) return
    store.setPart(item.part)
    if (worn[item.part]?.code !== item.code) store.toggle(item)
  }

  const isVertical = categoryLayout === 'vertical'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ToolbarRoot>
        <ToolbarSearch>
          <SearchField
            value={search}
            placeholder={allSearch ? '搜索全部服饰' : `搜索${PART_LABELS[part]}`}
            inputRef={searchRef}
            scope={{ active: allSearch, onToggle: () => setAllSearch((value) => !value) }}
            history={recent.items}
            onPickHistory={(item) => pickHistory(item.value)}
            onClearHistory={recent.clear}
            onChange={store.setSearch}
          />
        </ToolbarSearch>
        <ToolbarCount>{items.length.toLocaleString()} 件</ToolbarCount>
        <ToolbarActions>
          <ListSettingsButton />
        </ToolbarActions>
      </ToolbarRoot>

      <ToolbarSubbar>
        {isVertical ? (
          <span className="text-[10px] text-pkt-text-mute">分类已移到左侧</span>
        ) : (
          <div className="min-w-0 flex-1">
            <CategoryTabs
              counts={counts}
              active={part}
              icons={icons}
              orientation="horizontal"
              onSelect={(next) => store.setPart(next)}
            />
          </div>
        )}
        <ToolbarActions>
          <ButtonRoot
            size="sm"
            variant="ghost"
            isIconOnly
            aria-label={isVertical ? '分类改为横排' : '分类改为竖排'}
            onPress={toggleCategoryLayout}
          >
            {isVertical ? (
              <IconLayoutHorizontal className="size-4" />
            ) : (
              <IconLayoutVertical className="size-4" />
            )}
          </ButtonRoot>
        </ToolbarActions>
      </ToolbarSubbar>

      <div className="flex min-h-0 flex-1">
        {isVertical ? (
          <div className="flex w-14 shrink-0 flex-col border-r border-pkt-border/70">
            <CategoryTabs
              counts={counts}
              active={part}
              icons={icons}
              orientation="vertical"
              onSelect={(next) => store.setPart(next)}
            />
          </div>
        ) : null}

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 p-3">
            <ItemGrid
              items={items}
              selectedCodes={wornCodes}
              display={itemDisplay}
              columnsSetting={listColumns}
              onSelect={toggleItem}
            />
          </div>
        </section>

        <WardrobePanel
          preview={preview}
          wornCount={Object.keys(worn).length}
          openPanels={{ detail: detailOpen, faces: facesOpen, slots: slotsOpen, view: viewOpen }}
          onTogglePanel={(panel: OutfitPanel) => togglePanel(panelId(panel))}
        />

        <OutfitDetailWindow
          worn={worn}
          customAssets={customAssets}
          customWorn={customWorn}
          onToggleCustom={onToggleCustom}
          onUnequip={(target) => store.unequip(target)}
          onClear={() => store.clear()}
        />

        <FacesWindow assets={assets} faces={catalog.faces} />

        <SlotsWindow
          preview={preview}
          slots={outfitSaves}
          onSaveSlot={putSave}
          onDeleteSlot={removeSave}
          onLoadSlot={onLoadSlot}
        />

        <ViewSettingsWindow catalog={catalog} worn={worn} preview={preview} />

        <ListSettingsWindow />
      </div>
    </div>
  )
}

function compareItems(a: CatalogItem, b: CatalogItem, sort: ItemSort): number {
  if (sort === 'oldest') return a.serial - b.serial || a.type - b.type
  if (sort === 'name') {
    return a.name.localeCompare(b.name, 'zh-CN') || b.serial - a.serial
  }
  return b.serial - a.serial || b.type - a.type
}

function panelId(panel: OutfitPanel): string {
  if (panel === 'faces') return OUTFIT_FACES_WINDOW_ID
  if (panel === 'slots') return OUTFIT_SLOTS_WINDOW_ID
  if (panel === 'view') return OUTFIT_VIEW_WINDOW_ID
  return OUTFIT_DETAIL_WINDOW_ID
}
