import { app } from 'electron'
import { resolve } from 'node:path'

/** 用户数据目录：缓存、窗口状态、日志都在这里。 */
export function dataDir(): string {
  return app.getPath('userData')
}

export function cacheDir(): string {
  return resolve(dataDir(), 'cache')
}

export function resourceCacheDir(): string {
  return resolve(cacheDir(), 'res')
}

/**
 * 随包分发的只读资源目录。
 * 开发时是仓库里的 `resources/`，打包后是 `process.resourcesPath`。
 */
export function bundledResourceDir(): string {
  return app.isPackaged ? process.resourcesPath : resolve(process.cwd(), 'resources')
}
