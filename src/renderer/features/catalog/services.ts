import {
  encodeGif,
  openBundle,
  readSymbolImage,
  type OfficialBundle,
  type RgbaImage,
} from '@engine/index'
import type { CatalogFurniture, CatalogItem, CatalogPet } from '@shared/contract'
import { getCostume, resourceUrl, toBase64, toDataUrl, toPngBase64 } from '@/services/assets'
import { frameKey, type CatalogEntry, type CatalogKind, type PetView } from './types'

const BUNDLE_CACHE_LIMIT = 64
const THUMBNAIL_CACHE_LIMIT = 512

const bundleCache = new Map<string, Promise<OfficialBundle>>()
const thumbnailCache = new Map<string, Promise<string | null>>()

const CATEGORY_DIR: Record<CatalogKind, string> = {
  outfit: '服饰',
  furniture: '家具',
  pet: '宠物',
}

export interface FrameImage {
  name: string
  image: RgbaImage
}

export interface FrameGroup {
  label: string
  dir: string
  frames: FrameImage[]
}

export interface GifSequence {
  frames: FrameImage[]
  delays: number[]
}

export interface EntryFrames {
  groups: FrameGroup[]
  /** 服饰原始 700×840 sheet；家具/宠物没有。 */
  sheet?: RgbaImage
  total: number
  /** 可导出的动画序列；没有动态帧时为 undefined。 */
  gif?: GifSequence
}

/** 所有图鉴包都走同一个 pktres 缓存；这里只做内存 bundle 缓存。 */
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

function readImage(bundle: OfficialBundle, className: string): RgbaImage | null {
  try {
    return readSymbolImage(bundle, className)
  } catch (error) {
    console.warn('[catalog] 读取符号失败', className, error)
    return null
  }
}

function findSymbol(bundle: OfficialBundle, candidates: string[]): string | null {
  for (const candidate of candidates) {
    const direct = [...bundle.symbols.keys()].find(
      (name) => name.toLowerCase() === candidate.toLowerCase(),
    )
    if (direct) return direct
  }
  return null
}

function naturalCompare(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
}

/** 排除缩略图 `xxxS` 和家具遮罩 `xxx_3_01m`，保留实际渲染帧。 */
function frameSymbols(bundle: OfficialBundle): string[] {
  const names = [...bundle.symbols.keys()]
  const frames = names.filter((name) => {
    const lower = name.toLowerCase()
    return !lower.endsWith('s') && !lower.endsWith('m')
  })
  return (frames.length > 0 ? frames : names).sort(naturalCompare)
}

function outfitImage(item: CatalogItem): Promise<RgbaImage | null> {
  return getCostume(item).then((art) => {
    if (art.frames.length > 0) return art.frames[0] ?? null
    return art.frontHead ?? art.body ?? art.backHead ?? art.wingMask ?? null
  })
}

function furnitureImage(item: CatalogFurniture): Promise<RgbaImage | null> {
  return getBundle(item.zip, item.md5).then((bundle) => {
    const name =
      findSymbol(bundle, [`${item.code}s`, `${item.code}_3_01`, `${item.code}_1`]) ??
      frameSymbols(bundle)[0] ??
      null
    return name ? readImage(bundle, name) : null
  })
}

/** 家具大图：实际渲染帧，而不是 43×43 缩略图。 */
function furnitureFrameImage(item: CatalogFurniture): Promise<RgbaImage | null> {
  return getBundle(item.zip, item.md5).then((bundle) => {
    const name =
      findSymbol(bundle, [`${item.code}_3_01`, `${item.code}_3_1`, `${item.code}_1`]) ??
      frameSymbols(bundle)[0] ??
      null
    return name ? readImage(bundle, name) : null
  })
}

function petImage(item: CatalogPet, mode: 'pet' | 'egg'): Promise<RgbaImage | null> {
  const zip = mode === 'pet' ? item.petZip : item.eggZip
  const md5 = mode === 'pet' ? item.petMd5 : item.eggMd5
  const code = mode === 'pet' ? item.code : item.eggCode
  return getBundle(zip, md5).then((bundle) => {
    const name =
      findSymbol(bundle, [`${code}_001_3`, `${code}s`, `${code}_3_01`]) ??
      frameSymbols(bundle)[0] ??
      null
    return name ? readImage(bundle, name) : null
  })
}

function trimThumbnailCache(): void {
  while (thumbnailCache.size > THUMBNAIL_CACHE_LIMIT) {
    const oldest = thumbnailCache.keys().next().value
    if (oldest === undefined) break
    thumbnailCache.delete(oldest)
  }
}

