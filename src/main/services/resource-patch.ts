import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { Catalog } from '../../shared/contract'
import { dataDir } from './paths'

/**
 * 资源增量更新（运行期）。
 *
 * 官方每次发版基本上只会换 **md5 前缀**：文件结构、房型、家具参数都不变。
 * 所以不需要在应用里重跑 `catalog:build`（那要下 15MB 配置再解析 1 万条），
 * 只要拉最新的 `resource_list_*.txt`，把目录里各条目的 md5 换掉即可：
 *
 *   name（如 `furni/dec/dec1417.zip`）,md5
 *
 * 换完之后新图能直接加载（URL 里带 md5），命名/行列/锚点等元数据仍然有效。
 * 目录里没有的全新资源只能统计条数，等下一次重新打包快照。
 */

const HOME = 'https://web.picatown.com/'
const TIMEOUT_MS = 20_000
const PATCH_FILE = 'catalog-patch.json'

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

/** 抓一下官网当前版本标识。 */
export async function fetchLatestVersion(): Promise<{ mainScript: string; resourceList: string }> {
  const html = await getText(HOME)
  const mainScript = /Main_[0-9A-Za-z_.]+\.js/.exec(html)?.[0]
  if (!mainScript) throw new Error('首页没有 Main_*.js')

  const source = await getText(`${HOME}${mainScript}`)
  const resourceList = /resource_list_[0-9_]+\.txt/.exec(source)?.[0]
  if (!resourceList) throw new Error('Main.js 里没有 resource_list')
  return { mainScript, resourceList }
}

export async function fetchResourceList(name: string): Promise<Map<string, string>> {
  const text = await getText(`${HOME}release/res/${name}`)
  const map = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const comma = line.indexOf(',')
    if (comma <= 0) continue
    map.set(line.slice(0, comma), line.slice(comma + 1).trim())
  }
  if (map.size < 1000) throw new Error(`资源清单异常，仅 ${map.size} 条`)
  return map
}

/** 读已落盘的补丁（没有就返回 null）。 */
export async function readCatalogPatch(): Promise<CatalogPatch | null> {
  const raw = await readFile(patchFile(), 'utf8').catch(() => null)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as CatalogPatch
    if (!parsed?.md5 || typeof parsed.md5 !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

/**
 * 把补丁应用到目录上（就地改 md5 / meta）。
 *
 * 只在补丁的 `mainScript` 比快照新时应用，避免把旧补丁扣在新快照上。
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
  // 宠物有两套资源（本体 + 蛋）
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

/** 拉最新清单 → 生成补丁 → 落盘。返回补丁本身（无需更新时返回 null）。 */
export async function buildAndStorePatch(catalog: Catalog): Promise<CatalogPatch | null> {
  const latest = await fetchLatestVersion()
  if (latest.mainScript === catalog.meta.mainScript) return null

  const list = await fetchResourceList(latest.resourceList)
  const md5: Record<string, string> = {}
  let patched = 0
  const known = new Set<string>()

  const collect = (entry: { zip?: string; md5?: string } | null | undefined): void => {
    if (!entry?.zip) return
    known.add(entry.zip)
    const next = list.get(entry.zip)
    if (next && next !== entry.md5) {
      md5[entry.zip] = next
      patched += 1
    }
  }

  for (const entry of catalog.furniture) collect(entry)
  for (const entry of catalog.items) collect(entry)
  for (const entry of catalog.faces) collect(entry)
  for (const entry of catalog.npcs) collect(entry)
  for (const pet of catalog.pets ?? []) {
    collect({ zip: pet.petZip, md5: pet.petMd5 })
    collect({ zip: pet.eggZip, md5: pet.eggMd5 })
  }

  let added = 0
  for (const name of list.keys()) {
    if (!known.has(name)) added += 1
  }

  const patch: CatalogPatch = {
    mainScript: latest.mainScript,
    resourceList: latest.resourceList,
    updatedAt: Date.now(),
    md5,
    patched,
    added,
  }
  await mkdir(dataDir(), { recursive: true })
  await writeFile(patchFile(), JSON.stringify(patch), 'utf8')
  return patch
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

function patchFile(): string {
  return resolve(dataDir(), PATCH_FILE)
}

async function getText(url: string): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'user-agent': 'pktgf-desktop', referer: '' },
  })
  if (!response.ok) throw new Error(`请求失败 ${response.status}: ${url}`)
  return response.text()
}
