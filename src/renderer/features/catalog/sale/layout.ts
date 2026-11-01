import { PART_ORDER } from '@features/outfits/state/outfit-store'
import type { SaleArt } from './art'
import type { SaleLabel, SaleLabelPart, SaleSize, SaleTemplate } from './model'
import { normalizePrice } from './price'

/** 渲染用的条目：在编辑器数据之外补上已经加载好的立绘。 */
export interface SaleRenderItem {
  key: string
  name: string
  price: string
  sold: boolean
  group: string
  art: SaleArt
  labels?: SaleLabel[]
}

export interface SaleLayoutOptions {
  template: SaleTemplate
  size: SaleSize
  columns: number
  rowCounts?: number[]
  gap: number
  groupGap: number
  showNames: boolean
}

export interface SaleLabelLine {
  name: string
  price: string
}

export interface SaleCellLayout {
  item: SaleRenderItem
  x: number
  y: number
  width: number
  artHeight: number
  height: number
  /** 图片区底边；标签区从这之后开始，保证文字不会压到立绘。 */
  artBottom: number
  labelTop: number
  labelHeight: number
  labelLineHeight: number
  labels: SaleLabelLine[]
  /** true = 多行部件标签；false = 单品沿用旧版单行/上下排文字。 */
  usesLabelBlock: boolean
}

export interface SaleSheetLayout {
  width: number
  height: number
  cells: SaleCellLayout[]
}

/** 服装模版的立绘区高度：文字区固定排在下面，不参与图片绘制。 */
const CLOTHING_ART_HEIGHT: Record<SaleSize, number> = { dual: 200, large: 176, small: 128 }
const CLOTHING_LABEL_LINE_HEIGHT = 24

const ITEM_WIDTH = 100
const ITEM_ART_HEIGHT = 96
const ITEM_LABEL_LINE_HEIGHT = 20

const LABEL_TOP_GAP = 8
const LABEL_BOTTOM_GAP = 6

/** 保持旧版单品文字排版所需的固定高度。 */
const LEGACY_CLOTHING_LABEL_HEIGHT = 36
const LEGACY_ITEM_LABEL_HEIGHT_WITH_NAMES = 44
const LEGACY_ITEM_LABEL_HEIGHT_WITHOUT_NAMES = 32

const LABEL_PART_ORDER: SaleLabelPart[] = ['all', ...PART_ORDER]

/**
 * 生成实际要画在每行右侧的标签文字。
 *
 * 部件名称始终显示（这是用户明确设置的内容）；名称为空就只画价格。
 * 两项都空的标签不占用高度。
 */
export function saleLabelLines(labels: SaleLabel[] | undefined): SaleLabelLine[] {
  if (!labels || labels.length === 0) return []
  return [...labels]
    .sort((left, right) => labelOrder(left.part) - labelOrder(right.part))
    .map((label) => ({
      name: label.name.trim(),
      price: normalizePrice(label.price),
    }))
    .filter((line) => line.name !== '' || line.price !== '')
}

export function layoutSaleSheet(
  items: SaleRenderItem[],
  options: SaleLayoutOptions,
): SaleSheetLayout {
  const padding = options.template === 1 ? 24 : 18
  const columns = options.template === 1 ? 4 : clampColumns(options.columns)
  const gap = Math.max(0, options.gap)
  const groupGap = Math.max(0, Math.min(options.groupGap, options.gap))
  const rows = splitRows(items, columns, options.rowCounts)

  const cells: SaleCellLayout[] = []
  let width = padding * 2
  let y = padding

  rows.forEach((row, rowIndex) => {
    const metrics = row.map((item) => measureItem(item, options))
    const rowHeight = Math.max(...metrics.map((metric) => metric.height), 0)
    let x = padding

    row.forEach((item, index) => {
      const metric = metrics[index]!
      if (index > 0) {
        const previous = row[index - 1]!
        x += previous.group === item.group ? groupGap : gap
      }
      const artBottom = y + metric.artHeight
      cells.push({
        item,
        x,
        y,
        width: metric.width,
        artHeight: metric.artHeight,
        height: metric.height,
        artBottom,
        labelTop: metric.usesLabelBlock ? artBottom + LABEL_TOP_GAP : artBottom,
        labelHeight: metric.labelHeight,
        labelLineHeight: metric.labelLineHeight,
        labels: metric.labels,
        usesLabelBlock: metric.usesLabelBlock,
      })
      width = Math.max(width, x + metric.width + padding)
      x += metric.width
    })

    y += rowHeight
    if (rowIndex < rows.length - 1) y += gap
  })

  return {
    width,
    height: items.length === 0 ? padding * 2 : y + padding,
    cells,
  }
}

interface CellMetric {
  width: number
  artHeight: number
  labelHeight: number
  labelLineHeight: number
  height: number
  labels: SaleLabelLine[]
  usesLabelBlock: boolean
}

function measureItem(item: SaleRenderItem, options: SaleLayoutOptions): CellMetric {
  const labels = item.labels ? saleLabelLines(item.labels) : []
  const usesLabelBlock = labels.length > 0

  if (options.template === 1) {
    const width = options.size === 'dual' ? 280 : 190
    const artHeight = CLOTHING_ART_HEIGHT[options.size]
    const labelHeight = usesLabelBlock
      ? labelBlockHeight(labels.length, CLOTHING_LABEL_LINE_HEIGHT)
      : LEGACY_CLOTHING_LABEL_HEIGHT
    return {
      width,
      artHeight,
      labelHeight,
      labelLineHeight: CLOTHING_LABEL_LINE_HEIGHT,
      height: artHeight + labelHeight,
      labels,
      usesLabelBlock,
    }
  }

  const labelLineCount = labels.reduce(
    (count, line) => count + (line.name ? 1 : 0) + (line.price ? 1 : 0),
    0,
  )
  const labelHeight = usesLabelBlock
    ? labelBlockHeight(labelLineCount, ITEM_LABEL_LINE_HEIGHT)
    : options.showNames
      ? LEGACY_ITEM_LABEL_HEIGHT_WITH_NAMES
      : LEGACY_ITEM_LABEL_HEIGHT_WITHOUT_NAMES
  return {
    width: ITEM_WIDTH,
    artHeight: ITEM_ART_HEIGHT,
    labelHeight,
    labelLineHeight: ITEM_LABEL_LINE_HEIGHT,
    height: ITEM_ART_HEIGHT + labelHeight,
    labels,
    usesLabelBlock,
  }
}

function labelBlockHeight(lineCount: number, lineHeight: number): number {
  return LABEL_TOP_GAP + lineCount * lineHeight + LABEL_BOTTOM_GAP
}

function splitRows(
  items: SaleRenderItem[],
  columns: number,
  rowCounts: number[] | undefined,
): SaleRenderItem[][] {
  const rows: SaleRenderItem[][] = []
  let start = 0
  let index = 0
  while (start < items.length) {
    const count = Math.max(1, Math.floor(rowCounts?.[index] ?? columns))
    rows.push(items.slice(start, start + count))
    start += count
    index += 1
  }
  return rows
}

function clampColumns(value: number): number {
  return Math.max(1, Math.min(10, Math.round(value) || 5))
}

function labelOrder(part: SaleLabelPart): number {
  const index = LABEL_PART_ORDER.indexOf(part)
  return index < 0 ? LABEL_PART_ORDER.length : index
}
