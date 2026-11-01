import type { CatalogItem, OutfitSaveData, Part, SaveRecord } from '@shared/contract'
import { isOutfitSave } from '@features/outfits/state/outfit-save'
import { PART_LABELS, PART_ORDER } from '@features/outfits/state/outfit-store'
import type { CatalogEntry } from '../types'
import { normalizePrice } from './price'

export type SaleTemplate = 1 | 2
export type SaleSize = 'large' | 'small' | 'dual'
export type SaleLabelPart = Part | 'all'

/** 整套或单个部件的名称/价格；渲染时统一放在图片下方的标签区。 */
export interface SaleLabel {
  part: SaleLabelPart
  name: string
  price: string
}

/** 搭配存档的卖货快照：存档被删除后，保存过的卖货图仍能还原。 */
export interface OutfitSaleSource {
  saveId: string
  name: string
  data: OutfitSaveData
}

/** 卖货图条目：图鉴单品，或一整套已保存的搭配。 */
export type SaleSubject =
  | { kind: 'entry'; key: string; entry: CatalogEntry }
  | {
      kind: 'outfit'
      key: string
      source: OutfitSaleSource
      sex: 1 | 2
      faceCode: string | null
      /** 存档里能在当前图鉴解析到的部件，按 PART_ORDER 排列。 */
      wornItems: CatalogItem[]
    }

export type OutfitSaleSubject = Extract<SaleSubject, { kind: 'outfit' }>

/** 编辑器里的一条商品；单品用 name/price，搭配存档用 labels。 */
export interface SaleItemState {
  key: string
  subject: SaleSubject
  name: string
  price: string
  sold: boolean
  group: string
  labels: SaleLabel[]
}

/** 存进 localStorage 的条目快照。 */
export interface SaleRecordItem {
  key: string
  kind: 'entry' | 'outfit'
  name: string
  price: string
  sold: boolean
  labels?: SaleLabel[]
  outfit?: OutfitSaleSource
}

export interface SaleRecord {
  id: string
  createdAt: number
  template: SaleTemplate
  size: SaleSize
  front: boolean
  back: boolean
  columns: number
  customRows: boolean
  rowPattern: string
  gap: number
  groupGap: number
  showNames: boolean
  /** 旧记录用 order/groups 表达顺序和组合，新记录仍写这两项以保持兼容。 */
  order: string[]
  groups: Record<string, string>
  items: SaleRecordItem[]
  preview: string
}

export interface SaleCatalogIndex {
  itemsByCode: Map<string, CatalogItem>
}

export function outfitSaleKey(saveId: string): string {
  return `save:${saveId}`
}

export function createSaleCatalogIndex(items: CatalogItem[]): SaleCatalogIndex {
  const itemsByCode = new Map<string, CatalogItem>()
  for (const item of items) {
    if (!itemsByCode.has(item.code)) itemsByCode.set(item.code, item)
  }
  return { itemsByCode }
}

export function isSaleLabelPart(value: unknown): value is SaleLabelPart {
  return value === 'all' || (typeof value === 'string' && PART_ORDER.includes(value as Part))
}

export function isSaleOutfitSource(value: unknown): value is OutfitSaleSource {
  if (!value || typeof value !== 'object') return false
  const source = value as Partial<OutfitSaleSource>
  if (typeof source.saveId !== 'string' || typeof source.name !== 'string') return false
  const data = source.data as Partial<OutfitSaveData> | null
  if (!data || (data.sex !== 1 && data.sex !== 2)) return false
  if (data.faceCode != null && typeof data.faceCode !== 'string') return false
  return Boolean(data.worn && typeof data.worn === 'object')
}

export function outfitSourceFromSave(save: SaveRecord): OutfitSaleSource | null {
  if (!isOutfitSave(save)) return null
  return { saveId: save.id, name: save.name, data: save.data }
}

/** 存档部件全部缺失时返回 null，避免生成一张只有文字的空白图。 */
export function outfitSubjectFromSource(
  source: OutfitSaleSource,
  index: SaleCatalogIndex,
): OutfitSaleSubject | null {
  const wornItems: CatalogItem[] = []
  for (const part of PART_ORDER) {
    const code = source.data.worn[part]
    if (!code) continue
    const item = index.itemsByCode.get(code)
    if (item && item.part === part) wornItems.push(item)
  }
  if (wornItems.length === 0) return null
  return {
    kind: 'outfit',
    key: outfitSaleKey(source.saveId),
    source,
    sex: source.data.sex === 1 ? 1 : 2,
    faceCode: source.data.faceCode ?? null,
    wornItems,
  }
}

export function entrySaleItem(entry: CatalogEntry): SaleItemState {
  return {
    key: entry.key,
    subject: { kind: 'entry', key: entry.key, entry },
    name: entry.name,
    price: '',
    sold: false,
    group: entry.key,
    labels: [],
  }
}

/** 搭配存档默认只勾选「整套」；部件标签由用户按需勾选。 */
export function outfitSaleItem(subject: OutfitSaleSubject): SaleItemState {
  return {
    key: subject.key,
    subject,
    name: subject.source.name,
    price: '',
    sold: false,
    group: subject.key,
    labels: [{ part: 'all', name: subject.source.name, price: '' }],
  }
}

export function defaultLabelName(subject: SaleSubject, part: SaleLabelPart): string {
  if (subject.kind !== 'outfit') return subject.entry.name
  if (part === 'all') return subject.source.name
  const worn = subject.wornItems.find((item) => item.part === part)
  return worn?.name ?? PART_LABELS[part]
}