/** 卖货图模板二使用背包道具图标；没有图标包时退回资源缩略图。 */
export async function getSaleIcon(entry: CatalogEntry): Promise<string | null> {
  if (entry.kind === 'outfit' && entry.item?.itemZip && entry.item.itemMd5) {
    try {
      const bundle = await getBundle(entry.item.itemZip, entry.item.itemMd5)
      const serial = entry.item.serial
      const name =
        findSymbol(bundle, [`itm${serial}_3_01`, `itm${serial}`]) ?? frameSymbols(bundle)[0] ?? null
      const image = name ? readImage(bundle, name) : null
      if (image) return toDataUrl(image)
    } catch (error) {
      console.warn('[catalog] 读取道具图标失败', entry.code, error)
    }
  }
  return getEntryThumbnail(entry)
}

export function getEntryThumbnail(
  entry: CatalogEntry,
  petView: PetView = 'pet',
  furnitureMode: 'frame' | 'icon' = 'icon',
): Promise<string | null> {
  const cacheKey =
    entry.kind === 'pet'
      ? `${entry.key}:${petView}`
      : entry.kind === 'furniture'
        ? `${entry.key}:${furnitureMode}`
        : entry.key
  const cached = thumbnailCache.get(cacheKey)
  if (cached) return cached

  const task = (async () => {
    let image: RgbaImage | null = null
    if (entry.kind === 'outfit' && entry.item) image = await outfitImage(entry.item)
    if (entry.kind === 'furniture' && entry.furniture) {
      image =
        furnitureMode === 'frame'
          ? await furnitureFrameImage(entry.furniture)
          : await furnitureImage(entry.furniture)
    }
    if (entry.kind === 'pet' && entry.pet) image = await petImage(entry.pet, petView)
    return image ? toDataUrl(image) : null
  })().catch((error) => {
    thumbnailCache.delete(cacheKey)
    throw error
  })

  thumbnailCache.set(cacheKey, task)
  trimThumbnailCache()
  return task
}

export function getPetEggThumbnail(entry: CatalogEntry): Promise<string | null> {
  return getEntryThumbnail(entry, 'egg')
}

function frameFromBundle(bundle: OfficialBundle, label: string, dir: string): FrameGroup {
  const frames: FrameImage[] = []
  for (const className of frameSymbols(bundle)) {
    const image = readImage(bundle, className)
    if (image) frames.push({ name: className, image })
  }
  return { label, dir, frames }
}

const GIF_DELAY_MS = 100

function sameSize(frames: FrameImage[]): FrameImage[] {
  const first = frames[0]
  if (!first) return []
  return frames.filter(
    (frame) => frame.image.width === first.image.width && frame.image.height === first.image.height,
  )
}

function gifSequence(frames: FrameImage[], delays?: number[]): GifSequence | undefined {
  const usable = sameSize(frames)
  if (usable.length < 2) return undefined
  return {
    frames: usable,
    delays: usable.map((_, index) => Math.max(30, delays?.[index] ?? GIF_DELAY_MS)),
  }
}

/** 家具包：优先按官方 motion 的 serial/duration 播放，再回退到状态顺序。 */
function furnitureGif(
  frames: FrameImage[],
  motionFrames?: Array<{ frame: number; duration: number }>,
): GifSequence | undefined {
  const byDirection = new Map<number, Map<number, FrameImage>>()
  for (const frame of frames) {
    const match = /_([1357])_(\d+)$/.exec(frame.name)
    if (!match) continue
    const direction = Number(match[1])
    const state = Number(match[2])
    const states = byDirection.get(direction) ?? new Map<number, FrameImage>()
    states.set(state, frame)
    byDirection.set(direction, states)
  }
  if (byDirection.size === 0) return gifSequence(frames)

  const entries = [...byDirection.entries()].sort((left, right) => {
    const preferred = (value: number): number => (value === 3 ? 0 : value === 7 ? 1 : 2)
    return right[1].size - left[1].size || preferred(left[0]) - preferred(right[0])
  })
  const states = entries[0]?.[1]
  if (!states) return undefined

  if (motionFrames && motionFrames.length > 1) {
    const framesFromMotion: FrameImage[] = []
    const delays: number[] = []
    for (const step of motionFrames) {
      const image = states.get(step.frame)
      if (!image) continue
      framesFromMotion.push(image)
      delays.push(step.duration)
    }
    const sequence = gifSequence(framesFromMotion, delays)
    if (sequence) return sequence
  }

  const ordered = [...states.entries()]
    .sort((left, right) => left[0] - right[0])
    .map((entry) => entry[1])
  return gifSequence(ordered)
}

