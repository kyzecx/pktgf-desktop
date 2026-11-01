import { describe, expect, it } from 'vitest'

import type { CatalogItem } from '../src/shared/contract.ts'
import type { CatalogEntry } from '../src/renderer/features/catalog/types.ts'
import {
  createSaleCatalogIndex,
  outfitSubjectFromSource,
  saleItemsFromRecord,
  saleRecordItems,
  type OutfitSaleSource,
  type SaleRecord,
} from '../src/renderer/features/catalog/sale/model.ts'

function makeItem(
  overrides: Partial<CatalogItem> & Pick<CatalogItem, 'code' | 'part'>,
): CatalogItem {
  return {
    type: 1,
    sex: 0,
    serial: 1,
    name: overrides.code,
    description: '',
    zip: '',
    md5: '',
    useMask: false,
    coverHead: false,
    displaytemplate: false,
    motion: null,
    ...overrides,
  }
}

const hair = makeItem({ code: 'hair001', part: 'hair', name: '双马尾' })
const coat = makeItem({ code: 'coat001', part: 'coat', name: '小熊外套' })
const catalogIndex = createSaleCatalogIndex([hair, coat])

const hairEntry: CatalogEntry = {
  key: 'outfit:hair001',
  kind: 'outfit',
  code: 'hair001',
  name: '双马尾',
  description: '',
  category: 'hair',
  item: hair,
}
const entriesByKey = new Map([[hairEntry.key, hairEntry]])

function makeRecord(overrides: Partial<SaleRecord> = {}): SaleRecord {
  return {
    id: 'record-1',
    createdAt: 1,
    template: 1,
    size: 'dual',
    front: true,
    back: true,
    columns: 5,
    customRows: false,
    rowPattern: '',
    gap: 16,
    groupGap: 4,
    showNames: false,
    order: [],
    groups: {},
    items: [],
    preview: 'data:image/png;base64,',
    ...overrides,
  }
}

const outfitSource: OutfitSaleSource = {
  saveId: 'save-1',
  name: '春日套装',
  data: {
    sex: 2,
    faceCode: null,
    worn: { hair: 'hair001', coat: 'coat001' },
  },
}

describe('卖货图记录还原', () => {
  it('旧记录没有 kind/labels/outfit 时按图鉴单品还原', () => {
    const record = makeRecord({
      order: [hairEntry.key],
      items: [
        {
          key: hairEntry.key,
          name: '自定义名',
          price: '20',
          sold: true,
        } as SaleRecord['items'][number],
      ],
    })

    const items = saleItemsFromRecord(record, entriesByKey, catalogIndex)
    expect(items).toHaveLength(1)
    expect(items[0]!.subject.kind).toBe('entry')
    expect(items[0]!.name).toBe('自定义名')
    expect(items[0]!.price).toBe('20')
    expect(items[0]!.sold).toBe(true)
    expect(items[0]!.labels).toEqual([])
  })

  it('搭配存档从记录内嵌快照还原，不依赖存档仍然存在', () => {
    const record = makeRecord({
      order: ['save:save-1'],
      items: [
        {
          key: 'save:save-1',
          kind: 'outfit',
          name: '春日套装',
          price: '',
          sold: false,
          labels: [
            { part: 'hair', name: '双马尾', price: '20' },
            { part: 'all', name: '春日套装', price: '100' },
          ],
          outfit: outfitSource,
        },
      ],
    })

    const items = saleItemsFromRecord(record, entriesByKey, catalogIndex)
    expect(items).toHaveLength(1)
    const subject = items[0]!.subject
    expect(subject.kind).toBe('outfit')
    if (subject.kind !== 'outfit') throw new Error('expected outfit subject')
    expect(subject.source).toEqual(outfitSource)
    expect(subject.wornItems.map((item) => item.code)).toEqual(['hair001', 'coat001'])
    expect(items[0]!.labels).toEqual([
      { part: 'hair', name: '双马尾', price: '20' },
      { part: 'all', name: '春日套装', price: '100' },
    ])
  })

  it('图鉴里找不到的部件会被跳过，全部缺失时不生成条目', () => {
    const missingSource: OutfitSaleSource = {
      saveId: 'save-2',
      name: '旧套装',
      data: { sex: 1, faceCode: null, worn: { hair: 'gone001' } },
    }
    expect(outfitSubjectFromSource(missingSource, catalogIndex)).toBeNull()

    const record = makeRecord({
      order: ['save:save-2'],
      items: [
        {
          key: 'save:save-2',
          kind: 'outfit',
          name: '旧套装',
          price: '',
          sold: false,
          outfit: missingSource,
        },
      ],
    })

    expect(saleItemsFromRecord(record, entriesByKey, catalogIndex)).toEqual([])
  })

  it('保存记录时把搭配快照和标签一起写回', () => {
    const record = makeRecord({
      order: ['save:save-1'],
      items: [
        {
          key: 'save:save-1',
          kind: 'outfit',
          name: '春日套装',
          price: '',
          sold: true,
          labels: [{ part: 'all', name: '春日套装', price: '100' }],
          outfit: outfitSource,
        },
      ],
    })

    const items = saleItemsFromRecord(record, entriesByKey, catalogIndex)
    const saved = saleRecordItems(items)
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({
      key: 'save:save-1',
      kind: 'outfit',
      sold: true,
      outfit: outfitSource,
      labels: [{ part: 'all', name: '春日套装', price: '100' }],
    })
  })
})
