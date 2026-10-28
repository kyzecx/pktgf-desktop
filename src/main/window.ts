import { app, BrowserWindow, screen, shell } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { dataDir } from './services/paths'

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

const DEFAULT_STATE: WindowState = { width: 1280, height: 860, maximized: false }
const MIN_WIDTH = 1024
const MIN_HEIGHT = 700

/** 打包后图标在 extraResources，开发时直接读项目里的文件。 */
function appIconPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, process.platform === 'win32' ? 'icon.ico' : 'icon.png')
  }
  return join(
    app.getAppPath(),
    process.platform === 'win32' ? 'build/icon.ico' : 'resources/icon.png',
  )
}

function stateFile(): string {
  return resolve(dataDir(), 'window-state.json')
}

async function readState(): Promise<WindowState> {
  const raw = await readFile(stateFile(), 'utf8').catch(() => null)
  if (!raw) return DEFAULT_STATE
  try {
    const parsed = JSON.parse(raw) as Partial<WindowState>
    return {
      width: Math.max(MIN_WIDTH, Number(parsed.width) || DEFAULT_STATE.width),
      height: Math.max(MIN_HEIGHT, Number(parsed.height) || DEFAULT_STATE.height),
      maximized: Boolean(parsed.maximized),
      ...(typeof parsed.x === 'number' ? { x: parsed.x } : {}),
      ...(typeof parsed.y === 'number' ? { y: parsed.y } : {}),
    }
  } catch {
    return DEFAULT_STATE
  }
}

async function writeState(window: BrowserWindow): Promise<void> {
  if (window.isDestroyed()) return
  const bounds = window.getNormalBounds()
  const state: WindowState = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    maximized: window.isMaximized(),
  }
  await writeFile(stateFile(), JSON.stringify(state), 'utf8').catch(() => undefined)
}

/** 若上次窗口位置落在已拔掉的显示器上，退回主屏居中。 */
function ensureVisible(state: WindowState): WindowState {
  if (state.x === undefined || state.y === undefined) return state
  const displays = screen.getAllDisplays()
  const visible = displays.some((display) => {
    const { x, y, width, height } = display.workArea
    return (
      state.x! >= x - 100 && state.y! >= y - 100 && state.x! < x + width && state.y! < y + height
    )
  })
  return visible ? state : { ...state, x: undefined, y: undefined }
}

export interface CreateWindowOptions {
  preload: string
  rendererUrl: string | null
  onExternal: (url: string) => void
}

export async function createMainWindow(options: CreateWindowOptions): Promise<BrowserWindow> {
  const saved = ensureVisible(await readState())
  const isMac = process.platform === 'darwin'

  const window = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    ...(saved.x !== undefined ? { x: saved.x } : {}),
    ...(saved.y !== undefined ? { y: saved.y } : {}),
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    backgroundColor: '#0f1014',
    title: '皮卡堂工坊',
    icon: appIconPath(),
    // 无边框：mac 保留原生红绿灯，Windows / Linux 由渲染层自绘
    ...(isMac
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 14 } }
      : { frame: false }),
    webPreferences: {
      preload: options.preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  })

  if (saved.maximized) window.maximize()

  if (process.platform === 'darwin' && app.dock) app.dock.setIcon(appIconPath())

  window.once('ready-to-show', () => window.show())

  // 外链一律交给系统浏览器，应用内不导航
  window.webContents.setWindowOpenHandler(({ url }) => {
    options.onExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const current = window.webContents.getURL()
    if (url !== current) {
      event.preventDefault()
      options.onExternal(url)
    }
  })

  let saveTimer: NodeJS.Timeout | null = null
  const scheduleSave = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void writeState(window), 400)
  }
  window.on('resize', scheduleSave)
  window.on('move', scheduleSave)
  window.on('close', () => {
    if (saveTimer) clearTimeout(saveTimer)
    void writeState(window)
  })

  // 调试/截图用：直接落到某个路由
  const initialRoute = process.env.PKT_INITIAL_ROUTE?.replace(/^#?\/?/, '')
  const hash = initialRoute ? `#/${initialRoute}` : ''

  if (options.rendererUrl) {
    await window.loadURL(`${options.rendererUrl}${hash}`)
  } else {
    await window.loadURL(`app://bundle/index.html${hash}`)
  }

  return window
}

export function openExternal(url: string): void {
  if (!/^https?:\/\//i.test(url)) return
  void shell.openExternal(url)
}

export function openPath(target: string): void {
  void shell.openPath(target)
}

export { app }
