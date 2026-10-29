import type { Catalog } from './contract'

/**
 * 目录增量补丁（纯逻辑，不碰 fs/electron）。
 *
 * 官方发版常常只换 md5 前缀：把清单里的 md5 换掉即可，元数据（名字/行列/锚点）
 * 仍然有效。这里只负责「把补丁套到目录对象上」，读写与下载在主进程。
 */

export interface CatalogPatch {
  /** 生成补丁时的 Main_*.js（旧于这个版本的快照才会被补） */
  mainScript: string
  resourceList: string
  updatedAt: number
  /** name → md5 */
  md5: Record<string, string>
  patched: number
  /** 清单里有、目录里没有的文件数（新资源） */
  added: number
}

/** 宠物这类「两个字段一对」的条目。 */
function fixPair(
  entry: object,
  zipKey: string,
  md5Key: string,
  patch: CatalogPatch,
  onChanged: () => void,
): void {
  const record = entry as Record<string, unknown>
  const zip = record[zipKey]
  if (typeof zip !== 'string') return
  const next = patch.md5[zip]
  if (next && next !== record[md5Key]) {
    record[md5Key] = next
    onChanged()
  }
}

/**
 * 把补丁应用到目录上（就地改 md5 / meta）。
 *
 * 只在补丁的 `mainScript` 与快照不同时应用，避免把旧补丁扣在新快照上。
 * 返回替换了多少条。
 */
export function applyPatchToCatalog(catalog: Catalog, patch: CatalogPatch): number {
  if (patch.mainScript === catalog.meta.mainScript) return 0
  let changed = 0

  const fix = (entry: { zip?: string; md5?: string } | null | undefined): void => {
    if (!entry?.zip) return
    const next = patch.md5[entry.zip]
    if (next && next !== entry.md5) {
      entry.md5 = next
      changed += 1
    }
  }

  for (const entry of catalog.furniture) fix(entry)
  for (const entry of catalog.items) fix(entry)
  for (const entry of catalog.faces) fix(entry)
  for (const entry of catalog.npcs) fix(entry)
  for (const pet of catalog.pets ?? []) {
    fixPair(pet, 'petZip', 'petMd5', patch, () => {
      changed += 1
    })
    fixPair(pet, 'eggZip', 'eggMd5', patch, () => {
      changed += 1
    })
  }

  if (changed > 0) {
    catalog.meta = {
      ...catalog.meta,
      mainScript: patch.mainScript,
      resourceList: patch.resourceList,
    }
  }
  return changed
}
