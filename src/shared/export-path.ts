/**
 * 导出路径的纯逻辑（不依赖 node/electron，渲染层与主进程都能用）。
 *
 * 目录/文件是否存在由调用方注入 `exists`，这样这里保持可测的纯函数。
 */

/** 存在性判定（主进程传 `existsSync`）。 */
export type ExistsFn = (path: string) => boolean

/** 目录可用才算数，否则退回「每次询问」。 */
export function usableDir(dir: string | null, exists: ExistsFn): string | null {
  if (!dir) return null
  try {
    return exists(dir) ? dir : null
  } catch {
    return null
  }
}

/** 取扩展名（含点）；没有则空串。 */
function extOf(name: string): string {
  const index = name.lastIndexOf('.')
  return index > 0 ? name.slice(index) : ''
}

/** 取文件名（去掉目录部分）。 */
function baseOf(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return index >= 0 ? path.slice(index + 1) : path
}

/** 拼路径（保留 dir 结尾分隔符风格）。 */
function joinPath(dir: string, name: string): string {
  const separator = dir.includes('\\') && !dir.includes('/') ? '\\' : '/'
  return dir.endsWith('/') || dir.endsWith('\\') ? `${dir}${name}` : `${dir}${separator}${name}`
}

/** 同名文件自动加 (2)(3)…，不覆盖用户已导出的文件。 */
export function uniquePath(dir: string, name: string, exists: ExistsFn): string {
  const safe = baseOf(name).replace(/[\\/:*?"<>|]/g, '_')
  const ext = extOf(safe)
  const stem = safe.slice(0, safe.length - ext.length) || 'export'
  let candidate = joinPath(dir, safe)
  let index = 2
  while (exists(candidate)) {
    candidate = joinPath(dir, `${stem} (${index})${ext}`)
    index += 1
  }
  return candidate
}
