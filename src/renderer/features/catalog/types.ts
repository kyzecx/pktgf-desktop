import type { Catalog, CatalogFurniture, CatalogItem, CatalogPet } from '@shared/contract'

export type CatalogKind = 'outfit' | 'furniture' | 'pet'

/** 图鉴列表的统一投影：三种资源都只需要这些字段。 */
export type CatalogDisplay = 'large' | 'small'
export type PetView = 'pet' | 'egg'

export interface CatalogView {
  display: CatalogDisplay
  petView: PetView
}

export interface CatalogEntry {
  key: string
  kind: CatalogKind
  code: string
  name: string
  description: string
  category: string
  item?: CatalogItem
  furniture?: CatalogFurniture
  pet?: CatalogPet
}

/** 同一物品内帧的唯一键；跨物品时必须再和 entry.key 组合。 */
export function frameKey(dir: string, name: string): string {
  return `${dir}:${name}`
}

export const CATALOG_KIND_LABELS: Record<CatalogKind, string> = {
  outfit: '服饰',
  furniture: '家具',
  pet: '宠物',
}

export const FURNITURE_CATEGORY_LABELS: Record<string, string> = {
  bat: '浴室',
  bed: '床',
  blo: '积木',
  cab: '柜子',
  cha: '椅子',
  dec: '装饰',
  door: '门',
  ele: '家电',
  kit: '厨房',
  lig: '灯具',
  lux: '奢侈品',
  pla: '植物',
  rug: '地毯',
  she: '架子',
  tab: '桌子',
  tel: '电话',
  tile: '地板',
  toy: '玩具',
  wal: '墙饰',
  wall: '墙纸',
  win: '窗户',
}

export function buildCatalogEntries(catalog: Catalog): CatalogEntry[] {
  const entries: CatalogEntry[] = []
  const seenOutfits = new Set<string>()

  for (const item of catalog.items) {
    if (seenOutfits.has(item.code)) continue
    seenOutfits.add(item.code)
    entries.push({
      key: `outfit:${item.code}`,
      kind: 'outfit',
      code: item.code,
      name: item.name,
      description: item.description,
      category: item.part,
      item,
    })
  }

  for (const item of catalog.furniture ?? []) {
    entries.push({
      key: `furniture:${item.code}`,
      kind: 'furniture',
      code: item.code,
      name: item.name,
      description: item.description,
      category: item.category,
      furniture: item,
    })
  }

  for (const item of catalog.pets ?? []) {
    entries.push({
      key: `pet:${item.code}`,
      kind: 'pet',
      code: item.code,
      name: item.name,
      description: '',
      category: 'pet',
      pet: item,
    })
  }

  return entries
}
