import {
  buildCostume,
  buildCustomCostume,
  buildCustomSmallCostume,
  buildSmallCostume,
  composeActor,
  composeSmallActor,
  crop,
  encodePng,
  loadBaseActor,
  loadFaceLook,
  loadSmallBaseActor,
  openBundle,
  readSymbolImage,
  type CostumeInstance,
  type OfficialSpec,
  type RgbaImage,
  type Sex,
  type SmallBaseActorArt,
  type SmallCostumeArt,
  type SmallWorn,
} from '@engine/index'
import { OFFICIAL_SPEC } from '@engine/index'
import type { CatalogAssets, CatalogFace, CatalogItem, Part } from '@shared/contract'

/**
 * 渲染进程的资源访问层。
 *
 * 所有官方资源都通过 `pktres://` 走主进程：本机直连 + 磁盘缓存，
 * 这里只做内存缓存与引擎调用，不关心网络。
 */

const spec: OfficialSpec = OFFICIAL_SPEC

const ZIP_CACHE_LIMIT = 64
const COSTUME_CACHE_LIMIT = 256

const zipCache = new Map<string, Promise<Uint8Array>>()
const costumeCache = new Map<string, Promise<CostumeInstance>>()
const faceCache = new Map<string, Promise<RgbaImage | null>>()
const baseCache = new Map<string, Promise<Awaited<ReturnType<typeof loadBaseActor>>>>()

/** `<dir>/<md5>_<name>`，与官方 CDN 的路径规则一致。 */
export function resourceUrl(key: string, md5: string): string {
  const slash = key.lastIndexOf('/')
  const dir = slash >= 0 ? key.slice(0, slash + 1) : ''
  const name = key.slice(slash + 1)
  const path = `${dir}${md5}_${name}`
  return `pktres://res/${path.split('/').map(encodeURIComponent).join('/')}`
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const cached = zipCache.get(url)
  if (cached) return cached

  const promise = fetch(url)
    .then(async (response) => {
      if (!response.ok) throw new Error(`资源请求失败 ${response.status}`)
      return new Uint8Array(await response.arrayBuffer())
    })
    .catch((error) => {
      zipCache.delete(url)
      throw error
    })

  zipCache.set(url, promise)
  while (zipCache.size > ZIP_CACHE_LIMIT) {
    const oldest = zipCache.keys().next().value
    if (oldest === undefined) break
    zipCache.delete(oldest)
  }
  return promise
}

export function getCostume(item: CatalogItem): Promise<CostumeInstance> {
  const cached = costumeCache.get(item.code)
  if (cached) return cached

  const promise = fetchBytes(resourceUrl(item.zip, item.md5)).then((bytes) =>
    buildCostume({
      spec,
      code: item.code,
      part: item.part,
      zipBytes: bytes,
      flags: {
        useMask: item.useMask,
        coverHead: item.coverHead,
        displaytemplate: item.displaytemplate,
        motionName: item.motion,
      },
    }),
  )

  promise.catch(() => costumeCache.delete(item.code))
  costumeCache.set(item.code, promise)
  while (costumeCache.size > COSTUME_CACHE_LIMIT) {
    const oldest = costumeCache.keys().next().value
    if (oldest === undefined) break
    costumeCache.delete(oldest)
  }
  return promise
}

export function getBaseActor(sex: Sex, assets: CatalogAssets) {
  const key = `base-${sex}`
  const cached = baseCache.get(key)
  if (cached) return cached

  const promise = fetchBytes(resourceUrl(assets.baseActor.key, assets.baseActor.md5)).then(
    (bytes) => loadBaseActor({ spec, sex, zipBytes: bytes }),
  )
  promise.catch(() => baseCache.delete(key))
  baseCache.set(key, promise)
  return promise
}

export function getFaceLook(face: CatalogFace | null, sex: Sex): Promise<RgbaImage | null> {
  if (!face) return Promise.resolve(null)
  const key = `${face.code}-${sex}`
  const cached = faceCache.get(key)
  if (cached) return cached

  const promise = fetchBytes(resourceUrl(face.zip, face.md5)).then((bytes) =>
    loadFaceLook(bytes, face.code, sex),
  )
  promise.catch(() => faceCache.delete(key))
  faceCache.set(key, promise)
  return promise
}

const customCache = new Map<string, Promise<CostumeInstance>>()

const smallBaseCache = new Map<string, Promise<SmallBaseActorArt>>()
const smallCostumeCache = new Map<string, Promise<SmallCostumeArt>>()
const customSmallCache = new Map<string, Promise<SmallCostumeArt>>()
const faceMiniCache = new Map<string, Promise<RgbaImage | null>>()
const faceMiniUrlCache = new Map<string, Promise<string | null>>()

