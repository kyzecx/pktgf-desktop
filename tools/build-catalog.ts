/**
 * 构建官方服饰目录快照。
 *
 * 同时加载 4 个 config 会超过 15MB，运行时不可能每次都拉；
 * 这里在构建期把它们压成一份紧凑快照（含 md5，运行期直接拼 URL）。
 *
 *   npm run catalog:build
 *
 * 输出：resources/catalog.json.gz
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { gzipSync } from 'fflate'

import { openBundle, stripBom } from '../src/engine/bundle.ts'
import type { Part } from '../src/engine/types.ts'

const BASE = 'https://web.picatown.com'
const OUT = resolve('resources/catalog.json.gz')

/** 衣柜分类图标的来源：官方基础 UI 资源包。 */
const UI_ICON_PACKAGE = 'uiRes.zip'

/**
 * 部位 → uiRes 符号名。
 *
 * 官方衣柜有 9 个部位页，符号名与部位一一对应；`bear`（背饰）
 * 没有独立页签，借「收藏」图标兜底，避免这一格空白。
 */
const UI_ICON_SYMBOLS: Record<Part, string> = {
  hair: 'icon_hair',
  cset: 'icon_cset',
  hats: 'icon_hats',
  mask: 'icon_mask',
  glas: 'icon_glas',
  clot: 'icon_clot',
  pant: 'icon_pant',
  coat: 'icon_coat',
  bear: 'icon_collection',
  wing: 'icon_wing',
}

/** ActorModel.setCostume 支持的部位；`ying` 是遗留字段，不渲染。 */
const RENDERABLE_PARTS: Part[] = [
  'hair',
  'cset',
  'hats',
  'mask',
  'glas',
  'clot',
  'pant',
  'coat',
  'bear',
  'wing',
]

interface CostumeConfigEntry {
  type: number
  part: string
  serial: number
  sex?: number
  useMask?: boolean
  coverHead?: boolean
  displaytemplate?: boolean
  motionName?: string
}

interface PropConfigEntry {
  type: number
  classID?: number
  name?: string
  description?: string
}

interface FurniConfigEntry {
  type: number
  code?: string
  gridW?: number
  gridH?: number
  direction?: number
}

interface DecoConfigEntry {
  type: number
  code?: string
  gridW?: number
  gridH?: number
  direction?: number
}

interface PetConfigEntry {
  type: number
  code?: string
  name?: string
  eggType?: number
  gridW?: number
  gridH?: number
}

interface PetEggConfigEntry {
  type: number
  code?: string
}

interface FaceLookConfigEntry {
  type: number
  name?: string
  serial?: number
  available?: boolean | number
}

export interface CatalogItem {
  code: string
  part: Part
  type: number
  sex: 0 | 1 | 2
  serial: number
  name: string
  description: string
  zip: string
  md5: string
  useMask: boolean
  coverHead: boolean
  displaytemplate: boolean
  motion: string | null
}

export interface CatalogFace {
  code: string
  type: number
  name: string
  zip: string
  md5: string
}

export interface CatalogUiIcons {
  key: string
  md5: string
  symbols: Partial<Record<Part, string>>
}

export interface CatalogFurniture {
  code: string
  type: number
  name: string
  description: string
  category: string
  zip: string
  md5: string
  gridW: number
  gridH: number
  direction: number
}

export interface CatalogPet {
  code: string
  type: number
  name: string
  eggCode: string
  petZip: string
  petMd5: string
  eggZip: string
  eggMd5: string
  gridW: number
  gridH: number
}

export interface Catalog {
  meta: {
    mainScript: string
    resourceList: string
    builtAt: string
    counts: Record<string, number>
  }
  assets: {
    baseActor: { key: string; md5: string }
    uiIcons: CatalogUiIcons
  }
  faces: CatalogFace[]
  motions: Record<string, Array<{ frame: number; duration: number }>>
  items: CatalogItem[]
  furniture: CatalogFurniture[]
  pets: CatalogPet[]
}

