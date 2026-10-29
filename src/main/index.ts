import { app, BrowserWindow, session } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { registerIpcHandlers } from './ipc'
import { buildMenu } from './menu'
import { registerProtocolHandlers, registerSchemes } from './protocols'
import { checkResourceVersion, startVersionWatch } from './services/version-watch'
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

  // 后台校验官方客户端版本，不阻塞启动；之后每 5 分钟自动检查并更新
  void checkResourceVersion()
  startVersionWatch()

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
    // 可选：PKT_ROUTE=room 先跳到指定页面，PKT_SCREENSHOT_DELAY 控制等待毫秒
    if (process.env.PKT_ROUTE) {
      void mainWindow?.webContents.executeJavaScript(`location.hash = '#/${process.env.PKT_ROUTE}'`)
    }
    // 可选：PKT_CLICK_TEXT=导出 先点一下这个按钮；
    // PKT_EVAL='<js>' 执行一段脚本（截图验证浮层/交互链路用）
    const clickText = process.env.PKT_CLICK_TEXT
    if (clickText) {
      setTimeout(() => {
        void mainWindow?.webContents.executeJavaScript(
          `[...document.querySelectorAll('button')].find((el) => el.textContent?.includes(${JSON.stringify(clickText)}))?.click()`,
        )
      }, 2500)
    }
    const evalScript = process.env.PKT_EVAL
    if (evalScript) {
      setTimeout(() => {
        void mainWindow?.webContents
          .executeJavaScript(evalScript)
          .then((result: unknown) => console.info('[dev] PKT_EVAL →', result))
          .catch((error: unknown) => console.warn('[dev] PKT_EVAL 执行失败', error))
      }, 2500)
    }
    const delay = Number(process.env.PKT_SCREENSHOT_DELAY ?? 4000)
    setTimeout(async () => {
      const image = await mainWindow?.webContents.capturePage()
      if (image) await writeFile(screenshot, image.toPNG())
      app.quit()
    }, delay)
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
