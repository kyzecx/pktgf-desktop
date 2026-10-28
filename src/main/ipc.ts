import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
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
} from '../shared/contract'
import { checkAppUpdate, downloadAppUpdate } from './services/app-update'
import { loadCatalog } from './services/catalog'
import { dataDir } from './services/paths'
import { clearResourceCache, getCacheStats } from './services/resource-cache'
import { deleteSave, listSaves, putSave } from './services/saves'
import { checkResourceVersion, getResourceVersion } from './services/version-watch'

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

  ipcMain.handle(IPC.cacheStats, async () => getCacheStats())
  ipcMain.handle(IPC.cacheClear, async () => clearResourceCache())

  ipcMain.handle(IPC.updateCheck, async () => checkAppUpdate())
  ipcMain.handle(IPC.updateDownload, async (event) =>
    downloadAppUpdate((progress) => event.sender.send(IPC.updateProgress, progress)),
  )

  ipcMain.handle(
    IPC.saveFile,
    async (_event, request: SaveFileRequest): Promise<SaveFileResult> => {
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
