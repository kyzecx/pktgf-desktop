import { contextBridge, ipcRenderer } from 'electron'

import type {
  AppInfo,
  AppUpdateCheck,
  AppUpdateDownload,
  AppUpdateProgress,
  CatalogPayload,
  CacheStats,
  ChooseDirectoryResult,
  DesktopApi,
  ExportFilesRequest,
  ResourceVersionStatus,
  OpenFileRequest,
  OpenFileResult,
  SaveFileRequest,
  SaveFileResult,
  SaveRecord,
} from '../shared/contract'
import { IPC } from '../shared/contract'

/**
 * 渲染进程唯一的 Native 入口。
 *
 * 设计原则：只暴露「能力」，不暴露 Electron 对象；全部方法显式声明，
 * 渲染层通过 `window.pkt` 访问，类型来自 shared/contract。
 */
const api: DesktopApi = {
  platform: process.platform,

  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IPC.appInfo),
  getCatalog: (): Promise<CatalogPayload> => ipcRenderer.invoke(IPC.catalog),
  getResourceVersion: (): Promise<ResourceVersionStatus> => ipcRenderer.invoke(IPC.resourceVersion),
  checkResourceVersion: (): Promise<ResourceVersionStatus> =>
    ipcRenderer.invoke(IPC.resourceVersionRecheck),

  getCacheStats: (): Promise<CacheStats> => ipcRenderer.invoke(IPC.cacheStats),
  clearResourceCache: (): Promise<void> => ipcRenderer.invoke(IPC.cacheClear),

  checkAppUpdate: (): Promise<AppUpdateCheck> => ipcRenderer.invoke(IPC.updateCheck),
  downloadAppUpdate: (): Promise<AppUpdateDownload> => ipcRenderer.invoke(IPC.updateDownload),
  onAppUpdateProgress: (callback: (progress: AppUpdateProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: AppUpdateProgress): void =>
      callback(progress)
    ipcRenderer.on(IPC.updateProgress, listener)
    return () => ipcRenderer.removeListener(IPC.updateProgress, listener)
  },

  saveFile: (request: SaveFileRequest): Promise<SaveFileResult> =>
    ipcRenderer.invoke(IPC.saveFile, request),
  openFile: (request?: OpenFileRequest): Promise<OpenFileResult | null> =>
    ipcRenderer.invoke(IPC.openFile, request),
  chooseDirectory: (): Promise<ChooseDirectoryResult | null> =>
    ipcRenderer.invoke(IPC.chooseDirectory),
  writeExportFiles: (request: ExportFilesRequest): Promise<void> =>
    ipcRenderer.invoke(IPC.writeExportFiles, request),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke(IPC.openExternal, url),
  openDataDir: (): Promise<void> => ipcRenderer.invoke(IPC.openDataDir),

  windowMinimize: (): void => ipcRenderer.send(IPC.windowMinimize),
  windowToggleMaximize: (): void => ipcRenderer.send(IPC.windowToggleMaximize),
  windowClose: (): void => ipcRenderer.send(IPC.windowClose),

  listSaves: (): Promise<SaveRecord[]> => ipcRenderer.invoke(IPC.savesList),
  putSave: (save: SaveRecord): Promise<SaveRecord[]> => ipcRenderer.invoke(IPC.savesPut, save),
  deleteSave: (id: string): Promise<SaveRecord[]> => ipcRenderer.invoke(IPC.savesDelete, id),
}

contextBridge.exposeInMainWorld('pkt', api)
