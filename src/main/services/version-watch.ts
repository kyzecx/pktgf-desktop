import type { ResourceVersionStatus } from '../../shared/contract'
import { loadCatalog } from './catalog'

/** 资源版本探测：与目录快照不一致时给一个非阻断提示。 */

const HOME = 'https://web.picatown.com/'
const TIMEOUT_MS = 15_000
const RECHECK_INTERVAL_MS = 30 * 60 * 1000

let last: ResourceVersionStatus | null = null
let inflight: Promise<ResourceVersionStatus> | null = null

export async function getResourceVersion(): Promise<ResourceVersionStatus> {
  if (last) return last
  return checkResourceVersion()
}

export async function checkResourceVersion(force = false): Promise<ResourceVersionStatus> {
  if (inflight) return inflight
  if (!force && last && Date.now() - last.checkedAt < RECHECK_INTERVAL_MS) return last

  inflight = run()
    .catch((error: unknown) => {
      const catalog = last
      return {
        mainScript: null,
        catalogMainScript: catalog?.catalogMainScript ?? '',
        upToDate: true,
        checkedAt: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      } satisfies ResourceVersionStatus
    })
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

  return {
    mainScript,
    catalogMainScript: payload.meta.mainScript,
    upToDate: mainScript === null || mainScript === payload.meta.mainScript,
    checkedAt: Date.now(),
    error: null,
  }
}
