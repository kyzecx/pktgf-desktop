import {
  decodePng,
  openBundle,
  readSymbolImage,
  type OfficialBundle,
  type RgbaImage,
} from '@engine/index'
import type { SmallWorn } from '@engine/index'
import type {
  Catalog,
  CatalogAssets,
  CatalogFace,
  CatalogFurniture,
  CatalogNpcDef,
  Part,
  RoomDirection,
} from '@shared/contract'
import { customId, isCustomCode } from '@engine/room'
import { getFaceMiniImage, getSmallCostume, resourceUrl } from '@/services/assets'

import { crop } from '@engine/index'
import {
  actorCell,
  buildTmxScene,
  furniMaskSymbol,
  parseTmx,
  resolveFurniSprite,
  type FloorAssets,
  type WallAssets,
} from '@engine/room'

/**
 * 装修页的资源层：把地板 / 墙纸 / 门包拆成可直接绘制的位图。
 *
 * 与图鉴共用同一套 `pktres://` 缓存；这里只在内存里再缓存一层，
 * 并把 `RgbaImage` 转成 `ImageBitmap` 供 Canvas 绘制。
 */

const bundleCache = new Map<string, Promise<OfficialBundle>>()
const bitmapCache = new Map<string, Promise<ImageBitmap>>()
const BUNDLE_CACHE_LIMIT = 48
const BITMAP_CACHE_LIMIT = 512

function getBundle(zip: string, md5: string): Promise<OfficialBundle> {
  const key = `${zip}:${md5}`
  const cached = bundleCache.get(key)
  if (cached) return cached

  const promise = fetch(resourceUrl(zip, md5))
    .then(async (response) => {
      if (!response.ok) throw new Error(`资源请求失败 ${response.status}`)
      return openBundle(new Uint8Array(await response.arrayBuffer()))
    })
    .catch((error) => {
      bundleCache.delete(key)
      throw error
    })

  bundleCache.set(key, promise)
  while (bundleCache.size > BUNDLE_CACHE_LIMIT) {
    const oldest = bundleCache.keys().next().value
    if (oldest === undefined) break
    bundleCache.delete(oldest)
  }
  return promise
}

/**
 * RgbaImage → ImageBitmap（带缓存）。
 *
 * 缓存键必须由调用方给**语义 key**（zip + 符号名）。
 * 之前用「尺寸 + 稀疏内容哈希」：四个地砖变体长得几乎一样，哈希容易撞车，
 * 左右变体取到同一张图，边界描边就落到错误的一侧 —— 界面上表现为地砖接缝出现虚线
 * （Node 侧没有这层缓存，所以出图看不出问题）。
 */
function toBitmap(image: RgbaImage, key: string): Promise<ImageBitmap> {
  const cached = bitmapCache.get(key)
  if (cached) return cached

  const data = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height)
  const promise = createImageBitmap(data)
  bitmapCache.set(key, promise)
  while (bitmapCache.size > BITMAP_CACHE_LIMIT) {
    const oldest = bitmapCache.keys().next().value
    if (oldest === undefined) break
    bitmapCache.delete(oldest)
  }
  return promise
}

function readSymbol(bundle: OfficialBundle, name: string): RgbaImage | null {
  try {
    return readSymbolImage(bundle, name)
  } catch {
    return null
  }
}

function findSymbol(bundle: OfficialBundle, name: string): string | null {
  const lower = name.toLowerCase()
  return [...bundle.symbols.keys()].find((key) => key.toLowerCase() === lower) ?? null
}

export type DecoAssets = {
  /** 地板图自身格数（1 或 2） */
  floorCells: 1 | 2
  /** 墙纸自身格数（1 或 2） */
  wallCells: 1 | 2
  floor: FloorAssets<ImageBitmap> | null
  wall: WallAssets<ImageBitmap> | null
  door: ImageBitmap | null
}

/** 装修图的格数：官方用 `1 == 图.gridH` 判断（VO.gridH 来自 decoConfig.gridW）。 */
function cellsOf(def: CatalogFurniture | null): 1 | 2 {
  if (!def) return 1
  return def.rows === 2 ? 2 : 1
}