/** 是否可以作为服装模版渲染：图鉴服饰和整套搭配都算。 */
export function isClothingSubject(subject: SaleSubject): boolean {
  return subject.kind === 'outfit' || subject.entry.kind === 'outfit'
}

/** 只和图片有关、与名称/价格无关的标识；用于避免输入名称时重算立绘。 */
export function saleSubjectArtKey(subject: SaleSubject): string {
  if (subject.kind === 'entry') return `entry:${subject.entry.key}`
  const worn = subject.wornItems.map((item) => `${item.part}=${item.code}`).join(',')
  return `outfit:${subject.key}:${subject.sex}:${subject.faceCode ?? ''}:${worn}`
}

export function moveSaleItemAfter(
  items: SaleItemState[],
  key: string,
  targetKey: string,
): SaleItemState[] {
  const moving = items.find((item) => item.key === key)
  if (!moving) return items
  const without = items.filter((item) => item.key !== key)
  const target = without.findIndex((item) => item.key === targetKey)
  if (target < 0) return items
  without.splice(target + 1, 0, moving)
  return without
}

export function mergeSaleGroup(
  items: SaleItemState[],
  key: string,
  targetKey: string,
): SaleItemState[] {
  const moving = items.find((item) => item.key === key)
  const target = items.find((item) => item.key === targetKey)
  if (!moving || !target || moving.group === target.group) return items
  const from = moving.group
  const to = target.group
  return items.map((item) => (item.group === from ? { ...item, group: to } : item))
}

export function splitSaleGroup(items: SaleItemState[], groupId: string): SaleItemState[] {
  return items.map((item) => (item.group === groupId ? { ...item, group: item.key } : item))
}

export function detachSaleItem(items: SaleItemState[], key: string): SaleItemState[] {
  return items.map((item) => (item.key === key ? { ...item, group: item.key } : item))
}

export function saleRecordItems(items: SaleItemState[]): SaleRecordItem[] {
  return items.map((item) => ({
    key: item.key,
    kind: item.subject.kind,
    name: item.name,
    price: normalizePrice(item.price),
    sold: item.sold,
    labels:
      item.subject.kind === 'outfit'
        ? item.labels.map((label) => ({ ...label, price: normalizePrice(label.price) }))
        : undefined,
    outfit: item.subject.kind === 'outfit' ? item.subject.source : undefined,
  }))
}

/**
 * 把记录还原成编辑器条目。
 *
 * 旧版本记录没有 kind/labels/outfit 字段，按 key 前缀推断为图鉴单品；
 * 搭配存档从记录内嵌的快照还原，不依赖存档管理页仍然存在。
 */
export function saleItemsFromRecord(
  record: SaleRecord,
  entriesByKey: Map<string, CatalogEntry>,
  catalogIndex: SaleCatalogIndex,
): SaleItemState[] {
  const itemsByKey = new Map(record.items.map((item) => [item.key, item]))
  const order = record.order?.length ? record.order : record.items.map((item) => item.key)
  const result: SaleItemState[] = []

  for (const key of order) {
    const recordItem = itemsByKey.get(key)
    if (!recordItem) continue
    itemsByKey.delete(key)
    const item = saleItemFromRecordItem(
      recordItem,
      record.groups?.[key],
      entriesByKey,
      catalogIndex,
    )
    if (item) result.push(item)
  }

  for (const [key, recordItem] of itemsByKey) {
    const item = saleItemFromRecordItem(
      recordItem,
      record.groups?.[key],
      entriesByKey,
      catalogIndex,
    )
    if (item) result.push(item)
  }

  return result
}

function saleItemFromRecordItem(
  recordItem: SaleRecordItem,
  group: string | undefined,
  entriesByKey: Map<string, CatalogEntry>,
  catalogIndex: SaleCatalogIndex,
): SaleItemState | null {
  const kind = recordItem.kind ?? (recordItem.key.startsWith('save:') ? 'outfit' : 'entry')

  if (kind === 'outfit') {
    if (!isSaleOutfitSource(recordItem.outfit)) return null
    const subject = outfitSubjectFromSource(recordItem.outfit, catalogIndex)
    if (!subject) return null
    return {
      key: subject.key,
      subject,
      name: recordItem.name || subject.source.name,
      price: '',
      sold: Boolean(recordItem.sold),
      group: group ?? subject.key,
      labels: normalizeLabels(recordItem.labels, subject),
    }
  }

  const entry = entriesByKey.get(recordItem.key)
  if (!entry) return null
  return {
    key: entry.key,
    subject: { kind: 'entry', key: entry.key, entry },
    name: recordItem.name || entry.name,
    price: normalizePrice(recordItem.price ?? ''),
    sold: Boolean(recordItem.sold),
    group: group ?? entry.key,
    labels: [],
  }
}

function normalizeLabels(labels: SaleLabel[] | undefined, subject: OutfitSaleSubject): SaleLabel[] {
  // 字段缺失（旧记录）才补默认整套；空数组代表用户主动取消了全部标签。
  if (!Array.isArray(labels)) {
    return [{ part: 'all', name: subject.source.name, price: '' }]
  }
  const allowed = new Set<SaleLabelPart>(['all', ...subject.wornItems.map((item) => item.part)])
  const seen = new Set<SaleLabelPart>()
  const result: SaleLabel[] = []
  for (const label of labels) {
    if (!label || !isSaleLabelPart(label.part) || !allowed.has(label.part)) continue
    if (seen.has(label.part)) continue
    seen.add(label.part)
    result.push({
      part: label.part,
      name: typeof label.name === 'string' ? label.name : defaultLabelName(subject, label.part),
      price: normalizePrice(typeof label.price === 'string' ? label.price : ''),
    })
  }
  return result
}
