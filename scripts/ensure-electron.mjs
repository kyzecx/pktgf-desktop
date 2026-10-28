/**
 * 国内网络下 GitHub 直连不可用，Electron 的二进制需要走镜像。
 * 依赖包自己的 postinstall 在 npm 11 里默认被拦，所以由项目脚本兜底。
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// CI / 只需要类型检查时不必下载二进制
if (process.env.ELECTRON_SKIP_BINARY_DOWNLOAD === '1') process.exit(0)

try {
  const electronPath = require('electron')
  if (typeof electronPath === 'string' && existsSync(electronPath)) process.exit(0)
} catch {
  // 未安装或未下载，继续兜底
}

const installer = new URL('../node_modules/electron/install.js', import.meta.url).pathname
if (!existsSync(installer)) process.exit(0)

console.log('[setup] 正在通过镜像下载 Electron 运行时…')
execFileSync(process.execPath, [installer], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_MIRROR: process.env.ELECTRON_MIRROR ?? 'https://npmmirror.com/mirrors/electron/',
  },
})
