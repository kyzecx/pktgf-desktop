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
  /** 背包道具图标包（item/itm<serial>.zip） */
  itemZip?: string
  itemMd5?: string
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

/** 装修物件类型：家具本体，以及地板 / 墙纸 / 门。 */
export type DecoKind = 'furni' | 'tile' | 'wall' | 'door'

/**
 * 家具 / 地砖 / 墙纸 / 门共用的图鉴条目；图片按需从 zip 里的 symbol 读取。
 *
 * 注意官方语义：`gridW` 是 Y 方向（行），`gridH` 是 X 方向（列），
 * 这里统一暴露成 `rows`（Y）/ `cols`（X），避免在业务层继续踩反直觉的命名
 * （见 docs/room-spec.md §1.2）。
 */
export interface CatalogFurniture {
  code: string
  type: number
  name: string
  description: string
  category: string
  kind: DecoKind
  /**
   * 代码尾部的序号（`tile0001` → 1）。
   * 房型的 `defaultTile/defaultWall/defaultDoor/defaultBg` 引用的就是这个序号。
   */
  serial: number
  zip: string
  md5: string
  /** 占地行数（Y 方向）= 官方 furniConfig.gridW */
  rows: number
  /** 占地列数（X 方向）= 官方 furniConfig.gridH */
  cols: number
  /** 1=单向 2=两向 4=四向；地板/墙纸/门固定 2 */
  dirable: 1 | 2 | 4
  symetric: boolean
  /** 官方锚点串，像素，按方向用 & 分隔，例如 "28 37&29 34" */
  baseLoc: string
  /** 官方可叠放点串，例如 "16 23$33 32&37 26$18 20"；不可叠放为 null */
  surfaceLoc: string | null
  /** 1 地面 / 2 地毯 / 3,4 挂墙 / 5 靠墙 / 6..8 特殊；地板墙纸门为 0 */
  position: number
  usage: number
  /** 可以放到别的家具上 */
  meOverOther: boolean
  /** 0 不可叠 / 1 多面可叠 / 2 只有首面可叠 */
  otherOverMe: 0 | 1 | 2
  /** 官方行为串，例如 "open 打开 1" */
  behaviour: string | null
  /** 官方功能类型，例如 Door / Posy / transport / Food */
  functionType: string | null
  /** 官方家居动画（furniMotionConfig 的 key）与其帧时长。 */
  motion?: string | null
  motionFrames?: Array<{ frame: number; duration: number }>
  /** 动画组的整体时序（官方 time 字段），0 表示按帧循环 */
  motionTime?: number
  /** 官方动画模式；0 表示不播放 */
  animationMode: number
  /** 灯光叠加（833 条家具才有） */
  light?: { loc: string; color: string; intensity: number; mode: number } | null
}

/** 房型（官方 roomConfig）。 */
export interface CatalogRoomDef {
  type: number
  category: number
  name: string
  /** 占地行数（Y 方向）= 官方 roomConfig.gridW */
  rows: number
  /** 占地列数（X 方向）= 官方 roomConfig.gridH */
  cols: number
  entryX: number
  entryY: number
  entryDir: RoomDirection
  exitX: number
  exitY: number
  exitDir: RoomDirection
  defaultTile: number
  defaultWall: number
  defaultDoor: number
  defaultBg: number
  /** 0 = 满铺地板；其它值指向 roomMaps 的 key */
  defaultStructure: number
  maxFurni: number
  wallHeight: number
  /** 官方 tileDepth，即地板厚度 */
  floorDepth: number
  wallDepth: number
  /** 官方整图房的图片尺寸 "701 473"（格子坐标的基准） */
  picWH: string
  /** 整图房的地板原点在图片内的偏移 "350 130" */
  gridOffset: string
  /** 整图房的整间场景图（`scene/roomimg_<type>.zip`）；没有则 null */
  scene: { zip: string; md5: string } | null
  /** TMX 场景房的地图文件（`scene/map/<type>.tmx`）；没有则 null */
  tmx: { key: string; md5: string } | null
  /** 1 = 官方整图房；2 = 场景图房（TMX） */
  ifDefaultImg: number
  /** 官方 ifCombineRoom：1 = 普通单间；2 = 多房间打通（暂不支持） */
  combine: number
}

/** 房间内的四个朝向：5=+x 3=+y 1=-x 7=-y（见 docs/room-spec.md §1.3）。 */
export type RoomDirection = 1 | 3 | 5 | 7

/** 房间结构图（官方 roomMapConfig）：每行用 , 分隔，行间用 & 分隔。 */
export interface CatalogRoomMap {
  type: number
  /** "1,1,1&1,1,1"，0 表示该格不是地板 */
  map: string
}

/** NPC（官方 npcConfig）。 */
export interface CatalogNpcDef {
  type: number
  code: string
  name: string
  subType: string | null
  /** 占地行数（Y）/ 列数（X） */
  rows: number
  cols: number
  baseLoc: string
  moveSpeed: string
  moveStyle: string | null
  standStyle: string | null
  /** "move:0.7&magic:1" 形式的自主动作权重 */
  selfMotion: string | null
  width: number
  height: number
  /** 是否可换装 */
  cosType: number
  zip: string
  md5: string
}

