import { BrowserWindow } from 'electron'

import { IPC, type ResourceVersionStatus } from '../../shared/contract'
import { rename, writeFile } from 'node:fs/promises'

import { buildCatalog } from './catalog-build'
import { loadCatalog, loadCatalogFull, resetCatalogCache, runtimeCatalogFile } from './catalog'
import { buildAndStorePatch } from './resource-patch'

/**
 * 资源版本守护。
 *
 * 发现官方发新版 → **在应用内重建整份目录快照**（`catalog-build.ts`，与 CLI 同一份代码），
 * 写到 userData 后热替换；重建失败才退回「只换 md5」的增量补丁。
 * 这样官方更新后用户不用等我们发版。启动跑一次，之后每 5 分钟一次。
 */

const HOME = 'https://web.picatown.com/'
const TIMEOUT_MS = 15_000
/** 5 分钟一次（用户要求）；手动检查不受限制 */
const RECHECK_INTERVAL_MS = 5 * 60 * 1000

let last: ResourceVersionStatus | null = null
let inflight: Promise<ResourceVersionStatus> | null = null
let timer: NodeJS.Timeout | null = null

export async function getResourceVersion(): Promise<ResourceVersionStatus> {
  if (last) return last
  return checkResourceVersion()
}

/** 后台定时检查（启动时调一次，之后每 5 分钟）。 */
export function startVersionWatch(): void {
  if (timer) return
  timer = setInterval(() => {
    void checkResourceVersion().catch(() => undefined)
  }, RECHECK_INTERVAL_MS)
  timer.unref?.()
}

export function stopVersionWatch(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}

export async function checkResourceVersion(force = false): Promise<ResourceVersionStatus> {
  if (inflight) return inflight
  if (!force && last && Date.now() - last.checkedAt < RECHECK_INTERVAL_MS) return last

  inflight = run()
    .catch((error: unknown) => ({
      mainScript: null,
      catalogMainScript: last?.catalogMainScript ?? '',
      upToDate: true,
      checkedAt: Date.now(),
      error: error instanceof Error ? error.message : String(error),
      patched: 0,
      added: 0,
      applied: false,
    }))
    .finally(() => {
      inflight = null
    })

  last = await inflight
  return last
}

async function run(): Promise<ResourceVersionStatus> {
  const payload = await loadCatalog()
  const response = await fetch(HOME, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'user-agent': 'pktgf-desktop' },
  })
  if (!response.ok) throw new Error(`首页请求失败 ${response.status}`)

  const html = await response.text()
  const mainScript = /Main_[0-9A-Za-z_.]+\.js/.exec(html)?.[0] ?? null
  const upToDate = mainScript === null || mainScript === payload.meta.mainScript

  if (upToDate) {
    return {
      mainScript,
      catalogMainScript: payload.meta.mainScript,
      upToDate: true,
      checkedAt: Date.now(),
      error: null,
      patched: 0,
      added: 0,
      applied: false,
    }
  }

  // 发现新版本：先尝试重建整份目录（新家具/新房型也能跟上），失败再退回只换 md5
  let patched = 0
  let added = 0
  let applied = false
  let rebuilt = false
  let catalogMainScript = payload.meta.mainScript
  let patchError: string | null = null

  try {
    broadcastProgress('开始重建目录…')
    const built = await buildCatalog({ onProgress: (stage) => broadcastProgress(stage) })
    // 先写临时文件再改名：中途失败不会留下半个快照
    const target = runtimeCatalogFile()
    await writeFile(`${target}.tmp`, built.gz)
    await rename(`${target}.tmp`, target)
    patched = 0
    catalogMainScript = built.meta.mainScript
    applied = true
    rebuilt = true
    broadcastProgress('目录已更新')
  } catch (error) {
    patchError = error instanceof Error ? error.message : String(error)
    broadcastProgress(`重建失败，改用增量补丁：${patchError}`)
    try {
      const patch = await buildAndStorePatch(await loadCatalogFull())
      if (patch) {
        patched = patch.patched
        added = patch.added
        catalogMainScript = patch.mainScript
        if (patch.patched > 0) applied = true
      }
    } catch (patchFailure) {
      patchError = patchFailure instanceof Error ? patchFailure.message : String(patchFailure)
    }
  }

  if (applied) resetCatalogCache()

  const status: ResourceVersionStatus = {
    mainScript,
    catalogMainScript,
    upToDate: applied || (!patchError && catalogMainScript === payload.meta.mainScript),
    checkedAt: Date.now(),
    error: patchError,
    patched,
    added,
    applied,
    rebuilt,
  }

  if (applied) {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IPC.resourceUpdated, status)
    }
  }

  return status
}

/** 重建过程的分阶段进度（设置页会显示）。 */
function broadcastProgress(stage: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC.resourceProgress, { stage })
  }
}

/**
 * 手动触发一次完整重建（设置页按钮）。
 *
 * 不看版本号，直接重拉官方配置重建 —— 用来补上「只换了 md5 的补丁」留下的缺口。
 */
export async function rebuildCatalogNow(): Promise<ResourceVersionStatus> {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      broadcastProgress('开始重建目录…')
      const built = await buildCatalog({ onProgress: (stage) => broadcastProgress(stage) })
      const target = runtimeCatalogFile()
      await writeFile(`${target}.tmp`, built.gz)
      await rename(`${target}.tmp`, target)
      resetCatalogCache()
      const status: ResourceVersionStatus = {
        mainScript: built.meta.mainScript,
        catalogMainScript: built.meta.mainScript,
        upToDate: true,
        checkedAt: Date.now(),
        error: null,
        patched: 0,
        added: 0,
        applied: true,
        rebuilt: true,
      }
      last = status
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(IPC.resourceUpdated, status)
      }
      return status
    } catch (error) {
      return {
        mainScript: null,
        catalogMainScript: last?.catalogMainScript ?? '',
        upToDate: false,
        checkedAt: Date.now(),
        error: error instanceof Error ? error.message : String(error),
        patched: 0,
        added: 0,
        applied: false,
        rebuilt: false,
      }
    } finally {
      inflight = null
    }
  })()
  return inflight
}
