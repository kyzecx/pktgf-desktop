import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import {
  IPC,
  type AppInfo,
  type SaveRecord,
  type CatalogPayload,
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
