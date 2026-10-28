import { app, BrowserWindow, session } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { registerIpcHandlers } from './ipc'
import { buildMenu } from './menu'
import { registerProtocolHandlers, registerSchemes } from './protocols'
import { checkResourceVersion } from './services/version-watch'
import { createMainWindow, openExternal } from './window'

const APP_NAME = '皮卡堂工坊'

// Electron 默认在开发模式把应用名显示成 Electron；先统一成产品名，
// 菜单、Dock、关于面板和 userData 目录都会跟着变。
app.setName(APP_NAME)
app.setPath('userData', join(app.getPath('appData'), APP_NAME))
if (process.platform === 'win32') app.setAppUserModelId('top.pktgf.workshop')

const isDev = !app.isPackaged
let mainWindow: BrowserWindow | null = null

// 单实例：第二次启动直接聚焦已有窗口
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
}

// 自定义协议必须在 ready 之前注册
registerSchemes()

async function createWindow(): Promise<BrowserWindow> {
  return createMainWindow({
    preload: join(__dirname, '../preload/index.js'),
    rendererUrl: process.env['ELECTRON_RENDERER_URL'] ?? null,
    onExternal: openExternal,
  })
}

void app.whenReady().then(async () => {
  app.setAboutPanelOptions({
    applicationName: APP_NAME,
    applicationVersion: app.getVersion(),
    version: `Electron ${process.versions.electron}`,
    copyright: '非官方工具 · 素材版权归皮卡堂官方所有',
  })

  // 官方 CDN 对非白名单 Referer 返回 403，对空 Referer 放行。
  // 渲染层有 referrer 策略兜底，这里再全局保证一次（覆盖 <img>、CSS 背景等）。
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://*.picatown.com/*'] },
    (details, callback) => {
      delete details.requestHeaders['Referer']
      delete details.requestHeaders['referer']
      callback({ requestHeaders: details.requestHeaders })
    },
  )

  registerProtocolHandlers(join(__dirname, '../renderer'))
  registerIpcHandlers()

  mainWindow = await createWindow()
  buildMenu(mainWindow)
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 后台校验官方客户端版本，不阻塞启动
  void checkResourceVersion()

  // 开发/CI 用：PKT_SCREENSHOT=/path/to.png 时自动截屏并退出
  const screenshot = process.env.PKT_SCREENSHOT
  const dumpHtml = process.env.PKT_DUMP_HTML
  if (dumpHtml) {
    setTimeout(async () => {
      const html = await mainWindow?.webContents.executeJavaScript('document.body.innerHTML')
      if (html) await writeFile(dumpHtml, html)
      app.quit()
    }, 5000)
  } else if (screenshot) {
    setTimeout(async () => {
      const image = await mainWindow?.webContents.capturePage()
      if (image) await writeFile(screenshot, image.toPNG())
      app.quit()
    }, 4000)
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length > 0) return
    mainWindow = await createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

if (isDev) {
  app.on('browser-window-created', (_event, window) => {
    window.webContents.on('console-message', (_event, level, message, line, source) => {
      if (level >= 2) console.warn(`[renderer] ${message} (${source}:${line})`)
    })
  })
}
