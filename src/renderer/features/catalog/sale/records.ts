import type { SaleLabel, SaleRecord, SaleRecordItem, SaleSize } from './model'
import { isSaleLabelPart, isSaleOutfitSource } from './model'

const STORAGE_KEY = 'pkt-sale-records'
const MAX_RECORDS = 8

/** 读 localStorage 视为外部输入：字段不合法时退回默认值，不把脏数据带进编辑器。 */
export function readSaleRecords(): SaleRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap(toRecord).slice(0, MAX_RECORDS)
  } catch {
    return []
  }
}

export function writeSaleRecords(records: SaleRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, MAX_RECORDS)))
  } catch {
    /* 记录预览过大时只保留当前会话 */
  }
}

function toRecord(value: unknown): SaleRecord[] {
  if (!value || typeof value !== 'object') return []
  const raw = value as Record<string, unknown>
  if (typeof raw.id !== 'string' || typeof raw.preview !== 'string') return []
  if (!Array.isArray(raw.items)) return []

  const items = raw.items.flatMap(toRecordItem)
  if (items.length === 0) return []

  const itemKeys = new Set(items.map((item) => item.key))
  const order = Array.isArray(raw.order)
    ? raw.order.filter((key): key is string => typeof key === 'string' && itemKeys.has(key))
    : []

  return [
    {
      id: raw.id,
      createdAt: numberOr(raw.createdAt, 0),
      template: raw.template === 2 ? 2 : 1,
      size: toSize(raw.size),
      front: raw.front !== false,
      back: raw.back !== false,
      columns: clampInt(raw.columns, 1, 10, 5),
      customRows: raw.customRows === true,
      rowPattern: typeof raw.rowPattern === 'string' ? raw.rowPattern : '',
      gap: clampInt(raw.gap, 0, 40, 16),
      groupGap: clampInt(raw.groupGap, 0, 40, 4),
      showNames: raw.showNames === true,
      order: order.length > 0 ? order : items.map((item) => item.key),
      groups: toStringRecord(raw.groups),
      items,
      preview: raw.preview,
    },
  ]
}

function toRecordItem(value: unknown): SaleRecordItem[] {
  if (!value || typeof value !== 'object') return []
  const raw = value as Record<string, unknown>
  if (typeof raw.key !== 'string') return []

  const labels = Array.isArray(raw.labels) ? raw.labels.flatMap(toLabel) : undefined
  return [
    {
      key: raw.key,
      kind: raw.kind === 'outfit' ? 'outfit' : 'entry',
      name: typeof raw.name === 'string' ? raw.name : '',
      price: typeof raw.price === 'string' ? raw.price : '',
      sold: raw.sold === true,
      labels,
      outfit: isSaleOutfitSource(raw.outfit) ? raw.outfit : undefined,
    },
  ]
}

function toLabel(value: unknown): SaleLabel[] {
  if (!value || typeof value !== 'object') return []
  const raw = value as Record<string, unknown>
  if (!isSaleLabelPart(raw.part)) return []
  return [
    {
      part: raw.part,
      name: typeof raw.name === 'string' ? raw.name : '',
      price: typeof raw.price === 'string' ? raw.price : '',
    },
  ]
}

function toSize(value: unknown): SaleSize {
  return value === 'large' || value === 'small' ? value : 'dual'
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const number = numberOr(value, fallback)
  return Math.max(min, Math.min(max, Math.round(number)))
}

function toStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {}
  const result: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') result[key] = entry
  }
  return result
}
