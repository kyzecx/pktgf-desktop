import { openBundle, readSymbolImage, type OfficialBundle, type RgbaImage } from '@engine/index'
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

export interface EntryFrames {
  groups: FrameGroup[]
  /** 服饰原始 700×840 sheet；家具/宠物没有。 */
  sheet?: RgbaImage
  total: number
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

export function getEntryThumbnail(
  entry: CatalogEntry,
  petView: PetView = 'pet',
): Promise<string | null> {
  const cacheKey = entry.kind === 'pet' ? `${entry.key}:${petView}` : entry.key
  const cached = thumbnailCache.get(cacheKey)
  if (cached) return cached

  const task = (async () => {
    let image: RgbaImage | null = null
    if (entry.kind === 'outfit' && entry.item) image = await outfitImage(entry.item)
    if (entry.kind === 'furniture' && entry.furniture) image = await furnitureImage(entry.furniture)
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
    }
  }

  if (entry.kind === 'furniture' && entry.furniture) {
    const item = entry.furniture
    const bundle = await getBundle(item.zip, item.md5)
    const group = frameFromBundle(bundle, '帧', 'frames')
    return { groups: [group], total: group.frames.length }
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
    return { groups, total: groups.reduce((sum, group) => sum + group.frames.length, 0) }
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