async function main(): Promise<void> {
  console.log('· 发现资源版本…')
  const html = await getText(`${BASE}/`)
  const mainScript = /Main_[0-9A-Za-z_.]+\.js/.exec(html)?.[0]
  if (!mainScript) throw new Error('首页没有 Main_*.js')

  const source = await getText(`${BASE}/${mainScript}`)
  const resourceListName = /resource_list_[0-9_]+\.txt/.exec(source)?.[0]
  if (!resourceListName) throw new Error('Main.js 里没有 resource_list')

  console.log('· 下载资源清单…')
  const resourceList = parseResourceList(await getText(`${BASE}/release/res/${resourceListName}`))

  console.log('· 准备分类图标…')
  const uiIcons = await buildUiIcons(resourceList)

  console.log('· 下载配置…')
  const [
    costumeConfig,
    propConfig,
    faceLookConfig,
    animalMotionConfig,
    furniConfig,
    decoConfig,
    petConfig,
    petEggConfig,
  ] = await Promise.all([
    getConfig<CostumeConfigEntry[]>('config/costumeConfig.json', resourceList),
    getConfig<PropConfigEntry[]>('config/propConfig.json', resourceList),
    getConfig<FaceLookConfigEntry[]>('config/faceLookConfig.json', resourceList),
    getConfig<Record<string, Array<{ frame: number; duration: number }>>>(
      'config/animalMotionConfig.json',
      resourceList,
    ),
    getConfig<FurniConfigEntry[]>('config/furniConfig.json', resourceList),
    getConfig<DecoConfigEntry[]>('config/decoConfig.json', resourceList),
    getConfig<PetConfigEntry[]>('config/petConfig.json', resourceList),
    getConfig<PetEggConfigEntry[]>('config/petEggConfig.json', resourceList),
  ])

  const names = new Map<number, PropConfigEntry>()
  for (const entry of propConfig) names.set(entry.type, entry)

  const items = buildItems(costumeConfig, names, resourceList)
  const faces = buildFaces(faceLookConfig, resourceList)
  const furniture = buildFurniture(furniConfig, decoConfig, names, resourceList)
  const pets = buildPets(petConfig, petEggConfig, names, resourceList)

  const baseActorKey = pickLatestActor(resourceList)
  const baseActor = { key: baseActorKey, md5: resourceList.get(baseActorKey) ?? '' }

  const counts: Record<string, number> = {}
  for (const item of items) counts[item.part] = (counts[item.part] ?? 0) + 1
  counts.furniture = furniture.length
  counts.pets = pets.length

  const catalog: Catalog = {
    meta: {
      mainScript,
      resourceList: resourceListName,
      builtAt: new Date().toISOString(),
      counts,
    },
    assets: { baseActor, uiIcons },
    faces,
    motions: animalMotionConfig,
    items,
    furniture,
    pets,
  }

  const json = JSON.stringify(catalog)
  await mkdir(resolve('resources'), { recursive: true })
  await writeFile(OUT, gzipSync(new TextEncoder().encode(json), { level: 9 }))

  console.log(`· 已写入 ${OUT}`)
  console.log(`  原始 ${(json.length / 1024 / 1024).toFixed(2)} MB`)
  console.log(`  条目 ${items.length} · 表情 ${faces.length}`)
  console.log(`  家具 ${furniture.length} · 宠物 ${pets.length}`)
  console.log(`  分类图标 ${Object.keys(uiIcons.symbols).length} 个（${uiIcons.key}）`)
  console.log(
    '  分类:',
    Object.entries(counts)
      .map(([k, v]) => `${k}=${v}`)
      .join(' '),
  )
}

