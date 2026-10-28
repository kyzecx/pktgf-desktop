import { composeSmallActor } from '@engine/index'
import type { CatalogAssets } from '@shared/contract'
import {
  composeFromCatalog,
  getBaseActor,
  getSmallBaseActor,
  getSmallCostume,
  toDataUrl,
} from '@/services/assets'
import { getSaleIcon } from '../services'
import type { CatalogEntry } from '../types'

export interface SaleArt {
  large?: string
  front?: string
  back?: string
  icon?: string
}

/** 卖货图模板一使用大/小模型；模板二统一使用道具图。 */
export async function loadSaleArt(
  entry: CatalogEntry,
  assets: CatalogAssets,
  template: 1 | 2,
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
