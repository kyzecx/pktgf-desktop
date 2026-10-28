import type { Catalog, CatalogItem, OutfitSaveData, Part, SaveRecord } from '@shared/contract'
import { useOutfitStore } from './outfit-store'

export type OutfitSave = SaveRecord & { kind: 'outfit'; data: OutfitSaveData }

export function isOutfitSave(save: SaveRecord): save is OutfitSave {
  if (save.kind !== 'outfit') return false
  const data = save.data as Partial<OutfitSaveData> | null
  return Boolean(
    data && (data.sex === 1 || data.sex === 2) && data.worn && typeof data.worn === 'object',
  )
}

export function outfitItemCount(save: SaveRecord): number {
  return isOutfitSave(save) ? Object.keys(save.data.worn).length : 0
}

/** 把存档里的 part→code 还原成目录对象，并写回搭配 store。 */
export function applyOutfitSave(catalog: Catalog | null, save: SaveRecord): boolean {
  if (!catalog || !isOutfitSave(save)) return false

  const worn: Partial<Record<Part, CatalogItem>> = {}
  for (const code of Object.values(save.data.worn)) {
    const item = catalog.items.find((entry) => entry.code === code)
    if (item) worn[item.part] = item
  }

  useOutfitStore.getState().applySaved({
    sex: save.data.sex,
    faceCode: save.data.faceCode,
    worn,
  })
  return true
}