export function buildItems(
  costumeConfig: CostumeConfigEntry[],
  names: Map<number, PropConfigEntry>,
  resourceList: Map<string, string>,
): CatalogItem[] {
  const items: CatalogItem[] = []
  const seen = new Set<string>()

  for (const entry of costumeConfig) {
    const part = entry.part as Part
    if (!RENDERABLE_PARTS.includes(part)) continue
    if (typeof entry.serial !== 'number' || !Number.isFinite(entry.serial)) continue
    if (typeof entry.type !== 'number') continue

    const sex: 0 | 1 | 2 = entry.sex === 1 ? 1 : entry.sex === 2 ? 2 : 0
    const code = buildCode(sex, part, entry.serial)
    const folder = sex === 1 ? 'boy' : sex === 2 ? 'girl' : 'all'
    const zip = `actorCostume/${folder}/${code}.zip`
    const md5 = resourceList.get(zip)
    if (!md5) continue

    // 同一个 zip 可能被多个 type 引用（换色），按 code 去重但保留首个名称。
    const key = `${code}:${entry.type}`
    if (seen.has(key)) continue
    seen.add(key)

    const prop = names.get(entry.type)
    items.push({
      code,
      part,
      type: entry.type,
      sex,
      serial: entry.serial,
      name: prop?.name?.trim() || code,
      description: prop?.description?.trim() || '',
      zip,
      md5,
      useMask: Boolean(entry.useMask),
      coverHead: Boolean(entry.coverHead),
      displaytemplate: Boolean(entry.displaytemplate),
      motion: entry.motionName?.trim() || null,
    })
  }

  items.sort((a, b) => a.part.localeCompare(b.part) || a.serial - b.serial || a.sex - b.sex)
  return items
}

/**
 * 家具/墙纸/地板共用同一套符号包格式。
 * 代码前缀决定资源目录；propConfig 提供中文名。
 */
export function buildFurniture(
  furniConfig: FurniConfigEntry[],
  decoConfig: DecoConfigEntry[],
  names: Map<number, PropConfigEntry>,
  resourceList: Map<string, string>,
): CatalogFurniture[] {
  const items: CatalogFurniture[] = []
  const seen = new Set<string>()

  for (const entry of [...furniConfig, ...decoConfig]) {
    const code = String(entry.code ?? '').trim()
    if (!code || seen.has(code)) continue

    const folder = code.startsWith('door')
      ? 'door'
      : code.startsWith('wall')
        ? 'wall'
        : code.startsWith('tile')
          ? 'floor'
          : 'furni'
    const zip = `${folder}/${code}.zip`
    const md5 = resourceList.get(zip)
    if (!md5) continue

    const prop = names.get(entry.type)
    const category = code.startsWith('door')
      ? 'door'
      : code.startsWith('wall')
        ? 'wall'
        : code.startsWith('tile')
          ? 'tile'
          : code.slice(0, 3).toLowerCase()

    seen.add(code)
    items.push({
      code,
      type: Number(entry.type) || 0,
      name: prop?.name?.trim() || code,
      description: prop?.description?.trim() || '',
      category,
      zip,
      md5,
      gridW: Number(entry.gridW) || 1,
      gridH: Number(entry.gridH) || 1,
      direction: Number(entry.direction) || 1,
    })
  }

  items.sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      a.name.localeCompare(b.name, 'zh-CN') ||
      a.code.localeCompare(b.code),
  )
  return items
}

/** 宠物本体和蛋分别从 pet/、egg/ 目录取；两者都存在才入图鉴。 */
export function buildPets(
  petConfig: PetConfigEntry[],
  petEggConfig: PetEggConfigEntry[],
  names: Map<number, PropConfigEntry>,
  resourceList: Map<string, string>,
): CatalogPet[] {
  const eggs = new Map<number, PetEggConfigEntry>()
  for (const egg of petEggConfig) {
    if (typeof egg.type === 'number') eggs.set(egg.type, egg)
  }

  const pets: CatalogPet[] = []
  for (const entry of petConfig) {
    const code = String(entry.code ?? '').trim()
    const egg = eggs.get(Number(entry.eggType))
    const eggCode = String(egg?.code ?? '').trim()
    if (!code || !eggCode) continue

    const petZip = `pet/${code}.zip`
    const eggZip = `egg/${eggCode}.zip`
    const petMd5 = resourceList.get(petZip)
    const eggMd5 = resourceList.get(eggZip)
    if (!petMd5 || !eggMd5) continue

    const prop = names.get(entry.type)
    pets.push({
      code,
      type: Number(entry.type) || 0,
      name: entry.name?.trim() || prop?.name?.trim() || code,
      eggCode,
      petZip,
      petMd5,
      eggZip,
      eggMd5,
      gridW: Number(entry.gridW) || 1,
      gridH: Number(entry.gridH) || 1,
    })
  }

  pets.sort((a, b) => a.type - b.type || a.code.localeCompare(b.code))
  return pets
}

