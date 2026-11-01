import { composeSmallActor } from '@engine/index'
import type { Catalog, CatalogAssets, CatalogItem, Part } from '@shared/contract'
import {
  composeFromCatalog,
  composeSmallFromCatalog,
  getBaseActor,
  getFaceLook,
  getFaceMiniImage,
  getSmallBaseActor,
  getSmallCostume,
  toDataUrl,
} from '@/services/assets'
import { getSaleIcon } from '../services'
import type { CatalogEntry } from '../types'
import type { SaleSubject, SaleTemplate, OutfitSaleSubject } from './model'

export interface SaleArt {
  large?: string
  front?: string
  back?: string
  icon?: string
}

/** 卖货图素材：模板一使用大/小模型，模板二统一使用道具图或整套立绘。 */
export async function loadSaleArt(
  subject: SaleSubject,
  catalog: Catalog,
  assets: CatalogAssets,
  template: SaleTemplate,
): Promise<SaleArt> {
  if (subject.kind === 'outfit') {
    return loadOutfitSaleArt(subject, catalog, assets, template)
  }
  return loadEntrySaleArt(subject.entry, assets, template)
}

async function loadEntrySaleArt(
  entry: CatalogEntry,
  assets: CatalogAssets,
  template: SaleTemplate,
): Promise<SaleArt> {
  if (template === 2) {
    const icon = await getSaleIcon(entry)
    return icon ? { icon } : {}
  }

  if (!entry.item || entry.kind !== 'outfit') return {}
  const item = entry.item
  const sex = item.sex === 1 ? 1 : 2

  try {
    const base = await getBaseActor(sex, assets)
    const large = await composeFromCatalog({
      sex,
      worn: { [item.part]: item },
      base,
      face: null,
    })
    const [smallBase, smallArt] = await Promise.all([
      getSmallBaseActor(assets),
      getSmallCostume(item),
    ])
    const worn = {
      [item.part]: {
        art: smallArt,
        useMask: item.useMask,
        coverHead: item.coverHead,
      },
    }
    const front = composeSmallActor({ base: smallBase, worn, direction: 'front' })
    const back = composeSmallActor({ base: smallBase, worn, direction: 'back' })
    return {
      large: toDataUrl(large),
      front: toDataUrl(front),
      back: toDataUrl(back),
    }
  } catch (error) {
    console.warn('[sale] 生成服饰卖货图素材失败', entry.code, error)
    return {}
  }
}

async function loadOutfitSaleArt(
  subject: OutfitSaleSubject,
  catalog: Catalog,
  assets: CatalogAssets,
  template: SaleTemplate,
): Promise<SaleArt> {
  const worn: Partial<Record<Part, CatalogItem>> = {}
  for (const item of subject.wornItems) worn[item.part] = item
  const face = catalog.faces.find((entry) => entry.code === subject.faceCode) ?? null

  try {
    const base = await getBaseActor(subject.sex, assets)
    const faceLook = await getFaceLook(face, subject.sex)
    const large = await composeFromCatalog({
      sex: subject.sex,
      worn,
      base,
      face: faceLook,
    })

    if (template === 2) return { icon: toDataUrl(large) }

    const [smallBase, smallFace] = await Promise.all([
      getSmallBaseActor(assets),
      face ? getFaceMiniImage(face) : Promise.resolve(null),
    ])
    const small = await composeSmallFromCatalog({
      worn,
      base: smallBase,
      face: smallFace,
    })
    return {
      large: toDataUrl(large),
      front: toDataUrl(small.front),
      back: toDataUrl(small.back),
    }
  } catch (error) {
    console.warn('[sale] 生成搭配存档卖货图素材失败', subject.source.saveId, error)
    return {}
  }
}