/** 房型的 defaultTile / defaultWall / defaultDoor 引用代码序号（tile0001 → 1）。 */
export function findDeco(
  catalog: Catalog,
  kind: 'tile' | 'wall' | 'door',
  serial: number,
): CatalogFurniture | null {
  if (!serial) return null
  return catalog.furniture.find((item) => item.kind === kind && item.serial === serial) ?? null
}

/** 加载一个房间用到的全部装修素材（并发）。 */
export async function loadDecoAssets(
  catalog: Catalog,
  room: {
    defaultTile: number
    defaultWall: number
    defaultDoor: number
  },
): Promise<DecoAssets> {
  const floorDef = findDeco(catalog, 'tile', room.defaultTile)
  const wallDef = findDeco(catalog, 'wall', room.defaultWall)
  const doorDef = findDeco(catalog, 'door', room.defaultDoor)

  const [floor, wall, door] = await Promise.all([
    floorDef ? loadFloorAssets(floorDef) : Promise.resolve(null),
    wallDef ? loadWallAssets(wallDef) : Promise.resolve(null),
    doorDef ? loadDoorBitmap(doorDef) : Promise.resolve(null),
  ])

  return {
    floor,
    wall,
    door,
    floorCells: cellsOf(floorDef),
    wallCells: cellsOf(wallDef),
  }
}

async function loadFloorAssets(def: CatalogFurniture): Promise<FloorAssets<ImageBitmap>> {
  const bundle = await getBundle(def.zip, def.md5)
  // 地板图四向可能缺省（少数包没有边缘变体），缺的用「心」兜底
  const center = await requireBitmap(bundle, `${def.code}_4`)
  return {
    top: (await optionalBitmap(bundle, `${def.code}_1`)) ?? center,
    left: (await optionalBitmap(bundle, `${def.code}_2`)) ?? center,
    right: (await optionalBitmap(bundle, `${def.code}_3`)) ?? center,
    center,
  }
}

async function loadWallAssets(def: CatalogFurniture): Promise<WallAssets<ImageBitmap>> {
  const bundle = await getBundle(def.zip, def.md5)
  // 墙纸包不一定四向齐全（wall1001 没有 _down），缺的用 _left 兜底
  const left = await requireBitmap(bundle, `${def.code}_left`)
  const up = (await optionalBitmap(bundle, `${def.code}_up`)) ?? left
  const right = (await optionalBitmap(bundle, `${def.code}_right`)) ?? left
  const down = (await optionalBitmap(bundle, `${def.code}_down`)) ?? left
  return { up, left, right, down }
}

async function loadDoorBitmap(def: CatalogFurniture): Promise<ImageBitmap | null> {
  const bundle = await getBundle(def.zip, def.md5)
  return optionalBitmap(bundle, `${def.code}_left`)
}

async function optionalBitmap(bundle: OfficialBundle, name: string): Promise<ImageBitmap | null> {
  const symbol = findSymbol(bundle, name)
  if (!symbol) return null
  const image = readSymbol(bundle, symbol)
  if (!image) return null
  return toBitmap(image, `sym:${symbol}`)
}

async function requireBitmap(bundle: OfficialBundle, name: string): Promise<ImageBitmap> {
  const bitmap = await optionalBitmap(bundle, name)
  if (!bitmap) throw new Error(`素材缺少符号 ${name}`)
  return bitmap
}

export interface FurniArt {
  bitmap: ImageBitmap
  mirrored: boolean
  width: number
  height: number
  /** 遮罩帧（`_NNm`），`Posy` 放在 `Bonsai` 上时用来裁切 */
  mask: ImageBitmap | null
}

const furniCache = new Map<string, Promise<FurniArt | null>>()
const FURNI_CACHE_LIMIT = 400

