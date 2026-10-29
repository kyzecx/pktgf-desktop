/**
 * 构建官方目录快照（**主进程也能跑**，所以应用内可以自动更新）。
 *
 * 同时加载 15 个 config 会超过 15MB，运行时不可能每次都拉；
 * 这里把它们压成一份紧凑快照（含 md5，运行期直接拼 URL）。
 *
 * - CLI：`npm run catalog:build` → `resources/catalog.json.gz`
 * - 应用内：官方发新版后由 `version-watch` 调用，写到 userData 并热替换，
 *   这样**不用重新发版**也能跟上新家具 / 新房型 / 新部位。
 */
import { gzipSync } from 'fflate'

import { openBundle, stripBom } from '../../engine/bundle'
import type { Part } from '../../engine/types'

const BASE = 'https://web.picatown.com'

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

/**
 * 官方 furniConfig 条目。
 *
 * 致命坑：`gridW` 是 Y 方向（行），`gridH` 才是 X 方向（列），
 * 与直觉相反（docs/room-spec.md §1.2）。快照里统一改名为 rows / cols。
 */
interface FurniConfigEntry {
  type: number
  code?: string
  gridW?: number
  gridH?: number
  /** 1=单向 2=两向 4=四向 */
  direction?: number
  baseLoc?: string
  surfaceLoc?: string
  /** 1 地面 / 2 地毯 / 3,4 挂墙 / 5 靠墙 / 6..8 特殊 */
  position?: number
  usage?: number
  meOverOther?: number
  otherOverMe?: number
  behaviour?: string
  functionType?: string
  animation?: string
  animationMode?: number
  symetric?: boolean
  lightLoc?: string
  lightColor?: string
  lightIntensity?: number
  lightMode?: number
}

interface DecoConfigEntry {
  type: number
  code?: string
  gridW?: number
  gridH?: number
  /** 1 墙纸 / 2 地板 / 3 门 */
  category?: number
}

interface RoomConfigEntry {
  type: number
  category?: number
  typeName?: string
  gridW?: number
  gridH?: number
  entryX?: number
  entryY?: number
  entryDir?: number
  exitx?: number
  exity?: number
  exitDir?: number
  defaultTile?: number
  defaultWall?: number
  defaultDoor?: number
  defaultBg?: number
  defaultStructure?: number
  maxFurni?: number
  wallHeight?: number
  /** 地板厚度 */
  tileDepth?: number
  wallDepth?: number
  picWH?: string
  gridOffset?: string
  ifDefaultImg?: number
  ifCombineRoom?: number
  available?: number
}

interface RoomMapEntry {
  type: number
  map?: string
}

interface NpcConfigEntry {
  type: number
  code?: string
  name?: string
  subType?: string
  gridW?: number
  gridH?: number
  baseLoc?: string
  defaultMoveSpeed?: string
  moveStyle?: string
  standStyle?: string
  selfMotion?: string
  width?: number
  height?: number
  cosType?: number
}

/** 官方 motionConfig 的一步；arms3 / arms7 是按朝向覆写。 */
interface MotionStepEntry {
  duration?: number
  arms?: number
  legs?: number
  hair?: number
  face?: number
  dir?: number
  facing?: number
  offset?: string
  arms3?: number
  arms7?: number
  legs3?: number
  legs7?: number
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
  itemZip?: string
  itemMd5?: string
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
  kind: 'furni' | 'tile' | 'wall' | 'door'
  serial: number
  zip: string
  md5: string
  rows: number
  cols: number
  dirable: 1 | 2 | 4
  symetric: boolean
  baseLoc: string
  surfaceLoc: string | null
  position: number
  usage: number
  meOverOther: boolean
  otherOverMe: 0 | 1 | 2
  behaviour: string | null
  functionType: string | null
  motion?: string | null
  motionFrames?: Array<{ frame: number; duration: number }>
  motionTime?: number
  animationMode: number
  light?: { loc: string; color: string; intensity: number; mode: number } | null
}

