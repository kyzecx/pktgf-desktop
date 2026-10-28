import type { SaveRecord } from './contract'

/** 存档导入/导出的文件版本。 */
export const SAVE_BUNDLE_VERSION = 2

export function isSaveRecord(value: unknown): value is SaveRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<SaveRecord>
  return (
    record.version === 2 &&
    typeof record.id === 'string' &&
    (record.kind === 'outfit' || record.kind === 'room') &&
    typeof record.name === 'string' &&
    typeof record.createdAt === 'number' &&
    typeof record.updatedAt === 'number' &&
    typeof record.preview === 'string' &&
    Boolean(record.data) &&
    typeof record.data === 'object'
  )
}

/** 解析导入文件：`{ version: 2, saves }` 或裸数组。 */
export function parseSaveBundle(raw: string): SaveRecord[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!parsed || typeof parsed !== 'object') return []

  const bundle = parsed as { saves?: unknown }
  if (Array.isArray(bundle.saves)) return bundle.saves.filter(isSaveRecord)
  if (Array.isArray(parsed)) return parsed.filter(isSaveRecord)
  return []
}

export function serializeSaveBundle(saves: SaveRecord[]): string {
  return JSON.stringify({ version: SAVE_BUNDLE_VERSION, saves }, null, 2)
}
