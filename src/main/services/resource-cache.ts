import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import type { CacheStats } from '../../shared/contract'
import { resourceCacheDir } from './paths'

/**
 * 官方资源磁盘缓存。
 *
 * URL 里带 md5，内容永不变化，所以直接当 content-addressed 存储用；
 * 不做 TTL / LRU 淘汰（用户可以在设置里手动清空）。
 */

const UPSTREAM = 'https://web.picatown.com/release/res/'
const TIMEOUT_MS = 30_000
const MAX_CONCURRENCY = 8

const EXTENSION_TYPES: Record<string, string> = {
  zip: 'application/zip',
  png: 'image/png',
  json: 'application/json',
  txt: 'text/plain; charset=utf-8',
}

class Semaphore {
  private readonly queue: Array<() => void> = []
  private active = 0

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolveQueue) => this.queue.push(resolveQueue))
    }
    this.active += 1
    try {
      return await task()
    } finally {
      this.active -= 1
      const next = this.queue.shift()
      if (next) next()
    }
  }
}

const gate = new Semaphore(MAX_CONCURRENCY)

/** 只允许官方 `release/res/**` 下的路径，且禁止穿越。 */
export function sanitizeResourcePath(rawPath: string): string | null {
  const path = decodeURIComponent(rawPath).replace(/^\/+/, '')
  if (!path || path.length > 512) return null
  if (path.includes('\\') || path.includes('\u0000')) return null
  const segments = path.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return null
  return path
}

function cacheTarget(path: string): string {
  const hash = createHash('sha1').update(path).digest('hex')
  return resolve(resourceCacheDir(), hash.slice(0, 2), `${hash}.bin`)
}

function contentTypeFor(path: string): string {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  return EXTENSION_TYPES[extension] ?? 'application/octet-stream'
}

export interface CachedResource {
  data: Uint8Array
  contentType: string
  fromCache: boolean
}

export async function getResource(path: string): Promise<CachedResource> {
  const target = cacheTarget(path)

  const cached = await readFile(target).catch(() => null)
  if (cached) {
    return { data: new Uint8Array(cached), contentType: contentTypeFor(path), fromCache: true }
  }

  return gate.run(async () => {
    // 等锁期间可能已被别的请求写好
    const second = await readFile(target).catch(() => null)
    if (second) {
      return { data: new Uint8Array(second), contentType: contentTypeFor(path), fromCache: true }
    }

    const data = await download(path)
    await mkdir(dirname(target), { recursive: true })
    const temporary = `${target}.${process.pid}.tmp`
    await writeFile(temporary, data)
    await rename(temporary, target)
    return { data, contentType: contentTypeFor(path), fromCache: false }
  })
}

async function download(path: string): Promise<Uint8Array> {
  const url = `${UPSTREAM}${path.split('/').map(encodeURIComponent).join('/')}`
  let lastError: unknown = null

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'user-agent': 'pktgf-desktop' },
      })
      if (!response.ok) {
        throw new ResourceFetchError(response.status, url)
      }
      return new Uint8Array(await response.arrayBuffer())
    } catch (error) {
      lastError = error
      if (error instanceof ResourceFetchError && error.status === 404) break
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export class ResourceFetchError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`官方资源请求失败 ${status}`)
    this.name = 'ResourceFetchError'
  }
}

export async function getCacheStats(): Promise<CacheStats> {
  const root = resourceCacheDir()
  let files = 0
  let bytes = 0

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const full = resolve(directory, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile()) {
        const info = await stat(full).catch(() => null)
        if (info) {
          files += 1
          bytes += info.size
        }
      }
    }
  }

  await walk(root)
  return { files, bytes }
}

export async function clearResourceCache(): Promise<void> {
  await rm(resourceCacheDir(), { recursive: true, force: true })
}