export interface CatalogRoomDef {
  type: number
  category: number
  name: string
  rows: number
  cols: number
  entryX: number
  entryY: number
  entryDir: 1 | 3 | 5 | 7
  exitX: number
  exitY: number
  exitDir: 1 | 3 | 5 | 7
  defaultTile: number
  defaultWall: number
  defaultDoor: number
  defaultBg: number
  defaultStructure: number
  maxFurni: number
  wallHeight: number
  floorDepth: number
  wallDepth: number
  picWH: string
  gridOffset: string
  scene: { zip: string; md5: string } | null
  tmx: { key: string; md5: string } | null
  ifDefaultImg: number
  combine: number
}

export interface CatalogRoomMap {
  type: number
  map: string
}

export interface CatalogNpcDef {
  type: number
  code: string
  name: string
  subType: string | null
  rows: number
  cols: number
  baseLoc: string
  moveSpeed: string
  moveStyle: string | null
  standStyle: string | null
  selfMotion: string | null
  width: number
  height: number
  cosType: number
  zip: string
  md5: string
}

export interface CatalogMotionStep {
  duration?: number
  arms?: number
  legs?: number
  hair?: number
  face?: number
  dir?: 1 | 3 | 5 | 7
  facing?: 1 | 3 | 5 | 7
  offset?: string
  byDir?: Partial<Record<1 | 3 | 5 | 7, { arms?: number; legs?: number }>>
}

interface MotionFrame {
  serial?: number
  duration?: number
}

interface FurniMotionConfig {
  frames?: MotionFrame[]
  /** 官方整组时序；0 / 缺省表示按帧循环 */
  time?: number
}

interface PetMotionStep {
  frame: number
  duration?: number
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
  motionFrames?: Array<{ frame: number; duration: number }>
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
    tmxRes?: { key: string; md5: string }
  }
  faces: CatalogFace[]
  motions: Record<string, Array<{ frame: number; duration: number }>>
  items: CatalogItem[]
  furniture: CatalogFurniture[]
  pets: CatalogPet[]
  rooms: CatalogRoomDef[]
  roomMaps: CatalogRoomMap[]
  npcs: CatalogNpcDef[]
  actorMotions: Record<string, CatalogMotionStep[]>
  npcMotions: Record<string, Array<{ frame: number; duration: number }>>
}

export interface BuildCatalogOptions {
  /** 进度回调：stage 是给人看的短语 */
  onProgress?: (stage: string) => void
}

export interface BuiltCatalog {
  /** 压缩后的 catalog.json.gz 内容 */
  gz: Uint8Array
  /** 快照元信息（版本、条目数） */
  meta: { mainScript: string; resourceList: string; counts: Record<string, number> }
}

