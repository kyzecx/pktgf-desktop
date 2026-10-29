import * as React from 'react'

import type { CatalogAssets, CatalogItem } from '@shared/contract'
import { composeActor, composeSmallActor, OFFICIAL_SPEC } from '@engine/index'
import {
  getBaseActor,
  getCostume,
  getSmallBaseActor,
  getSmallCostume,
  toDataUrl,
} from '@/services/assets'
import { useOutfitStore } from '../state/outfit-store'

export type ThumbnailMode = 'large' | 'small'
type ThumbnailSex = 1 | 2

let thumbnailAssets: CatalogAssets | null = null

/** 由搭配页注入，用于把缩略图合成到基础角色上。 */
export function setThumbnailAssets(assets: CatalogAssets | null): void {
  thumbnailAssets = assets
}

/**
 * 缩略图按需渲染。
 *
 * 只渲染视口内的物品；用 4 并发的队列避免一次性拉爆网络和主线程，
 * 结果做 LRU（800 条，按大/小模型和性别分开缓存）。
 *
 * 男女通用服饰（sex=0）用当前选中的性别做底板，否则男性列表里
 * 会出现女性身体。
 */

const CACHE_LIMIT = 800
const CONCURRENCY = 4

const cache = new Map<string, string>()
const pending = new Map<string, Array<(url: string | null) => void>>()
const queue: Array<{ item: CatalogItem; mode: ThumbnailMode; sex: ThumbnailSex }> = []
let active = 0

function sexFor(item: CatalogItem, selectedSex: ThumbnailSex): ThumbnailSex {
  return item.sex === 1 ? 1 : item.sex === 2 ? 2 : selectedSex
}

function cacheKey(item: CatalogItem, mode: ThumbnailMode, sex: ThumbnailSex): string {
  return `${mode}:${item.code}:${sex}`
}

function remember(key: string, url: string): void {
  cache.set(key, url)
  if (cache.size <= CACHE_LIMIT) return
  const oldest = cache.keys().next().value
  if (oldest !== undefined) cache.delete(oldest)
}

function pump(): void {
  while (active < CONCURRENCY && queue.length > 0) {
    const job = queue.shift()
    if (!job) return
    const key = cacheKey(job.item, job.mode, job.sex)
    if (cache.has(key)) {
      resolve(key, cache.get(key) ?? null)
      continue
    }

    active += 1
    void render(job.item, job.mode, job.sex)
      .then((url) => {
        if (url) remember(key, url)
        resolve(key, url)
      })
      .catch(() => resolve(key, null))
      .finally(() => {
        active -= 1
        pump()
      })
  }
}

function resolve(key: string, url: string | null): void {
  const waiters = pending.get(key)
  pending.delete(key)
  for (const waiter of waiters ?? []) waiter(url)
}

async function render(item: CatalogItem, mode: ThumbnailMode, sex: ThumbnailSex): Promise<string> {
  return mode === 'small' ? renderSmall(item, sex) : renderLarge(item, sex)
}

async function renderLarge(item: CatalogItem, sex: ThumbnailSex): Promise<string> {
  const costume = await getCostume(item)

  // 有基础角色时合成「穿上这件物品」的样子，和游戏内图标一致；
  // 否则退回只画物品自己的大图帧。
  if (thumbnailAssets) {
    const base = await getBaseActor(sex, thumbnailAssets)
    const composed = composeActor({
      spec: OFFICIAL_SPEC,
      base,
      worn: { [item.part]: costume },
    })
    return toDataUrl(composed)
  }

  const frame = costume.frontHead ?? costume.body ?? costume.frames[0] ?? null
  return frame ? toDataUrl(frame) : ''
}

async function renderSmall(item: CatalogItem, sex: ThumbnailSex): Promise<string> {
  // 小图必须依附基础角色；没有资源时退回大图，至少不出现空卡片。
  if (!thumbnailAssets) return renderLarge(item, sex)

  const [base, art] = await Promise.all([getSmallBaseActor(thumbnailAssets), getSmallCostume(item)])
  // 只看服饰本身的小图；基础身体永远有像素，不能拿整张合成图判断。
  // 头/臂/腿现在是帧数组（官方按帧号取），任意一帧有像素就算有内容。
  const hasSmallArt = [
    art.front.head?.[0],
    art.front.body,
    art.front.arm?.[0],
    art.front.leg?.[0],
  ].some((image) => image && hasVisiblePixels(image))
  if (!hasSmallArt) return renderLarge(item, sex)

  const composed = composeSmallActor({
    base,
    worn: { [item.part]: { art, useMask: item.useMask, coverHead: item.coverHead } },
    direction: 'front',
  })
  return toDataUrl(composed)
}

function hasVisiblePixels(image: { data: Uint8ClampedArray }): boolean {
  for (let index = 3; index < image.data.length; index += 4) {
    if ((image.data[index] ?? 0) > 0) return true
  }
  return false
}

function request(
  item: CatalogItem,
  mode: ThumbnailMode,
  sex: ThumbnailSex,
  callback: (url: string | null) => void,
): () => void {
  const key = cacheKey(item, mode, sex)
  const cached = cache.get(key)
  if (cached !== undefined) {
    callback(cached || null)
    return () => undefined
  }

  const waiters = pending.get(key)
  if (waiters) {
    waiters.push(callback)
  } else {
    pending.set(key, [callback])
    queue.push({ item, mode, sex })
    pump()
  }

  return () => {
    const list = pending.get(key)
    if (!list) return
    const index = list.indexOf(callback)
    if (index >= 0) list.splice(index, 1)
  }
}

export function useThumbnail(
  item: CatalogItem | null,
  mode: ThumbnailMode = 'large',
): string | null {
  const selectedSex = useOutfitStore((state) => state.sex)
  const sex = item ? sexFor(item, selectedSex) : selectedSex
  const initialKey = item ? cacheKey(item, mode, sex) : null
  const [url, setUrl] = React.useState<string | null>(() =>
    initialKey ? (cache.get(initialKey) ?? null) : null,
  )

  React.useEffect(() => {
    if (!item) {
      setUrl(null)
      return
    }
    let alive = true
    const currentSex = sexFor(item, selectedSex)
    const key = cacheKey(item, mode, currentSex)
    const cached = cache.get(key)
    if (cached !== undefined) {
      setUrl(cached || null)
      return
    }
    setUrl(null)
    const cancel = request(item, mode, currentSex, (next) => {
      if (alive) setUrl(next)
    })
    return () => {
      alive = false
      cancel()
    }
  }, [item, mode, selectedSex])

  return url
}
