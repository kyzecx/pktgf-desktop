import { app, shell } from 'electron'
import { open, mkdir, rename, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'

import type { AppUpdateCheck, AppUpdateDownload, AppUpdateProgress } from '../../shared/contract'

/**
 * GitHub Releases 更新检查与安装包下载。
 *
 * 不引入 electron-updater：未签名包无法可靠地自动替换自身，
 * 这里只负责「检查版本 → 下载对应平台安装包 → 在文件管理器里打开」，
 * 由用户运行安装包完成更新。
 */

const OWNER = 'kyzecx'
const REPO = 'pktgf-desktop'
const RELEASES_URL = `https://github.com/${OWNER}/${REPO}/releases`
const API_URL = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`
const REQUEST_TIMEOUT_MS = 15_000
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000

interface GitHubAsset {
  name?: string
  size?: number
  browser_download_url?: string
}

interface GitHubRelease {
  tag_name?: string
  name?: string
  body?: string | null
  html_url?: string
  published_at?: string | null
  assets?: GitHubAsset[]
}

let lastCheck: AppUpdateCheck | null = null
let lastAssetUrl: string | null = null
let lastAssetSize = 0

export async function checkAppUpdate(): Promise<AppUpdateCheck> {
  const currentVersion = app.getVersion()

  try {
    const response = await fetch(API_URL, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': `pktgf-desktop/${currentVersion}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    // 仓库还没有发布 release
    if (response.status === 404) {
      lastCheck = {
        currentVersion,
        latestVersion: null,
        available: false,
        releaseUrl: RELEASES_URL,
        notes: null,
        assetName: null,
        publishedAt: null,
        error: null,
      }
      return lastCheck
    }
    if (!response.ok) {
      throw new Error(`GitHub API 请求失败 ${response.status}`)
    }

    const release = (await response.json()) as GitHubRelease
    const latestVersion = normalizeVersion(release.tag_name ?? release.name ?? '')
    if (!latestVersion) throw new Error('无法解析 GitHub Release 版本号')

    const available = compareVersions(latestVersion, currentVersion) > 0
    const asset = available ? pickAsset(release.assets ?? []) : null
    lastAssetUrl = asset?.browser_download_url ?? null
    lastAssetSize = Number(asset?.size) || 0

    lastCheck = {
      currentVersion,
      latestVersion,
      available,
      releaseUrl: release.html_url?.trim() || RELEASES_URL,
      notes: release.body?.trim() || null,
      assetName: asset?.name ?? null,
      publishedAt: release.published_at ?? null,
      error: null,
    }
    return lastCheck
  } catch (error) {
    lastCheck = {
      currentVersion,
      latestVersion: null,
      available: false,
      releaseUrl: RELEASES_URL,
      notes: null,
      assetName: null,
      publishedAt: null,
      error: error instanceof Error ? error.message : String(error),
    }
    return lastCheck
  }
}

export async function downloadAppUpdate(
  onProgress?: (progress: AppUpdateProgress) => void,
): Promise<AppUpdateDownload> {
  const check = lastCheck ?? (await checkAppUpdate())
  const releaseUrl = check.releaseUrl
  if (!check.available) {
    return {
      downloaded: false,
      path: null,
      releaseUrl,
      error: check.error ?? '当前已是最新版本',
    }
  }
  if (!lastAssetUrl) {
    return {
      downloaded: false,
      path: null,
      releaseUrl,
      error: '该版本没有当前平台的安装包，请到 GitHub 发布页下载',
    }
  }

  const fileName = sanitizeAssetName(lastAssetName(check), check.latestVersion)
  const folder = join(app.getPath('downloads'), '皮卡堂工坊更新')
  const target = join(folder, fileName)
  const part = `${target}.part`
  let handle: Awaited<ReturnType<typeof open>> | null = null

  try {
    await mkdir(folder, { recursive: true })
    const response = await fetch(lastAssetUrl, {
      headers: { 'user-agent': `pktgf-desktop/${check.currentVersion}` },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    })
    if (!response.ok || !response.body) {
      throw new Error(`安装包下载失败 ${response.status}`)
    }

    const total = Number(response.headers.get('content-length')) || lastAssetSize
    let transferred = 0
    onProgress?.({ percent: 0, transferred: 0, total })

    handle = await open(part, 'w')
    const reader = response.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      await handle.write(value)
      transferred += value.byteLength
      onProgress?.({
        percent: total > 0 ? Math.min(100, Math.round((transferred / total) * 100)) : 0,
        transferred,
        total,
      })
    }
    await handle.close()
    handle = null

    await rm(target, { force: true })
    await rename(part, target)
    shell.showItemInFolder(target)
    return { downloaded: true, path: target, releaseUrl, error: null }
  } catch (error) {
    await handle?.close().catch(() => undefined)
    await rm(part, { force: true }).catch(() => undefined)
    return {
      downloaded: false,
      path: null,
      releaseUrl,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function lastAssetName(check: AppUpdateCheck): string {
  return check.assetName ?? `pktgf-update-${check.latestVersion ?? 'latest'}.bin`
}

/** 只接受 GitHub 域名的 https 资源，避免被伪造的 API 响应带去任意地址。 */
function isSafeDownloadUrl(value: string | undefined): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'github.com' ||
        url.hostname.endsWith('.github.com') ||
        url.hostname.endsWith('.githubusercontent.com'))
    )
  } catch {
    return false
  }
}

function pickAsset(assets: GitHubAsset[]): GitHubAsset | null {
  const usable = assets.filter(
    (asset): asset is GitHubAsset & { name: string; browser_download_url: string } =>
      Boolean(asset.name) && isSafeDownloadUrl(asset.browser_download_url),
  )

  const archTokens =
    process.arch === 'arm64' ? ['arm64', 'aarch64'] : ['x64', 'x86_64', 'amd64', 'intel']
  const preferArch = (list: typeof usable): GitHubAsset | null =>
    list.find((asset) => archTokens.some((token) => asset.name.toLowerCase().includes(token))) ??
    list[0] ??
    null

  if (process.platform === 'darwin') {
    return preferArch(usable.filter((asset) => /\.dmg$/i.test(asset.name)))
  }
  if (process.platform === 'win32') {
    return preferArch(usable.filter((asset) => /\.exe$/i.test(asset.name)))
  }
  if (process.platform === 'linux') {
    const appImage = usable.filter((asset) => /\.appimage$/i.test(asset.name))
    if (appImage.length > 0) return preferArch(appImage)
    return preferArch(usable.filter((asset) => /\.deb$/i.test(asset.name)))
  }
  return null
}

function normalizeVersion(value: string): string | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/i.exec(value.trim())
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null
}

function compareVersions(a: string, b: string): number {
  const parse = (value: string): number[] =>
    value.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const left = parse(a)
  const right = parse(b)
  for (let index = 0; index < 3; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

function sanitizeAssetName(name: string, version: string | null): string {
  const base = basename(name)
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
  return base || `pktgf-update-${version ?? 'latest'}.bin`
}