/** 拉官方配置并构建整份目录快照。 */
export async function buildCatalog(options: BuildCatalogOptions = {}): Promise<BuiltCatalog> {
  const report = options.onProgress ?? (() => undefined)
  report('发现资源版本…')
  const html = await getText(`${BASE}/`)
  const mainScript = /Main_[0-9A-Za-z_.]+\.js/.exec(html)?.[0]
  if (!mainScript) throw new Error('首页没有 Main_*.js')

  const source = await getText(`${BASE}/${mainScript}`)
  const resourceListName = /resource_list_[0-9_]+\.txt/.exec(source)?.[0]
  if (!resourceListName) throw new Error('Main.js 里没有 resource_list')

  report('下载资源清单…')
  const resourceList = parseResourceList(await getText(`${BASE}/release/res/${resourceListName}`))

  report('准备分类图标…')
  const uiIcons = await buildUiIcons(resourceList)

  report('下载配置（15 个）…')
  const [
    costumeConfig,
    propConfig,
    faceLookConfig,
    animalMotionConfig,
    furniConfig,
    decoConfig,
    petConfig,
    petEggConfig,
    furniMotionConfig,
    petMotionConfig,
    roomConfig,
    roomMapConfig,
    npcConfig,
    motionConfig,
    npcMotionConfig,
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
    getConfig<Record<string, FurniMotionConfig>>('config/furniMotionConfig.json', resourceList),
    getConfig<Record<string, PetMotionStep[]>>('config/petMotionConfig.json', resourceList),
    getConfig<RoomConfigEntry[]>('config/roomConfig.json', resourceList),
    getConfig<RoomMapEntry[]>('config/roomMapConfig.json', resourceList),
    // NPC 配置在 config/picatown/ 子目录下。
    getConfig<NpcConfigEntry[]>('config/picatown/npcConfig.json', resourceList),
    getConfig<Record<string, MotionStepEntry[]>>('config/motionConfig.json', resourceList),
    getConfig<Record<string, Array<{ frame?: number; duration?: number }>>>(
      'config/npcMotionConfig.json',
      resourceList,
    ),
  ])

  const names = new Map<number, PropConfigEntry>()
  for (const entry of propConfig) names.set(entry.type, entry)

  const items = buildItems(costumeConfig, names, resourceList)
  const faces = buildFaces(faceLookConfig, resourceList)
  const furniture = buildFurniture(furniConfig, decoConfig, names, resourceList, furniMotionConfig)
  const pets = buildPets(petConfig, petEggConfig, names, resourceList, petMotionConfig)
  const rooms = buildRooms(roomConfig, resourceList)
  const roomMaps = buildRoomMaps(roomMapConfig)
  const npcs = buildNpcs(npcConfig, names, resourceList)
  const actorMotions = buildActorMotions(motionConfig)
  const npcMotions = buildNpcMotions(npcMotionConfig)

  const tmxResKey = 'tmxRes.zip'
  const tmxResMd5 = resourceList.get(tmxResKey)
  const tmxRes = tmxResMd5 ? { key: tmxResKey, md5: tmxResMd5 } : undefined
  const baseActorKey = pickLatestActor(resourceList)
  const baseActor = { key: baseActorKey, md5: resourceList.get(baseActorKey) ?? '' }

  const counts: Record<string, number> = {}
  for (const item of items) counts[item.part] = (counts[item.part] ?? 0) + 1
  counts.furniture = furniture.length
  counts.pets = pets.length
  counts.rooms = rooms.length
  counts.roomMaps = roomMaps.length
  counts.npcs = npcs.length
  counts.actorMotions = Object.keys(actorMotions).length
  counts.npcMotions = Object.keys(npcMotions).length

  const catalog: Catalog = {
    meta: {
      mainScript,
      resourceList: resourceListName,
      builtAt: new Date().toISOString(),
      counts,
    },
    assets: { baseActor, uiIcons, ...(tmxRes ? { tmxRes } : {}) },
    faces,
    motions: animalMotionConfig,
    items,
    furniture,
    pets,
    rooms,
    roomMaps,
    npcs,
    actorMotions,
    npcMotions,
  }

  report('压缩快照…')
  const json = JSON.stringify(catalog)
  return {
    gz: gzipSync(new TextEncoder().encode(json), { level: 9 }),
    meta: { mainScript, resourceList: resourceListName, counts },
  }
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
    const itemZip = `item/itm${entry.serial}.zip`
    const itemMd5 = resourceList.get(itemZip)

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
      itemZip: itemMd5 ? itemZip : undefined,
      itemMd5,
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
  motions: Record<string, FurniMotionConfig>,
): CatalogFurniture[] {
  const items: CatalogFurniture[] = []
  const seen = new Set<string>()

  for (const raw of [...furniConfig, ...decoConfig]) {
    const code = String(raw.code ?? '').trim()
    if (!code || seen.has(code)) continue

    const kind = decoKind(code)
    const folder =
      kind === 'door' ? 'door' : kind === 'wall' ? 'wall' : kind === 'tile' ? 'floor' : 'furni'
    const zip = `${folder}/${code}.zip`
    const md5 = resourceList.get(zip)
    if (!md5) continue

    const entry = raw as FurniConfigEntry
    const prop = names.get(entry.type)
    const category = kind === 'furni' ? code.slice(0, 3).toLowerCase() : kind

    // 官方 animation 是 furniMotionConfig 的 key；"0" / 空串表示不动。
    const animation = String(entry.animation ?? '').trim()
    const motion = animation && animation !== '0' ? animation : null
    const group = motion ? motions[motion] : undefined
    const motionFrames = (group?.frames ?? [])
      .map((frame) => ({
        frame: Number(frame.serial) || 0,
        duration: Math.max(0, Number(frame.duration) || 100),
      }))
      .filter((frame) => frame.frame > 0)

    const lightLoc = String(entry.lightLoc ?? '').trim()
    const hasLight = lightLoc.length > 0

    seen.add(code)
    items.push({
      code,
      type: Number(entry.type) || 0,
      name: prop?.name?.trim() || code,
      description: prop?.description?.trim() || '',
      category,
      kind,
      serial: codeSerial(code),
      zip,
      md5,
      rows: Math.max(1, Number(entry.gridW) || 1),
      cols: Math.max(1, Number(entry.gridH) || 1),
      dirable: normalizeDirable(entry.direction, kind),
      symetric: Boolean(entry.symetric),
      baseLoc: String(entry.baseLoc ?? '').trim(),
      surfaceLoc: String(entry.surfaceLoc ?? '').trim() || null,
      position: Number(entry.position) || 0,
      usage: Number(entry.usage) || 3,
      meOverOther: Number(entry.meOverOther) === 1,
      otherOverMe: clampOverMe(entry.otherOverMe),
      behaviour: String(entry.behaviour ?? '').trim() || null,
      functionType: String(entry.functionType ?? '').trim() || null,
      motion,
      motionFrames: motionFrames.length > 0 ? motionFrames : undefined,
      motionTime: group?.time ? Number(group.time) : undefined,
      animationMode: Number(entry.animationMode) || 0,
      light: hasLight
        ? {
            loc: lightLoc,
            color: String(entry.lightColor ?? '').trim(),
            intensity: Number(entry.lightIntensity) || 0,
            mode: Number(entry.lightMode) || 0,
          }
        : null,
    })
  }

  items.sort(
    (a, b) =>
      a.kind.localeCompare(b.kind) ||
      a.category.localeCompare(b.category) ||
      a.name.localeCompare(b.name, 'zh-CN') ||
      a.code.localeCompare(b.code),
  )
  return items
}

