import * as React from 'react'

import { createEntryExport } from '../services'
import type { CatalogEntry } from '../types'

export interface CatalogExportTarget {
  entry: CatalogEntry
  /** undefined = 该物品全部帧；传入集合 = 只导出选中的帧。 */
  frames?: ReadonlySet<string>
}

export interface CatalogExportState {
  running: boolean
  done: number
  total: number
  current: string
  rootPath: string | null
  error: string | null
  finished: boolean
}

const INITIAL: CatalogExportState = {
  running: false,
  done: 0,
  total: 0,
  current: '',
  rootPath: null,
  error: null,
  finished: false,
}

/** 逐个物品下载并写入同一个用户选定目录；单物品和批量共用。 */
export function useCatalogExport(): {
  state: CatalogExportState
  start: (targets: CatalogExportTarget[], label: string) => Promise<void>
  cancel: () => void
  reset: () => void
} {
  const [state, setState] = React.useState<CatalogExportState>(INITIAL)
  const cancelRef = React.useRef(false)
  const runningRef = React.useRef(false)

  const start = React.useCallback(async (targets: CatalogExportTarget[], label: string) => {
    if (runningRef.current || targets.length === 0) return
    const selectedFrameCount = targets.reduce((sum, target) => sum + (target.frames?.size ?? 0), 0)
    if (targets.length > 20) {
      const confirmed = window.confirm(
        `将下载 ${targets.length.toLocaleString()} 个物品的${
          selectedFrameCount > 0 ? ` ${selectedFrameCount.toLocaleString()} 个选中帧` : '全部帧'
        }。\n\n` +
          '文件会按「皮卡堂图鉴 / 分类 / 物品代码_名称」自动建文件夹。\n' +
          '数量较多时需要较长时间，过程中可以随时取消。',
      )
      if (!confirmed) return
    }

    const directory = await window.pkt.chooseDirectory()
    if (!directory) return

    runningRef.current = true
    cancelRef.current = false
    setState({
      running: true,
      done: 0,
      total: targets.length,
      current: targets[0]?.entry.name ?? label,
      rootPath: directory.path,
      error: null,
      finished: false,
    })

    let firstError: string | null = null
    for (let index = 0; index < targets.length; index += 1) {
      if (cancelRef.current) break
      const target = targets[index]!
      setState((current) => ({ ...current, current: target.entry.name }))

      try {
        const output = await createEntryExport(target.entry, target.frames)
        await window.pkt.writeExportFiles({ token: directory.token, files: output.files })
      } catch (error) {
        firstError = error instanceof Error ? error.message : String(error)
        break
      }

      setState((current) => ({ ...current, done: index + 1 }))
    }

    runningRef.current = false
    setState((current) => ({
      ...current,
      running: false,
      current: '',
      error: firstError,
      finished: !firstError && !cancelRef.current,
    }))
  }, [])

  const cancel = React.useCallback(() => {
    cancelRef.current = true
  }, [])

  const reset = React.useCallback(() => {
    if (!runningRef.current) setState(INITIAL)
  }, [])

  return { state, start, cancel, reset }
}
