import * as React from 'react'

import type { Catalog, CatalogAssets, CatalogItem, Part, SaveRecord } from '@shared/contract'
import { ButtonRoot, ChipLabel, ChipRoot, IconSearch, InputRoot } from '@heroui/react'
import { useFloatingStore } from '@ui/floating'
import { FacesWindow, OUTFIT_FACES_WINDOW_ID } from './components/faces-window'
import { ItemGrid } from './components/item-grid'
import {
  OUTFIT_DETAIL_WINDOW_ID,
  OutfitDetailWindow,
  type WornCustomAsset,
} from './components/outfit-detail-window'
import { SearchPalette } from './components/search-palette'
import { OUTFIT_SLOTS_WINDOW_ID, SlotsWindow } from './components/slots-window'
import { OUTFIT_VIEW_WINDOW_ID, ViewSettingsWindow } from './components/view-settings-window'
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
  const worn = useOutfitStore((state) => state.worn)
  const categoryLayout = useOutfitStore((state) => state.categoryLayout)
  const toggleCategoryLayout = useOutfitStore((state) => state.toggleCategoryLayout)
  const itemDisplay = useOutfitStore((state) => state.itemDisplay)
  const listColumns = useOutfitStore((state) => state.listColumns)
  const itemSort = useOutfitStore((state) => state.itemSort)
  const setItemSort = useOutfitStore((state) => state.setItemSort)
  const store = useOutfitStore()

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
    const filtered = catalog.items.filter((item) => {
      if (item.part !== part) return false
      if (item.sex !== 0 && item.sex !== sex) return false
      if (!keyword) return true
      return item.name.toLowerCase().includes(keyword) || item.code.toLowerCase().includes(keyword)
    })
    return filtered.sort((a, b) => compareItems(a, b, itemSort))
  }, [catalog.items, part, sex, search, itemSort])

  const selectedCode = worn[part]?.code ?? null

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

  return (
    <div className="flex h-full min-h-0">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-pkt-border px-3">
          <div className="relative w-64">
            <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-pkt-text-mute" />
            <InputRoot
              value={search}
              placeholder={`搜索${PART_LABELS[part]}`}
              onChange={(event) => store.setSearch(event.target.value)}
              className="w-full pl-9"
            />
          </div>
          <ChipRoot size="sm" variant="soft">
            <ChipLabel>{items.length.toLocaleString()} 件</ChipLabel>
          </ChipRoot>
          <select
            value={itemSort}
            onChange={(event) => setItemSort(event.target.value as ItemSort)}
            aria-label="列表排序"
            className="h-7 shrink-0 rounded-md border border-pkt-border bg-pkt-panel px-1.5 text-[10px] text-pkt-text"
          >
            <option value="newest">最新优先</option>
            <option value="oldest">最早优先</option>
            <option value="name">按名称</option>
          </select>
          <div className="ml-auto flex items-center gap-1">
            {([1, 2] as const).map((value) => (
              <ButtonRoot
                key={value}
                size="sm"
                variant={sex === value ? 'primary' : 'ghost'}
                onClick={() => store.setSex(value)}
              >
                {value === 1 ? '男' : '女'}
              </ButtonRoot>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 p-3">
          <ItemGrid
            items={items}
            selectedCode={selectedCode}
            display={itemDisplay}
            columnsSetting={listColumns}
            onSelect={(item) => store.toggle(item)}
          />
        </div>
      </section>

      <WardrobePanel
        preview={preview}
        wornCount={Object.keys(worn).length}
        openPanels={{ detail: detailOpen, faces: facesOpen, slots: slotsOpen, view: viewOpen }}
        onTogglePanel={(panel: OutfitPanel) => togglePanel(panelId(panel))}
        counts={counts}
        activePart={part}
        icons={icons}
        onSelectPart={(next) => store.setPart(next)}
        layout={categoryLayout}
        onToggleLayout={toggleCategoryLayout}
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

      <SearchPalette
        items={catalog.items}
        sex={sex}
        worn={worn}
        onPick={(item) => {
          store.setPart(item.part)
          store.toggle(item)
        }}
      />
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