/** 整图房的整间图：`scene/roomimg_<type>.zip`（资源清单里有才算）。 */
function sceneZipOf(
  type: number,
  resourceList: Map<string, string>,
): { zip: string; md5: string } | null {
  const zip = `scene/roomimg_${type}.zip`
  const md5 = resourceList.get(zip)
  return md5 ? { zip, md5 } : null
}

/** TMX 场景房：`scene/map/<type>.tmx`。 */
function tmxOf(
  type: number,
  resourceList: Map<string, string>,
): { key: string; md5: string } | null {
  const key = `scene/map/${type}.tmx`
  const md5 = resourceList.get(key)
  return md5 ? { key, md5 } : null
}

/** 代码尾部数字即序号：tile0001 → 1，cha0012 → 12。 */
function codeSerial(code: string): number {
  const match = /(\d+)$/.exec(code)
  return match ? Number(match[1]) : 0
}

/** 代码前缀决定资源目录与类别。 */
function decoKind(code: string): CatalogFurniture['kind'] {
  if (code.startsWith('door')) return 'door'
  if (code.startsWith('wall')) return 'wall'
  if (code.startsWith('tile')) return 'tile'
  return 'furni'
}

/** 地板/墙纸/门不支持旋转；家具按 direction 1/2/4 归一。 */
function normalizeDirable(
  direction: number | undefined,
  kind: CatalogFurniture['kind'],
): 1 | 2 | 4 {
  if (kind !== 'furni') return 2
  const value = Number(direction) || 1
  return value === 4 ? 4 : value === 2 ? 2 : 1
}

function clampOverMe(value: number | undefined): 0 | 1 | 2 {
  const n = Number(value) || 0
  return n === 1 ? 1 : n === 2 ? 2 : 0
}