/** 小模型的基础头/身/手/腿：和基础角色包同一个 actor sheet。 */
export function getSmallBaseActor(assets: CatalogAssets): Promise<SmallBaseActorArt> {
  const key = assets.baseActor.md5
  const cached = smallBaseCache.get(key)
  if (cached) return cached

  const promise = fetchBytes(resourceUrl(assets.baseActor.key, assets.baseActor.md5)).then(
    (bytes) => loadSmallBaseActor({ zipBytes: bytes }),
  )
  promise.catch(() => smallBaseCache.delete(key))
  smallBaseCache.set(key, promise)
  return promise
}

/** 一件服饰的 40×60 小图（正面第 0 帧）。 */
export function getSmallCostume(item: CatalogItem): Promise<SmallCostumeArt> {
  const cached = smallCostumeCache.get(item.code)
  if (cached) return cached

  const promise = fetchBytes(resourceUrl(item.zip, item.md5)).then((bytes) =>
    buildSmallCostume({ part: item.part, code: item.code, zipBytes: bytes }),
  )
  promise.catch(() => smallCostumeCache.delete(item.code))
  smallCostumeCache.set(item.code, promise)
  return promise
}

/** 表情小图 `<code>_3_mini`（40×60）；同时供预览和表情选择器使用。 */
export function getFaceMiniImage(face: CatalogFace): Promise<RgbaImage | null> {
  const cached = faceMiniCache.get(face.code)
  if (cached) return cached

  const promise = fetchBytes(resourceUrl(face.zip, face.md5)).then((bytes) => {
    const bundle = openBundle(bytes)
    return readSymbolImage(bundle, `${face.code}_3_mini`)
  })
  promise.catch(() => faceMiniCache.delete(face.code))
  faceMiniCache.set(face.code, promise)
  return promise
}

/** 表情选择器用的 data URL：裁掉小图下方空白，只留头部。 */
export function getFaceMiniUrl(face: CatalogFace): Promise<string | null> {
  const cached = faceMiniUrlCache.get(face.code)
  if (cached) return cached

  const promise = getFaceMiniImage(face).then((image) =>
    image ? toDataUrl(cropHead(image)) : null,
  )
  promise.catch(() => faceMiniUrlCache.delete(face.code))
  faceMiniUrlCache.set(face.code, promise)
  return promise
}

/** 默认表情：基础小模型头。 */
export function getDefaultFaceMiniUrl(assets: CatalogAssets): Promise<string> {
  return getSmallBaseActor(assets).then((base) => toDataUrl(cropHead(base.front.head)))
}

function cropHead(image: RgbaImage): RgbaImage {
  return crop(image, { x: 0, y: 0, w: image.width, h: Math.min(image.height, 44) })
}

export interface CustomCostumeSource {
  id: string
  part: string
  /** 700×840 静态 sheet */
  dataUrl: string
  /** 动态素材的 100×150 帧条 */
  animateDataUrl?: string
}

/** 自建素材的小模型图层：只读静态 sheet 左侧的 40×60 格子。 */
export function getCustomSmallCostume(asset: CustomCostumeSource): Promise<SmallCostumeArt> {
  const cached = customSmallCache.get(asset.id)
  if (cached) return cached

  const promise = fetch(asset.dataUrl)
    .then((response) => response.arrayBuffer())
    .then((buffer) =>
      buildCustomSmallCostume({
        spec,
        part: asset.part as Part,
        png: new Uint8Array(buffer),
      }),
    )
  promise.catch(() => customSmallCache.delete(asset.id))
  customSmallCache.set(asset.id, promise)
  return promise
}

export interface ComposeSmallRequest {
  worn: Record<string, CatalogItem | undefined>
  base: SmallBaseActorArt
  face: RgbaImage | null
  custom?: CustomCostumeSource[]
}

export interface SmallComposeResult {
  front: RgbaImage
  back: RgbaImage
}

/** 小模型合成（正面 + 背面）：缺资源时跳过该层，不让整张预览失败。 */
export async function composeSmallFromCatalog(
  request: ComposeSmallRequest,
): Promise<SmallComposeResult> {
  const entries = Object.entries(request.worn).filter((entry): entry is [string, CatalogItem] =>
    Boolean(entry[1]),
  )

  const worn: SmallWorn = {}
  await Promise.all(
    entries.map(async ([part, item]) => {
      try {
        const art = await getSmallCostume(item)
        worn[part as Part] = {
          art,
          useMask: item.useMask,
          coverHead: item.coverHead,
        }
      } catch (error) {
        console.warn('[assets] 小模型服饰加载失败', item.code, error)
      }
    }),
  )

  for (const asset of request.custom ?? []) {
    try {
      const art = await getCustomSmallCostume(asset)
      worn[asset.part as Part] = { art, useMask: false, coverHead: false }
    } catch (error) {
      console.warn('[assets] 自建素材小模型加载失败', asset.id, error)
    }
  }

  return {
    front: composeSmallActor({
      base: request.base,
      worn,
      face: request.face,
      direction: 'front',
    }),
    back: composeSmallActor({ base: request.base, worn, direction: 'back' }),
  }
}