/**
 * 取家具在某个朝向 / 帧上的图。
 *
 * 符号解析（含镜像回退）走 `engine/room/furni.ts`，这里只负责取包、解码、缓存。
 * 返回的 `mirrored` 由调用方决定怎么翻（Canvas 里用 `ctx.scale(-1,1)`）。
 */
export function loadFurniArt(
  def: CatalogFurniture,
  dir: RoomDirection,
  frame = 1,
): Promise<FurniArt | null> {
  // 自定义件：图存在 localStorage（dataURL），不需要走 zip
  if (isCustomCode(def.code)) return loadCustomFurniArt(def.code, dir)

  const key = `${def.code}:${dir}:${frame}`
  const cached = furniCache.get(key)
  if (cached) return cached

  const promise = (async () => {
    const bundle = await getBundle(def.zip, def.md5)
    const available = new Set(bundle.symbols.keys())
    const ref = resolveFurniSprite(def, dir, frame, available)
    if (!ref) return null
    const image = readSymbol(bundle, ref.symbol)
    if (!image) return null
    const bitmap = await toBitmap(image, `furni:${def.md5}:${ref.symbol}`)

    const maskRef = furniMaskSymbol(def, dir, frame, available)
    const maskImage = maskRef ? readSymbol(bundle, maskRef.symbol) : null
    const mask = maskImage
      ? await toBitmap(maskImage, `furni-mask:${def.md5}:${maskRef!.symbol}`)
      : null

    return { bitmap, mirrored: ref.mirrored, width: image.width, height: image.height, mask }
  })().catch((error) => {
    furniCache.delete(key)
    throw error
  })

  furniCache.set(key, promise)
  while (furniCache.size > FURNI_CACHE_LIMIT) {
    const oldest = furniCache.keys().next().value
    if (oldest === undefined) break
    furniCache.delete(oldest)
  }
  return promise
}

/** 家具图的缓存键：同一件家具按朝向/帧分别取图。 */
export function furniArtKey(instance: { code: string; dir: number; state: number }): string {
  const frame = instance.state > 0 ? instance.state : 1
  return `${instance.code}:${instance.dir}:${frame}`
}

/** 家具当前显示的帧号（state 0 = 静止，取第 1 帧）。 */
export function furniFrameOf(instance: { state: number }): number {
  return instance.state > 0 ? instance.state : 1
}

/** 角色/NPC 贴图：统一成 40×60（NPC 帧高 70，画的时候底部对齐）。 */
export interface ActorArt {
  bitmap: ImageBitmap
  mirrored: boolean
  width: number
  height: number
}

const actorCache = new Map<string, Promise<ActorArt | null>>()

/** 把 RgbaImage 合成好的角色帧转成可直接画的位图。 */
export async function actorArtFromImage(
  image: RgbaImage,
  key: string,
  mirrored = false,
): Promise<ActorArt> {
  const cacheKey = `composite:${key}:${mirrored ? 'm' : 'n'}`
  const cached = actorCache.get(cacheKey)
  if (cached) return (await cached) as ActorArt
  const promise = toBitmap(image, `actor:${key}:${mirrored ? 'm' : 'n'}`).then((bitmap) => ({
    bitmap,
    mirrored,
    width: image.width,
    height: image.height,
  }))
  actorCache.set(cacheKey, promise)
  return promise
}

/**
 * NPC 图：符号 `<code>_<NNN>_<dirArt>`，帧高 70。
 *
 * 方向与角色同构：3 = 正面、7 = 背面，5/1 用水平镜像。
 */
export function loadNpcArt(
  def: CatalogNpcDef,
  dir: RoomDirection,
  frame: number,
): Promise<ActorArt | null> {
  const artDir = dir === 3 || dir === 5 ? 3 : 7
  const mirrored = dir === 5 || dir === 1
  const key = `${def.code}:${artDir}:${frame}:${mirrored ? 'm' : 'n'}`
  const cached = actorCache.get(key)
  if (cached) return cached

  const promise = (async () => {
    const bundle = await getBundle(def.zip, def.md5)
    const suffix = String(frame).padStart(3, '0')
    const name = `${def.code}_${suffix}_${artDir}`
    const symbol = findSymbol(bundle, name)
    if (!symbol) return null
    const image = readSymbol(bundle, symbol)
    if (!image) return null
    const bitmap = await toBitmap(image, `npc:${def.md5}:${symbol}`)
    return { bitmap, mirrored, width: image.width, height: image.height }
  })().catch((error) => {
    actorCache.delete(key)
    throw error
  })

  actorCache.set(key, promise)
  return promise
}

