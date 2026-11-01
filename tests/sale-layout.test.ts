import { describe, expect, it } from 'vitest'

import {
  layoutSaleSheet,
  saleLabelLines,
  type SaleLayoutOptions,
  type SaleRenderItem,
} from '../src/renderer/features/catalog/sale/layout.ts'
import {
  displayPrice,
  normalizePrice,
  sanitizePriceInput,
} from '../src/renderer/features/catalog/sale/price.ts'

function makeItem(overrides: Partial<SaleRenderItem> = {}): SaleRenderItem {
  return {
    key: 'item',
    name: '单品',
    price: '',
    sold: false,
    group: 'item',
    art: {},
    ...overrides,
  }
}

const clothing: SaleLayoutOptions = {
  template: 1,
  size: 'dual',
  columns: 4,
  gap: 8,
  groupGap: 2,
  showNames: true,
}

const itemSheet: SaleLayoutOptions = {
  template: 2,
  size: 'dual',
  columns: 3,
  gap: 8,
  groupGap: 2,
  showNames: true,
}

describe('卖货图布局', () => {
  it('部件标签区从图片底边之后开始，不会覆盖图片', () => {
    const layout = layoutSaleSheet(
      [
        makeItem({
          labels: [
            { part: 'all', name: '整套', price: '100' },
            { part: 'hair', name: '发型', price: '20' },
            { part: 'coat', name: '外套', price: '30' },
          ],
        }),
      ],
      clothing,
    )

    const cell = layout.cells[0]!
    expect(cell.usesLabelBlock).toBe(true)
    expect(cell.artBottom).toBe(cell.y + cell.artHeight)
    expect(cell.labelTop).toBeGreaterThan(cell.artBottom)
    expect(cell.height).toBe(cell.artHeight + cell.labelHeight)
    expect(cell.labelHeight).toBe(8 + 3 * 24 + 6)
  })

  it('是否带标签不改变图片区高度', () => {
    const plain = layoutSaleSheet([makeItem()], clothing).cells[0]!
    const labelled = layoutSaleSheet(
      [makeItem({ labels: [{ part: 'all', name: '整套', price: '1' }] })],
      clothing,
    ).cells[0]!

    expect(labelled.artHeight).toBe(plain.artHeight)
    expect(labelled.artBottom).toBe(labelled.y + labelled.artHeight)
    expect(labelled.labelTop).toBeGreaterThanOrEqual(labelled.artBottom)
  })

  it('行高取该行最高的条目，下一行不会压到上一行的标签', () => {
    const layout = layoutSaleSheet(
      [
        makeItem({
          key: 'a',
          labels: [
            { part: 'all', name: '整套', price: '1' },
            { part: 'hair', name: '发型', price: '2' },
            { part: 'coat', name: '外套', price: '3' },
          ],
        }),
        makeItem({ key: 'b' }),
        makeItem({ key: 'c' }),
        makeItem({ key: 'd' }),
        makeItem({ key: 'e' }),
      ],
      clothing,
    )

    const first = layout.cells.find((cell) => cell.item.key === 'a')!
    const second = layout.cells.find((cell) => cell.item.key === 'b')!
    const nextRow = layout.cells.find((cell) => cell.item.key === 'e')!
    expect(second.y).toBe(first.y)
    expect(nextRow.y).toBe(24 + Math.max(first.height, second.height) + 8)
    expect(nextRow.y).toBeGreaterThanOrEqual(first.y + first.height)
    expect(nextRow.y).toBeGreaterThanOrEqual(second.y + second.height)
  })

  it('道具模版的部件标签按名称、价格上下两行预留高度', () => {
    const labelled = layoutSaleSheet(
      [
        makeItem({
          labels: [{ part: 'hair', name: '双马尾', price: '20' }],
        }),
      ],
      itemSheet,
    ).cells[0]!
    expect(labelled.artHeight).toBe(96)
    expect(labelled.labelHeight).toBe(8 + 2 * 20 + 6)

    const priceOnly = layoutSaleSheet(
      [
        makeItem({
          labels: [{ part: 'hair', name: '', price: '20' }],
        }),
      ],
      itemSheet,
    ).cells[0]!
    expect(priceOnly.labelHeight).toBe(8 + 20 + 6)
  })

  it('组合内的条目使用组合间距，组合之间使用普通间距', () => {
    const layout = layoutSaleSheet(
      [
        makeItem({ key: 'a', group: 'g' }),
        makeItem({ key: 'b', group: 'g' }),
        makeItem({ key: 'c', group: 'c' }),
      ],
      { ...itemSheet, columns: 3, gap: 10, groupGap: 2 },
    )
    const a = layout.cells[0]!
    const b = layout.cells[1]!
    const c = layout.cells[2]!

    expect(b.x - (a.x + a.width)).toBe(2)
    expect(c.x - (b.x + b.width)).toBe(10)
  })

  it('自定义每行数量会改变行分布', () => {
    const layout = layoutSaleSheet(
      Array.from({ length: 5 }, (_, index) => makeItem({ key: `item-${index}` })),
      { ...itemSheet, columns: 3, rowCounts: [2, 3] },
    )
    const ys = layout.cells.map((cell) => cell.y)
    expect(ys[0]).toBe(ys[1])
    expect(ys[2]).toBe(ys[3])
    expect(ys[3]).toBe(ys[4])
    expect(ys[2]!).toBeGreaterThan(ys[0]!)
  })
})