/** 房型：官方 gridW/gridH 换成 rows/cols，避免继续传反直觉的命名。 */
export function buildRooms(
  roomConfig: RoomConfigEntry[],
  resourceList: Map<string, string>,
): CatalogRoomDef[] {
  const rooms: CatalogRoomDef[] = []
  for (const entry of roomConfig) {
    if (typeof entry.type !== 'number') continue
    // available=0 只是「不再新售」，玩家已有的房间仍然要能打开，所以不过滤。
    rooms.push({
      type: entry.type,
      category: Number(entry.category) || 1,
      name: String(entry.typeName ?? '').trim() || `房型 ${entry.type}`,
      rows: Math.max(1, Number(entry.gridW) || 1),
      cols: Math.max(1, Number(entry.gridH) || 1),
      // 官方 Room.setType：entryX = config.entryY、entryY = config.entryX（互换）
      entryX: Number(entry.entryY) || 0,
      entryY: Number(entry.entryX) || 0,
      entryDir: normalizeDir(entry.entryDir),
      exitX: Number(entry.exitx) || 0,
      exitY: Number(entry.exity) || 0,
      exitDir: normalizeDir(entry.exitDir),
      defaultTile: Number(entry.defaultTile) || 0,
      defaultWall: Number(entry.defaultWall) || 0,
      defaultDoor: Number(entry.defaultDoor) || 0,
      defaultBg: Number(entry.defaultBg) || 0,
      defaultStructure: Number(entry.defaultStructure) || 0,
      maxFurni: Number(entry.maxFurni) || 200,
      wallHeight: Number(entry.wallHeight) || 128,
      floorDepth: Number(entry.tileDepth) || 8,
      wallDepth: Number(entry.wallDepth) || 4,
      picWH: String(entry.picWH ?? '').trim(),
      gridOffset: String(entry.gridOffset ?? '').trim(),
      scene: sceneZipOf(entry.type, resourceList),
      tmx: tmxOf(entry.type, resourceList),
      ifDefaultImg: Number(entry.ifDefaultImg) || 0,
      combine: Number(entry.ifCombineRoom) || 0,
    })
  }
  rooms.sort((a, b) => a.category - b.category || a.type - b.type)
  return rooms
}

/** 只有 1/3/5/7 合法；非法值按官方默认 3 处理。 */
function normalizeDir(value: number | undefined): 1 | 3 | 5 | 7 {
  const n = Number(value)
  return n === 1 || n === 5 || n === 7 ? n : 3
}

/** 房间结构图：先去掉空行/尾部分隔符，再统一成 a,b,c&d,e,f。 */
export function buildRoomMaps(roomMapConfig: RoomMapEntry[]): CatalogRoomMap[] {
  const maps: CatalogRoomMap[] = []
  for (const entry of roomMapConfig) {
    if (typeof entry.type !== 'number') continue
    const raw = String(entry.map ?? '').trim()
    if (!raw) continue
    const rows = raw
      .split('&')
      .map((row) => row.trim().replace(/,$/, ''))
      .filter((row) => row.length > 0)
    if (rows.length === 0) continue
    maps.push({ type: entry.type, map: rows.join('&') })
  }
  maps.sort((a, b) => a.type - b.type)
  return maps
}

/** NPC：官方 baseLoc 是像素锚点，直接原样保留。 */
export function buildNpcs(
  npcConfig: NpcConfigEntry[],
  names: Map<number, PropConfigEntry>,
  resourceList: Map<string, string>,
): CatalogNpcDef[] {
  const npcs: CatalogNpcDef[] = []
  const seen = new Set<string>()
  for (const entry of npcConfig) {
    const code = String(entry.code ?? '').trim()
    if (!code || seen.has(code)) continue
    const zip = `npc/${code}.zip`
    const md5 = resourceList.get(zip)
    if (!md5) continue
    const prop = names.get(Number(entry.type))
    seen.add(code)
    npcs.push({
      type: Number(entry.type) || 0,
      code,
      name: String(entry.name ?? '').trim() || prop?.name?.trim() || code,
      subType: String(entry.subType ?? '').trim() || null,
      rows: Math.max(1, Number(entry.gridW) || 1),
      cols: Math.max(1, Number(entry.gridH) || 1),
      baseLoc: String(entry.baseLoc ?? '').trim(),
      moveSpeed: String(entry.defaultMoveSpeed ?? '').trim() || 'speed1',
      moveStyle: String(entry.moveStyle ?? '').trim() || null,
      standStyle: String(entry.standStyle ?? '').trim() || null,
      selfMotion: String(entry.selfMotion ?? '').trim() || null,
      width: Number(entry.width) || 40,
      height: Number(entry.height) || 60,
      cosType: Number(entry.cosType) || 0,
      zip,
      md5,
    })
  }
  npcs.sort((a, b) => a.type - b.type || a.code.localeCompare(b.code))
  return npcs
}