/** 宠物包：按官方 walk motion 的帧序列/时长播放。 */
function petGif(
  frames: FrameImage[],
  motionFrames?: Array<{ frame: number; duration: number }>,
): GifSequence | undefined {
  const byDirection = new Map<number, Map<number, FrameImage>>()
  for (const frame of frames) {
    const match = /_(\d{3})_([37])$/.exec(frame.name)
    if (!match) continue
    const index = Number(match[1])
    const direction = Number(match[2])
    const indices = byDirection.get(direction) ?? new Map<number, FrameImage>()
    indices.set(index, frame)
    byDirection.set(direction, indices)
  }
  const indices = byDirection.get(3) ?? byDirection.get(7)
  if (!indices) return undefined

  if (motionFrames && motionFrames.length > 1) {
    const framesFromMotion: FrameImage[] = []
    const delays: number[] = []
    for (const step of motionFrames) {
      const image = indices.get(step.frame)
      if (!image) continue
      framesFromMotion.push(image)
      delays.push(step.duration)
    }
    const sequence = gifSequence(framesFromMotion, delays)
    if (sequence) return sequence
  }

  const ordered = [...indices.entries()]
    .sort((left, right) => left[0] - right[0])
    .map((entry) => entry[1])
  return gifSequence(ordered)
}

export async function getEntryFrames(entry: CatalogEntry): Promise<EntryFrames> {
  if (entry.kind === 'outfit' && entry.item) {
    const item = entry.item
    const art = await getCostume(item)
    const frames: FrameImage[] = []
    if (art.frames.length > 0) {
      art.frames.forEach((image, index) => {
        frames.push({ name: `frame_${String(index + 1).padStart(3, '0')}`, image })
      })
    } else {
      const image = art.frontHead ?? art.body ?? art.backHead ?? art.wingMask
      if (image) frames.push({ name: 'frame_001', image })
    }

    let sheet: RgbaImage | undefined
    try {
      const bundle = await getBundle(item.zip, item.md5)
      sheet = readImage(bundle, item.code) ?? undefined
    } catch (error) {
      console.warn('[catalog] 读取服饰 sheet 失败', item.code, error)
    }

    return {
      groups: [{ label: '帧', dir: 'frames', frames }],
      sheet,
      total: frames.length,
      gif: gifSequence(frames),
    }
  }

  if (entry.kind === 'furniture' && entry.furniture) {
    const item = entry.furniture
    const bundle = await getBundle(item.zip, item.md5)
    const group = frameFromBundle(bundle, '帧', 'frames')
    return {
      groups: [group],
      total: group.frames.length,
      gif: furnitureGif(group.frames, item.motionFrames),
    }
  }

  if (entry.kind === 'pet' && entry.pet) {
    const item = entry.pet
    const [petBundle, eggBundle] = await Promise.all([
      getBundle(item.petZip, item.petMd5),
      getBundle(item.eggZip, item.eggMd5),
    ])
    const groups = [
      frameFromBundle(petBundle, '宠物帧', 'pet/frames'),
      frameFromBundle(eggBundle, '宠物蛋帧', 'egg/frames'),
    ]
    return {
      groups,
      total: groups.reduce((sum, group) => sum + group.frames.length, 0),
      gif: petGif(groups[0]?.frames ?? [], item.motionFrames),
    }
  }

  return { groups: [], total: 0 }
}