const uiIconCache = new Map<string, Promise<Partial<Record<Part, string>>>>()

/**
 * 分类图标：uiRes 包里的小符号 → data URL。
 *
 * 图标只有 16×16，但只能整包取；整包一次解压后缓存住，
 * 后续分类切换不再碰网络。失败时返回空表，界面回退到文字。
 */
export async function getPartIconUrls(
  uiIcons: CatalogAssets['uiIcons'],
): Promise<Partial<Record<Part, string>>> {
  if (!uiIcons) return {}

  const key = `${uiIcons.key}:${uiIcons.md5}`
  const cached = uiIconCache.get(key)
  if (cached) return cached

  const promise = fetchBytes(resourceUrl(uiIcons.key, uiIcons.md5))
    .then((bundleBytes) => {
      const bundle = openBundle(bundleBytes)
      const icons: Partial<Record<Part, string>> = {}
      for (const [part, symbol] of Object.entries(uiIcons.symbols)) {
        if (!symbol) continue
        const image = readSymbolImage(bundle, symbol)
        if (image) icons[part as Part] = toDataUrl(image)
      }
      return icons
    })
    .catch((error) => {
      uiIconCache.delete(key)
      throw error
    })

  uiIconCache.set(key, promise)
  return promise
}

/** 自建素材：静态 sheet + 可选动态帧条 → CostumeInstance。 */
export function getCustomCostume(asset: CustomCostumeSource): Promise<CostumeInstance> {
  const cached = customCache.get(asset.id)
  if (cached) return cached

  const promise = Promise.all([
    fetch(asset.dataUrl).then((response) => response.arrayBuffer()),
    asset.animateDataUrl
      ? fetch(asset.animateDataUrl).then((response) => response.arrayBuffer())
      : Promise.resolve(null),
  ]).then(([buffer, animate]) =>
    buildCustomCostume({
      spec,
      id: asset.id,
      part: asset.part as never,
      png: new Uint8Array(buffer),
      animatePng: animate ? new Uint8Array(animate) : undefined,
    }),
  )

  promise.catch(() => customCache.delete(asset.id))
  customCache.set(asset.id, promise)
  return promise
}

export interface ComposeRequest {
  sex: Sex
  worn: Record<string, CatalogItem | undefined>
  base: Awaited<ReturnType<typeof loadBaseActor>>
  face: RgbaImage | null
  showActorBase?: boolean
  /** 动态物品的帧号 */
  frame?: number
  /** 自建素材，优先于目录里的同部位服饰 */
  custom?: CustomCostumeSource[]
}

/** 合成角色。缺少资源时跳过该层，保证预览不整体失败。 */
export async function composeFromCatalog(request: ComposeRequest): Promise<RgbaImage> {
  const entries = Object.entries(request.worn).filter((entry): entry is [string, CatalogItem] =>
    Boolean(entry[1]),
  )

  const costumes = await Promise.all(
    entries.map(async ([part, item]) => {
      try {
        return [part, await getCostume(item)] as const
      } catch (error) {
        console.warn('[assets] 服饰资源加载失败', item.code, error)
        return null
      }
    }),
  )

  const worn: Record<string, CostumeInstance> = {}
  for (const entry of costumes) {
    if (entry) worn[entry[0]] = entry[1]
  }

  for (const asset of request.custom ?? []) {
    try {
      worn[asset.part] = await getCustomCostume(asset)
    } catch (error) {
      console.warn('[assets] 自建素材加载失败', asset.id, error)
    }
  }

  return composeActor({
    spec,
    base: request.base,
    face: request.face,
    worn,
    showActorBase: request.showActorBase ?? true,
    frame: request.frame ?? 0,
  })
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

export function toPngBase64(image: RgbaImage): string {
  const bytes = encodePng(image)
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

export function toDataUrl(image: RgbaImage): string {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const context = canvas.getContext('2d')
  if (!context) return ''
  context.putImageData(
    new ImageData(
      image.data as unknown as Uint8ClampedArray<ArrayBuffer>,
      image.width,
      image.height,
    ),
    0,
    0,
  )
  return canvas.toDataURL('image/png')
}

export { spec }
