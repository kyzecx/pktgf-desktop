import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
  uniquePath as uniquePathShared,
  usableDir as usableDirShared,
} from '../../shared/export-path'

import type { ExportPrefs } from '../../shared/contract'
import { dataDir } from './paths'

/**
 * 导出偏好：保存目录 + 保存后是否自动在文件管理器里显示。
 *
 * 存主进程而不是 localStorage：真正落盘的是主进程，
 * 而且目录选择要走系统对话框（只能主进程弹）。
 */

const PREFS_FILE = 'export-prefs.json'

const DEFAULTS: ExportPrefs = { dir: null, openAfterSave: false }

export async function readExportPrefs(): Promise<ExportPrefs> {
  const raw = await readFile(resolve(dataDir(), PREFS_FILE), 'utf8').catch(() => null)
  if (!raw) return { ...DEFAULTS }
  try {
    const parsed = JSON.parse(raw) as Partial<ExportPrefs>
    return {
      dir: typeof parsed.dir === 'string' && parsed.dir.trim() ? parsed.dir : null,
      openAfterSave: Boolean(parsed.openAfterSave),
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export async function writeExportPrefs(patch: Partial<ExportPrefs>): Promise<ExportPrefs> {
  const current = await readExportPrefs()
  const next: ExportPrefs = {
    dir: patch.dir !== undefined ? (patch.dir && patch.dir.trim() ? patch.dir : null) : current.dir,
    openAfterSave:
      patch.openAfterSave !== undefined ? Boolean(patch.openAfterSave) : current.openAfterSave,
  }
  await mkdir(dataDir(), { recursive: true })
  await writeFile(resolve(dataDir(), PREFS_FILE), JSON.stringify(next, null, 2), 'utf8')
  return next
}

/** 主进程里带上 fs 的便捷版本。 */
export function usableDir(prefs: Pick<ExportPrefs, 'dir'>): string | null {
  return usableDirShared(prefs.dir, existsSync)
}

export function uniquePath(dir: string, name: string): string {
  return uniquePathShared(dir, name, existsSync)
}