function safeSegment(value: string): string {
  const cleaned = [...value]
    .map((char) => {
      if (char.charCodeAt(0) < 32) return ''
      return /[\\/:*?"<>|]/.test(char) ? '_' : char
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.slice(0, 80) || 'item'
}

interface FrameManifest {
  group: string
  name: string
  file: string
  width: number
  height: number
}

function metadataBase64(
  entry: CatalogEntry,
  frames: EntryFrames,
  manifest: FrameManifest[],
): string {
  const metadata = {
    category: entry.kind,
    code: entry.code,
    name: entry.name,
    description: entry.description,
    source: entry.item
      ? { zip: entry.item.zip, md5: entry.item.md5 }
      : entry.furniture
        ? { zip: entry.furniture.zip, md5: entry.furniture.md5 }
        : entry.pet
          ? {
              petZip: entry.pet.petZip,
              petMd5: entry.pet.petMd5,
              eggZip: entry.pet.eggZip,
              eggMd5: entry.pet.eggMd5,
            }
          : null,
    frames: manifest,
    sheet: frames.sheet ? 'sheet.png' : null,
  }
  return toBase64(new TextEncoder().encode(JSON.stringify(metadata, null, 2)))
}

export interface OriginalExport {
  files: Array<{ path: string; base64: string }>
  folder: string
  imageCount: number
}

const ORIGINAL_IMAGE = /\.(png|jpe?g|webp)$/i

/** 原图导出：直接写 zip 里的 PNG/JPG，不裁切、不重新编码。 */
export async function createOriginalExport(entry: CatalogEntry): Promise<OriginalExport> {
  const folderName = safeSegment(`${entry.code}_${entry.name}`)
  const folder = `皮卡堂图鉴/${CATEGORY_DIR[entry.kind]}/${folderName}`
  const files: Array<{ path: string; base64: string }> = []
  const images: string[] = []

  const addBundle = (bundle: OfficialBundle, prefix = ''): void => {
    for (const [name, data] of bundle.files) {
      if (!ORIGINAL_IMAGE.test(name)) continue
      const relative = `${prefix}${name}`
      images.push(relative)
      files.push({
        path: `${folder}/original/${relative}`,
        base64: toBase64(data),
      })
    }
  }

  if (entry.kind === 'outfit' && entry.item) {
    addBundle(await getBundle(entry.item.zip, entry.item.md5))
  } else if (entry.kind === 'furniture' && entry.furniture) {
    addBundle(await getBundle(entry.furniture.zip, entry.furniture.md5))
  } else if (entry.kind === 'pet' && entry.pet) {
    const [petBundle, eggBundle] = await Promise.all([
      getBundle(entry.pet.petZip, entry.pet.petMd5),
      getBundle(entry.pet.eggZip, entry.pet.eggMd5),
    ])
    addBundle(petBundle, 'pet/')
    addBundle(eggBundle, 'egg/')
  }

  files.push({
    path: `${folder}/original/metadata.json`,
    base64: toBase64(
      new TextEncoder().encode(
        JSON.stringify({ code: entry.code, name: entry.name, images }, null, 2),
      ),
    ),
  })

  return { files, folder, imageCount: images.length }
}

export interface GifExport {
  file: { path: string; base64: string }
  frameCount: number
}

/** 动态图鉴直接导出循环 GIF；只有一帧时返回 null。 */
export async function createEntryGif(entry: CatalogEntry): Promise<GifExport | null> {
  const frames = await getEntryFrames(entry)
  if (!frames.gif || frames.gif.frames.length < 2) return null
  const bytes = encodeGif(
    frames.gif.frames.map((frame) => frame.image),
    frames.gif.delays,
  )
  const folderName = safeSegment(`${entry.code}_${entry.name}`)
  return {
    file: {
      path: `皮卡堂图鉴/${CATEGORY_DIR[entry.kind]}/${folderName}/animation.gif`,
      base64: toBase64(bytes),
    },
    frameCount: frames.gif.frames.length,
  }
}

export interface EntryExport {
  files: Array<{ path: string; base64: string }>
  frameCount: number
  folder: string
}

/**
 * 生成「一个物品一个文件夹」的导出文件列表。
 * selected 为 undefined 时导出全部帧；传入集合时只导出选中的帧。
 */
export async function createEntryExport(
  entry: CatalogEntry,
  selected?: ReadonlySet<string>,
): Promise<EntryExport> {
  const frames = await getEntryFrames(entry)
  const groups = selected
    ? frames.groups.map((group) => ({
        ...group,
        frames: group.frames.filter((frame) => selected.has(frameKey(group.dir, frame.name))),
      }))
    : frames.groups
  const chosenCount = groups.reduce((sum, group) => sum + group.frames.length, 0)
  const exportFrames: EntryFrames = {
    groups,
    sheet: selected ? undefined : frames.sheet,
    total: chosenCount,
  }
  const folderName = safeSegment(`${entry.code}_${entry.name}`)
  const folder = `皮卡堂图鉴/${CATEGORY_DIR[entry.kind]}/${folderName}`
  const files: Array<{ path: string; base64: string }> = []

  if (exportFrames.sheet) {
    files.push({ path: `${folder}/sheet.png`, base64: toPngBase64(exportFrames.sheet) })
  }

  const manifest: FrameManifest[] = []
  for (const group of groups) {
    group.frames.forEach((frame, index) => {
      const frameName = `${String(index + 1).padStart(3, '0')}_${safeSegment(frame.name)}.png`
      const relative = `${group.dir}/${frameName}`
      manifest.push({
        group: group.label,
        name: frame.name,
        file: relative,
        width: frame.image.width,
        height: frame.image.height,
      })
      files.push({
        path: `${folder}/${relative}`,
        base64: toPngBase64(frame.image),
      })
    })
  }

  files.push({
    path: `${folder}/metadata.json`,
    base64: metadataBase64(entry, exportFrames, manifest),
  })
  return { files, frameCount: chosenCount, folder }
}