/** 角色动作的一步（官方 motionConfig 的一条）。 */
export interface CatalogMotionStep {
  duration?: number
  arms?: number
  legs?: number
  hair?: number
  face?: number
  dir?: RoomDirection
  facing?: RoomDirection
  /** "x,y" */
  offset?: string
  /** 逐朝向覆写：官方 arms3 / arms7 */
  byDir?: Partial<Record<RoomDirection, { arms?: number; legs?: number }>>
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
  /** 默认宠物动作（walk）的帧与时长。 */
  motionFrames?: Array<{ frame: number; duration: number }>
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
  /** TMX 场景房的瓦片图集（tmxRes.zip）；旧快照没有该字段 */
  tmxRes?: { key: string; md5: string }
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
  /** 装修相关快照；旧快照没有这些字段，读取处一律 `?? []`。 */
  rooms: CatalogRoomDef[]
  roomMaps: CatalogRoomMap[]
  npcs: CatalogNpcDef[]
  /** 角色动作（官方 motionConfig），key 为动作名。 */
  actorMotions: Record<string, CatalogMotionStep[]>
  /** NPC 动作（官方 npcMotionConfig），每步是「帧序号 + 时长」。 */
  npcMotions: Record<string, Array<{ frame: number; duration: number }>>
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
  /** 本次自动更新替换了多少条 md5（0 = 没有需要更新的） */
  patched?: number
  /** 官方清单里有、目录里还没有的新文件数 */
  added?: number
  /** 目录已被补丁更新（渲染层需要重新拉目录） */
  applied?: boolean
  /** 本次是重建整份目录（而不是只换 md5） */
  rebuilt?: boolean
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

/** 系统 ffmpeg 检测结果（不内置二进制，见 docs/room-plan.md §11.2）。 */
export interface FfmpegStatus {
  available: boolean
  /** 检测到的可执行文件路径 */
  path: string | null
  version: string | null
  error: string | null
}

export interface EncodeVideoRequest {
  /** 逐帧 PNG 的 base64（按顺序） */
  framesBase64: string[]
  fps: number
  suggestedName: string
  /** 同 SaveFileRequest.useExportDir */
  useExportDir?: boolean
}

export interface EncodeVideoResult {
  ok: boolean
  path: string | null
  error: string | null
}

/** 导出偏好：固定保存目录 + 保存后是否自动打开所在文件夹。 */
export interface ExportPrefs {
  /** null = 每次让用户选 */
  dir: string | null
  openAfterSave: boolean
}

export interface SaveFileRequest {
  suggestedName: string
  /** base64，避免 IPC 传大 Buffer 时的类型问题 */
  dataBase64: string
  /**
   * true = 设置里指定了保存目录就直接写进去（文件名重名自动加序号），
   * 没指定才弹对话框。
   */
  useExportDir?: boolean
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
  /** 目录被自动更新后触发（渲染层重新拉一次目录） */
  onResourceUpdated(callback: (status: ResourceVersionStatus) => void): () => void
  /** 重建目录的进度（后台自动更新时也会推） */
  onResourceProgress(callback: (progress: { stage: string }) => void): () => void
  checkResourceVersion(): Promise<ResourceVersionStatus>
  /** 无视版本号，强制重建整份目录（设置页按钮） */
  rebuildCatalog(): Promise<ResourceVersionStatus>
  getCacheStats(): Promise<CacheStats>
  clearResourceCache(): Promise<void>
  checkAppUpdate(): Promise<AppUpdateCheck>
  downloadAppUpdate(): Promise<AppUpdateDownload>
  onAppUpdateProgress(callback: (progress: AppUpdateProgress) => void): () => void
  saveFile(request: SaveFileRequest): Promise<SaveFileResult>
  openFile(request?: OpenFileRequest): Promise<OpenFileResult | null>
  chooseDirectory(): Promise<ChooseDirectoryResult | null>
  writeExportFiles(request: ExportFilesRequest): Promise<void>
  ffmpegStatus(): Promise<FfmpegStatus>
  exportPrefs(): Promise<ExportPrefs>
  setExportPrefs(patch: Partial<ExportPrefs>): Promise<ExportPrefs>
  chooseExportDir(): Promise<ExportPrefs | null>
  revealPath(path: string): Promise<void>
  encodeVideo(request: EncodeVideoRequest): Promise<EncodeVideoResult>
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
  resourceUpdated: 'pkt:resource-updated',
  resourceProgress: 'pkt:resource-progress',
  resourceRebuild: 'pkt:resource-rebuild',
  cacheStats: 'pkt:cache-stats',
  cacheClear: 'pkt:cache-clear',
  updateCheck: 'pkt:update-check',
  updateDownload: 'pkt:update-download',
  updateProgress: 'pkt:update-progress',
  saveFile: 'pkt:save-file',
  openFile: 'pkt:open-file',
  chooseDirectory: 'pkt:choose-directory',
  writeExportFiles: 'pkt:write-export-files',
  ffmpegStatus: 'pkt:ffmpeg-status',
  exportPrefs: 'pkt:export-prefs',
  setExportPrefs: 'pkt:set-export-prefs',
  chooseExportDir: 'pkt:choose-export-dir',
  revealPath: 'pkt:reveal-path',
  encodeVideo: 'pkt:encode-video',
  openExternal: 'pkt:open-external',
  openDataDir: 'pkt:open-data-dir',
  windowMinimize: 'pkt:window-minimize',
  windowToggleMaximize: 'pkt:window-toggle-maximize',
  windowClose: 'pkt:window-close',
  savesList: 'pkt:saves-list',
  savesPut: 'pkt:saves-put',
  savesDelete: 'pkt:saves-delete',
} as const