/** 探测 NPC 有多少帧（符号名里的三位序号最大值）。 */
export async function loadNpcFrameCount(def: CatalogNpcDef): Promise<number> {
  const bundle = await getBundle(def.zip, def.md5)
  let max = 0
  for (const name of bundle.symbols.keys()) {
    const match = new RegExp(`^${def.code}_(\\d{3})_`, 'i').exec(name)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return Math.max(1, max)
}

export interface PlayerActorAssets {
  sheet: RgbaImage
  worn: SmallWorn
  face: RgbaImage | null
}

const playerCache = new Map<string, Promise<PlayerActorAssets>>()

/**
 * 玩家角色的合成素材：基础 actor sheet + 穿戴的小图 + 表情。
 *
 * 穿戴直接用搭配存档里的 `worn`（part → code），与衣柜共用同一套小图，
 * 所以「同一个存档在衣柜和房间里长得一样」。
 */
export function loadPlayerActorAssets(input: {
  catalog: Catalog
  assets: CatalogAssets
  outfit: { sex: 1 | 2; faceCode: string | null; worn: Record<string, string> }
}): Promise<PlayerActorAssets> {
  const key = JSON.stringify([input.outfit.sex, input.outfit.faceCode, input.outfit.worn])
  const cached = playerCache.get(key)
  if (cached) return cached

  const promise = (async () => {
    const sheet = await loadActorSheet(input.assets)
    const worn: SmallWorn = {}
    await Promise.all(
      Object.entries(input.outfit.worn).map(async ([part, code]) => {
        const item = input.catalog.items.find((entry) => entry.code === code)
        if (!item) return
        const art = await getSmallCostume(item).catch(() => null)
        if (!art) return
        worn[part as Part] = { art, useMask: item.useMask, coverHead: item.coverHead }
      }),
    )
    const faceEntry = input.outfit.faceCode
      ? (input.catalog.faces.find((entry) => entry.code === input.outfit.faceCode) ?? null)
      : null
    const face = await loadFaceMini(faceEntry)
    return { sheet, worn, face }
  })().catch((error) => {
    playerCache.delete(key)
    throw error
  })

  playerCache.set(key, promise)
  return promise
}

const actorSheetCache = new Map<string, Promise<RgbaImage>>()

/** 基础 actor 的 700×840 sheet（`actor` 符号）。 */
function loadActorSheet(assets: CatalogAssets): Promise<RgbaImage> {
  const key = assets.baseActor.md5
  const cached = actorSheetCache.get(key)
  if (cached) return cached
  const promise = fetch(resourceUrl(assets.baseActor.key, assets.baseActor.md5))
    .then(async (response) => {
      if (!response.ok) throw new Error(`资源请求失败 ${response.status}`)
      const bundle = openBundle(new Uint8Array(await response.arrayBuffer()))
      const sheet = readSymbolImage(bundle, 'actor')
      if (!sheet) throw new Error('基础角色包缺少 actor 符号')
      return sheet
    })
    .catch((error) => {
      actorSheetCache.delete(key)
      throw error
    })
  actorSheetCache.set(key, promise)
  return promise
}

/** 表情小图（40×60），按 faceCode 缓存。 */
function loadFaceMini(face: CatalogFace | null): Promise<RgbaImage | null> {
  if (!face) return Promise.resolve(null)
  const cached = faceMiniCache.get(face.code)
  if (cached) return cached
  const promise = getFaceMiniImage(face).catch(() => null)
  faceMiniCache.set(face.code, promise)
  return promise
}

const faceMiniCache = new Map<string, Promise<RgbaImage | null>>()

const sceneCache = new Map<string, Promise<ImageBitmap | null>>()

/** 整图房型的整间场景图（`scene/roomimg_<type>.zip` 里的同名符号）。 */
export function loadSceneArt(
  scene: { zip: string; md5: string } | null,
): Promise<ImageBitmap | null> {
  if (!scene) return Promise.resolve(null)
  const key = `${scene.zip}:${scene.md5}`
  const cached = sceneCache.get(key)
  if (cached) return cached

  const promise = (async () => {
    const bundle = await getBundle(scene.zip, scene.md5)
    // 符号名与包同名：roomimg_109
    const base = scene.zip.slice(scene.zip.lastIndexOf('/') + 1, -4)
    const symbol = findSymbol(bundle, base)
    if (!symbol) return null
    const image = readSymbol(bundle, symbol)
    return image ? toBitmap(image, `scene:${scene.md5}:${symbol}`) : null
  })().catch((error) => {
    sceneCache.delete(key)
    throw error
  })

  sceneCache.set(key, promise)
  return promise
}

const tmxCache = new Map<string, Promise<ImageBitmap | null>>()

/**
 * TMX 场景房：解析地图 + 用 `tmxRes` 图集合成整张场景（居中裁到舞台）。
 *
 * 浏览器里用 `DecompressionStream('deflate')` 解 TMX 图层的 zlib 数据，
 * 与 Node 侧的 `zlib.inflateSync` 等价。
 */
export function loadTmxScene(
  room: { tmx: { key: string; md5: string } | null; type: number },
  assets: CatalogAssets,
  stage: { width: number; height: number },
): Promise<ImageBitmap | null> {
  if (!room.tmx || !assets.tmxRes) return Promise.resolve(null)
  const key = `${room.tmx.md5}:${stage.width}x${stage.height}`
  const cached = tmxCache.get(key)
  if (cached) return cached

  const promise = (async () => {
    const [xmlBytes, atlasBytes] = await Promise.all([
      fetchBytesOf(room.tmx!.key, room.tmx!.md5),
      fetchBytesOf(assets.tmxRes!.key, assets.tmxRes!.md5),
    ])
    const xml = new TextDecoder().decode(xmlBytes)
    const map = await parseTmx(xml, { inflate: inflateZlib })
    const bundle = openBundle(atlasBytes)

    // TMX 引用的是图集文件名；tmxRes 里的两张图按顺序对应
    const sources = ['SourcesNO20161212.png', '地块数据.png']
    const bySource = new Map<string, RgbaImage>()
    ;[...bundle.symbols.keys()].sort().forEach((name, index) => {
      const image = readSymbol(bundle, name)
      if (!image) return
      bySource.set(sources[index] ?? name, image)
    })

    const scene = buildTmxScene(map, { bySource }, stage)
    return toBitmap(scene.image, `tmx:${room.tmx!.md5}:${stage.width}x${stage.height}`)
  })().catch((error) => {
    tmxCache.delete(key)
    throw error
  })

  tmxCache.set(key, promise)
  return promise
}

async function fetchBytesOf(key: string, md5: string): Promise<Uint8Array> {
  const response = await fetch(resourceUrl(key, md5))
  if (!response.ok) throw new Error(`资源请求失败 ${response.status}: ${key}`)
  return new Uint8Array(await response.arrayBuffer())
}

async function inflateZlib(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

const customArtCache = new Map<string, Promise<FurniArt | null>>()

/**
 * 自定义家具：只有一张 `_3_01` 图。
 *
 * 朝向按官方规则镜像：3/7 用原图，1/5 水平翻转（`dirable` 只影响编辑器给不给按钮，
 * 渲染上镜像永远可用）。
 */
function loadCustomFurniArt(code: string, dir: RoomDirection): Promise<FurniArt | null> {
  const key = `${code}:${dir}`
  const cached = customArtCache.get(key)
  if (cached) return cached

  const promise = (async () => {
    const id = customId(code)
    const stored = readCustomFurni(id)
    if (!stored) return null
    const image = await decodeDataUrl(stored.image)
    const bitmap = await toBitmap(image, `custom:${id}`)
    return {
      bitmap,
      mirrored: dir === 1 || dir === 5,
      width: image.width,
      height: image.height,
      mask: null,
    }
  })().catch((error) => {
    customArtCache.delete(key)
    throw error
  })

  customArtCache.set(key, promise)
  return promise
}

function readCustomFurni(id: string): { image: string } | null {
  try {
    const raw = localStorage.getItem('pkt-custom-furni')
    if (!raw) return null
    const list = JSON.parse(raw) as Array<{ id: string; image: string }>
    return list.find((item) => item.id === id) ?? null
  } catch {
    return null
  }
}

async function decodeDataUrl(dataUrl: string): Promise<RgbaImage> {
  const response = await fetch(dataUrl)
  const bytes = new Uint8Array(await response.arrayBuffer())
  return decodePng(bytes)
}

const actorFrameCache = new Map<string, Promise<string | null>>()

/**
 * 角色动作帧的缩略图（dataURL），给动作编辑器选帧用。
 *
 * 直接从基础 actor 的 700×840 sheet 里裁 40×60 的格子，
 * 这样用户看到的就是真实帧，不用数格子。
 */
export function loadActorFrameThumb(
  assets: CatalogAssets,
  part: 'arm' | 'leg' | 'head',
  dir: RoomDirection,
  index: number,
): Promise<string | null> {
  const key = `${assets.baseActor.md5}:${part}:${dir}:${index}`
  const cached = actorFrameCache.get(key)
  if (cached) return cached

  const promise = (async () => {
    const sheet = await loadActorSheet(assets)
    const cell = actorCell(part, dir, index)
    if (!cell) return null
    const canvas = document.createElement('canvas')
    canvas.width = 40
    canvas.height = 60
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    // sheet 是 RGBA，直接 putImageData 到大画布再裁，避免逐像素循环
    const full = document.createElement('canvas')
    full.width = sheet.width
    full.height = sheet.height
    full
      .getContext('2d')
      ?.putImageData(
        new ImageData(new Uint8ClampedArray(sheet.data), sheet.width, sheet.height),
        0,
        0,
      )
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(full, cell.x, cell.y, 40, 60, 0, 0, 40, 60)
    return canvas.toDataURL('image/png')
  })().catch(() => null)

  actorFrameCache.set(key, promise)
  return promise
}

const customActorCache = new Map<string, Promise<ActorArt | null>>()

/**
 * 自定义角色帧：从横向帧条里裁第 index 帧。
 *
 * 帧宽按「帧条宽度 / frameCount」等分，帧高就是图高 —— 这样 40×60、
 * 40×70（带法杖那种）都能直接用。
 */
export function loadCustomActorArt(
  actor: { id: string; front: string; back?: string; frameCount: number },
  dir: RoomDirection,
  index: number,
): Promise<ActorArt | null> {
  const useBack = (dir === 7 || dir === 1) && Boolean(actor.back)
  const mirrored = dir === 1 || dir === 5
  const key = `custom-actor:${actor.id}:${useBack ? 'b' : 'f'}:${index}:${mirrored ? 'm' : 'n'}`
  const cached = customActorCache.get(key)
  if (cached) return cached

  const promise = (async () => {
    const strip = useBack ? actor.back! : actor.front
    const full = await decodeDataUrl(strip)
    const count = Math.max(1, actor.frameCount)
    const frameWidth = Math.floor(full.width / count)
    if (frameWidth <= 0) return null
    const x = Math.min(full.width - frameWidth, index * frameWidth)
    const frame = crop(full, { x, y: 0, w: frameWidth, h: full.height })
    const bitmap = await toBitmap(frame, key)
    return { bitmap, mirrored, width: frame.width, height: frame.height, mask: null }
  })().catch((error) => {
    customActorCache.delete(key)
    throw error
  })

  customActorCache.set(key, promise)
  return promise
}

/** 导出用：地板/墙纸/门的**原始位图**（画布用 ImageBitmap，导出要 RgbaImage）。 */
export async function loadDecoImages(
  catalog: Catalog,
  room: { defaultTile: number; defaultWall: number; defaultDoor: number },
): Promise<{
  floor: FloorAssets | null
  wall: WallAssets | null
  door: RgbaImage | null
  floorCells: 1 | 2
  wallCells: 1 | 2
}> {
  const floorDef = findDeco(catalog, 'tile', room.defaultTile)
  const wallDef = findDeco(catalog, 'wall', room.defaultWall)
  const doorDef = findDeco(catalog, 'door', room.defaultDoor)

  const read = async (def: CatalogFurniture | null, names: string[]) => {
    if (!def) return []
    const bundle = await getBundle(def.zip, def.md5)
    return names.map((name) => {
      const symbol = findSymbol(bundle, name)
      return symbol ? readSymbol(bundle, symbol) : null
    })
  }

  const [floorImages, wallImages, doorImages] = await Promise.all([
    read(
      floorDef,
      ['_1', '_2', '_3', '_4'].map((suffix) => `${floorDef?.code}${suffix}`),
    ),
    read(
      wallDef,
      ['_up', '_left', '_right', '_down'].map((suffix) => `${wallDef?.code}${suffix}`),
    ),
    read(doorDef, [`${doorDef?.code}_left`]),
  ])

  return {
    floor:
      floorImages[0] && floorImages[1] && floorImages[2] && floorImages[3]
        ? {
            top: floorImages[0],
            left: floorImages[1],
            right: floorImages[2],
            center: floorImages[3],
          }
        : null,
    wall:
      wallImages[0] && wallImages[1] && wallImages[2]
        ? {
            up: wallImages[0],
            left: wallImages[1],
            right: wallImages[2],
            down: wallImages[3] ?? wallImages[1],
          }
        : null,
    door: doorImages[0] ?? null,
    floorCells: cellsOf(floorDef),
    wallCells: cellsOf(wallDef),
  }
}

const furniRgbaCache = new Map<string, Promise<{ image: RgbaImage; mirrored: boolean } | null>>()
/** 导出用的原始位图缓存上限：一屋子家具 × 帧数很容易爆内存 */
const FURNI_RGBA_CACHE_LIMIT = 400

function rememberRgba(
  key: string,
  value: Promise<{ image: RgbaImage; mirrored: boolean } | null>,
): void {
  furniRgbaCache.set(key, value)
  while (furniRgbaCache.size > FURNI_RGBA_CACHE_LIMIT) {
    const oldest = furniRgbaCache.keys().next().value
    if (oldest === undefined) break
    furniRgbaCache.delete(oldest)
  }
}

/** 导出用：家具帧的原始位图。 */
export function loadFurniImage(
  def: CatalogFurniture,
  dir: RoomDirection,
  frame = 1,
): Promise<{ image: RgbaImage; mirrored: boolean } | null> {
  if (isCustomCode(def.code)) {
    const id = customId(def.code)
    const key = `custom:${id}:${dir}`
    const cached = furniRgbaCache.get(key)
    if (cached) return cached
    const promise = (async () => {
      const stored = readCustomFurni(id)
      if (!stored) return null
      const image = await decodeDataUrl(stored.image)
      return { image, mirrored: dir === 1 || dir === 5 }
    })()
    rememberRgba(key, promise)
    return promise
  }

  const key = `${def.code}:${dir}:${frame}`
  const cached = furniRgbaCache.get(key)
  if (cached) return cached

  const promise = (async () => {
    const bundle = await getBundle(def.zip, def.md5)
    const ref = resolveFurniSprite(def, dir, frame, new Set(bundle.symbols.keys()))
    if (!ref) return null
    const image = readSymbol(bundle, ref.symbol)
    return image ? { image, mirrored: ref.mirrored } : null
  })().catch((error) => {
    furniRgbaCache.delete(key)
    throw error
  })
  rememberRgba(key, promise)
  return promise
}