/** NPC 动作：官方 npcMotionConfig 的步骤是「帧序号 + 时长」。 */
export function buildNpcMotions(
  config: Record<string, Array<{ frame?: number; duration?: number }>>,
): Record<string, Array<{ frame: number; duration: number }>> {
  const out: Record<string, Array<{ frame: number; duration: number }>> = {}
  for (const [name, steps] of Object.entries(config)) {
    if (!Array.isArray(steps) || steps.length === 0) continue
    out[name.toLowerCase()] = steps.map((step) => ({
      frame: Math.max(1, Math.floor(Number(step.frame) || 1)),
      duration: Math.max(0, Math.floor(Number(step.duration) || 200)),
    }))
  }
  return out
}

/**
 * 角色动作：官方 motionConfig 的 key 是小写动作名，
 * `arms3` / `arms7` 属于「按朝向覆写」，这里折叠进 byDir，运行期只认一份结构。
 */
export function buildActorMotions(
  motionConfig: Record<string, MotionStepEntry[]>,
): Record<string, CatalogMotionStep[]> {
  const out: Record<string, CatalogMotionStep[]> = {}
  for (const [name, steps] of Object.entries(motionConfig)) {
    if (!Array.isArray(steps) || steps.length === 0) continue
    const normalized = steps.map((step) => normalizeMotionStep(step))
    out[name.toLowerCase()] = normalized
  }
  return out
}

function normalizeMotionStep(step: MotionStepEntry): CatalogMotionStep {
  const result: CatalogMotionStep = {}
  const duration = Number(step.duration)
  if (Number.isFinite(duration) && duration > 0) result.duration = duration
  assignFrame(result, 'arms', step.arms)
  assignFrame(result, 'legs', step.legs)
  assignFrame(result, 'hair', step.hair)
  assignFrame(result, 'face', step.face)
  if (step.dir !== undefined) result.dir = normalizeDir(step.dir)
  if (step.facing !== undefined) result.facing = normalizeDir(step.facing)
  const offset = String(step.offset ?? '').trim()
  if (offset) result.offset = offset

  const byDir: NonNullable<CatalogMotionStep['byDir']> = {}
  if (step.arms3 !== undefined || step.legs3 !== undefined) {
    byDir[3] = { arms: toIndex(step.arms3), legs: toIndex(step.legs3) }
  }
  if (step.arms7 !== undefined || step.legs7 !== undefined) {
    byDir[7] = { arms: toIndex(step.arms7), legs: toIndex(step.legs7) }
  }
  if (Object.keys(byDir).length > 0) result.byDir = byDir
  return result
}

function assignFrame(
  target: CatalogMotionStep,
  key: 'arms' | 'legs' | 'hair' | 'face',
  raw: number | undefined,
): void {
  const value = toIndex(raw)
  if (value !== undefined) target[key] = value
}

function toIndex(raw: number | undefined): number | undefined {
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined
}

/** 宠物本体和蛋分别从 pet/、egg/ 目录取；两者都存在才入图鉴。 */
export function buildPets(
  petConfig: PetConfigEntry[],
  petEggConfig: PetEggConfigEntry[],
  names: Map<number, PropConfigEntry>,
  resourceList: Map<string, string>,
  petMotions: Record<string, PetMotionStep[]>,
): CatalogPet[] {
  const eggs = new Map<number, PetEggConfigEntry>()
  for (const egg of petEggConfig) {
    if (typeof egg.type === 'number') eggs.set(egg.type, egg)
  }

  const defaultMotion =
    petMotions.walk ?? Object.values(petMotions).find((steps) => steps.length > 1) ?? []
  const motionFrames = defaultMotion
    .map((step) => ({
      frame: Number(step.frame) || 0,
      duration: Math.max(0, Number(step.duration) || 100),
    }))
    .filter((step) => step.frame > 0)

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
      motionFrames: motionFrames.length > 0 ? motionFrames : undefined,
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