export function buildFaces(
  faceLookConfig: FaceLookConfigEntry[],
  resourceList: Map<string, string>,
): CatalogFace[] {
  const faces: CatalogFace[] = []
  for (const entry of faceLookConfig) {
    if (typeof entry.type !== 'number') continue
    if (entry.available === false || entry.available === 0) continue

    const code = `face001_head${String(entry.type).padStart(3, '0')}`
    const zip = `faceLook/${code}.zip`
    const md5 = resourceList.get(zip)
    if (!md5) continue
    faces.push({ code, type: entry.type, name: entry.name?.trim() || code, zip, md5 })
  }
  faces.sort((a, b) => a.type - b.type)
  return faces
}

/**
 * 从 uiRes.zip 解析出分类图标符号。
 *
 * 资源清单里没有符号表，只有完整包；这里只校验符号是否存在，
 * 运行期再由渲染层按需取图，避免把官方素材打进安装包。
 */
async function buildUiIcons(resourceList: Map<string, string>): Promise<CatalogUiIcons> {
  const md5 = resourceList.get(UI_ICON_PACKAGE)
  if (!md5) throw new Error(`资源清单缺少 ${UI_ICON_PACKAGE}，无法生成分类图标`)

  const bytes = await getBytes(`${BASE}/release/res/${md5}_${UI_ICON_PACKAGE}`)
  const bundle = openBundle(bytes)
  const missing = Object.values(UI_ICON_SYMBOLS).filter((name) => !bundle.symbols.has(name))
  if (missing.length > 0) {
    throw new Error(`${UI_ICON_PACKAGE} 缺少分类图标符号: ${missing.join(', ')}`)
  }

  return { key: UI_ICON_PACKAGE, md5, symbols: UI_ICON_SYMBOLS }
}

/** 资源清单里版本号最大的 actor<ver>.zip 即基础角色包。 */
function pickLatestActor(resourceList: Map<string, string>): string {
  let best = ''
  let version = -1
  for (const key of resourceList.keys()) {
    const match = /^actor(\d+)\.zip$/.exec(key)
    if (!match) continue
    const value = Number(match[1])
    if (value > version) {
      version = value
      best = key
    }
  }
  if (!best) throw new Error('资源清单里没有 actor<ver>.zip')
  return best
}

function buildCode(sex: 0 | 1 | 2, part: string, serial: number): string {
  const prefix = sex === 1 ? 'm' : sex === 2 ? 'f' : 'u'
  return `${prefix}_${part}${String(serial).padStart(3, '0')}`
}

function parseResourceList(text: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const comma = line.indexOf(',')
    if (comma <= 0) continue
    map.set(line.slice(0, comma), line.slice(comma + 1).trim())
  }
  if (map.size < 1000) throw new Error(`资源清单异常，仅 ${map.size} 条`)
  return map
}

async function getConfig<T>(key: string, resourceList: Map<string, string>): Promise<T> {
  const md5 = resourceList.get(key)
  if (!md5) throw new Error(`资源清单缺少 ${key}`)
  const slash = key.lastIndexOf('/')
  const url = `${BASE}/release/res/${key.slice(0, slash + 1)}${md5}_${key.slice(slash + 1)}`
  const text = await getText(url)
  return JSON.parse(stripBom(text)) as T
}

async function getText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { 'user-agent': 'pktgf-desktop/catalog-builder' } })
  if (!response.ok) throw new Error(`请求失败 ${response.status}: ${url}`)
  return response.text()
}

async function getBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { headers: { 'user-agent': 'pktgf-desktop/catalog-builder' } })
  if (!response.ok) throw new Error(`请求失败 ${response.status}: ${url}`)
  return new Uint8Array(await response.arrayBuffer())
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
