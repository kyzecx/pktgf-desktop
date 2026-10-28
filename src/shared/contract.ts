/** 主进程与渲染进程共享的 IPC 契约。改动这里两端都会编译报错。 */

export type Part =
  'hair' | 'cset' | 'hats' | 'mask' | 'glas' | 'clot' | 'pant' | 'coat' | 'bear' | 'wing'

export interface CatalogItem {
  code: string
  part: Part
  type: number
  sex: 0 | 1 | 2
  serial: number
  name: string
  description: string
  zip: string
  md5: string
  useMask: boolean
  coverHead: boolean
  displaytemplate: boolean
  motion: string | null
}

export interface CatalogFace {
  code: string
  type: number
  name: string
  zip: string
  md5: string
}

/** 家具图鉴条目；图片按需从 zip 里的 symbol 读取。 */
export interface CatalogFurniture {
  code: string
  type: number
  name: string
  description: string
  category: string
  zip: string
  md5: string
  gridW: number
  gridH: number
  direction: number
}

/** 宠物图鉴条目；宠物本体和宠物蛋是两个资源包。 */
export interface CatalogPet {
  code: string
  type: number
  name: string
  eggCode: string
  petZip: string
  petMd5: string
  eggZip: string
  eggMd5: string
  gridW: number
  gridH: number
}

export interface CatalogMeta {
  mainScript: string
  resourceList: string
  builtAt: string
  counts: Record<string, number>
}

export interface CatalogAssets {
  /** 基础角色包（actor<ver>.zip） */
  baseActor: { key: string; md5: string }
  /** 衣柜分类图标：uiRes 资源包 + 部位到符号名的映射；旧快照没有该字段。 */
  uiIcons?: CatalogUiIcons
}

export interface CatalogUiIcons {
  /** 资源清单里的 key，例如 uiRes.zip */
  key: string
  md5: string
  symbols: Partial<Record<Part, string>>
}

export interface Catalog {
  meta: CatalogMeta
  assets: CatalogAssets
  faces: CatalogFace[]
  motions: Record<string, Array<{ frame: number; duration: number }>>
  items: CatalogItem[]
  furniture: CatalogFurniture[]
  pets: CatalogPet[]
}

/** 渲染进程拿到的目录是「原始 JSON 字符串 + 解析好的元信息」，避免重复序列化。 */
export interface CatalogPayload {
  json: string
  meta: CatalogMeta
  assets: CatalogAssets
}

export interface ResourceVersionStatus {
  /** 当前资源版本标识 */
  mainScript: string | null
  /** 目录快照使用的资源版本标识 */
  catalogMainScript: string
  /** 两者是否一致 */
  upToDate: boolean
  checkedAt: number
  error: string | null
}

export interface AppUpdateCheck {
  currentVersion: string
  latestVersion: string | null
  available: boolean
  releaseUrl: string
  notes: string | null
  assetName: string | null
  publishedAt: string | null
  error: string | null
}

export interface AppUpdateProgress {
  percent: number
  transferred: number
  total: number
}

export interface AppUpdateDownload {
  downloaded: boolean
  path: string | null
  releaseUrl: string
  error: string | null
}

export interface CacheStats {
  files: number
  bytes: number
}

export interface SaveFileRequest {
  suggestedName: string
  /** base64，避免 IPC 传大 Buffer 时的类型问题 */
  dataBase64: string
}

export interface OpenFileRequest {
  filters?: Array<{ name: string; extensions: string[] }>
}

export interface OpenFileResult {
  name: string
  base64: string
}

export interface SaveFileResult {
  saved: boolean
  path: string | null
}

/** 图鉴批量导出：目录在 dialogs 选择一次，后续按 token 写入。 */
export interface ChooseDirectoryResult {
  token: string
  path: string
}

export interface ExportFile {
  /** 相对导出根目录的路径，不能包含 .. 或绝对路径。 */
  path: string
  /** PNG / JSON 的 base64 内容。 */
  base64: string
}

export interface ExportFilesRequest {
  token: string
  files: ExportFile[]
}

/** Electron 的 process.platform 取值；不引 @types/node，保持 shared 层零依赖。 */
export type Platform = 'darwin' | 'win32' | 'linux' | (string & {})

export type SaveKind = 'outfit' | 'room'

/** 搭配存档的 data 字段。 */
export interface OutfitSaveData {
  sex: 1 | 2
  faceCode: string | null
  /** part -> 服饰 code */
  worn: Record<string, string>
}

/**
 * 通用存档记录。
 *
 * 搭配、后续装修/家具等工具共用同一个文件和管理页；
 * 各工具把自己的数据放在 `data` 里。
 */
export interface SaveRecord {
  version: 2
  id: string
  kind: SaveKind
  name: string
  createdAt: number
  updatedAt: number
  /** 列表缩略图 data URL */
  preview: string
  data: unknown
}

export interface AppInfo {
  appVersion: string
  electronVersion: string
  chromeVersion: string
  platform: Platform
  isPackaged: boolean
  dataDir: string
}

export interface DesktopApi {
  readonly platform: Platform
  getAppInfo(): Promise<AppInfo>
  getCatalog(): Promise<CatalogPayload>
  getResourceVersion(): Promise<ResourceVersionStatus>
  checkResourceVersion(): Promise<ResourceVersionStatus>
  getCacheStats(): Promise<CacheStats>
  clearResourceCache(): Promise<void>
  checkAppUpdate(): Promise<AppUpdateCheck>
  downloadAppUpdate(): Promise<AppUpdateDownload>
  onAppUpdateProgress(callback: (progress: AppUpdateProgress) => void): () => void
  saveFile(request: SaveFileRequest): Promise<SaveFileResult>
  openFile(request?: OpenFileRequest): Promise<OpenFileResult | null>
  chooseDirectory(): Promise<ChooseDirectoryResult | null>
  writeExportFiles(request: ExportFilesRequest): Promise<void>
  openExternal(url: string): Promise<void>
  openDataDir(): Promise<void>
  windowMinimize(): void
  windowToggleMaximize(): void
  windowClose(): void
  listSaves(): Promise<SaveRecord[]>
  putSave(save: SaveRecord): Promise<SaveRecord[]>
  deleteSave(id: string): Promise<SaveRecord[]>
}

export const IPC = {
  appInfo: 'pkt:app-info',
  catalog: 'pkt:catalog',
  resourceVersion: 'pkt:resource-version',
  resourceVersionRecheck: 'pkt:resource-version-recheck',
  cacheStats: 'pkt:cache-stats',
  cacheClear: 'pkt:cache-clear',
  updateCheck: 'pkt:update-check',
  updateDownload: 'pkt:update-download',
  updateProgress: 'pkt:update-progress',
  saveFile: 'pkt:save-file',
  openFile: 'pkt:open-file',
  chooseDirectory: 'pkt:choose-directory',
  writeExportFiles: 'pkt:write-export-files',
  openExternal: 'pkt:open-external',
  openDataDir: 'pkt:open-data-dir',
  windowMinimize: 'pkt:window-minimize',
  windowToggleMaximize: 'pkt:window-toggle-maximize',
  windowClose: 'pkt:window-close',
  savesList: 'pkt:saves-list',
  savesPut: 'pkt:saves-put',
  savesDelete: 'pkt:saves-delete',
} as const
