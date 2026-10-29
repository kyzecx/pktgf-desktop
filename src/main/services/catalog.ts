import { gunzipSync } from 'fflate'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { Catalog, CatalogPayload } from '../../shared/contract'
import { bundledResourceDir, dataDir } from './paths'
import { applyPatchToCatalog, readCatalogPatch } from './resource-patch'

let cached: { catalog: Catalog; json: string } | null = null
let loading: Promise<{ catalog: Catalog; json: string }> | null = null

/**
 * 目录快照随包分发，冷启动只需读一个 700KB 的 gz。
 * 官方更新后由 `catalog:build` 重新生成；运行期不做增量拼接。
 */
export async function loadCatalog(): Promise<CatalogPayload> {
  if (cached) return toPayload(cached)
  if (!loading) {
    loading = readSnapshot().finally(() => {
      loading = null
    })
  }
  cached = await loading
  return toPayload(cached)
}

function toPayload(entry: { catalog: Catalog; json: string }): CatalogPayload {
  return { json: entry.json, meta: entry.catalog.meta, assets: entry.catalog.assets }
}

/** 完整的目录对象（增量更新要就地改 md5，所以必须拿到解析后的结构）。 */
export async function loadCatalogFull(): Promise<Catalog> {
  if (cached) return cached.catalog
  if (!loading) {
    loading = readSnapshot().finally(() => {
      loading = null
    })
  }
  cached = await loading
  return cached.catalog
}

/** 目录被自动更新后要重新读一次快照。 */
export function resetCatalogCache(): void {
  cached = null
}

/** 应用内重建的目录快照（优先于随包分发的版本）。 */
export function runtimeCatalogFile(): string {
  return resolve(dataDir(), 'catalog.json.gz')
}

async function readSnapshot(): Promise<{ catalog: Catalog; json: string }> {
  // 应用内自动更新下载重建的快照优先
  const runtime = await readFile(runtimeCatalogFile()).catch(() => null)
  if (runtime) {
    try {
      const json = new TextDecoder().decode(gunzipSync(new Uint8Array(runtime)))
      const catalog = JSON.parse(json) as Catalog
      if (catalog?.meta?.mainScript && Array.isArray(catalog.furniture)) {
        return { catalog, json }
      }
    } catch {
      // 快照坏了就用随包的那份
    }
  }

  const file = resolve(bundledResourceDir(), 'catalog.json.gz')
  const bytes = await readFile(file)
  const json = new TextDecoder().decode(gunzipSync(new Uint8Array(bytes)))
  const catalog = JSON.parse(json) as Catalog

  if (!catalog.meta || !Array.isArray(catalog.items) || !catalog.assets?.baseActor) {
    throw new Error('目录快照结构不正确，请重新运行 npm run catalog:build')
  }

  // 有增量补丁就先把 md5 换掉（官方只换 md5 前缀时不用重建整个快照）
  const patch = await readCatalogPatch()
  if (patch) {
    const changed = applyPatchToCatalog(catalog, patch)
    if (changed > 0) return { catalog, json: JSON.stringify(catalog) }
  }

  return { catalog, json }
}
