import { gunzipSync } from 'fflate'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { Catalog, CatalogPayload } from '../../shared/contract'
import { bundledResourceDir } from './paths'

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

async function readSnapshot(): Promise<{ catalog: Catalog; json: string }> {
  const file = resolve(bundledResourceDir(), 'catalog.json.gz')
  const bytes = await readFile(file)
  const json = new TextDecoder().decode(gunzipSync(new Uint8Array(bytes)))
  const catalog = JSON.parse(json) as Catalog

  if (!catalog.meta || !Array.isArray(catalog.items) || !catalog.assets?.baseActor) {
    throw new Error('目录快照结构不正确，请重新运行 npm run catalog:build')
  }

  return { catalog, json }
}
