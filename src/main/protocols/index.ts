import { protocol } from 'electron'
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

import { getResource, ResourceFetchError, sanitizeResourcePath } from '../services/resource-cache'

/**
 * 两个自定义协议：
 *
 *   app://bundle/**   打包后的渲染层静态文件
 *   pktres://res/**   官方资源（主进程按需下载并磁盘缓存）
 *
 * 为什么不用 file://：origin 会是 null，localStorage / IndexedDB / CacheStorage
 * 全部不可用。注册成 standard + secure 的自定义协议才有正常 origin。
 */

export const APP_SCHEME = 'app'
export const RES_SCHEME = 'pktres'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
}

export function registerSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
    {
      scheme: RES_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ])
}

export function registerProtocolHandlers(rendererRoot: string): void {
  const root = resolve(rendererRoot)

  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url)
    const requested = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'
    const target = resolve(root, requested)

    // 防穿越：解析后必须仍在 root 内
    if (target !== root && !target.startsWith(root + sep)) {
      return new Response('Forbidden', { status: 403 })
    }

    const data = await readFile(target).catch(() => null)
    if (!data) return new Response('Not Found', { status: 404 })

    return new Response(data, {
      headers: {
        'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
      },
    })
  })

  protocol.handle(RES_SCHEME, async (request) => {
    const url = new URL(request.url)
    // pktres://res/<path...>
    if (url.hostname !== 'res') return new Response('Not Found', { status: 404 })

    const path = sanitizeResourcePath(url.pathname)
    if (!path) return new Response('Bad Request', { status: 400 })

    try {
      const { data, contentType, fromCache } = await getResource(path)
      return new Response(data, {
        headers: {
          'content-type': contentType,
          // 路径内嵌 md5，内容不变
          'cache-control': 'public, max-age=31536000, immutable',
          'x-pkt-cache': fromCache ? 'hit' : 'miss',
        },
      })
    } catch (error) {
      if (error instanceof ResourceFetchError) {
        return new Response(`Upstream ${error.status}`, {
          status: error.status === 404 ? 404 : 502,
        })
      }
      console.error('[pktres] 请求失败', path, error)
      return new Response('Bad Gateway', { status: 502 })
    }
  })
}

/** 给主进程自己的诊断用（不经过协议）。 */
export function resourceUrlFor(path: string): string {
  return `${RES_SCHEME}://res/${path.split('/').map(encodeURIComponent).join('/')}`
}

export function rendererFileUrl(relative: string): string {
  return pathToFileURL(resolve(relative)).toString()
}