describe('卖货图标签文字', () => {
  it('整套排在最前，其余按部位顺序；名称为空时只保留价格', () => {
    const lines = saleLabelLines([
      { part: 'coat', name: '外套', price: '30' },
      { part: 'hair', name: '', price: '20' },
      { part: 'all', name: '整套', price: '100' },
    ])
    expect(lines).toEqual([
      { name: '整套', price: '100' },
      { name: '', price: '20' },
      { name: '外套', price: '30' },
    ])
  })

  it('部件名称始终显示，不受单品名称开关影响', () => {
    const lines = saleLabelLines([{ part: 'all', name: '整套', price: '100' }])
    expect(lines).toEqual([{ name: '整套', price: '100' }])
  })

  it('没有标签时返回空列表', () => {
    expect(saleLabelLines([])).toEqual([])
    expect(saleLabelLines(undefined)).toEqual([])
  })

  it('名称和价格都为空时不占用标签行', () => {
    expect(saleLabelLines([{ part: 'all', name: ' ', price: ' ' }])).toEqual([])
  })

  it('价格里的特殊符号会被清掉', () => {
    expect(saleLabelLines([{ part: 'all', name: '整套', price: '12234、、、..' }])).toEqual([
      { name: '整套', price: '12234' },
    ])
  })
})

describe('价格输入清洗', () => {
  it('输入时只保留数字和一个小数点，最多两位小数', () => {
    expect(sanitizePriceInput('12234、、、..')).toBe('12234.')
    expect(sanitizePriceInput('12,345.678')).toBe('12345.67')
    expect(sanitizePriceInput('abc')).toBe('')
    expect(sanitizePriceInput('.5')).toBe('0.5')
    expect(sanitizePriceInput('12.')).toBe('12.')
  })

  it('中文输入法的全角小数点会转成英文小数点', () => {
    expect(sanitizePriceInput('12。5')).toBe('12.5')
    expect(sanitizePriceInput('12．5')).toBe('12.5')
    expect(sanitizePriceInput('12｡5')).toBe('12.5')
    expect(sanitizePriceInput('12·5')).toBe('12.5')
  })

  it('小数价格在渲染时保留', () => {
    expect(normalizePrice('9.99')).toBe('9.99')
    expect(displayPrice('0.5')).toBe('0.5')
    expect(displayPrice('12。5')).toBe('12.5')
  })

  it('渲染价格去掉末尾小数点，空价格显示占位符', () => {
    expect(normalizePrice('12.')).toBe('12')
    expect(displayPrice('')).toBe('—')
    expect(displayPrice('、、')).toBe('—')
  })
})
