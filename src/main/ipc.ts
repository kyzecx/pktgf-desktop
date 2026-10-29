import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve, sep } from 'node:path'

import {
  IPC,
  type AppInfo,
  type SaveRecord,
  type CatalogPayload,
  type ChooseDirectoryResult,
  type ExportFilesRequest,
  type ResourceVersionStatus,
  type OpenFileRequest,
  type OpenFileResult,
  type SaveFileRequest,
  type SaveFileResult,
  type EncodeVideoRequest,
  type EncodeVideoResult,
  type ExportPrefs,
  type FfmpegStatus,
} from '../shared/contract'
import { checkAppUpdate, downloadAppUpdate } from './services/app-update'
import { loadCatalog } from './services/catalog'
import { readExportPrefs, uniquePath, usableDir, writeExportPrefs } from './services/export-prefs'
import { dataDir } from './services/paths'
import { clearResourceCache, getCacheStats } from './services/resource-cache'
import { deleteSave, listSaves, putSave } from './services/saves'
import {
  checkResourceVersion,
  getResourceVersion,
  rebuildCatalogNow,
} from './services/version-watch'

/** 只在用户通过系统目录选择器授权的根目录下写图鉴文件。 */
const exportRoots = new Map<string, string>()

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.appInfo, async (): Promise<AppInfo> => ({
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron ?? '',
    chromeVersion: process.versions.chrome ?? '',
    platform: process.platform,
    isPackaged: app.isPackaged,
    dataDir: dataDir(),
  }))

  ipcMain.handle(IPC.catalog, async (): Promise<CatalogPayload> => loadCatalog())

  ipcMain.handle(IPC.resourceVersion, async (): Promise<ResourceVersionStatus> =>
    getResourceVersion(),
  )
  ipcMain.handle(IPC.resourceVersionRecheck, async (): Promise<ResourceVersionStatus> =>
    checkResourceVersion(true),
  )

  ipcMain.handle(IPC.resourceRebuild, async (): Promise<ResourceVersionStatus> =>
    rebuildCatalogNow(),
  )

  ipcMain.handle(IPC.cacheStats, async () => getCacheStats())
  ipcMain.handle(IPC.cacheClear, async () => clearResourceCache())

  ipcMain.handle(IPC.updateCheck, async () => checkAppUpdate())
  ipcMain.handle(IPC.updateDownload, async (event) =>
    downloadAppUpdate((progress) => event.sender.send(IPC.updateProgress, progress)),
  )

  ipcMain.handle(
    IPC.saveFile,
    async (_event, request: SaveFileRequest): Promise<SaveFileResult> => {
      // 设置里指定了保存目录 → 直接落盘，不再弹对话框
      const fixedDir = request.useExportDir ? usableDir(await readExportPrefs()) : null
      if (fixedDir) {
        await mkdir(fixedDir, { recursive: true })
        const target = uniquePath(fixedDir, request.suggestedName)
        await writeFile(target, Buffer.from(request.dataBase64, 'base64'))
        if ((await readExportPrefs()).openAfterSave) shell.showItemInFolder(target)
        return { saved: true, path: target }
      }

      const window = BrowserWindow.getFocusedWindow()
      const options = {
        defaultPath: resolve(app.getPath('downloads'), sanitizeFilename(request.suggestedName)),
      }
      const result = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options)

      if (result.canceled || !result.filePath) return { saved: false, path: null }

      await mkdir(dirname(result.filePath), { recursive: true })
      await writeFile(result.filePath, Buffer.from(request.dataBase64, 'base64'))
      if ((await readExportPrefs()).openAfterSave) shell.showItemInFolder(result.filePath)
      return { saved: true, path: result.filePath }
    },
  )

  ipcMain.handle(
    IPC.openFile,
    async (_event, request?: OpenFileRequest): Promise<OpenFileResult | null> => {
      const window = BrowserWindow.getFocusedWindow()
      const options = { properties: ['openFile' as const], filters: request?.filters }
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options)
      const file = result.filePaths[0]
      if (result.canceled || !file) return null
      const data = await readFile(file)
      return { name: file.split(/[\\/]/).pop() ?? 'file', base64: data.toString('base64') }
    },
  )

  ipcMain.handle(IPC.chooseDirectory, async (): Promise<ChooseDirectoryResult | null> => {
    const window = BrowserWindow.getFocusedWindow()
    const options = { properties: ['openDirectory' as const, 'createDirectory' as const] }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    const root = result.filePaths[0]
    if (result.canceled || !root) return null
    const token = randomUUID()
    exportRoots.set(token, resolve(root))
    return { token, path: root }
  })

  ipcMain.handle(IPC.writeExportFiles, async (_event, request: ExportFilesRequest) => {
    const root = exportRoots.get(request.token)
    if (!root) throw new Error('导出目录已失效，请重新选择')
    if (!Array.isArray(request.files) || request.files.length === 0) return

    for (const file of request.files) {
      const relative = sanitizeRelativePath(file.path)
      const target = resolve(root, relative)
      if (target !== root && !target.startsWith(root + sep)) {
        throw new Error(`非法导出路径: ${file.path}`)
      }
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, Buffer.from(file.base64, 'base64'))
    }
  })

  ipcMain.handle(IPC.ffmpegStatus, async (): Promise<FfmpegStatus> => {
    return detectFfmpeg()
  })

  ipcMain.handle(
    IPC.encodeVideo,
    async (_event, request: EncodeVideoRequest): Promise<EncodeVideoResult> => {
      const status = await detectFfmpeg()
      if (!status.available || !status.path) {
        return { ok: false, path: null, error: status.error ?? '未检测到 ffmpeg' }
      }
      if (!Array.isArray(request.framesBase64) || request.framesBase64.length === 0) {
        return { ok: false, path: null, error: '没有可编码的帧' }
      }

      const prefs = await readExportPrefs()
      const fixedDir = request.useExportDir ? usableDir(prefs) : null
      let target: string
      if (fixedDir) {
        await mkdir(fixedDir, { recursive: true })
        target = uniquePath(fixedDir, request.suggestedName)
      } else {
        const window = BrowserWindow.getFocusedWindow()
        const options = {
          defaultPath: request.suggestedName,
          filters: [{ name: 'MP4 视频', extensions: ['mp4'] }],
        }
        const result = window
          ? await dialog.showSaveDialog(window, options)
          : await dialog.showSaveDialog(options)
        const picked = result.filePath
        if (result.canceled || !picked) return { ok: false, path: null, error: '已取消' }
        target = picked
      }

      const temp = await mkdtemp(resolve(tmpdir(), 'pktgf-frames-'))
      try {
        await Promise.all(
          request.framesBase64.map((base64, index) =>
            writeFile(
              resolve(temp, `frame-${String(index).padStart(4, '0')}.png`),
              Buffer.from(base64, 'base64'),
            ),
          ),
        )

        const fps = Math.min(60, Math.max(1, Math.round(request.fps) || 12))
        await runFfmpeg(status.path, [
          '-y',
          '-framerate',
          String(fps),
          '-i',
          resolve(temp, 'frame-%04d.png'),
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-vf',
          'pad=ceil(iw/2)*2:ceil(ih/2)*2',
          target,
        ])
        if (prefs.openAfterSave) shell.showItemInFolder(target)
        return { ok: true, path: target, error: null }
      } catch (error) {
        return {
          ok: false,
          path: null,
          error: error instanceof Error ? error.message : String(error),
        }
      } finally {
        await rm(temp, { recursive: true, force: true })
      }
    },
  )

  ipcMain.handle(IPC.exportPrefs, async (): Promise<ExportPrefs> => readExportPrefs())

  ipcMain.handle(
    IPC.setExportPrefs,
    async (_event, patch: Partial<ExportPrefs>): Promise<ExportPrefs> => writeExportPrefs(patch),
  )

  ipcMain.handle(IPC.chooseExportDir, async (): Promise<ExportPrefs | null> => {
    const window = BrowserWindow.getFocusedWindow()
    const options = {
      title: '选择导出目录',
      properties: ['openDirectory' as const, 'createDirectory' as const],
      defaultPath: usableDir(await readExportPrefs()) ?? app.getPath('downloads'),
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    const picked = result.filePaths[0]
    if (result.canceled || !picked) return null
    return writeExportPrefs({ dir: resolve(picked) })
  })

  ipcMain.handle(IPC.revealPath, async (_event, path: string) => {
    if (typeof path === 'string' && path) shell.showItemInFolder(path)
  })

  ipcMain.handle(IPC.openExternal, async (_event, url: string) => {
    if (/^https?:\/\//i.test(url)) await shell.openExternal(url)
  })

  ipcMain.handle(IPC.openDataDir, async () => {
    await mkdir(dataDir(), { recursive: true })
    await shell.openPath(dataDir())
  })

  ipcMain.handle(IPC.savesList, async (): Promise<SaveRecord[]> => listSaves())
  ipcMain.handle(IPC.savesPut, async (_event, save: SaveRecord): Promise<SaveRecord[]> =>
    putSave(save),
  )
  ipcMain.handle(IPC.savesDelete, async (_event, id: string): Promise<SaveRecord[]> =>
    deleteSave(id),
  )

  ipcMain.on(IPC.windowMinimize, () => BrowserWindow.getFocusedWindow()?.minimize())
  ipcMain.on(IPC.windowToggleMaximize, () => {
    const window = BrowserWindow.getFocusedWindow()
    if (!window) return
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
  })
  ipcMain.on(IPC.windowClose, () => BrowserWindow.getFocusedWindow()?.close())
}

/** 只保留文件名，避免用户传入路径片段。 */
function sanitizeFilename(name: string): string {
  const base = name.replace(/[\\/:*?"<>|]/g, '_').trim()
  return base.length > 0 ? base : 'pktgf-export.png'
}

/** 相对路径只允许普通段；拒绝绝对路径、盘符和 ..。 */
function sanitizeRelativePath(rawPath: string): string {
  const path = String(rawPath ?? '').replace(/\\/g, '/')
  if (!path || path.startsWith('/') || /^[a-zA-Z]:/.test(path)) {
    throw new Error(`非法导出路径: ${rawPath}`)
  }
  const segments = path.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`非法导出路径: ${rawPath}`)
  }
  return segments.join(sep)
}

let ffmpegCache: FfmpegStatus | null = null

/** 检测系统 ffmpeg：PATH 里的 `ffmpeg -version`，结果缓存。 */
async function detectFfmpeg(): Promise<FfmpegStatus> {
  if (ffmpegCache) return ffmpegCache
  try {
    const output = await runFfmpeg('ffmpeg', ['-version'])
    const version = /ffmpeg version ([^\s]+)/i.exec(output)?.[1] ?? null
    ffmpegCache = { available: true, path: 'ffmpeg', version, error: null }
  } catch (error) {
    ffmpegCache = {
      available: false,
      path: null,
      version: null,
      error:
        '未检测到 ffmpeg。视频导出需要单独安装：macOS `brew install ffmpeg`，Windows `winget install ffmpeg`，或从 ffmpeg.org 下载后加入 PATH',
    }
    void error
  }
  return ffmpegCache
}

function runFfmpeg(binary: string, args: string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      out += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      err += chunk.toString()
    })
    child.on('error', (error) => reject(error))
    child.on('close', (code) => {
      if (code === 0) resolvePromise(out || err)
      else reject(new Error(err.trim() || `ffmpeg 退出码 ${code ?? '?'}`))
    })
  })
}
